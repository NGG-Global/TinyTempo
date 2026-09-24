import { clamp01, easeInOutCubic, easeOut, REFERENCE_BEAT } from './motion';

/**
 * Curves and timings for the barber. Pure, so it is unit-tested under node and shared with
 * the synthesized voices: the coda's snips, the cape's whoosh and the hat's landing are
 * heard where they are drawn. Every ending settles inside the five-beat hold, which is
 * 2.0 s at the 150 BPM ceiling.
 */
export const BARBER_REVEAL_SEC = 1.8;

export const BARBER_MOTION = {
  successAccuracy: 70,
  partialAccuracy: 40,
  /**
   * The mop is cut in twelve locks: eight round the back, left to right over the crown,
   * then four across the fringe. A round can cut three quarters of them; the rest belong
   * to a clean round's finishing flurry, so a failed round always has hair left long.
   */
  locks: 12,
  backLocks: 8,
  reach: 0.75,
  /**
   * The order the locks are cut in: the left side and the left of the fringe first, then
   * over the crown, the rest of the fringe and down the right. A middling round has
   * therefore opened one eye's worth of fringe and left the other side long, which is what
   * makes it read as lopsided rather than as unfinished.
   */
  order: [0, 1, 8, 9, 2, 3, 4, 5, 10, 11, 6, 7] as const,
  /** The blades meet on the beat and are open again before a half-beat pair at 150 BPM. */
  reopenBeats: 0.42,
  /** How long the scissors take to move on to the next lock after a cut. */
  travelSec: 0.16,
  /** A clean round's finishing snips, from the coda's contact. */
  flurry: [0, 0.12, 0.24] as const,
  /** A snipped tuft reaches the floor in this long. */
  fallSec: 0.55,
} as const;

export type BarberOutcome = 'success' | 'partial' | 'fail';

export function barberOutcome(accuracy: number): BarberOutcome {
  if (accuracy >= BARBER_MOTION.successAccuracy) return 'success';
  return accuracy >= BARBER_MOTION.partialAccuracy ? 'partial' : 'fail';
}

/** Locks cut by `hits` judged hits out of `targets`. Never the whole mop. */
export function locksCut(hits: number, targets: number): number {
  const share = clamp01(Math.max(0, hits) / Math.max(1, targets));
  return Math.floor(BARBER_MOTION.locks * BARBER_MOTION.reach * share);
}

/**
 * When each lock was cut, indexed by lock: the judged hit that took the count past it in
 * `order`, then — on a clean round only — the flurry for whatever was left. Infinity for a
 * lock still long.
 */
export function cutTimes(hitTimes: readonly number[], targets: number, contact: number | null, outcome: BarberOutcome | null): number[] {
  const { locks, order, flurry } = BARBER_MOTION;
  const times = Array.from({ length: locks }, () => Infinity);
  let cut = 0;
  hitTimes.forEach((time, i) => {
    const reached = locksCut(i + 1, targets);
    for (; cut < reached; cut++) times[order[cut]!] = time;
  });
  if (contact !== null && outcome === 'success') {
    const left = locks - cut;
    for (let k = 0; k < left; k++) times[order[cut + k]!] = contact + flurry[Math.floor(k * flurry.length / left)]!;
  }
  return times;
}

/** Blade opening: 1 open, 0 shut on the beat, open again inside half a beat. */
export function snipOpening(age: number, beat = REFERENCE_BEAT): number {
  if (age < 0) return 1;
  return easeOut(age / (BARBER_MOTION.reopenBeats * beat));
}

/** A snipped tuft's fall: 0 where it was cut, 1 on the floor, accelerating like a dropped thing. */
export function tuftFall(age: number, still = false): number {
  if (age < 0) return 0;
  if (still) return 1;
  return clamp01(age / BARBER_MOTION.fallSec) ** 2;
}

export interface BarberFinale {
  /** 0 the cape is on, 1 it has been whisked away. */
  readonly cape: number;
  /** 0 squeezed shut, as they have been all round; 1 open on the result. */
  readonly eyes: number;
  /** A clean cut catching the light. */
  readonly shine: number;
  /** A rough round's beanie: 0 above the frame, 1 on the head. */
  readonly hat: number;
  /** The beanie's squash as it lands. */
  readonly squash: number;
}

/** Contacts the synthesized codas share with the picture. */
export const BARBER_CUES = {
  success: { capeAt: 0.46, eyesAt: 0.74, shineAt: 0.92 },
  partial: { capeAt: 0.3, eyesAt: 0.62 },
  fail: { alarmAt: 0.08, hatFrom: 0.2, hatLands: 0.5 },
} as const;

const step = (age: number, from: number, length: number, still: boolean, ease = easeOut): number =>
  still ? (age >= from ? 1 : 0) : ease((age - from) / length);

/**
 * The reveal. A clean round finishes the cut and whisks the cape off; a middling one takes
 * the cape off on what there is; a rough one never shows it — a beanie comes down instead.
 */
export function barberFinale(age: number, outcome: BarberOutcome, still = false): BarberFinale {
  const none = { cape: 0, eyes: 0, shine: 0, hat: 0, squash: 0 };
  if (age < 0) return none;
  if (outcome === 'success') {
    const cue = BARBER_CUES.success;
    return {
      ...none,
      cape: step(age, cue.capeAt, 0.42, still, easeInOutCubic),
      eyes: step(age, cue.eyesAt, 0.16, still),
      shine: step(age, cue.shineAt, 0.3, still),
    };
  }
  if (outcome === 'partial') {
    const cue = BARBER_CUES.partial;
    return { ...none, cape: step(age, cue.capeAt, 0.5, still, easeInOutCubic), eyes: step(age, cue.eyesAt, 0.2, still) };
  }
  const cue = BARBER_CUES.fail;
  const falling = clamp01((age - cue.hatFrom) / (cue.hatLands - cue.hatFrom));
  const landed = age - cue.hatLands;
  return {
    ...none,
    eyes: step(age, cue.alarmAt, 0.08, still),
    hat: still ? (age >= cue.hatFrom ? 1 : 0) : falling * falling,
    squash: still || landed < 0 ? 0 : Math.sin(clamp01(landed / 0.24) * Math.PI) * (1 - clamp01(landed / 0.24)),
  };
}
