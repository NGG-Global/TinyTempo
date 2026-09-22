import { clamp01, easeInOutCubic, easeOut, REFERENCE_BEAT } from './motion';

/**
 * Curves and data for the clapping hands act. Pure, so it is unit-tested under node and
 * shared with the sound voices where a sound and a picture must land together: the crowd
 * comes up at `crowdAtSec` and the recorded applause swells there too. Every ending
 * settles inside the five-beat hold the household acts established, even at the 150 BPM
 * ceiling.
 */
export const CLAP_REVEAL_SEC = 1.65;

export const CLAP_MOTION = {
  successAccuracy: 70,
  partialAccuracy: 40,
  /** The palms are driven apart by the clap and reach the top of the rebound here. */
  reboundBeats: 0.16,
  /** And are back at the waiting distance here — inside half a beat, so a quick pair reads as two claps. */
  readyBeats: 0.44,
  /** How far apart the hands wait between claps, against the full rebound. */
  readyGap: 0.5,
  /** The palms flatten against each other on contact and recover inside this fraction of a beat. */
  squashBeats: 0.11,
  /** How long the ring of air thrown out by a clap takes to widen and fade. */
  ringBeats: 0.55,
  /** When the crowd starts to come up, from the finale's contact beat. */
  crowdAtSec: 0.16,
  /** When the hands give up and turn over, from the same beat. */
  shrugAtSec: 0.14,
  /** Claps a second the two hands settle into once the round is won, and once it is merely survived. */
  applauseHz: 5.4,
  politeHz: 2.6,
} as const;

export type ClapOutcome = 'success' | 'partial' | 'fail';

export function clapOutcome(accuracy: number): ClapOutcome {
  if (accuracy >= CLAP_MOTION.successAccuracy) return 'success';
  return accuracy >= CLAP_MOTION.partialAccuracy ? 'partial' : 'fail';
}

/**
 * One hand in the crowd: where it ends up, how big it is that far back, and the rate and
 * phase of its own clapping. A crowd in lockstep is one pair of hands drawn eleven times,
 * so no two of these share a rate.
 *
 * The order is the reveal: the first `POLITE_HANDS` are spread across the back of the
 * room, so a middling round is a scatter of applause from three separate places rather
 * than three people sitting together.
 */
export interface CrowdHand {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly tilt: number;
  /** Claps a second. */
  readonly rate: number;
  readonly phase: number;
  /** Index into the act's skin tones. */
  readonly tone: number;
}
export const CROWD_HANDS: readonly CrowdHand[] = [
  { x: -268, y: -96, scale: 0.42, tilt: -0.24, rate: 4.4, phase: 0.12, tone: 0 },
  { x: 262, y: -112, scale: 0.44, tilt: 0.26, rate: 5.1, phase: 0.61, tone: 2 },
  { x: 6, y: -206, scale: 0.36, tilt: 0.04, rate: 4.8, phase: 0.37, tone: 1 },
  { x: -292, y: 42, scale: 0.56, tilt: -0.3, rate: 5.6, phase: 0.83, tone: 1 },
  { x: -186, y: 10, scale: 0.5, tilt: -0.12, rate: 4.2, phase: 0.05, tone: 2 },
  { x: -112, y: -158, scale: 0.4, tilt: -0.06, rate: 5.9, phase: 0.48, tone: 0 },
  { x: 124, y: -164, scale: 0.42, tilt: 0.08, rate: 4.6, phase: 0.29, tone: 1 },
  { x: 190, y: 14, scale: 0.5, tilt: 0.16, rate: 5.3, phase: 0.72, tone: 0 },
  { x: 292, y: 48, scale: 0.58, tilt: 0.3, rate: 4.9, phase: 0.16, tone: 2 },
  { x: -268, y: 128, scale: 0.66, tilt: -0.2, rate: 6.1, phase: 0.55, tone: 2 },
  { x: 270, y: 124, scale: 0.64, tilt: 0.22, rate: 4.0, phase: 0.9, tone: 1 },
];
/** How much of the crowd a middling round brings out. */
export const POLITE_HANDS = 3;

/** How many hands answer the round: a full house, a scattered few, or nobody at all. */
export function crowdSize(outcome: ClapOutcome): number {
  if (outcome === 'success') return CROWD_HANDS.length;
  return outcome === 'partial' ? POLITE_HANDS : 0;
}

