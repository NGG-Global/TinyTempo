import { RHYTHM } from '../config/rhythm';
import type { RoundResult } from './scoring';

/**
 * What the result's timing details say: how a level's taps were spread around the beat,
 * and the one thing to change. Pure, so every rule is tested under node.
 *
 * The scorer already knew all of it — Perfects, Goods, misses, extras and every tap's
 * signed error — and the plaque boiled it down to a percentage and "On the beat". A rhythm
 * game's most useful sentence is the one that turns "I got 72%" into "I am consistently
 * early", because that is a thing a player can fix.
 *
 * **The lean is a median, not a mean.** One flubbed tap 120 ms late in a level of thirty
 * otherwise 20 ms early must not read as "on the beat"; the median is the tap the player
 * makes most. **Spread is measured round the lean**, as the mean distance from it, so a
 * player who is steady but early is told "early", and one who is centred but scattered is
 * told "uneven" — opposite advice, which the old absolute mean could not tell apart.
 *
 * The errors are on the heard clock with the Tap offset already applied (`AudioClock.input`),
 * so a lean is the player's, not the device's — unless the offset is wrong, in which case
 * every tap leans the same way by about the same amount. That pattern gets its own advice.
 */

/** A level's timing so far: the scorer's counts, summed over its scored tasks, and every hit's signed error. */
export interface TimingTally {
  readonly perfect: number;
  readonly good: number;
  readonly missed: number;
  readonly extras: number;
  readonly deltasMs: readonly number[];
}

export const EMPTY_TIMING: TimingTally = Object.freeze({ perfect: 0, good: 0, missed: 0, extras: 0, deltasMs: Object.freeze([]) });

export function addRound(tally: TimingTally, result: Pick<RoundResult, 'perfect' | 'good' | 'missed' | 'extras' | 'deltasMs'>): TimingTally {
  return {
    perfect: tally.perfect + result.perfect,
    good: tally.good + result.good,
    missed: tally.missed + result.missed,
    extras: tally.extras + result.extras,
    deltasMs: [...tally.deltasMs, ...result.deltasMs.filter(Number.isFinite)],
  };
}

export const TIMING = {
  /** Fewer hits than this and a lean is noise, not a habit. */
  minHits: 4,
  /** Inside this, the lean is too small to act on: centred. A quarter of the Perfect window. */
  centredMs: 12,
  /** From here a lean is plainly early or late rather than slightly. */
  clearMs: 35,
  /** Mean distance from the lean past which the taps are scattered rather than leaning. */
  unevenMs: 40,
  /**
   * A lean this large and this steady is more likely the device's output lag than the
   * player — the Tap offset is what fixes it, not practice.
   */
  offsetLeanMs: 60,
  offsetSpreadMs: 30,
  offsetMinHits: 8,
} as const;

export type Tendency = 'none' | 'sparse' | 'centred' | 'early' | 'late' | 'uneven';

