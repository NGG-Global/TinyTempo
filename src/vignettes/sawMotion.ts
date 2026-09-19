import type { Judgement } from '@/rhythm/judge';
import { advanceOnHit, clamp01, easeOut, REFERENCE_BEAT } from './motion';
export { acceptDemoBeat, clamp01, easeOut, REFERENCE_BEAT } from './motion';

/** Presentation-only curves. They never alter a target, grade or score. */
export const SAW_MOTION = {
  // Stroke phases are fractions of a beat, not seconds. Levels ramp from 120 toward
  // 150 BPM task by task, and the tightest authored interval is always a half beat,
  // so a stroke held in seconds would outlive its interval at the plateau and a
  // quick pair would read as one long scrub. In beats it tightens with the tempo.
  drawBackBeats: 0.3,
  biteHoldBeats: 0.056,
  followThroughBeats: 0.38,
  dustBeats: 0.84,
  /** Half the stroke's reach along the blade, in board units. */
  travel: 152,
  boardThickness: 86,
  /** The blade stands inside the plane of the cut, so it plunges rather than lying on the face. */
  bladeTiltRad: Math.PI / 6,
  /** A flawless response stops short of severing; the unscored coda finishes the cut. */
  kerfAtFullResponse: 0.86,
  /** How far the saw rocks about the bite at the end of a stroke, in radians. */
  rockRad: 0.04,
  /** The heap of sawdust under the cut when the board is sawn through, in board units. */
  pileWidth: 150,
  pileHeight: 22,
} as const;

export interface SawTiming {
  readonly drawBackSec: number;
  readonly biteHoldSec: number;
  readonly followThroughSec: number;
  readonly dustSec: number;
}

/** The stroke's phases in seconds for a given beat length. */
export function sawTiming(beat = REFERENCE_BEAT): SawTiming {
  return {
    drawBackSec: SAW_MOTION.drawBackBeats * beat,
    biteHoldSec: SAW_MOTION.biteHoldBeats * beat,
    followThroughSec: SAW_MOTION.followThroughBeats * beat,
    dustSec: SAW_MOTION.dustBeats * beat,
  };
}

/**
 * Push, pull, push. Parity of the action count is the only source of direction,
 * so nothing can hold a stale copy of it.
 */
export function sawDirection(strokeIndex: number): 1 | -1 {
  return ((Math.trunc(strokeIndex) % 2) + 2) % 2 === 0 ? 1 : -1;
}

/**
 * Travel along the blade after the bite, in the stroke's own direction: 0 at
 * maximum tooth engagement, 1 at the end of the follow-through. Consecutive
 * strokes alternate direction, so a stroke resting at 1 is the next stroke's -1.
 */
export function strokeTravel(age: number, beat = REFERENCE_BEAT): number {
  if (age <= 0) return 0;
  const { biteHoldSec, followThroughSec } = sawTiming(beat);
  return easeOut((age - biteHoldSec) / (followThroughSec - biteHoldSec));
}

/**
 * The draw back before the bite, in the same frame: -1 fully back, 0 at contact.
 * Quick pairs begin the draw back while the previous follow-through is still
 * moving, so blend from that pose instead of snapping to the nominal end of travel.
 */
export function drawBack(untilBite: number, from = -1, beat = REFERENCE_BEAT): number {
  const p = clamp01(1 - untilBite / sawTiming(beat).drawBackSec);
  // Slow off the reversal, accelerating into the beat: the bite is what carries the timing.
  return from * (1 - p ** 2);
}

/** Depth cut by accurate strokes alone, as a fraction of the board. */
export function kerfDepth(bites: number, targets: number): number {
  return clamp01(bites / Math.max(1, targets)) * SAW_MOTION.kerfAtFullResponse;
}

/** The blade is never visible below the depth it has actually sawn. */
export function bladeVisibleDepth(kerf: number): number {
  return SAW_MOTION.boardThickness * clamp01(kerf);
}

/** Sawdust leaves the kerf on the bite and falls under its own weight. */
export function dustFall(age: number, beat = REFERENCE_BEAT): number {
  const p = clamp01(age / sawTiming(beat).dustSec);
  return p * p * 210;
}

/**
 * Only an accurate stroke deepens the kerf. An extra tap still skids across the
 * face and a missed target judders, but neither cuts, and an omission never
 * invents a stroke the player did not make.
 */
export function advanceBite(bites: number, kind: Judgement['kind']): number {
  return advanceOnHit(bites, kind);
}

/**
 * The blade's own geometry, along its own axis, in board units. Fixed: a saw blade is a
 * piece of sheet steel and none of these change while it is being pushed and pulled.
 *
 * The axis runs from the toe, through the kerf at zero, back to the heel where the handle
 * is bolted. The back edge stands further off the tooth line at the heel than at the toe,
 * which is the blade's taper.
 */
