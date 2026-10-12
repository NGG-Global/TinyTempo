import type { AchievementConfig } from '../config/achievements';
import { isCleared } from '../game/health';
import type { EndlessRecord } from '../game/endlessProgress';
import type { Progress } from '../game/progress';
import { playGamesId } from './ids';
import type { LeaderboardReason, PlayGames } from './playGames';

/**
 * Play Games achievements, as decisions. Pure — Play Games and the config are injected — so
 * every rule here is tested under node; `playgames/achievementSync.ts` wires it to the game.
 *
 * **Earned is derived, never stored.** A level achievement is earned exactly when the save
 * has cleared its level, the rule keepsakes and stars already follow; an Endless one
 * exactly when the device's Endless record (`game/endlessProgress.ts`) holds the run that
 * earned it. A save from before achievements existed, a save code, a merge and an Auto
 * Backup restore all carry the level ones without knowing it, and a player already past
 * level 30 is owed the first three the first time they are signed in.
 *
 * **Unlocking is re-sent, not remembered.** v2's `unlock` queues an unlock made offline and
 * syncs it later by itself, and unlocking an achievement already unlocked is harmless. So
 * instead of keeping a ledger of what Play Games has confirmed, `sync` hands over every
 * earned achievement once per session — after each finished level or Endless run and at
 * boot once signed in — and the platform's idempotence does the rest. One signed out when
 * they earned it gets it the next time they are signed in. Nothing here ever prompts for
 * sign-in except `open()`, which the player asked for.
 */

/** The rule an achievement is earned by: one of the config's shapes, without the id. */
export type AchievementRule =
  | { readonly clearLevel: number }
  | { readonly endlessMs: number }
  | { readonly endlessRuns: number };

export type Achievement = AchievementRule & {
  readonly key: string;
  /** The Console id, validated; null leaves this achievement off. */
  readonly id: string | null;
};

export function achievementsFrom(config: readonly AchievementConfig[]): readonly Achievement[] {
  return config.map(entry => ({ ...entry, id: playGamesId(entry.id) }));
}

/** What an achievement can be judged against: the road's save, and the device's Endless record. */
export interface EarnedFacts {
  readonly progress: Progress;
  /** Null where the Endless record is not to hand; every Endless achievement then reads as unearned. */
  readonly endless?: EndlessRecord | null;
}

/**
 * Whether the facts have earned it. A level: cleared, which `unlocked` above the level says
 * as well — everything below the frontier has been cleared — and which also covers a save
 * whose accuracy for that level was never written by an older version of the game. An
 * Endless milestone: the record's best run reached it; the first run: the record holds one.
 */
export function hasEarned(facts: Progress | EarnedFacts, achievement: AchievementRule): boolean {
  const { progress, endless } = 'progress' in facts ? facts : { progress: facts, endless: null };
  if ('clearLevel' in achievement) return progress.unlocked > achievement.clearLevel || isCleared(progress, achievement.clearLevel);
  if (!endless) return false;
  if ('endlessMs' in achievement) return endless.validRuns > 0 && endless.bestMs >= achievement.endlessMs;
  return endless.validRuns >= achievement.endlessRuns;
}

export function earnedAchievements(facts: Progress | EarnedFacts, all: readonly Achievement[]): readonly Achievement[] {
  return all.filter(achievement => hasEarned(facts, achievement));
}

/** The achievements one result has just earned: for analytics or a result screen. */
export function newlyEarned(before: Progress | EarnedFacts, after: Progress | EarnedFacts, all: readonly Achievement[]): readonly Achievement[] {
  return all.filter(achievement => !hasEarned(before, achievement) && hasEarned(after, achievement));
}

export type SyncOutcome =
  | { readonly kind: 'synced'; readonly sent: readonly string[] }
  | { readonly kind: 'skipped'; readonly reason: 'unavailable' | 'unconfigured' | 'signed_out' | 'nothing_new' };