/**
 * The distance between the palms: 0 together on the beat, 1 at the top of the rebound,
 * settling back to `readyGap` where the hands wait for the next one. The clap is the
 * contact, so the motion is entirely after the beat — there is nothing to wind up from,
 * because the hands are already apart.
 */
export function handGap(age: number, beat = REFERENCE_BEAT): number {
  if (age < 0) return CLAP_MOTION.readyGap;
  const out = CLAP_MOTION.reboundBeats * beat, back = CLAP_MOTION.readyBeats * beat;
  if (age < out) return easeOut(age / out);
  return 1 - (1 - CLAP_MOTION.readyGap) * easeInOutCubic((age - out) / (back - out));
}

/** How hard the palms are still flattened against each other: 1 on contact, gone by `squashBeats`. */
export function palmSquash(age: number, beat = REFERENCE_BEAT): number {
  if (age < 0) return 0;
  return 1 - easeOut(age / (CLAP_MOTION.squashBeats * beat));
}

/** The ring of air a clap throws out, 0 at the palms to 1 at its widest; 0 once it has gone. */
export function clapRing(age: number, beat = REFERENCE_BEAT): number {
  if (age < 0) return 0;
  const p = age / (CLAP_MOTION.ringBeats * beat);
  return p >= 1 ? 0 : easeOut(p);
}

/**
 * How warm the room has grown, one step per landed clap. Only judged hits warm it; the
 * example's beats drive it while the player is watching and it starts again from nothing
 * at the handover, so the demonstration consumes nothing.
 */
export function roomWarmth(hits: number, targets: number): number {
  return clamp01(Math.max(0, hits) / Math.max(1, targets));
}

/** Where one hand in the crowd is in its own clap: 0 palms together, 1 fully open. */
export function crowdClap(now: number, index: number, still = false): number {
  const hand = CROWD_HANDS[Math.abs(Math.floor(index)) % CROWD_HANDS.length]!;
  // A still crowd is a crowd of hands caught mid-applause rather than a frozen clap.
  if (still) return 0.55;
  return 0.5 - 0.5 * Math.cos((now * hand.rate + hand.phase) * Math.PI * 2);
}

export interface ClapFinale {
  /** Where the two hands are once the round is resolved, on `handGap`'s scale. */
  readonly open: number;
  /** How far the crowd has come up: 0 out of sight, 1 in place. */
  readonly crowd: number;
  /** How many of its hands are in it at all. */
  readonly hands: number;
  /** The two hands turning over, palms up: 0 clapping, 1 the full shrug. */
  readonly shrug: number;
  /** The room's light coming up on the applause. */
  readonly lights: number;
}

const REST: ClapFinale = { open: CLAP_MOTION.readyGap, crowd: 0, hands: 0, shrug: 0, lights: 0 };

/**
 * What answers the round. A clean one brings the room up on its feet — the two hands
 * carry on applauding and a crowd of them rises behind. A middling one gets a scattered
 * few. A rough one gets nobody: the hands come apart, turn palms up and hold the shrug,
 * and no crowd appears at all.
 */
export function clapFinale(age: number, outcome: ClapOutcome, still = false): ClapFinale {
  if (age < 0) return REST;
  const hands = crowdSize(outcome);
  if (outcome === 'fail') {
    const shrug = easeOut((age - CLAP_MOTION.shrugAtSec) / 0.5);
    // Palms up and wide: further apart than any clap leaves them, and going nowhere.
    return { open: CLAP_MOTION.readyGap + (1 - CLAP_MOTION.readyGap) * shrug, crowd: 0, hands, shrug, lights: 0 };
  }
  const success = outcome === 'success';
  const hz = success ? CLAP_MOTION.applauseHz : CLAP_MOTION.politeHz;
  const swing = success ? 0.5 : 0.38;
  // Applause, not a beat: it starts from the clap that ended the round and runs at its
  // own rate. Held still under reduced motion, where a 5 Hz oscillation is the thing the
  // preference is about.
  const open = still ? CLAP_MOTION.readyGap : swing * (0.5 - 0.5 * Math.cos(age * hz * Math.PI * 2));
  const rise = (age - CLAP_MOTION.crowdAtSec) / (success ? 0.75 : 0.9);
  const crowd = still ? (age >= CLAP_MOTION.crowdAtSec ? 1 : 0) : easeOut(rise);
  const lights = (still ? (age >= 0.2 ? 1 : 0) : easeOut(age / 0.6)) * (success ? 1 : 0.45);
  return { open, crowd, hands, shrug: 0, lights };
}
