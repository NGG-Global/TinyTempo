import { clamp01, easeInOutCubic, easeOut, REFERENCE_BEAT } from './motion';

/**
 * Curves for the DJ scratch act. Pure, so it is unit-tested under node and shared
 * with the sound voices where a sound and a picture must land together: the needle
 * skips off the record at `skipAtSec` on a rough round, and the rough voice puts its
 * pop there. Every ending settles inside the five-beat hold the household acts
 * established, even at the 150 BPM ceiling.
 */
export const SCRATCH_REVEAL_SEC = 1.65;

export const SCRATCH_MOTION = {
  /** The hand shoves the record back this far, in radians, on the beat. */
  pushRadians: 0.55,
  /** The shove is over inside this fraction of a beat; the record is drawn back to where it was by `returnBeats`. */
  pushBeats: 0.14,
  returnBeats: 0.42,
  /** The crossfader is cut open on the beat and closed again inside this fraction of a beat. */
  cutBeats: 0.3,
  /** When the needle leaves the groove on a rough round, from the finale's contact beat. */
  skipAtSec: 0.22,
  /** The platter's idle turn: 33⅓ rpm, so a sticker on the record shows it is moving. */
  spinRadPerSec: (100 / 3 / 60) * Math.PI * 2,
} as const;

/**
 * The scratch: how far the record has been shoved back from where the platter would
 * have carried it. 1 at the end of the shove, drawn back to 0 by `returnBeats`, so a
 * quick pair at 150 BPM reads as two scratches and not a wobble.
 */
export function scratchPush(age: number, beat = REFERENCE_BEAT): number {
  if (age < 0) return 0;
  const push = SCRATCH_MOTION.pushBeats * beat, back = SCRATCH_MOTION.returnBeats * beat;
  if (age < push) return easeOut(age / push);
  return 1 - easeInOutCubic((age - push) / (back - push));
}

/** The other hand's cut on the crossfader: 1 open on the beat, closed again well before the next half beat. */
export function faderCut(age: number, beat = REFERENCE_BEAT): number {
  if (age < 0) return 0;
  return 1 - easeOut(age / (SCRATCH_MOTION.cutBeats * beat));
}

/**
 * The mixer's level meter, lit one step per landed scratch. Only judged hits raise it;
 * the example's beats drive it during the demonstration and it starts again from
 * nothing at the handover, so nothing is consumed.
 */
export function meterLevel(hits: number, targets: number): number {
  return clamp01(Math.max(0, hits) / Math.max(1, targets));
}

export interface ScratchFinale {
  /** The scratching hand comes off the record and goes up: 0 on the record, 1 in the air. */
  readonly handsUp: number;
  /** Extra backward rotation of the record from the spin-back, in radians. */
  readonly spinback: number;
  /** The room's lights: beams and a wash that come up on a clean round. */
  readonly lights: number;
  /** How far the needle has skidded off across the record on a rough round. */
  readonly skip: number;
  /** How far the platter has run down after the skip: 1 is stopped. */
  readonly stopped: number;
}

const REST: ScratchFinale = { handsUp: 0, spinback: 0, lights: 0, skip: 0, stopped: 0 };

/** A clean round throws the hands up under the lights with a spin-back; a rough one skips the needle and stops the platter. */
export function scratchFinale(age: number, successful: boolean, still = false): ScratchFinale {
  if (age < 0) return REST;
  if (!successful) {
    const since = age - SCRATCH_MOTION.skipAtSec;
    if (since < 0) return REST;
    return { ...REST, skip: easeOut(since / 0.35), stopped: easeOut(since / 0.6) };
  }
  const handsUp = easeOut((age - 0.08) / 0.5);
  // A spin-back runs the record backwards fast and lets it coast; it is rotation, so it has no still form.
  const spinback = still ? 0 : 7 * (1 - Math.exp(-age * 2.4));
  const lights = still ? (age >= 0.2 ? 1 : 0) : easeOut(age / 0.6);
  return { handsUp, spinback, lights, skip: 0, stopped: 0 };
}