export interface TimingReport {
  /** "24 Perfect · 5 Good · 1 Miss", with extras only when there were any. */
  readonly counts: string;
  /** What the taps did, as a fact. */
  readonly lean: string;
  /** The one thing to change, or to keep. */
  readonly advice: string;
  readonly tendency: Tendency;
  /** The median signed error, rounded; null with too few hits to read one. */
  readonly offsetMs: number | null;
  /** Mean distance from the median, rounded; null with too few hits. */
  readonly spreadMs: number | null;
  /** Each hit's error as a fraction of the Good window, −1 early to 1 late, for the bar. */
  readonly marks: readonly number[];
  /** The Perfect window as the same fraction, for the bar's centre band. */
  readonly perfectBand: number;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function countsLine(tally: TimingTally): string {
  const parts = [`${tally.perfect} Perfect`, `${tally.good} Good`, `${tally.missed} Miss`];
  if (tally.extras > 0) parts.push(`${tally.extras} Extra`);
  return parts.join(' · ');
}

const ADVICE = {
  none: 'Listen for the count, then tap on Go!',
  missed: 'Most beats went by — start right on Go!',
  offsetEarly: 'Always early? Check your Tap offset.',
  offsetLate: 'Always late? Check your Tap offset.',
  extras: 'One tap per beat — extras cost points.',
  slightlyEarly: 'Slightly early — sit behind the beat.',
  early: 'Early — let the beat arrive, then tap.',
  slightlyLate: 'Slightly late — lean into the beat.',
  late: 'Late — tap as the beat lands.',
  uneven: 'Uneven — keep one steady pulse going.',
  centred: 'Right on the beat — keep it there.',
} as const;

/** Every sentence the details can show, for the tests that keep them short enough to fit. */
export const TIMING_ADVICE: readonly string[] = Object.values(ADVICE);

/**
 * The report for a level, or null when there is nothing to report — a preview result, or
 * a level that judged no beat at all. The advice picks the most useful single thing, in
 * this order: no hits, most beats missed, a steady lean big enough to be the device, a lot
 * of extra taps, a lean, scattered taps, and otherwise praise.
 */
export function timingReport(tally: TimingTally): TimingReport | null {
  const targets = tally.perfect + tally.good + tally.missed;
  if (targets === 0) return null;
  const deltas = tally.deltasMs.filter(Number.isFinite);
  const hits = deltas.length;
  const good = RHYTHM.goodMs;
  const marks = deltas.map(delta => Math.max(-1, Math.min(1, delta / good)));
  const base = { counts: countsLine(tally), marks, perfectBand: RHYTHM.perfectMs / good };
  if (hits === 0) {
    return { ...base, lean: 'No taps landed on a beat', advice: ADVICE.none, tendency: 'none', offsetMs: null, spreadMs: null };
  }
  const missedMost = tally.missed > hits;
  if (hits < TIMING.minHits) {
    return {
      ...base, lean: `Only ${hits} ${hits === 1 ? 'tap' : 'taps'} landed on a beat`,
      advice: missedMost ? ADVICE.missed : ADVICE.none, tendency: 'sparse', offsetMs: null, spreadMs: null,
    };
  }
  const centre = median(deltas)!;
  const spread = deltas.reduce((sum, delta) => sum + Math.abs(delta - centre), 0) / hits;
  // Rounded away from zero at the half, so an early lean and a late one of the same size
  // read as the same number: Math.round takes -33.5 to -33 and 33.5 to 34.
  const offsetMs = Math.sign(centre) * Math.round(Math.abs(centre));
  const spreadMs = Math.round(spread);
  const size = Math.abs(centre);
  const early = centre < 0;
  const centred = size < TIMING.centredMs;
  // Scattered wide of a small lean is unevenness, not a lean: the cure is a steadier pulse,
  // and "sit behind the beat" would only move the scatter.
  const uneven = spread > TIMING.unevenMs && size < TIMING.clearMs;
  const tendency: Tendency = uneven ? 'uneven' : centred ? 'centred' : early ? 'early' : 'late';
  const lean = centred ? 'Your taps were centred on the beat' : `You tended to tap ${Math.abs(offsetMs)} ms ${early ? 'early' : 'late'}`;

  let advice: string;
  if (missedMost) advice = ADVICE.missed;
  else if (size >= TIMING.offsetLeanMs && spread <= TIMING.offsetSpreadMs && hits >= TIMING.offsetMinHits) {
    advice = early ? ADVICE.offsetEarly : ADVICE.offsetLate;
  } else if (tally.extras >= Math.max(3, hits / 4)) advice = ADVICE.extras;
  else if (uneven) advice = ADVICE.uneven;
  else if (!centred) {
    advice = early
      ? (size >= TIMING.clearMs ? ADVICE.early : ADVICE.slightlyEarly)
      : (size >= TIMING.clearMs ? ADVICE.late : ADVICE.slightlyLate);
  } else advice = ADVICE.centred;

  return { ...base, lean, advice, tendency, offsetMs, spreadMs };
}
