import type { ShelfItemView } from './replayTimer';
import {
  abandonAttempt, attemptCostsHeart, type GrantHeartResult, type Health,
} from './health';
import type { Progress } from './progress';
import type { RewardedReason, RewardedResult } from '../monetization/types';

/**
 * What the restart puck does, as pure functions of the run and the save.
 *
 * **One heart is one attempt at an unfinished frontier level, and a restart is a resource of
 * its own** (`game/dailyRestarts.ts`). Resume after an interruption continues the attempt that
 * already paid. A restart before the player's first scored response is a reset of the same
 * attempt and is free. A restart after it uses one of the day's restarts and is the same
 * attempt from its first task again: the heart it began on stays its heart, so nothing is
 * charged twice. With none left, a rewarded ad buys one restart, a replay timer
 * (`game/replayTimer.ts`) makes every restart free for a while, or the run goes on. Nothing
 * here touches storage or the scene; `PlayScene` reads the answers.
 */

/**
 * - `try_again`: the level is already scored. The result's own path: a new attempt.
 * - `immediate`: nothing to charge. A finished or protected level, a running replay timer,
 *   the legacy Premium, or a start that has not reached its first downbeat yet (no attempt
 *   exists to end).
 * - `confirm_free`: a frontier attempt that has not reached a scored response. Restarting
 *   resets it at no cost, and the sheet says so.
 * - `confirm_restart`: a frontier attempt in its scored part, with a daily restart to use.
 * - `out_of_restarts`: the same, with none left today. The ad buys one, or the run goes on.
 */
export type RestartKind = 'try_again' | 'immediate' | 'confirm_free' | 'confirm_restart' | 'out_of_restarts';

export interface RestartFacts {
  readonly level: number;
  readonly progress: Progress;
  readonly health: Health;
  readonly now: number;
  /** The legacy entitlement, for an account that holds it: free restarts, like a timer. */
  readonly premium: boolean;
  /** A replay timer runs on this device now (`replayTimerActive`). */
  readonly timerActive: boolean;
  /** The attempt holding this run, or null when none has begun. */
  readonly attemptId: string | null;
  /** The level's result has been recorded (`recordOutcome`). */
  readonly outcomeRecorded: boolean;
  /** The attempt has entered its first scored response (`scoredResponseBegins`). */
  readonly scoredResponseBegun: boolean;
  /** Today's restarts still unused (`restartsLeft`). */
  readonly restartsLeft: number;
  /** The held replay timers the empty sheet can start (`shelfView`), unexpired. */
  readonly shelf: readonly ShelfItemView[];
}

export function restartKind(facts: RestartFacts): RestartKind {
  if (facts.outcomeRecorded) return 'try_again';
  if (facts.premium || facts.timerActive || !attemptCostsHeart(facts.progress, facts.level)) return 'immediate';
  if (facts.attemptId === null) return 'immediate';
  if (!facts.scoredResponseBegun) return 'confirm_free';
  return facts.restartsLeft > 0 ? 'confirm_restart' : 'out_of_restarts';
}

/**
 * The sheets the puck can raise. `immediate` and `try_again` raise none; `timers` is the
 * picker the empty sheet opens, never raised by a kind on its own.
 */
export type RestartSheetKind = 'free' | 'daily' | 'empty' | 'timers';

export function sheetFor(kind: RestartKind): RestartSheetKind | null {
  switch (kind) {
    case 'confirm_free': return 'free';
    case 'confirm_restart': return 'daily';
    case 'out_of_restarts': return 'empty';
    default: return null;
  }
}

/**
 * The sheet an open sheet should become as the run moves under it. A free sheet whose
 * response has begun becomes the daily one; an empty sheet left open past midnight becomes
 * the daily one, because the ad is never offered while a restart is there; a run that turned
 * free (a timer or Premium arrived, or the level stopped costing) shows the free sheet, which
 * never mentions a cost. A recorded result closes it: the result has its own Try again. The
 * timer picker stays open while the empty sheet is what the run would raise, since it is
 * that sheet's own second page.
 */
