import { ENDLESS } from '../config/endless';
import { rankedMs } from '../game/endless';
import { playGamesId } from './ids';
import type { LeaderboardReason, PlayGames, SubmitReason } from './playGames';

/**
 * The Endless Survival leaderboard, as decisions: what a score is, which one is worth
 * sending, and what to do when sending fails. Pure — Play Games, storage, analytics and
 * the day are injected — so every rule is tested under node, the split
 * `playgames/leaderboard.ts` (Daily Tempo) already keeps. `playgames/endless.ts` wires it
 * to the game. Daily Tempo's module, id, score scale and storage key are not touched.
 *
 * **The score is the survival time in whole milliseconds**, submitted to a Play Games
 * leaderboard of the *Time* format with *Larger is better*, so Play renders 66 032 as
 * 1:06.03. No scale, no packing of accuracy into the integer: equal times tie, which v1
 * accepts rather than hiding a second score inside the first.
 *
 * **One leaderboard is daily, weekly and all-time at once**, and a submission is filed
 * into whichever daily and weekly windows are *current when it arrives*. That is the
 * rule every policy here follows. A finished run is sent at once if it can be. One that
 * cannot — offline, a timeout, a player signed out — is kept pending **for the Play Games
 * day it was played on** and sent only while that day lasts; once the day has turned it is
 * dropped from the queue, because sending it then would post it to a daily and a weekly
 * chart the player did not play it on. The local best keeps the time either way, and the
 * player's next ranked run posts to the board. The all-time view, which only ever keeps
 * the maximum, therefore shows a best that reached Play Games, never one that was held
 * back — and the game never tells the player a past day's time was posted to that day.
 *
 * **Play Games is never required.** Nothing here can delay, block or fail the result, and
 * nothing prompts for sign-in except `open()`, which the player asked for by tapping.
 */

/** The longest survival a leaderboard will take: the ruleset's own plausibility ceiling. */
export const MAX_ENDLESS_SCORE = ENDLESS.maxRunMs;

/** A survival time as a leaderboard score, or null for anything that is not a ranked time. */
export function endlessScore(elapsedMs: number): number | null {
  return rankedMs(elapsedMs);
}

/** A leaderboard id the game will use, or null: the same rule every Play Games id follows. */
export function endlessLeaderboardId(raw: unknown): string | null {
  return playGamesId(raw);
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The score tag a submission carries: the ruleset and the Play Games day it was played on. */
export function endlessScoreTag(rulesVersion: number, day: string): string | null {
  // At most 64 URI-safe characters, per the Games API.
  if (!Number.isInteger(rulesVersion) || rulesVersion < 0 || !DAY.test(day)) return null;
  return `r${rulesVersion}-${day}`;
}

/** The Play Games day's best, and how much of it Play Games has confirmed. */
export interface EndlessDayBest {
  readonly day: string;
  readonly best: number;
  /** The highest score confirmed submitted on this day; below `best` means one is pending. */
  readonly submitted: number;
}

export const ENDLESS_BOARD_KEY = 'tiny-tempo.endless-board.v1';
const VERSION = 1;
const validScore = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= -1 && n <= MAX_ENDLESS_SCORE;

/** The stored day's best, every field checked. Anything else is no best at all. */
export function parseEndlessDayBest(raw: string | null): EndlessDayBest | null {
  if (!raw) return null;
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return null; }
  if (typeof data !== 'object' || data === null) return null;
  const { day, best, submitted } = data as Record<string, unknown>;
  if (typeof day !== 'string' || !DAY.test(day) || !validScore(best) || best < 0 || !validScore(submitted)) return null;
  return { day, best, submitted: Math.min(submitted, best) };
}

/**
 * A new result against the day's record. Only a better score moves `best`; a new day
 * starts over, and **a best from an earlier day that never reached Play Games is
 * dropped** from the queue, for the reason the file's comment gives. `submitted` starts at
 * -1 so a first score of 0 is still sent.
 */
export function recordEndlessDayBest(current: EndlessDayBest | null, day: string, score: number): { readonly next: EndlessDayBest; readonly improved: boolean } {
  if (!current || current.day !== day) return { next: { day, best: score, submitted: -1 }, improved: true };
  if (score <= current.best) return { next: current, improved: false };
  return { next: { ...current, best: score }, improved: true };
}

