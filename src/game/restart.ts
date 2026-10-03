import {
  abandonAttempt, attemptCostsHeart, reconcile, type GrantHeartResult, type Health,
} from './health';
import type { Progress } from './progress';
import type { RewardedReason, RewardedResult } from '../monetization/types';

/**
 * What the restart puck does, as pure functions of the run and the save.
 *
 * **One heart is one real attempt at an unfinished frontier level.** Resume after an
 * interruption continues the attempt that already paid. A restart before the player's
 * first scored response is a reset of the same attempt and is free. A restart after it
 * ends the attempt and begins another, which costs a heart through `beginAttempt` like any
 * other attempt. Nothing here touches storage or the scene; `PlayScene` reads the answers.
 */

/**
 * - `try_again`: the level is already scored. The result's own path: a new attempt.
 * - `immediate`: nothing to charge. A finished or protected level, Premium, or a start
 *   that has not reached its first downbeat yet (no attempt exists to end).
 * - `confirm_free`: a frontier attempt that has not reached a scored response. Restarting
 *   resets it at no cost, and the sheet says so.
 * - `confirm_paid`: a frontier attempt in its scored part, with a heart to spend.
 * - `out_of_hearts`: the same, with none. The run continues until a heart is found.
 */
export type RestartKind = 'try_again' | 'immediate' | 'confirm_free' | 'confirm_paid' | 'out_of_hearts';

export interface RestartFacts {
  readonly level: number;
  readonly progress: Progress;
  readonly health: Health;
  readonly now: number;
  readonly premium: boolean;
  /** The attempt holding this run, or null when none has begun. */
  readonly attemptId: string | null;
  /** The level's result has been recorded (`recordOutcome`). */
  readonly outcomeRecorded: boolean;
  /** The attempt has entered its first scored response (`scoredResponseBegins`). */
  readonly scoredResponseBegun: boolean;
}

export function restartKind(facts: RestartFacts): RestartKind {
  if (facts.outcomeRecorded) return 'try_again';
  if (facts.premium || !attemptCostsHeart(facts.progress, facts.level)) return 'immediate';
  if (facts.attemptId === null) return 'immediate';
  if (!facts.scoredResponseBegun) return 'confirm_free';
  return reconcile(facts.health, facts.now).hearts > 0 ? 'confirm_paid' : 'out_of_hearts';
}

/** The three sheets the puck can raise. `immediate` and `try_again` raise none. */
export type RestartSheetKind = 'free' | 'paid' | 'empty';

export function sheetFor(kind: RestartKind): RestartSheetKind | null {
  switch (kind) {
    case 'confirm_free': return 'free';
    case 'confirm_paid': return 'paid';
    case 'out_of_hearts': return 'empty';
    default: return null;
  }
}

/**
 * The sheet an open sheet should become as the run moves under it. A free sheet whose
 * response has begun becomes paid; an empty sheet whose heart regenerated becomes paid,
 * because the ad is never offered while a heart is there; a run that turned free (Premium
 * arrived, or the level stopped costing) shows the free sheet, which never mentions a
 * heart. A recorded result closes it: the result has its own Try again.
 */
export function liveSheet(facts: RestartFacts): RestartSheetKind | null {
  const kind = restartKind(facts);
  if (kind === 'try_again') return null;
  if (kind === 'immediate') return 'free';
  return sheetFor(kind);
}

/**
 * How a start treats the attempt in hand, said explicitly rather than read off whether a
 * result exists.
 * - `resume`: the attempt continues (Resume, Retry after a failed audio start, the first
 *   start). A finished attempt is never resumed.
 * - `free_restart`: the same attempt from its first task; nothing is spent or ended.
 * - `new_attempt`: the attempt ends here and the next downbeat begins another — the paid
 *   restart, and Try again after a result.
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
 * rehearsal spends nothing, so none of them can turn a free restart into a paid one.
 */
export function scoredResponseBegins(event: 'respond' | 'judged' | 'other', context: {
  readonly teaching: boolean;
  readonly introducing: boolean;
  readonly rehearsal: boolean;
}): boolean {
  if (event === 'other') return false;
  return !context.teaching && !context.introducing && !context.rehearsal;
}

/** What one rewarded watch came to. */
export type HeartWatch =
  | { readonly kind: 'granted'; readonly granted: boolean; readonly hearts: number }
  | { readonly kind: 'failed'; readonly reason: RewardedReason };

/**
 * One rewarded video for one heart: the play screen's Watch and the restart sheet's both
 * come through here, so neither has an ad or reward path of its own. The heart is granted
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
 * A restart the player asked for while something asynchronous ran — a rewarded video or
 * a purchase — still applies only to the run it was asked on: the same scene, the same
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
