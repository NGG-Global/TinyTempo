import { clamp01, easeOut, REFERENCE_BEAT, TURN_OPEN_SEC } from './motion';
export { acceptDemoBeat, advanceOnHit, clamp01, easeOut } from './motion';

export const PAPER_MOTION = {
  successAccuracy: 70,
  partialAccuracy: 40,
  reopenBeats: 0.42,
  unfoldSec: 0.64,
  revealSec: 1.25,
} as const;

/**
 * Each set is one visit's worth of shapes; the rotation lap picks the set, so the ninth
 * level cuts stars, hearts and angels and the twenty-second cuts butterflies, trees and
 * tulips. Within a set the shape still cycles per task.
 */
export const PAPER_SHAPE_SETS = [['star', 'heart', 'angel'], ['butterfly', 'tree', 'tulip']] as const;
export const PAPER_SHAPES = PAPER_SHAPE_SETS.flat();
export type PaperShape = typeof PAPER_SHAPES[number];
export type PaperOutcome = 'success' | 'partial' | 'fail';
export interface PaperPoint { readonly x: number; readonly y: number }

/** The shape is chosen before any cut: its silhouette and reveal always agree. */
export function paperShape(roundId: number, lap = 0): PaperShape {
  const set = PAPER_SHAPE_SETS[Math.max(0, Math.floor(lap)) % PAPER_SHAPE_SETS.length]!;
  return set[((Math.max(1, Math.floor(roundId)) - 1) % set.length)]!;
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
  // The fold is the butterfly's body: one wing per half, notched between fore and hind wing.
  butterfly: [point(0, -112),
    ...bezier(point(0, -112), point(38, -186), point(146, -196), point(176, -150), 8),
    ...bezier(point(176, -150), point(190, -92), point(142, -30), point(102, -12), 8),
    ...bezier(point(102, -12), point(160, 18), point(178, 108), point(122, 158), 8),
    ...bezier(point(122, 158), point(84, 190), point(30, 154), point(0, 126), 8)],
  // A fir in three tiers over a stub of trunk. Straight cuts, like the star.
  tree: [point(0, -184), point(50, -104), point(24, -100), point(90, -18), point(54, -12),
    point(132, 76), point(30, 80), point(30, 146), point(0, 146)],
  // The centre petal's tip sits on the fold; a cup of a bloom narrows to the stem, which
  // runs down the fold with one leaf.
  tulip: [point(0, -172),
    point(30, -118),
    ...bezier(point(30, -118), point(48, -152), point(66, -178), point(80, -166), 6),
    ...bezier(point(80, -166), point(132, -150), point(134, -66), point(56, -18), 8),
    point(16, -14), point(16, 48),
    ...bezier(point(16, 48), point(82, 56), point(124, 118), point(110, 160), 6),
    ...bezier(point(110, 160), point(72, 148), point(30, 130), point(16, 108), 6),
    point(16, 172), point(0, 172)],
};

/** Arclength sampling keeps long and short contour segments moving at the same speed. */
export function paperCutPoint(shape: PaperShape, progress: number): PaperPoint {
  const points = PAPER_CONTOURS[shape];
  // A complete cut lands exactly on the fold: the walk below would otherwise stop a
  // rounding error short of the last point on a long contour.
  if (progress >= 1) return points.at(-1)!;
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
  const settle = reduced ? 0 : Math.sin(age * (shape === 'heart' ? 9 : shape === 'butterfly' ? 16 : 12)) * Math.exp(-age * 3);
  // Winged shapes rise; the tree stays put on the mat; the star and butterfly rock.
  const lift = shape === 'angel' ? 42 : shape === 'butterfly' ? 32 : shape === 'tree' ? 8 : 20;
  const tilt = shape === 'star' ? settle * 0.11 : shape === 'butterfly' ? settle * 0.07 : 0;
  return { open: p, lift: reduced ? 0 : p * lift, tilt, crumple: 0, drop: 0 };
}
