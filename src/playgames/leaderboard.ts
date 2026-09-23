import { playGamesId } from './ids';
import type { LeaderboardReason, PlayGames, SubmitReason } from './playGames';

/**
 * The Daily Tempo leaderboard, as decisions: what a score is, which one is worth sending,
 * and what to do when sending fails. Pure — Play Games, storage, analytics and the clock
 * are all injected — so every rule here is tested under node, the same split the rest of
 * `playgames/` and `monetization/` follow. `playgames/dailyTempo.ts` wires it to the game.
 *
 * **Play Games is never required.** A player who is signed out, offline, on a device
 * without Play Games or in a browser plays Daily Tempo exactly the same; nothing here can
 * delay, block or fail the result screen, and nothing here ever prompts for sign-in
 * except `open()`, which the player asked for by tapping the leaderboard button.
 */

/**
 * **The one conversion from accuracy to leaderboard score.** Play Games leaderboards take
 * a whole number (a `long`); Daily Tempo's result is a percentage. The score is the
 * accuracy in thousandths of a percent — `round(accuracy × 1000)` — so 0–100% is 0–100 000
 * and three decimals survive, enough to separate two players the game would show as the
 * same rounded percentage. The Play Console leaderboard is set to show it back as a number
 * with three decimal places, so 98 765 reads as 98.765.
 *
 * Changing the scale after launch would make old and new scores incomparable on the same
 * board, so it is fixed here and nowhere else.
 */
export const LEADERBOARD_SCALE = 1000;
export const MAX_LEADERBOARD_SCORE = 100 * LEADERBOARD_SCALE;

/** Accuracy (percent) to leaderboard score, or null for anything that is not a result. */
export function leaderboardScore(accuracy: number): number | null {
  if (typeof accuracy !== 'number' || !Number.isFinite(accuracy)) return null;
  const clamped = Math.max(0, Math.min(100, accuracy));
  // Through six decimals first: 0.5005 × 1000 is 500.49999999999994 in binary floating point,
  // and a half that rounds down on one device and up in a test is not one source of truth.
  return Math.round(Number((clamped * LEADERBOARD_SCALE).toFixed(6)));
}

/** And back, for showing a score the game sent. */
export function accuracyFromScore(score: number): number {
  return score / LEADERBOARD_SCALE;
}

/**
 * A leaderboard id the game will use, or null. The Console generates ids of URL-safe
 * characters (`CgkI…`); an all-digit value is the Games *project* id pasted into the wrong
 * field, which would fail on every call, so it is refused here instead.
 */
export function leaderboardId(raw: unknown): string | null {
  return playGamesId(raw);
}

