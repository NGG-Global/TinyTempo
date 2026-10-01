import { clamp01, easeOut } from './motion';

/**
 * The prospector's curves, pure so they are tested under node.
 *
 * Every beat is one blow of the pick. The demonstration's blows spark and crack nothing;
 * only judged hits crack the boulder, so the example never consumes the player's stone.
 * The coda is one last blow that splits it open at `PROSPECTOR_SPLIT_AT`, and what is
 * inside — a gem, or nothing — is the verdict.
 */
export const PROSPECTOR_REVEAL_SEC = 1.25;
/** From the coda's contact to the boulder falling open; the reveal sounds land here. */
export const PROSPECTOR_SPLIT_AT = 0.3;
/** The handle's angle, in radians from the horizontal, raised over his shoulder and on the stone. */
export const PICK_RAISED = -1.95;
export const PICK_STRUCK = 0.55;

/**
 * How far into the blow the pick is: 1 on the stone at the contact, easing back to 0 — raised
 * — by 0.4 of a beat, never longer than 0.32 s, so the fastest grid still sees every blow
 * land and lift. Before a contact, and between blows, it rests raised.
 */
export function pickBlow(age: number, beat: number): number {
  const duration = Math.min(0.32, beat * 0.4);
  if (!(age >= 0) || age >= duration) return 0;
  return 1 - easeOut(age / duration);
}

/** The handle's angle for a blow: raised at 0, on the stone at 1. */
export function pickAngle(blow: number): number {
  return PICK_RAISED + (PICK_STRUCK - PICK_RAISED) * clamp01(blow);
}

/** Sparks off the point: they fly for 0.16 s after a contact and are gone. */
export function sparkLife(age: number): number {
  return age >= 0 && age < 0.16 ? 1 - age / 0.16 : 0;
}

/**
 * How many of the boulder's cracks show. Judged hits crack it in proportion to the phrase,
 * and every crack can show: the split belongs to the coda, success or not, because a
 * prospector who finds nothing still has to have opened the stone to know it.
 */
export function cracksShown(hits: number, targets: number, cracks: number): number {
  return Math.floor(clamp01(hits / Math.max(1, targets)) * Math.max(0, cracks));
}

/** How far the boulder has fallen open: 0 whole, 1 split, from the coda's contact. */
export function splitOpen(ending: number, still: boolean): number {
  if (ending < 0) return 0;
  return still ? 1 : easeOut(ending / PROSPECTOR_SPLIT_AT);
}

/** The gem's glow, or the dust's drift: rising once the stone is open. */
export function revealGlow(ending: number, still: boolean): number {
  if (ending < PROSPECTOR_SPLIT_AT) return 0;
  return still ? 1 : easeOut((ending - PROSPECTOR_SPLIT_AT) / 0.35);
}
