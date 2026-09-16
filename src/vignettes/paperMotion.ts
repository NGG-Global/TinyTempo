import { clamp01, easeOut, REFERENCE_BEAT, TURN_OPEN_SEC } from './motion';
export { acceptDemoBeat, advanceOnHit, clamp01, easeOut } from './motion';

export const PAPER_MOTION = {
  successAccuracy: 70,
  partialAccuracy: 40,
  reopenBeats: 0.42,
  unfoldSec: 0.64,
  revealSec: 1.25,
} as const;

export const PAPER_SHAPES = ['star', 'heart', 'angel'] as const;
export type PaperShape = typeof PAPER_SHAPES[number];
export type PaperOutcome = 'success' | 'partial' | 'fail';
export interface PaperPoint { readonly x: number; readonly y: number }

/** The shape is chosen before any cut: its silhouette and reveal always agree. */
export function paperShape(roundId: number): PaperShape {
  return PAPER_SHAPES[((Math.max(1, Math.floor(roundId)) - 1) % PAPER_SHAPES.length)]!;
}

export function paperOutcome(accuracy: number): PaperOutcome {
  if (accuracy >= PAPER_MOTION.successAccuracy) return 'success';
  return accuracy >= PAPER_MOTION.partialAccuracy ? 'partial' : 'fail';
}

/** The blades meet on the cue and reopen before even a half-beat pair at 150 BPM. */
export function scissorOpening(age: number, beat = REFERENCE_BEAT): number {
  if (age < 0) return 1;
  return easeOut(age / (PAPER_MOTION.reopenBeats * beat));
}

/**
 * The example travels the fold; the player's cut starts at the top. Ease back over the
 * same window as the stage light so a late last snip does not teleport the scissors.
 */
export function paperHandoff(demoProgress: number, respondAge: number): number {
  return clamp01(demoProgress) * (1 - easeOut(respondAge / TURN_OPEN_SEC));
}

const point = (x: number, y: number): PaperPoint => ({ x, y });
const bezier = (a: PaperPoint, b: PaperPoint, c: PaperPoint, d: PaperPoint, count = 10): PaperPoint[] =>
  Array.from({ length: count }, (_, i) => {
    const t = (i + 1) / count, u = 1 - t;
    return point(u ** 3 * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t ** 3 * d.x,
      u ** 3 * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t ** 3 * d.y);
  });

/** Right halves, ordered top to bottom around the cut edge; mirror around the fold to open. */
export const PAPER_CONTOURS: Readonly<Record<PaperShape, readonly PaperPoint[]>> = {
  star: [point(0, -178), point(43, -59), point(170, -55), point(68, 23), point(106, 146), point(0, 73)],
  heart: [point(0, -99),
    ...bezier(point(0, -99), point(68, -207), point(188, -172), point(172, -58)),
    ...bezier(point(172, -58), point(165, 27), point(58, 119), point(0, 171))],
  angel: [point(0, -178),
    ...bezier(point(0, -178), point(40, -180), point(47, -131), point(15, -118), 8),
    point(17, -100), point(43, -104),
    ...bezier(point(43, -104), point(96, -161), point(161, -166), point(181, -129), 8),
    ...bezier(point(181, -129), point(175, -77), point(119, -28), point(74, -28), 8),
    point(105, 93), point(137, 146), point(82, 164), point(0, 172)],
};

/** Arclength sampling keeps long and short contour segments moving at the same speed. */
export function paperCutPoint(shape: PaperShape, progress: number): PaperPoint {
  const points = PAPER_CONTOURS[shape];
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y));
  let distance = lengths.reduce((sum, n) => sum + n, 0) * clamp01(progress);
  for (let i = 0; i < lengths.length; i++) {
    const length = lengths[i]!;
    if (distance <= length) {
      const a = points[i]!, b = points[i + 1]!;
      const t = length > 0 ? distance / length : 0;
      return point(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    }
    distance -= length;
  }
  return points.at(-1)!;
}

export interface PaperReveal {
  readonly open: number;
  readonly lift: number;
  readonly tilt: number;
  readonly crumple: number;
  readonly drop: number;
}

/** Five endings share the same contact time; all settle within the shortest reveal hold. */
export function paperReveal(age: number, outcome: PaperOutcome, shape: PaperShape, reduced = false): PaperReveal {
  if (age < 0) return { open: 0, lift: 0, tilt: 0, crumple: 0, drop: 0 };
  const p = easeOut(age / PAPER_MOTION.unfoldSec);
  if (outcome === 'fail') {
    return { open: p * 0.16, lift: 0, tilt: reduced ? 0 : p * 0.24,
      crumple: easeOut((age - 0.12) / 0.44), drop: reduced ? 0 : 70 * easeOut((age - 0.46) / 0.55) };
  }
  if (outcome === 'partial') {
    return { open: p * 0.72, lift: reduced ? 0 : 12 * p,
      tilt: reduced ? 0 : Math.sin(age * 15) * Math.exp(-age * 3) * 0.1, crumple: 0, drop: 0 };
  }
  const settle = reduced ? 0 : Math.sin(age * (shape === 'heart' ? 9 : 12)) * Math.exp(-age * 3);
  return { open: p, lift: reduced ? 0 : p * (shape === 'angel' ? 42 : 20),
    tilt: shape === 'star' ? settle * 0.11 : 0, crumple: 0, drop: 0 };
}
