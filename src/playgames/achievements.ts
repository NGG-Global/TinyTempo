import type { AchievementConfig } from '../config/achievements';
import { isCleared } from '../game/health';
import type { Progress } from '../game/progress';
import { playGamesId } from './ids';
import type { LeaderboardReason, PlayGames } from './playGames';

/**
 * Play Games achievements, as decisions. Pure — Play Games and the config are injected — so
 * every rule here is tested under node; `playgames/achievementSync.ts` wires it to the game.
 *
 * **Earned is derived, never stored.** An achievement is earned exactly when the save has
 * cleared its level, the rule keepsakes and stars already follow. A save from before
 * achievements existed, a save code, a merge and an Auto Backup restore all carry them
 * without knowing it, and a player already past level 30 is owed the first three the first
 * time they are signed in.
 *
 * **Unlocking is re-sent, not remembered.** v2's `unlock` queues an unlock made offline and
 * syncs it later by itself, and unlocking an achievement already unlocked is harmless. So
 * instead of keeping a ledger of what Play Games has confirmed, `sync` hands over every
 * earned achievement once per session — after each finished level and at boot once signed
 * in — and the platform's idempotence does the rest. One signed out when they earned it
 * gets it the next time they are signed in. Nothing here ever prompts for sign-in except
 * `open()`, which the player asked for.
 */

export interface Achievement {
  readonly key: string;
  readonly clearLevel: number;
  /** The Console id, validated; null leaves this achievement off. */
  readonly id: string | null;
}

export function achievementsFrom(config: readonly AchievementConfig[]): readonly Achievement[] {
  return config.map(entry => ({ key: entry.key, clearLevel: entry.clearLevel, id: playGamesId(entry.id) }));
}

/**
 * Whether a save has earned it: its level cleared. `unlocked` above the level says so as
 * well — everything below the frontier has been cleared — which also covers a save whose
 * accuracy for that level was never written by an older version of the game.
 */
export function hasEarned(progress: Progress, achievement: Pick<Achievement, 'clearLevel'>): boolean {
  return progress.unlocked > achievement.clearLevel || isCleared(progress, achievement.clearLevel);
}

export function earnedAchievements(progress: Progress, all: readonly Achievement[]): readonly Achievement[] {
  return all.filter(achievement => hasEarned(progress, achievement));
}

/** The achievements one result has just earned: for analytics or a result screen. */
export function newlyEarned(before: Progress, after: Progress, all: readonly Achievement[]): readonly Achievement[] {
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
  sync(progress: Progress): Promise<SyncOutcome>;
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

  const run = async (progress: Progress): Promise<SyncOutcome> => {
    if (!deps.native()) return { kind: 'skipped', reason: 'unavailable' };
    if (configured.length === 0) return { kind: 'skipped', reason: 'unconfigured' };
    const owed = configured.filter(a => hasEarned(progress, a) && !sent.has(a.id));
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
    sync(progress) {
      // One at a time: a sync that arrives mid-sync waits, then sends only what is still owed.
      const next = (inFlight ?? Promise.resolve<SyncOutcome>({ kind: 'skipped', reason: 'nothing_new' }))
        .then(() => run(progress))
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