export const BLADE = {
  toe: -170,
  heel: 430,
  toeDepth: 26,
  heelDepth: 64,
  toothStep: 18,
  /** The first tooth sits this far back from the toe. */
  toothInset: 4,
} as const;

export interface BladeSpan {
  /** Axis of the toe and of the heel. Both move by the whole stroke: the blade is rigid. */
  readonly toe: number;
  readonly heel: number;
  /** Axis where the tooth line meets the board's top face; below it the teeth are in wood. */
  readonly toothCut: number;
  /** Axis of the first tooth still above the wood. Teeth are phased to the blade. */
  readonly firstTooth: number;
  /** The midpoint of the steel, which the maker's etch is stamped on. */
  readonly mid: number;
}

/**
 * Where the blade is for a stroke that has slid `slide` board units from the bite.
 *
 * Both ends move by the whole slide. Pinning the toe at the kerf and letting only the
 * heel travel is what a blade does not do: it took the drawn steel from 278 to 582 units
 * across one stroke, left every tooth standing exactly where it was, and read as a saw
 * being stretched rather than one being pushed.
 */
export function bladeSpan(slide: number): BladeSpan {
  const toe = BLADE.toe + slide;
  const heel = BLADE.heel + slide;
  const toothCut = Math.max(toe, 0);
  const steps = Math.max(0, Math.ceil((toothCut - toe - BLADE.toothInset) / BLADE.toothStep));
  return {
    toe, heel, toothCut,
    firstTooth: toe + BLADE.toothInset + steps * BLADE.toothStep,
    mid: (toe + heel) / 2,
  };
}

/**
 * How far a point on the blade stands above the board's top face, in blade units.
 * Positive is clear of the wood; the face itself is zero.
 *
 * The blade is cut off along that face, not at the kerf. The two coincide only at the
 * tooth edge; everywhere else the kerf's perpendicular stands *above* the board, so
 * cutting there left the steel ending in mid-air over uncut wood — which is what made a
 * stroke read as the blade shortening rather than as the blade going into the cut.
 */
const COTANGENT = 1 / Math.tan(SAW_MOTION.bladeTiltRad);
const aboveBoard = (point: readonly [number, number]): number => point[0] + point[1] * COTANGENT;

/** One convex polygon in blade space, keeping only what stands above the board's top face. */
function clipToBoard(poly: readonly (readonly [number, number])[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
    const da = aboveBoard(a), db = aboveBoard(b);
    if (da >= 0) out.push([a[0], a[1]]);
    if ((da >= 0) !== (db >= 0)) {
      const k = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
    }
  }
  return out;
}

/**
 * The blade's drawn outline, as `[axis, off]` corners going round the steel.
 *
 * A rigid quad clipped against one half-plane, so it comes back with four corners for
 * most of the stroke and five at the end of a push, where the toe's own edge has risen
 * clear of the wood and shows as well. Nothing here changes the blade — only how much of
 * it the board is hiding.
 */
export function bladeOutline(span: BladeSpan): readonly (readonly [number, number])[] {
  return clipToBoard([
    [span.toe, 0], [span.heel, 0], [span.heel, BLADE.heelDepth], [span.toe, BLADE.toeDepth],
  ]);
}

/**
 * The lit line down the blade's back, `inset` inside the back edge and clipped to the
 * same face, or null when none of it is showing.
 */
export function bladeBackLine(span: BladeSpan, inset: number): readonly [readonly [number, number], readonly [number, number]] | null {
  const a: [number, number] = [span.toe, BLADE.toeDepth - inset];
  const b: [number, number] = [span.heel, BLADE.heelDepth - inset];
  const da = aboveBoard(a), db = aboveBoard(b);
  if (da < 0 && db < 0) return null;
  const cut = (): [number, number] => {
    const k = da / (da - db);
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  };
  return [da >= 0 ? a : cut(), db >= 0 ? b : cut()];
}

/**
 * A hand saw is not pushed flat: the heel dips into the push and the toe lifts on the
 * pull, pivoting about the teeth in the kerf. `slide` is the blade's travel in board
 * units, so the rock follows the stroke exactly and is zero at the bite.
 */
export function sawRock(slide: number): number {
  const travel = Math.max(-1, Math.min(1, slide / SAW_MOTION.travel));
  return 0 - travel * SAW_MOTION.rockRad;
}

/** The sawdust heap on the floor grows with the kerf, so the demonstration leaves none. */
export function dustPile(kerf: number): { readonly width: number; readonly height: number } {
  const k = clamp01(kerf);
  return { width: SAW_MOTION.pileWidth * Math.sqrt(k), height: SAW_MOTION.pileHeight * k };
}