/** The score tag a submission carries: the Daily Tempo day it was played on. */
export function scoreTag(day: string): string | null {
  // At most 64 URI-safe characters, per the Games API; a calendar day is ten.
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/** Today's best, and how much of it Play Games has confirmed. */
export interface DailyBest {
  readonly day: string;
  readonly best: number;
  /** The highest score confirmed submitted today; below `best` means one is pending. */
  readonly submitted: number;
}

const KEY = 'tiny-tempo.daily-tempo-best.v1';
const VERSION = 1;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const validScore = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= -1 && n <= MAX_LEADERBOARD_SCORE;

/** The stored best, every field checked. Anything else is no best at all. */
export function parseDailyBest(raw: string | null): DailyBest | null {
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
 * dropped**: a score carries no date of its own to Play Games, so sending yesterday's
 * best today would file it on today's daily view, against a chart that player did not
 * play. `submitted` starts at -1, so a first score of 0 is still sent.
 */
export function recordBest(current: DailyBest | null, day: string, score: number): { readonly next: DailyBest; readonly improved: boolean } {
  if (!current || current.day !== day) return { next: { day, best: score, submitted: -1 }, improved: true };
  if (score <= current.best) return { next: current, improved: false };
  return { next: { ...current, best: score }, improved: true };
}

/** The score still owed to Play Games today, or null. */
export function pendingScore(current: DailyBest | null, today: string): number | null {
  if (!current || current.day !== today) return null;
  return current.best > current.submitted ? current.best : null;
}

/** What one attempt to send came to. `skipped` means nothing was asked of Play Games. */
export type SubmitOutcome =
  | { readonly kind: 'submitted'; readonly score: number; readonly newBest: boolean }
  | { readonly kind: 'failed'; readonly score: number; readonly reason: Exclude<SubmitReason, 'submitted'> }
  | { readonly kind: 'skipped'; readonly reason: 'unconfigured' | 'signed_out' | 'unavailable' | 'nothing_pending' | 'not_better' | 'invalid' };

export type OpenOutcome = { readonly result: LeaderboardReason | 'unconfigured'; readonly signedIn: boolean };

/** The leaderboard analytics, as the adapter reports them. */
export type LeaderboardEvent =
  | { readonly event: 'leaderboard_score_submitted'; readonly accuracy: number; readonly newBest: boolean; readonly retry: boolean }
  | { readonly event: 'leaderboard_submit_failed'; readonly reason: Exclude<SubmitReason, 'submitted'>; readonly retry: boolean }
  | { readonly event: 'leaderboard_opened'; readonly result: LeaderboardReason | 'unconfigured'; readonly signIn: boolean };

export interface LeaderboardDeps {
  /** The Play Games adapter in force now; read on every call, since boot installs it late. */
  readonly games: () => PlayGames;
  /** The configured id, validated by `leaderboardId`; null turns the feature off. */
  readonly id: string | null;
  readonly storage: Storage | null;
  readonly today: () => string;
  readonly report: (event: LeaderboardEvent) => void;
  /** How long a submission may take before it is given up on and kept pending. */
  readonly timeoutMs?: number;
  /** Whether a native Play Games is installed at all; false in a browser. */
  readonly native: () => boolean;
}

export const SUBMIT_TIMEOUT_MS = 15_000;

export interface DailyTempoLeaderboard {
  /** A finished Daily Tempo: keep the day's best, and send it if it is new. Never rejects. */
  record(result: { readonly day: string; readonly accuracy: number }): Promise<SubmitOutcome>;
  /** Send a best that could not be sent earlier. For boot, and for coming back online. */
  retry(): Promise<SubmitOutcome>;
  /** The native leaderboard screen, on its daily view. The one call that may sign in. */
  open(): Promise<OpenOutcome>;
  /** Whether a leaderboard button can do anything on this build. */
  readonly available: boolean;
  /** Today's best as stored, for a result screen to show. */
  best(): DailyBest | null;
}

export function createDailyTempoLeaderboard(deps: LeaderboardDeps): DailyTempoLeaderboard {
  const timeoutMs = deps.timeoutMs ?? SUBMIT_TIMEOUT_MS;
  let memory: DailyBest | null = null;
  let inFlight: Promise<SubmitOutcome> | null = null;

  const read = (): DailyBest | null => {
    let raw: string | null = null;
    try { raw = deps.storage?.getItem(KEY) ?? null; } catch { raw = null; }
    return parseDailyBest(raw) ?? memory;
  };
  const write = (best: DailyBest): void => {
    memory = best;
    try { deps.storage?.setItem(KEY, JSON.stringify({ version: VERSION, ...best })); } catch { /* blocked storage: memory holds it */ }
  };
  const safeReport = (event: LeaderboardEvent): void => {
    try { deps.report(event); } catch { /* analytics never costs a score */ }
  };

  const withTimeout = <T>(work: Promise<T>, fallback: T): Promise<T> => new Promise(resolve => {
    const timer = setTimeout(() => resolve(fallback), timeoutMs);
    work.then(value => { clearTimeout(timer); resolve(value); }, () => { clearTimeout(timer); resolve(fallback); });
  });

  /** Send whatever is pending. One at a time: a second call waits for the first. */
  const send = (retry: boolean): Promise<SubmitOutcome> => {
    if (inFlight) return inFlight.then(() => send(retry));
    const attempt = (async (): Promise<SubmitOutcome> => {
      if (deps.id === null) return { kind: 'skipped', reason: 'unconfigured' };
      if (!deps.native()) return { kind: 'skipped', reason: 'unavailable' };
      const today = deps.today();
      const current = read();
      const score = pendingScore(current, today);
      if (score === null) return { kind: 'skipped', reason: 'nothing_pending' };
      const games = deps.games();
      // v2 signs players in by itself at startup; ask whether it has, never prompt.
      const status = games.status.authenticated ? games.status : await withTimeout(games.refresh(), games.status);
      if (!status.authenticated) return { kind: 'skipped', reason: 'signed_out' };
      const result = await withTimeout(games.submitScore(deps.id, score, scoreTag(today)), { submitted: false, newBest: false, reason: 'timeout' as const });
      if (result.submitted) {
        // Re-read: a better score recorded while this one was in the air stays pending.
        const latest = read() ?? current!;
        if (latest.day === today) write({ ...latest, submitted: Math.max(latest.submitted, score) });
        safeReport({ event: 'leaderboard_score_submitted', accuracy: Math.round(accuracyFromScore(score)), newBest: result.newBest, retry });
        return { kind: 'submitted', score, newBest: result.newBest };
      }
      const reason = result.reason === 'submitted' ? 'failed' : result.reason;
      // Signed out is the player's choice, not a failure of the game; it is not reported.
      if (reason !== 'signed_out') safeReport({ event: 'leaderboard_submit_failed', reason, retry });
      return { kind: 'failed', score, reason };
    })().catch((): SubmitOutcome => ({ kind: 'skipped', reason: 'unavailable' }));
    inFlight = attempt;
    return attempt.finally(() => { if (inFlight === attempt) inFlight = null; });
  };

  return {
    get available() { return deps.id !== null && deps.native(); },
    best: () => read(),
    async record(result) {
      try {
        const score = leaderboardScore(result.accuracy);
        if (score === null || !DAY.test(result.day)) return { kind: 'skipped', reason: 'invalid' };
        const current = read();
        const { next, improved } = recordBest(current, result.day, score);
        if (improved) write(next);
        // A lower retry sends nothing — unless an earlier best is still owed, which it then carries.
        if (!improved && pendingScore(next, deps.today()) === null) return { kind: 'skipped', reason: 'not_better' };
        return await send(false);
      } catch {
        return { kind: 'skipped', reason: 'unavailable' };
      }
    },
    retry: () => send(true),
    async open() {
      try {
        if (deps.id === null) {
          safeReport({ event: 'leaderboard_opened', result: 'unconfigured', signIn: false });
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
              safeReport({ event: 'leaderboard_opened', result, signIn });
              return { result, signedIn: false };
            }
          }
        }
        const view = await games.showLeaderboard(deps.id, 'daily');
        safeReport({ event: 'leaderboard_opened', result: view.reason, signIn });
        // Signed in now, so anything owed can go.
        if (view.shown) void send(true);
        return { result: view.reason, signedIn: true };
      } catch {
        return { result: 'failed', signedIn: false };
      }
    },
  };
}

/** What a result screen says about the score, from the outcome of recording it. */
export function submissionCopy(outcome: SubmitOutcome): string {
  switch (outcome.kind) {
    case 'submitted': return 'Posted to the leaderboard';
    case 'failed': return outcome.reason === 'offline' || outcome.reason === 'timeout'
      ? 'Will post when you are back online' : 'Could not post to the leaderboard';
    case 'skipped':
      if (outcome.reason === 'signed_out') return 'Sign in to Play Games to post your score';
      if (outcome.reason === 'not_better') return 'Your best today still stands';
      return '';
  }
}
