import { clamp01, easeOut } from './motion';

/**
 * The ice cream act's curves, pure so they are tested under node.
 *
 * Every beat is one lick. The demonstration's licks touch the treat and take nothing;
 * only judged hits wear it down, so the example never eats the player's treat. The coda
 * is one more lick: on success it takes the last of the treat, and on a rough round the
 * rest of it slips and lands on the floor at `ICE_CREAM_DROP_AT`.
 */
export const ICE_CREAM_REVEAL_SEC = 1.3;
/** From the coda's contact to the dropped treat landing; the rough voice's splat is here. */
export const ICE_CREAM_DROP_AT = 0.42;
/** How much of the treat judged hits can take before the coda; the rest is success's. */
export const LICKABLE = 0.8;

/**
 * How far the tongue is out: 1 on the treat at the contact, back in by 0.45 of a beat and
 * never later than 0.3 s, so the fastest grid still sees every lick land and return.
 * Before a contact, and between licks, it is in.
 */
export function lickReach(age: number, beat: number): number {
  const duration = Math.min(0.3, beat * 0.45);
  if (!(age >= 0) || age >= duration) return 0;
  return 1 - easeOut(age / duration);
}

/** How far up the treat the tongue has swept in a lick: 0 at the contact, 1 as it leaves. */
export function lickSweep(age: number, beat: number): number {
  const duration = Math.min(0.3, beat * 0.45);
  if (!(age >= 0)) return 0;
  return easeOut(age / duration);
}

/**
 * How much of the treat is gone. Judged hits take it in proportion to the phrase, up to
 * `LICKABLE`; a successful coda's lick takes the rest. A rough coda takes nothing more —
 * what is left is what falls.
 */
export function licked(hits: number, targets: number, ending: number, successful: boolean, still: boolean): number {
  const progress = clamp01(hits / Math.max(1, targets)) * LICKABLE;
  if (ending < 0 || !successful) return progress;
  return progress + (1 - progress) * (still ? 1 : easeOut(ending / 0.5));
}

/**
 * Where the dropped treat is on its way down: 0 in the hand, 1 on the floor at
 * `ICE_CREAM_DROP_AT`, accelerating as a fall does.
 */
export function dropFall(ending: number, still: boolean): number {
  if (ending < 0) return 0;
  if (still) return 1;
  const t = clamp01(ending / ICE_CREAM_DROP_AT);
  return t * t;
}

/** The splat spreading on the floor, and the face falling with it: rising from the landing. */
export function splatSpread(ending: number, still: boolean): number {
  if (ending < ICE_CREAM_DROP_AT) return 0;
  return still ? 1 : easeOut((ending - ICE_CREAM_DROP_AT) / 0.3);
}

/** The happy finish: a coloured tongue and a grin, rising once the last lick has landed. */
export function relish(ending: number, still: boolean): number {
  if (ending < 0.45) return 0;
  return still ? 1 : easeOut((ending - 0.45) / 0.35);
}
