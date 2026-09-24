import { clamp01, easeOut, REFERENCE_BEAT } from './motion';

/**
 * Curves for the paintbrush. Pure, so the stroke count, the brush travel and both endings
 * are unit-tested under node and shared with the synthesized swish. A round lays down
 * strokes and keeps the last of the picture for a clean round's finish.
 */
export const CANVAS_REVEAL_SEC = 1.7;

export const CANVAS_MOTION = {
  /** Strokes in every painting. A task of any length maps onto this list. */
  strokes: 8,
  /** A round can lay this much of the picture; the rest is a clean round's finishing strokes. */
  reach: 0.8,
  /** One stroke travels the bristles and settles inside half a beat, so a quick pair still reads as two. */
  travelBeats: 0.42,
  /** A clean round's remaining strokes, from the coda's contact. */
  flurry: [0, 0.1, 0.2, 0.3] as const,
  liftFrom: 0.48,
  signFrom: 0.85,
  signSec: 0.4,
  /** A rough round: a smear across the wet paint, then a drip off the ferrule. */
  smearSec: 0.55,
  dripFrom: 0.4,
} as const;

/** Strokes laid by `hits` judged hits of `targets`. A round alone never finishes the picture. */
export function strokesLaid(hits: number, targets: number): number {
  const share = clamp01(Math.max(0, hits) / Math.max(1, targets));
  return Math.floor(CANVAS_MOTION.strokes * CANVAS_MOTION.reach * share);
}

/**
 * When each stroke was laid, in painting order: the judged hit that took the count past it,
 * then — on a clean round only — the finishing flurry. Infinity for a stroke still missing.
 */
export function strokeTimes(hitTimes: readonly number[], targets: number, contact: number | null, successful: boolean): number[] {
  const { strokes, flurry } = CANVAS_MOTION;
  const times = Array.from({ length: strokes }, () => Infinity);
  let laid = 0;
  hitTimes.forEach((time, i) => {
    const reached = strokesLaid(i + 1, targets);
    for (; laid < reached; laid++) times[laid] = time;
  });
  if (contact !== null && successful) {
    const left = strokes - laid;
    for (let k = 0; k < left; k++) times[laid + k] = contact + flurry[Math.floor(k * flurry.length / left)]!;
  }
  return times;
}

/** How far the bristles have travelled along the stroke they are on, 0 at the start and 1 at the end. */
export function brushTravel(age: number, beat = REFERENCE_BEAT): number {
  if (age < 0) return 0;
  const t = age / (CANVAS_MOTION.travelBeats * beat);
  return t >= 1 ? 1 : easeOut(t);
}

export interface StrokePose {
  readonly x: number;
  readonly y: number;
  /** Direction of travel, radians, for the handle behind the bristles. */
  readonly angle: number;
}

/** Where the bristles are along a polyline, by arc length, so a long stroke is not rushed at its bends. */
export function strokePose(points: readonly (readonly [number, number])[], t: number): StrokePose {
  const count = Math.max(2, points.length);
  if (points.length < 2) {
    const only = points[0] ?? [0, 0];
    return { x: only[0], y: only[1], angle: 0 };
  }
  const lengths = [0];
  for (let i = 1; i < count; i++) {
    const a = points[i - 1]!, b = points[i]!;
    lengths.push(lengths[i - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = lengths[count - 1] || 1;
  const along = clamp01(t) * total;
  let i = 1;
  while (i < count - 1 && lengths[i]! < along) i++;
  const span = lengths[i]! - lengths[i - 1]! || 1;
  const f = (along - lengths[i - 1]!) / span;
  const a = points[i - 1]!, b = points[i]!;
  return {
    x: a[0] + (b[0] - a[0]) * f,
    y: a[1] + (b[1] - a[1]) * f,
    angle: Math.atan2(b[1] - a[1], b[0] - a[0]),
  };
}

export interface CanvasFinale {
  /** 0 with the bristles on the canvas, 1 lifted clear of it. */
  readonly lift: number;
  /** The signature in the corner, 0 hidden to 1 written. */
  readonly sign: number;
  /** A rough round's smear across the wet paint. */
  readonly smear: number;
  /** How far the drip has run. */
  readonly drip: number;
}

export function canvasFinale(age: number, successful: boolean, still = false): CanvasFinale {
  const M = CANVAS_MOTION;
  const none = { lift: 0, sign: 0, smear: 0, drip: 0 };
  if (age < 0) return none;
  const step = (from: number, length: number) => (still ? (age >= from ? 1 : 0) : easeOut((age - from) / length));
  if (successful) {
    return { ...none, lift: step(M.liftFrom, 0.35), sign: step(M.signFrom, M.signSec) };
  }
  return { ...none, smear: step(0, M.smearSec), drip: step(M.dripFrom, 0.7) };
}
