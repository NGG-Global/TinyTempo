import { clamp01, easeInOutCubic, easeOut } from './motion';

/**
 * The instant camera's curves, pure so they are tested under node.
 *
 * Every beat is one press of the shutter: the button dips, the body nods and the flash
 * fires. The demonstration's shots hang nothing; only judged hits peg a small print to the
 * line, so the example never uses up the player's prints. The coda is one last shot: the
 * print slides out of the slot, lifts to face the player and develops, and what it shows —
 * the subject, sharp and smiling, or a washed-out blur — is the verdict.
 */
export const CAMERA_REVEAL_SEC = 1.25;
/** From the coda's click to the print fully out of the slot; the motor whirs until here. */
export const EJECT_SEC = 0.3;
/** The print has lifted to face the player by here, and starts to develop. */
export const RISE_END_SEC = 0.55;
/** Fully developed: the picture is as clear as it will get. */
export const DEVELOP_END_SEC = 1.1;

/**
 * How far the shutter button is down: 1 at the click, easing back up by 0.35 of a beat and
 * never longer than 0.18 s, so a sixteenth at the fastest tempo still sees every press lift.
 */
export function shutterPress(age: number, beat: number): number {
  const duration = Math.min(0.18, beat * 0.35);
  if (!(age >= 0) || age >= duration) return 0;
  return 1 - easeOut(age / duration);
}

/** The flash: bright at the click and gone within 0.14 s. */
export function flashLife(age: number): number {
  return age >= 0 && age < 0.14 ? (1 - age / 0.14) ** 2 : 0;
}

/** How many of the line's prints are hung: judged hits, in proportion to the phrase. */
export function printsHung(hits: number, targets: number, slots: number): number {
  return Math.floor(clamp01(hits / Math.max(1, targets)) * Math.max(0, slots));
}

/** How far the print is out of the slot: 0 inside, 1 out, from the coda's click. */
export function ejectOut(ending: number, still: boolean): number {
  if (ending < 0) return 0;
  return still ? 1 : easeOut(ending / EJECT_SEC);
}

/** How far the print has lifted from the slot to face the player. */
export function printRise(ending: number, still: boolean): number {
  if (ending < 0) return 0;
  if (still) return 1;
  return ending < EJECT_SEC ? 0 : easeInOutCubic((ending - EJECT_SEC) / (RISE_END_SEC - EJECT_SEC));
}

/** How far the picture has developed out of the dark. */
export function developed(ending: number, still: boolean): number {
  if (ending < 0) return 0;
  if (still) return 1;
  return ending < RISE_END_SEC ? 0 : easeOut((ending - RISE_END_SEC) / (DEVELOP_END_SEC - RISE_END_SEC));
}
