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