export function liveSheet(facts: RestartFacts, shown: RestartSheetKind | null = null): RestartSheetKind | null {
  const kind = restartKind(facts);
  if (kind === 'try_again') return null;
  if (kind === 'immediate') return 'free';
  const next = sheetFor(kind);
  return shown === 'timers' && next === 'empty' ? 'timers' : next;
}

/**
 * How a start treats the attempt in hand, said explicitly rather than read off whether a
 * result exists.
 * - `resume`: the attempt continues (Resume, Retry after a failed audio start, the first
 *   start). A finished attempt is never resumed.
 * - `free_restart`: the same attempt from its first task; no heart is spent and nothing is
 *   ended. Every restart from the puck, a daily or rewarded one included.
 * - `new_attempt`: the attempt ends here and the next downbeat begins another — Try again
 *   and the replay block after a result.
 */
export type StartMode = 'resume' | 'free_restart' | 'new_attempt';

export interface AttemptHandover {
  /** The id the start continues, or null for a fresh one. */
  readonly keep: string | null;
  /** The id this start ends, or null. Ended once, here, before anything else runs. */
  readonly abandon: string | null;
}

export function attemptForStart(mode: StartMode, attemptId: string | null, outcomeRecorded: boolean): AttemptHandover {
  if (mode === 'new_attempt') return { keep: null, abandon: outcomeRecorded ? null : attemptId };
  return { keep: outcomeRecorded ? null : attemptId, abandon: null };
}

/**
 * A task an interruption cut short, and the most it may still be credited (`scoreCeiling`).
 * Paused twice inside the same task, the lower ceiling holds: a second pause can no more
 * improve the task than the first.
 */
export interface PausedTask {
  readonly task: number;
  readonly ceiling: number;
}

export function pauseTask(previous: PausedTask | null, task: number, ceiling: number): PausedTask {
  const held = Number.isFinite(ceiling) ? Math.max(0, Math.min(100, ceiling)) : 100;
  return previous !== null && previous.task === task ? { task, ceiling: Math.min(previous.ceiling, held) } : { task, ceiling: held };
}

/** The ceiling a task completes under: its pause's, or none (100). */
export function ceilingFor(paused: PausedTask | null, task: number): number {
  return paused !== null && paused.task === task ? paused.ceiling : 100;
}

/**
 * Where Resume continues an attempt: the first task with no result, when at least one is
 * finished and one is still to play. Null otherwise — nothing finished starts the level
 * as it always did (its teach pass or introduction included), and everything finished is
 * a result, never a run. The completed tasks are kept and never played or reported again.
 */
export function resumeTask(results: readonly (number | undefined)[], taskCount: number): number | null {
  let next = 0;
  while (next < taskCount && results[next] !== undefined) next++;
  return next > 0 && next < taskCount ? next : null;
}

/**
 * The lead-in a continued task is placed with: its own (a breather keeps its four bars), and
 * never less than the level's opening bar, so the pulse is found again before the
 * demonstration — most tasks have no lead-in of their own.
 */
export function resumeLeadBeats(taskLeadBeats: number, openingBeats: number): number {
  return Math.max(taskLeadBeats, openingBeats);
}

/**
 * The ledger side of a start's handover: an ended attempt keeps the heart it spent and
 * holds nothing any more, so the next `beginAttempt` with a new id spends exactly one.
 * Idempotent, like `abandonAttempt`.
 */
export function releaseAttempt(health: Health, handover: AttemptHandover, now: number = Date.now()): Health {
  return handover.abandon === null ? health : abandonAttempt(health, handover.abandon, now);
}

/**
 * Whether a phase change, or a judgement, means the attempt's scored part has begun. The
 * first-run pass and a finer grid's introduction count toward nothing, and the DEV
 * rehearsal spends nothing, so none of them can turn a free restart into one that uses a
 * daily restart. A restart clears it: the new pass starts free until it scores again.
 */
