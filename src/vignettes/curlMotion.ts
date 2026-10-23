import type { Judgement } from '@/rhythm/judge';
import { advanceOnHit, clamp01, easeOut, REFERENCE_BEAT } from './motion';
export { acceptDemoBeat, clamp01, easeOut, REFERENCE_BEAT } from './motion';

/** Presentation-only curves. They never alter a target, grade or score. */
export const CURL_MOTION = {
  // Rep phases are fractions of a beat, not seconds, for the reason the saw gives:
  // the tightest authored interval is a half beat at every tempo from 120 to 150 BPM,
  // and a rep held in seconds would still be lowering when the next one had to start.
  liftBeats: 0.36,
  squeezeBeats: 0.08,
  lowerBeats: 0.4,
  /** How far a wasted tap gets the weight before the arm gives: a half rep, never a rep. */
  halfRep: 0.45,
  /** Elbow to the centre of the grip, in figure units. */
  forearm: 176,
  /** The forearm hanging straight down, as a screen-space angle. */
  hangRad: Math.PI / 2,
  /** The sweep from hanging to the squeeze. Past vertical, so the weight ends in front of the chest. */
  sweepRad: 2.48,
  /** A flawless response leaves one rep in the set; the unscored coda takes it. */
  pumpAtFullResponse: 0.86,
} as const;

export interface CurlTiming {
  readonly liftSec: number;
  readonly squeezeSec: number;
  readonly lowerSec: number;
}

/** The rep's phases in seconds for a given beat length. */
export function curlTiming(beat = REFERENCE_BEAT): CurlTiming {
  return {
    liftSec: CURL_MOTION.liftBeats * beat,
    squeezeSec: CURL_MOTION.squeezeBeats * beat,
    lowerSec: CURL_MOTION.lowerBeats * beat,
  };
}

/**
 * Flexion from the squeeze onward: `peak` at the top and held there, then lowered
 * under control to 0, the arm hanging. The squeeze itself is at age 0 and carries the
 * timing. Before any rep the arm hangs.
 */
export function curlFlex(age: number, peak = 1, beat = REFERENCE_BEAT): number {
  if (age < 0) return 0;
  const { squeezeSec, lowerSec } = curlTiming(beat);
  const p = clamp01((age - squeezeSec) / (lowerSec - squeezeSec));
  // Slow off the top and slow into the bottom: a lowered weight, not a dropped one.
  return clamp01(peak) * (1 - p * p * (3 - 2 * p));
}

/**
 * The lift before a known squeeze: from wherever the arm is, gathering speed up to
 * exactly 1 on the beat. Quick pairs begin their lift while the previous rep is still
 * lowering, so blend from that flexion rather than snapping to hanging first.
 */
export function curlLift(untilSqueeze: number, from = 0, beat = REFERENCE_BEAT): number {
  const p = clamp01(1 - untilSqueeze / curlTiming(beat).liftSec);
  const start = clamp01(from);
  return start + (1 - start) * p ** 1.8;
}

/** The forearm's screen-space angle at a flexion, from the elbow. */
export function forearmAngle(flex: number): number {
  return CURL_MOTION.hangRad - clamp01(flex) * CURL_MOTION.sweepRad;
}

/** The bicep swells late in the lift, so the squeeze is where it pops. */
export function bicepBulge(flex: number): number {
  return clamp01(flex) ** 1.7;
}

/** How pumped the arm is from accurate reps alone, as a fraction of the set. */
export function pumpLevel(reps: number, targets: number): number {
  return clamp01(reps / Math.max(1, targets)) * CURL_MOTION.pumpAtFullResponse;
}

/** When the dropped weight first meets the mat, in seconds after it leaves the hand. The rough sound's thud is placed here. */
export const DROP_LANDING_SEC = 0.3;
/** The two bounces after it lands, smaller each time. */
export const DROP_BOUNCE_SEC = { first: 0.3, second: 0.18 } as const;
/** How long a chalk stroke takes to draw on. */
export const CHALK_DRAW_SEC = 0.42;

/**
 * The dropped weight in the rough coda: its height above where it comes to rest on the
 * mat, falling `from` figure units under gravity and bouncing twice, smaller each time.
 */
export function dropHeight(age: number, from: number): number {
  const firstSec = DROP_BOUNCE_SEC.first;
  const secondSec = DROP_BOUNCE_SEC.second;
  if (age <= 0) return from;
  if (age < DROP_LANDING_SEC) return from * (1 - (age / DROP_LANDING_SEC) ** 2);
  const first = age - DROP_LANDING_SEC;
  if (first < firstSec) return Math.sin(first / firstSec * Math.PI) * 44;
  const second = first - firstSec;
  if (second < secondSec) return Math.sin(second / secondSec * Math.PI) * 13;
  return 0;
}

/** The settle of a held pose after a strong finish: a small tremor that dies away. */
export function holdTremor(age: number): number {
  if (age <= 0) return 0;
  return Math.sin(age * 38) * Math.exp(-age * 2.4) * 0.03;
}

/** A chalk stroke drawn on: 0 before it starts, 1 complete. */
export function chalkDraw(age: number): number {
  return easeOut(age / CHALK_DRAW_SEC);
}

/**
 * Only an accurate rep counts. An extra tap gets the weight halfway before the arm
 * gives, and a missed target leaves the arm trembling under the load; neither is a rep,
 * and an omission never invents one the player did not make.
 */
export function advanceRep(reps: number, kind: Judgement['kind']): number {
  return advanceOnHit(reps, kind);
}
