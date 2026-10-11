import { clamp01, easeOut } from './motion';

/**
 * The frog's curves, pure so they are tested under node.
 *
 * Every beat is one croak: the throat sac swells on the contact and empties before the
 * next. The demonstration's croaks call to nobody; only judged hits bring the pond's other
 * two frogs up to listen, so the example never spends the player's audience. The coda is
 * one more croak. On success the two listeners hop out onto their pads at `FROG_JOIN_AT`
 * and the three sing the chords at `FROG_CHORDS`; on a rough round the frog leaps off its
 * pad and lands in the water at `FROG_SPLASH_AT`.
 */
export const FROG_REVEAL_SEC = 1.4;
/** From the coda's contact to the frog hitting the water on a rough round; the splash is here. */
export const FROG_SPLASH_AT = 0.42;
/** When the rough coda's frog leaves its pad, after the crouch that winds the leap up. */
export const FROG_LEAP_AT = 0.1;
/** From the coda's contact to the two listeners landing on their pads on success. */
export const FROG_JOIN_AT = 0.45;
/** When the listeners leave the water, on success. */
export const FROG_RISE_AT = 0.06;
/** The chorus: two short chords and a long one, from the coda's contact. The voice sings them here. */
export const FROG_CHORDS: readonly (readonly [at: number, length: number])[] = [[0.52, 0.16], [0.72, 0.16], [0.92, 0.42]];
/** When the frog that jumped looks back out of the water. */
export const FROG_SURFACE_AT = 0.85;

/**
 * How full the throat sac is: 1 on the contact, holding round for a moment and emptying by
 * half a beat, never later than 0.34 s, so a sixteenth's croak is gone before the next. A
 * small wobble rides the swell, the skin settling, and dies with it.
 */
export function croakSwell(age: number, beat: number): number {
  const duration = Math.min(0.34, beat * 0.5);
  if (!(age >= 0) || age >= duration) return 0;
  const t = age / duration;
  const swell = 1 - t * t * (3 - 2 * t);
  return swell * (1 + 0.08 * Math.sin(age * 48) * (1 - t));
}

/** A croak's ring on the water, 0 as it leaves the pad and 1 as it fades; -1 when there is none. */
export function croakRipple(age: number): number {
  return age >= 0 && age < 0.7 ? age / 0.7 : -1;
}

/**
 * How far each listener has come up out of the water to hear: 0 under, 1 eyes up. Judged
 * hits bring them up in proportion to the phrase, the left one over the first half and the
 * right one over the second, so a phrase of any length shows the pond filling.
 */
export function listenerRise(hits: number, targets: number, index: 0 | 1): number {
  return clamp01(clamp01(hits / Math.max(1, targets)) * 2 - index);
}

/** The listeners' hop from the water onto their pads on success: 0 in the water, 1 seated. */
export function joinHop(ending: number, still: boolean): number {
  if (ending < FROG_RISE_AT) return 0;
  if (still) return 1;
  return clamp01((ending - FROG_RISE_AT) / (FROG_JOIN_AT - FROG_RISE_AT));
}

/** How full every sac is through the chorus: a swell on each chord, held through the last. */
export function chorusSwell(ending: number, still: boolean): number {
  if (still || ending < 0) return 0;
  let swell = 0;
  for (const [at, length] of FROG_CHORDS) {
    const age = ending - at;
    if (age < 0 || age >= length + 0.12) continue;
    // In fast, held for the chord, and out over the last 0.12 s.
    const t = age < 0.03 ? age / 0.03 : age < length ? 1 : 1 - (age - length) / 0.12;
    swell = Math.max(swell, t);
  }
  return swell;
}

/** Whether the frogs are singing with their eyes closed: from the first chord to the end. */
export function singing(ending: number): boolean {
  return ending >= FROG_CHORDS[0]![0] - 0.04;
}

export interface Leap {
  /** How deep the frog is crouched before the leap, 0 to 1. */
  readonly crouch: number;
  /** How far along the arc from the pad to the water, 0 to 1; 0 before it leaves. */
  readonly travel: number;
  /** In the water: nothing of it is drawn but, later, its eyes. */
  readonly under: boolean;
}

/** The rough coda's leap: a crouch on the contact, an arc off the pad, and into the water. */
export function leap(ending: number, still: boolean): Leap {
  if (ending < 0) return { crouch: 0, travel: 0, under: false };
  if (still) return { crouch: 0, travel: 1, under: true };
  if (ending < FROG_LEAP_AT) return { crouch: easeOut(ending / FROG_LEAP_AT), travel: 0, under: false };
  const travel = clamp01((ending - FROG_LEAP_AT) / (FROG_SPLASH_AT - FROG_LEAP_AT));
  return { crouch: 0, travel, under: ending >= FROG_SPLASH_AT };
}

/** The splash, 0 as the frog goes in and 1 as the last drop falls; -1 before it. */
export function splash(ending: number, still: boolean): number {
  if (ending < FROG_SPLASH_AT) return -1;
  return still ? 1 : clamp01((ending - FROG_SPLASH_AT) / 0.55);
}

/** The jumper's eyes coming back up out of the water, sheepish, late in the rough coda. */
export function surfaced(ending: number, still: boolean): number {
  if (ending < FROG_SURFACE_AT) return still && ending >= 0 ? 0.8 : 0;
  return still ? 0.8 : 0.8 * easeOut((ending - FROG_SURFACE_AT) / 0.3);
}

/** The listeners ducking back under when the frog leaps: 1 still up, 0 gone. */
export function duck(ending: number, still: boolean): number {
  if (ending < 0) return 1;
  if (still) return 0;
  return 1 - easeOut((ending - 0.06) / 0.24);
}

/** The emptied pad rocking on the water after the frog has pushed off it, in stage units. */
export function padBob(ending: number, still: boolean): number {
  const age = ending - FROG_LEAP_AT;
  if (still || age < 0) return 0;
  return Math.sin(age * Math.PI * 2 * 2.4) * Math.exp(-age * 3.2) * 7;
}

/**
 * An idle blink, every 3.6 s and over in 0.14: 0 open, 1 shut. The frog is alive between
 * croaks, and a blink is the one movement that does not read as a beat.
 */
export function blink(now: number, offset = 0): number {
  if (!Number.isFinite(now)) return 0;
  const phase = (((now + offset) % 3.6) + 3.6) % 3.6;
  return phase < 0.14 ? Math.sin(phase / 0.14 * Math.PI) : 0;
}

/** A sung note's drift up from a frog: 0 as it leaves the mouth, 1 as it fades; -1 when there is none. */
export function noteDrift(ending: number, at: number): number {
  const age = ending - at;
  return age >= 0 && age < 0.85 ? age / 0.85 : -1;
}