export function scoredResponseBegins(event: 'respond' | 'judged' | 'other', context: {
  readonly teaching: boolean;
  readonly introducing: boolean;
  readonly rehearsal: boolean;
}): boolean {
  if (event === 'other') return false;
  return !context.teaching && !context.introducing && !context.rehearsal;
}

/** What one rewarded watch for a restart came to: a restart, or why not. */
export type RestartWatch = { readonly kind: 'rewarded' } | { readonly kind: 'failed'; readonly reason: RewardedReason };

/**
 * One rewarded video for one restart, used straight away: nothing is banked, so there is no
 * grant to dedupe and nothing left over if the run ended while it played. A show that throws
 * is a failure, never an exception into the scene.
 */
export async function watchForRestart(show: () => Promise<RewardedResult>): Promise<RestartWatch> {
  let result: RewardedResult;
  try { result = await show(); } catch { return { kind: 'failed', reason: 'failed' }; }
  return result.ok ? { kind: 'rewarded' } : { kind: 'failed', reason: result.reason };
}

/** What one rewarded watch came to. */
export type HeartWatch =
  | { readonly kind: 'granted'; readonly granted: boolean; readonly hearts: number }
  | { readonly kind: 'failed'; readonly reason: RewardedReason };

/**
 * One rewarded video for one heart: the play screen's Watch and the map's both come through
 * here, so neither has an ad or reward path of its own. The heart is granted
 * the moment the SDK confirms the reward, through the claim id's dedupe, whatever happened
 * to the screen meanwhile: the player watched it, so the heart is theirs. What the caller
 * does with it afterwards is the caller's to check.
 */
export async function watchForHeart(
  show: () => Promise<RewardedResult>, redeem: (claimId: string) => GrantHeartResult, claimId: string,
): Promise<HeartWatch> {
  let result: RewardedResult;
  try { result = await show(); } catch { return { kind: 'failed', reason: 'failed' }; }
  if (!result.ok) return { kind: 'failed', reason: result.reason };
  const grant = redeem(claimId);
  return { kind: 'granted', granted: grant.granted, hearts: grant.health.hearts };
}

/**
 * A restart the player asked for while something asynchronous ran — a rewarded video —
 * still applies only to the run it was asked on: the same scene, the same
 * attempt, no result recorded since, and no other start begun in between.
 */
export interface RestartTicket {
  readonly attemptId: string | null;
  readonly startRequest: number;
}

export function ticketStillApplies(ticket: RestartTicket, now: {
  readonly disposed: boolean;
  readonly attemptId: string | null;
  readonly startRequest: number;
  readonly outcomeRecorded: boolean;
}): boolean {
  return !now.disposed && !now.outcomeRecorded && now.attemptId === ticket.attemptId && now.startRequest === ticket.startRequest;
}

/**
 * How long a result ignores taps after it appears, in seconds. The summary opens on the
 * last coda's end, and a player still tapping the rhythm lands a tap or two on it: a failed
 * result's tap-anywhere is Try again, which on the frontier spends a heart, and a cleared
 * one's is Continue, which leaves the result unread. The block takes about this long to
 * rise into place, so a tap the block is ready for is one the result takes.
 */
export const RESULT_ARM_SEC = 0.7;

/** Whether a result shown at `shownAtSec` takes a tap at `nowSec` (wall-clock seconds). */
export function resultArmed(shownAtSec: number, nowSec: number): boolean {
  // A microsecond of tolerance: wall-clock seconds are floats, and 10.7 − 10 is under 0.7.
  return Number.isFinite(shownAtSec) && nowSec - shownAtSec >= RESULT_ARM_SEC - 1e-6;
}

/**
 * The hearts Try again will spend, said on the block before it is pressed: one on an
 * unfinished frontier level past the protected area, none on a finished or protected one,
 * and none under Premium. The same rule `beginAttempt` charges by.
 */
export function tryAgainCost(facts: { readonly progress: Progress; readonly level: number; readonly premium: boolean }): 0 | 1 {
  return !facts.premium && attemptCostsHeart(facts.progress, facts.level) ? 1 : 0;
}
