import { overshoot } from '@/ui/spring';
import { clamp01, easeOut } from './motion';

/**
 * The glasses' curves, pure so they are tested under node.
 *
 * Every beat is one clink: the two glasses swing together, touch rim to rim on the contact
 * and spring apart. The demonstration's clinks light nothing; only judged hits light the
 * room's lights, so the example never spends the player's party, and every mistake leaves a
 * hairline crack in the right-hand glass. The coda is one more clink. On success the glasses
 * lift, the lights the hits left dark come on, and "Cheers!" goes up; on a rough round the
 * cracked glass gives on the contact and shatters at `GLASS_BREAK_AT`, and its drink lands
 * on the cloth at `GLASS_SPILL_AT`.
 */
export const GLASS_REVEAL_SEC = 1.35;
/** From the coda's contact to the bowl shattering on a rough round; the break's voice is here. */
export const GLASS_BREAK_AT = 0.05;
/** From the coda's contact to the spilled drink landing on the cloth. */
export const GLASS_SPILL_AT = 0.4;
/** From the coda's contact to "Cheers!" going up on success. */
export const CHEER_AT = 0.1;
/** How far apart the success coda's lights come on, from the contact. */
export const LIGHT_CASCADE = 0.07;
/** The most hairline cracks mistakes can leave in the glass. */
export const MAX_CRACKS = 3;
/** Gravity on a shard, in stage units per second squared. */
export const SHARD_GRAVITY = 1500;

/**
 * How far into a clink the glasses are: 1 rim to rim on the contact, apart again by 0.45 of
 * a beat and never later than 0.3 s, so the fastest grid still sees them meet and part.
 */
export function clinkSwing(age: number, beat: number): number {
  const duration = Math.min(0.3, beat * 0.45);
  if (!(age >= 0) || age >= duration) return 0;
  return 1 - easeOut(age / duration);
}

/** The glint where the rims meet: 1 on the contact, gone in 0.22 s. */
export function clinkShine(age: number): number {
  return age >= 0 && age < 0.22 ? 1 - age / 0.22 : 0;
}

/** How far a drink's surface rocks after a clink, in radians: a damped slosh. */
export function slosh(age: number): number {
  // Infinite before the first clink, where sin would make the drink's surface NaN.
  if (!(age >= 0) || age > 2) return 0;
  return Math.sin(age * 26) * Math.exp(-age * 6) * 0.16;
}

/**
 * How many of the room's lights are on. Judged hits light all but the last two in
 * proportion to the phrase; a successful coda lights the rest, one every `LIGHT_CASCADE`.
 * A rough coda lights nothing more.
 */
export function lightsLit(hits: number, targets: number, lights: number, ending: number, successful: boolean, still: boolean): number {
  const earned = Math.floor(clamp01(hits / Math.max(1, targets)) * Math.max(0, lights - 2) + 1e-9);
  if (ending < 0 || !successful) return earned;
  if (still) return lights;
  return Math.min(lights, earned + 1 + Math.floor(ending / LIGHT_CASCADE));
}

/** The cracks a round's mistakes have left, up to `MAX_CRACKS`. */
export function cracksShown(errors: number): number {
  return Math.max(0, Math.min(MAX_CRACKS, Math.floor(errors)));
}

/** "Cheers!" going up: 0 before `CHEER_AT`, popping past full size and settling. */
export function cheerPop(ending: number, still: boolean): number {
  if (ending < CHEER_AT) return still && ending >= 0 ? 1 : 0;
  return still ? 1 : overshoot((ending - CHEER_AT) / 0.3, 0.15);
}

/** The glasses raised in the toast, 0 to 1 over the success coda's first 0.35 s. */
export function toastLift(ending: number, still: boolean): number {
  if (ending < 0) return 0;
  return still ? 1 : easeOut(ending / 0.35);
}

/** Whether the right-hand bowl has gone: from `GLASS_BREAK_AT` on a rough coda. */
export function broken(ending: number, still: boolean): boolean {
  return ending >= 0 && (still || ending >= GLASS_BREAK_AT);
}

export interface ShardPose {
  readonly dx: number;
  readonly dy: number;
  readonly angle: number;
  readonly landed: boolean;
}

/**
 * Where a shard thrown from height `y` at (`vx`, `vy`) is `age` seconds after the break, as
 * an offset from where it started: a parabola under `SHARD_GRAVITY` until it reaches
 * `floor`, then still where it landed. It spins while it flies and stops when it lands.
 */
export function shardPose(y: number, vx: number, vy: number, spin: number, floor: number, age: number): ShardPose {
  if (!(age > 0)) return { dx: 0, dy: 0, angle: 0, landed: false };
  const drop = Math.max(0, floor - y);
  const land = (-vy + Math.sqrt(vy * vy + 2 * SHARD_GRAVITY * drop)) / SHARD_GRAVITY;
  const t = Math.min(age, land);
  return { dx: vx * t, dy: vy * t + 0.5 * SHARD_GRAVITY * t * t, angle: spin * t, landed: age >= land };
}

/** The spilled drink: falling from the bowl, 0 to 1 at `GLASS_SPILL_AT`, accelerating. */
export function spillFall(ending: number, still: boolean): number {
  if (ending < GLASS_BREAK_AT) return still && ending >= 0 ? 1 : 0;
  if (still) return 1;
  const t = clamp01((ending - GLASS_BREAK_AT) / (GLASS_SPILL_AT - GLASS_BREAK_AT));
  return t * t;
}

/** The puddle spreading on the cloth from the moment the drink lands. */
export function puddleSpread(ending: number, still: boolean): number {
  if (ending < GLASS_SPILL_AT) return still && ending >= 0 ? 1 : 0;
  return still ? 1 : easeOut((ending - GLASS_SPILL_AT) / 0.3);
}
