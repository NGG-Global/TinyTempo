import { clamp01 } from '@/vignettes/motion';

/**
 * The contact punch: a short downward kick of the act's stage the instant a Perfect lands,
 * settling back within about 120 ms. Impacts used to land with particles alone and read
 * light; a stage that gives under the blow is what makes one feel heavy.
 *
 * It moves the act and nothing else — never the camera, the turn block, the verdict or the
 * headline, which the player is reading while it happens. Pure `f(age)` from the contact's
 * own time on the audio clock, like every other curve here, so a slow frame costs that frame
 * and never moves the punch off its beat.
 */
export const PUNCH = Object.freeze({
  /** Peak displacement at the contact, in design units, before the treatment's exaggeration. */
  reach: 3,
  /** How long until it has settled. */
  settleSec: 0.12,
});

/**
 * The punch's offset `age` seconds after contact, in design units, positive downward: full
 * reach on the contact, a small rebound past rest, and nothing once it has settled.
 */
export function punch(age: number, strength = 1, exaggeration = 1): number {
  if (!Number.isFinite(age) || age < 0 || age >= PUNCH.settleSec) return 0;
  const p = clamp01(age / PUNCH.settleSec);
  return PUNCH.reach * strength * exaggeration * (1 - p) ** 2 * Math.cos(1.5 * Math.PI * p);
}
