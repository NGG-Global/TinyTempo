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
 * Each set is one visit's worth of shapes; the rotation lap picks the set, so the first
 * visit cuts stars, hearts and angels, the second butterflies, trees and tulips, the third
 * crowns, bells and mushrooms and the fourth gingerbread men, maple leaves and rockets.
 * Within a set the shape still cycles per task. Append sets; never reorder them.
 */
export const PAPER_SHAPE_SETS = [
  ['star', 'heart', 'angel'], ['butterfly', 'tree', 'tulip'],
  ['crown', 'bell', 'mushroom'], ['gingerbread', 'maple', 'rocket'],
] as const;
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
  // Five points on a band: the centre one is on the fold.
  crown: [point(0, -176), point(46, -50), point(98, -146), point(138, -40), point(182, -120),
    point(158, 60), point(172, 70), point(172, 148), point(0, 148)],
  // A knob, a waisted shoulder flaring to the lip, and the clapper hanging under it.
  bell: [point(0, -188),
    ...bezier(point(0, -188), point(22, -188), point(28, -162), point(16, -150), 6),
    ...bezier(point(16, -150), point(80, -150), point(106, -104), point(112, -40), 8),
    ...bezier(point(112, -40), point(118, 40), point(140, 86), point(178, 106), 8),
    point(176, 128), point(48, 128),
    ...bezier(point(48, 128), point(50, 162), point(26, 178), point(0, 178), 6)],
  // A domed cap over its gills, and a stout stem swelling to its foot.
  mushroom: [point(0, -172),
    ...bezier(point(0, -172), point(104, -172), point(188, -110), point(184, -26), 10),
    ...bezier(point(184, -26), point(150, -4), point(96, -8), point(56, -8), 6),
    ...bezier(point(56, -8), point(46, 60), point(78, 120), point(72, 156), 8),
    ...bezier(point(72, 156), point(52, 170), point(22, 172), point(0, 172), 6)],
  // Head, one arm out and one leg down; the fold runs through his buttons.
  gingerbread: [point(0, -188),
    ...bezier(point(0, -188), point(30, -188), point(54, -168), point(54, -140), 6),
    ...bezier(point(54, -140), point(54, -114), point(38, -100), point(24, -96), 5),
    ...bezier(point(24, -96), point(70, -100), point(122, -98), point(150, -82), 6),
    ...bezier(point(150, -82), point(182, -72), point(182, -34), point(148, -30), 6),
    ...bezier(point(148, -30), point(118, -26), point(84, -28), point(60, -22), 6),
    ...bezier(point(60, -22), point(58, 10), point(64, 40), point(68, 62), 5),
    ...bezier(point(68, 62), point(84, 100), point(112, 128), point(120, 150), 6),
    ...bezier(point(120, 150), point(126, 186), point(84, 194), point(70, 176), 6),
    ...bezier(point(70, 176), point(52, 150), point(22, 100), point(0, 94), 6)],
  // Straight cuts, tooth by tooth: the centre lobe, two side lobes, then the stalk.
  maple: [point(0, -190), point(22, -140), point(46, -152), point(40, -78), point(116, -134),
    point(110, -96), point(164, -104), point(126, -46), point(172, -24), point(98, 22),
    point(124, 72), point(40, 50), point(12, 64), point(12, 170), point(0, 170)],
  // Nose cone, body, one fin and the flame, whose tip lands back on the fold.
  rocket: [point(0, -190),
    ...bezier(point(0, -190), point(34, -166), point(58, -128), point(58, -88), 8),
    point(58, 20),
    ...bezier(point(58, 20), point(104, 48), point(126, 82), point(126, 122), 6),
    point(126, 160), point(58, 124), point(44, 140), point(24, 140),
    point(34, 166), point(14, 168), point(0, 192)],
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
  const rate = shape === 'heart' ? 9 : shape === 'butterfly' ? 16 : shape === 'bell' ? 7 : 12;
  const settle = reduced ? 0 : Math.sin(age * rate) * Math.exp(-age * 3);
  // Winged shapes rise and the rocket lifts off; the tree and mushroom stay put on the mat;
  // the star, butterfly and leaf rock, the bell swings and the gingerbread man jigs.
  const lift = shape === 'angel' ? 42 : shape === 'rocket' ? 48 : shape === 'butterfly' ? 32
    : shape === 'tree' || shape === 'mushroom' ? 8 : 20;
  const tilt = settle * (shape === 'star' ? 0.11 : shape === 'bell' ? 0.16 : shape === 'maple' ? 0.09
    : shape === 'gingerbread' ? 0.08 : shape === 'butterfly' ? 0.07 : 0);
  return { open: p, lift: reduced ? 0 : p * lift, tilt, crumple: 0, drop: 0 };
}
