import { clamp01, easeInOutCubic, easeOut, REFERENCE_BEAT } from './motion';

/**
 * Curves and timings for the toothbrush. Pure, so it is unit-tested under node and shared
 * with the synthesized voices: the finishing scrubs, the rinse and the gleam's "ting" are
 * heard where they are drawn. Every ending settles inside the five-beat hold.
 */
export const BRUSH_REVEAL_SEC = 1.8;

export const BRUSH_MOTION = {
  /** Eight teeth along the top and eight along the bottom, numbered left to right in each. */
  teeth: 16,
  /** A round can clean this much of the mouth; the rest is a clean round's finishing scrub. */
  reach: 0.8,
  /** Along the top row left to right, then back along the bottom: once round the mouth. */
  order: [0, 1, 2, 3, 4, 5, 6, 7, 15, 14, 13, 12, 11, 10, 9, 8] as const,
  /** One scrub: there and back along the teeth, settled inside a third of a beat. */
  scrubBeats: 0.36,
  travelSec: 0.14,
  /** A clean round's finishing scrubs, from the coda's contact. */
  flurry: [0, 0.1, 0.2] as const,
  withdrawFrom: 0.32,
  rinseFrom: 0.46,
  rinseSec: 0.44,
  gleamFrom: 0.98,
  gleamSec: 0.42,
  tingAt: 1.18,
  /** A rough round: the foam swells over the lip, runs down the chin, and one bubble bursts. */
  swellSec: 0.5,
  dripFrom: 0.2,
  blorpAt: 0.92,
} as const;

/** Teeth cleaned by `hits` judged hits of `targets`. A round alone never finishes the job. */
export function teethCleaned(hits: number, targets: number): number {
  const share = clamp01(Math.max(0, hits) / Math.max(1, targets));
  return Math.floor(BRUSH_MOTION.teeth * BRUSH_MOTION.reach * share);
}

/**
 * When each tooth came clean, indexed by tooth: the judged hit that took the count past it
 * in `order`, then — on a clean round only — the finishing scrubs. Infinity for a tooth
 * still dull.
 */
export function cleanTimes(hitTimes: readonly number[], targets: number, contact: number | null, successful: boolean): number[] {
  const { teeth, order, flurry } = BRUSH_MOTION;
  const times = Array.from({ length: teeth }, () => Infinity);
  let clean = 0;
  hitTimes.forEach((time, i) => {
    const reached = teethCleaned(i + 1, targets);
    for (; clean < reached; clean++) times[order[clean]!] = time;
  });
  if (contact !== null && successful) {
    const left = teeth - clean;
    for (let k = 0; k < left; k++) times[order[clean + k]!] = contact + flurry[Math.floor(k * flurry.length / left)]!;
  }
  return times;
}

/** The brush's travel along the teeth on a stroke, -1…1, and still again inside a third of a beat. */
export function scrub(age: number, beat = REFERENCE_BEAT): number {
  if (age < 0) return 0;
  const t = age / (BRUSH_MOTION.scrubBeats * beat);
  return t >= 1 ? 0 : Math.sin(t * Math.PI * 2) * (1 - t);
}

export interface BrushFinale {
  /** 0 at the teeth, 1 gone out of the mirror. */
  readonly withdraw: number;
  /** 0 foam as it is, 1 rinsed away. */
  readonly rinse: number;
  /** Where the gleam has swept to across the teeth, 0 left to 1 right; -1 before it starts. */
  readonly gleam: number;
  /** The big glint on the front teeth. */
  readonly ting: number;
  /** A rough round's foam: how far it has swelled, and how far it has run down the chin. */
  readonly swell: number;
  readonly drip: number;
  /** The one bubble that grows at the corner and bursts: its size, then -1 once burst. */
  readonly bubble: number;
}

export function brushFinale(age: number, successful: boolean, still = false): BrushFinale {
  const M = BRUSH_MOTION;
  const none = { withdraw: 0, rinse: 0, gleam: -1, ting: 0, swell: 0, drip: 0, bubble: 0 };
  if (age < 0) return none;
  const step = (from: number, length: number, ease = easeOut) => (still ? (age >= from ? 1 : 0) : ease((age - from) / length));
  if (successful) {
    const gleam = age < M.gleamFrom ? -1 : still ? 1 : clamp01((age - M.gleamFrom) / M.gleamSec);
    return {
      ...none,
      withdraw: step(M.withdrawFrom, 0.3, easeInOutCubic),
      rinse: step(M.rinseFrom, M.rinseSec),
      gleam,
      // The glint flares on its cue and settles to a steady shine rather than going out.
      ting: age < M.tingAt ? 0 : still ? 1 : easeOut((age - M.tingAt) / 0.18) * (1 - 0.25 * clamp01((age - M.tingAt - 0.3) / 0.3)),
    };
  }
  return {
    ...none,
    swell: step(0, M.swellSec),
    drip: still ? (age >= M.dripFrom ? 1 : 0) : clamp01((age - M.dripFrom) / 1.1),
    bubble: age >= M.blorpAt ? -1 : still ? 0 : clamp01((age - 0.3) / (M.blorpAt - 0.3)),
  };
}