/** The score still owed to Play Games today, or null. Yesterday's is never owed. */
export function pendingEndlessScore(current: EndlessDayBest | null, today: string): number | null {
  if (!current || current.day !== today) return null;
  return current.best > current.submitted ? current.best : null;
}

export type EndlessSubmitOutcome =
  | { readonly kind: 'submitted'; readonly score: number; readonly newBest: boolean }
  | { readonly kind: 'failed'; readonly score: number; readonly reason: Exclude<SubmitReason, 'submitted'> }
  | { readonly kind: 'skipped'; readonly reason: 'unconfigured' | 'signed_out' | 'unavailable' | 'nothing_pending' | 'not_better' | 'invalid' };

export type EndlessOpenOutcome = { readonly result: LeaderboardReason | 'unconfigured'; readonly signedIn: boolean };

/** The leaderboard analytics, as the adapter reports them. */
export type EndlessLeaderboardEvent =
  | { readonly event: 'endless_score_posted'; readonly durationMs: number; readonly newBest: boolean; readonly retry: boolean }
  | { readonly event: 'endless_score_failed'; readonly reason: Exclude<SubmitReason, 'submitted'>; readonly retry: boolean }
  | { readonly event: 'endless_board_opened'; readonly result: LeaderboardReason | 'unconfigured'; readonly signIn: boolean };

export interface EndlessLeaderboardDeps {
  /** The Play Games adapter in force now; read on every call, since boot installs it late. */
  readonly games: () => PlayGames;
  /** The configured id, validated by `endlessLeaderboardId`; null turns the feature off. */
  readonly id: string | null;
  readonly rulesVersion: number;
  readonly storage: Storage | null;
  /** Today on Play Games' daily clock (`dailyTempoDay`). */
  readonly today: () => string;
  readonly report: (event: EndlessLeaderboardEvent) => void;
  /** How long a submission may take before it is given up on and kept pending. */
  readonly timeoutMs?: number;
  /** Whether a native Play Games is installed at all; false in a browser. */
  readonly native: () => boolean;
}

export const ENDLESS_SUBMIT_TIMEOUT_MS = 15_000;

export interface EndlessLeaderboard {
  /** A finished, valid run: keep the day's best, and send it if it is new. Never rejects. */
  record(run: { readonly day: string; readonly elapsedMs: number }): Promise<EndlessSubmitOutcome>;
  /** Send a best that could not be sent earlier today. For boot, and for coming back online. */
  retry(): Promise<EndlessSubmitOutcome>;
  /** The native leaderboard screen, on its weekly view. The one call that may sign in. */
  open(): Promise<EndlessOpenOutcome>;
  /** Whether a leaderboard button can do anything on this build. */
  readonly available: boolean;
  /** Today's best as stored, for a result screen to say whether it was posted. */
  best(): EndlessDayBest | null;
}