export type AchievementsOpen = { readonly result: LeaderboardReason | 'unconfigured'; readonly signedIn: boolean };

export interface AchievementDeps {
  readonly games: () => PlayGames;
  readonly achievements: readonly Achievement[];
  /** Whether a native Play Games is installed at all; false in a browser. */
  readonly native: () => boolean;
  /** How long a Play Games call may take before this sync gives up on it. */
  readonly timeoutMs?: number;
}

export const ACHIEVEMENT_TIMEOUT_MS = 10_000;

export interface AchievementSync {
  /** Hand every earned achievement not yet sent this session to Play Games. Never rejects. */
  sync(facts: Progress | EarnedFacts): Promise<SyncOutcome>;
  /** Play Games' achievements screen. The one call that may sign in. */
  open(): Promise<AchievementsOpen>;
  /** Whether an achievements button can do anything on this build. */
  readonly available: boolean;
}

export function createAchievementSync(deps: AchievementDeps): AchievementSync {
  const timeoutMs = deps.timeoutMs ?? ACHIEVEMENT_TIMEOUT_MS;
  const configured = deps.achievements.filter((a): a is Achievement & { id: string } => a.id !== null);
  /** Ids Play Games took this session. In memory on purpose: every new session sends again. */
  const sent = new Set<string>();
  let inFlight: Promise<SyncOutcome> | null = null;

  const withTimeout = <T>(work: Promise<T>, fallback: T): Promise<T> => new Promise(resolve => {
    const timer = setTimeout(() => resolve(fallback), timeoutMs);
    work.then(value => { clearTimeout(timer); resolve(value); }, () => { clearTimeout(timer); resolve(fallback); });
  });

  const run = async (facts: Progress | EarnedFacts): Promise<SyncOutcome> => {
    if (!deps.native()) return { kind: 'skipped', reason: 'unavailable' };
    if (configured.length === 0) return { kind: 'skipped', reason: 'unconfigured' };
    const owed = configured.filter(a => hasEarned(facts, a) && !sent.has(a.id));
    if (owed.length === 0) return { kind: 'skipped', reason: 'nothing_new' };
    const games = deps.games();
    // v2 signs players in by itself at startup; ask whether it has, never prompt.
    const status = games.status.authenticated ? games.status : await withTimeout(games.refresh(), games.status);
    if (!status.authenticated) return { kind: 'skipped', reason: 'signed_out' };
    const done: string[] = [];
    for (const achievement of owed) {
      const result = await withTimeout(games.unlockAchievement(achievement.id), { sent: false, reason: 'failed' as const });
      if (result.sent) { sent.add(achievement.id); done.push(achievement.key); }
      // Signed out mid-sync: stop, and let the next sync send the rest.
      else if (result.reason === 'signed_out') break;
    }
    return { kind: 'synced', sent: done };
  };

  return {
    get available() { return deps.native() && configured.length > 0; },
    sync(facts) {
      // One at a time: a sync that arrives mid-sync waits, then sends only what is still owed.
      const next = (inFlight ?? Promise.resolve<SyncOutcome>({ kind: 'skipped', reason: 'nothing_new' }))
        .then(() => run(facts))
        .catch((): SyncOutcome => ({ kind: 'skipped', reason: 'unavailable' }));
      inFlight = next;
      return next;
    },
    async open() {
      try {
        if (configured.length === 0) return { result: 'unconfigured', signedIn: false };
        const games = deps.games();
        if (!games.status.authenticated) {
          const refreshed = await games.refresh();
          if (!refreshed.authenticated) {
            // The player tapped the button: this is the one place sign-in is offered.
            const status = await games.signIn();
            if (!status.authenticated) return { result: deps.native() ? 'signed_out' : 'unavailable', signedIn: false };
          }
        }
        const view = await games.showAchievements();
        return { result: view.reason, signedIn: true };
      } catch {
        return { result: 'failed', signedIn: false };
      }
    },
  };
}