export function createEndlessLeaderboard(deps: EndlessLeaderboardDeps): EndlessLeaderboard {
  const timeoutMs = deps.timeoutMs ?? ENDLESS_SUBMIT_TIMEOUT_MS;
  let memory: EndlessDayBest | null = null;
  let inFlight: Promise<EndlessSubmitOutcome> | null = null;

  const read = (): EndlessDayBest | null => {
    let raw: string | null = null;
    try { raw = deps.storage?.getItem(ENDLESS_BOARD_KEY) ?? null; } catch { raw = null; }
    return parseEndlessDayBest(raw) ?? memory;
  };
  const write = (best: EndlessDayBest): void => {
    memory = best;
    try { deps.storage?.setItem(ENDLESS_BOARD_KEY, JSON.stringify({ version: VERSION, ...best })); } catch { /* blocked storage: memory holds it */ }
  };
  const safeReport = (event: EndlessLeaderboardEvent): void => {
    try { deps.report(event); } catch { /* analytics never costs a score */ }
  };

  const withTimeout = <T>(work: Promise<T>, fallback: T): Promise<T> => new Promise(resolve => {
    const timer = setTimeout(() => resolve(fallback), timeoutMs);
    work.then(value => { clearTimeout(timer); resolve(value); }, () => { clearTimeout(timer); resolve(fallback); });
  });

  /** Send whatever is pending today. One at a time: a second call waits for the first. */
  const send = (retry: boolean): Promise<EndlessSubmitOutcome> => {
    if (inFlight) return inFlight.then(() => send(retry));
    const attempt = (async (): Promise<EndlessSubmitOutcome> => {
      if (deps.id === null) return { kind: 'skipped', reason: 'unconfigured' };
      if (!deps.native()) return { kind: 'skipped', reason: 'unavailable' };
      const today = deps.today();
      const current = read();
      const score = pendingEndlessScore(current, today);
      if (score === null) return { kind: 'skipped', reason: 'nothing_pending' };
      const games = deps.games();
      // v2 signs players in by itself at startup; ask whether it has, never prompt.
      const status = games.status.authenticated ? games.status : await withTimeout(games.refresh(), games.status);
      if (!status.authenticated) return { kind: 'skipped', reason: 'signed_out' };
      const result = await withTimeout(
        games.submitScore(deps.id, score, endlessScoreTag(deps.rulesVersion, today)),
        { submitted: false, newBest: false, reason: 'timeout' as const },
      );
      if (result.submitted) {
        // Re-read: a better score recorded while this one was in the air stays pending.
        const latest = read() ?? current!;
        if (latest.day === today) write({ ...latest, submitted: Math.max(latest.submitted, score) });
        safeReport({ event: 'endless_score_posted', durationMs: score, newBest: result.newBest, retry });
        return { kind: 'submitted', score, newBest: result.newBest };
      }
      const reason = result.reason === 'submitted' ? 'failed' : result.reason;
      // Signed out is the player's choice, not a failure of the game; it is not reported.
      if (reason !== 'signed_out') safeReport({ event: 'endless_score_failed', reason, retry });
      return { kind: 'failed', score, reason };
    })().catch((): EndlessSubmitOutcome => ({ kind: 'skipped', reason: 'unavailable' }));
    inFlight = attempt;
    return attempt.finally(() => { if (inFlight === attempt) inFlight = null; });
  };

  return {
    get available() { return deps.id !== null && deps.native(); },
    best: () => read(),
    async record(run) {
      try {
        const score = endlessScore(run.elapsedMs);
        if (score === null || !DAY.test(run.day)) return { kind: 'skipped', reason: 'invalid' };
        const current = read();
        const { next, improved } = recordEndlessDayBest(current, run.day, score);
        if (improved) write(next);
        // A lower run sends nothing — unless today's best is still owed, which it then carries.
        if (!improved && pendingEndlessScore(next, deps.today()) === null) return { kind: 'skipped', reason: 'not_better' };
        return await send(false);
      } catch {
        return { kind: 'skipped', reason: 'unavailable' };
      }
    },
    retry: () => send(true),
    async open() {
      try {
        if (deps.id === null) {
          safeReport({ event: 'endless_board_opened', result: 'unconfigured', signIn: false });
          return { result: 'unconfigured', signedIn: false };
        }
        const games = deps.games();
        let signIn = false;
        if (!games.status.authenticated) {
          const refreshed = await games.refresh();
          if (!refreshed.authenticated) {
            // The player tapped the button: this is the one place sign-in is offered.
            signIn = true;
            const status = await games.signIn();
            if (!status.authenticated) {
              const result = deps.native() ? 'signed_out' as const : 'unavailable' as const;
              safeReport({ event: 'endless_board_opened', result, signIn });
              return { result, signedIn: false };
            }
          }
        }
        // Weekly: the view a returning player can still climb this week; Play's screen
        // switches to daily and all-time from there.
        const view = await games.showLeaderboard(deps.id, 'weekly');
        safeReport({ event: 'endless_board_opened', result: view.reason, signIn });
        // Signed in now, so anything owed today can go.
        if (view.shown) void send(true);
        return { result: view.reason, signedIn: true };
      } catch {
        return { result: 'failed', signedIn: false };
      }
    },
  };
}

/** What a result screen says about the time, from the outcome of recording it. */
export function endlessSubmissionCopy(outcome: EndlessSubmitOutcome): string {
  switch (outcome.kind) {
    case 'submitted': return 'Posted to the leaderboard';
    case 'failed': return outcome.reason === 'offline' || outcome.reason === 'timeout'
      ? 'Will post when you are back online today' : 'Could not post to the leaderboard';
    case 'skipped':
      if (outcome.reason === 'signed_out') return 'Sign in to Play Games to post your time';
      if (outcome.reason === 'not_better') return 'Your best today still stands';
      return '';
  }
}
