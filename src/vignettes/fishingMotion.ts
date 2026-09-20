import { clamp01, easeInOutCubic, easeOut, REFERENCE_BEAT } from './motion';

/**
 * Curves and data for the fisherman act. Pure, so it is unit-tested under node and
 * shared with the sound voices where a sound and a picture must land together: the
 * catch breaks the surface at `breachSec`, and the success and rough voices put their
 * splash there. Every ending settles inside the five-beat hold the household acts
 * established, even at the 150 BPM ceiling.
 */
export const FISHING_REVEAL_SEC = 1.65;

export const FISHING_MOTION = {
  successAccuracy: 70,
  partialAccuracy: 40,
  /** The rod springs back from the heave inside this fraction of a beat, so a quick pair reads as two pulls. */
  heaveBeats: 0.45,
  /** When the catch breaks the surface, from the finale's contact beat. */
  breachSec: 0.28,
  splashSec: 0.45,
} as const;

export type FishingOutcome = 'success' | 'partial' | 'fail';

export function fishingOutcome(accuracy: number): FishingOutcome {
  if (accuracy >= FISHING_MOTION.successAccuracy) return 'success';
  return accuracy >= FISHING_MOTION.partialAccuracy ? 'partial' : 'fail';
}

/**
 * The three big fish, and how each one comes out of the water. The bass leaps straight
 * up and somersaults on the line; the salmon comes out in one long swing into the
 * fisherman's arms; the carp is the heavy one, hauled up slowly with the rod bowed and
 * the fisherman leaning right back into it. The round id picks the fish before any pull,
 * so the shadow under the surface and the catch that surfaces agree.
 */
export type Flight = 'leap' | 'arc' | 'heave';
export interface BigFish {
  readonly id: string;
  readonly flight: Flight;
  readonly colour: number;
  readonly belly: number;
  readonly fin: number;
  /** Relative to the bass. */
  readonly size: number;
}
export const BIG_FISH: readonly BigFish[] = [
  { id: 'bass', flight: 'leap', colour: 0x5e9c5a, belly: 0xdce8bf, fin: 0x3b6b3a, size: 1 },
  { id: 'salmon', flight: 'arc', colour: 0xe08a7a, belly: 0xf8e3d3, fin: 0xb45a50, size: 1.12 },
  { id: 'carp', flight: 'heave', colour: 0xe2a63a, belly: 0xf9e5ad, fin: 0xb87a24, size: 1.3 },
];

export function bigFish(roundId: number): BigFish {
  return BIG_FISH[(Math.max(1, Math.floor(roundId)) - 1) % BIG_FISH.length]!;
}

/** What a rough round hauls up instead; the round id alternates them. */
export type Junk = 'boot' | 'tyre';
export const JUNK: readonly Junk[] = ['boot', 'tyre'];
export function junkFor(roundId: number): Junk {
  return JUNK[(Math.max(1, Math.floor(roundId)) - 1) % JUNK.length]!;
}

/**
 * The pull: 1 at the heave on the beat, back toward rest inside `heaveBeats`. The way
 * back is not smooth — the rod springs up, then the line meets something heavy and yanks
 * it down again before it settles — which is what makes it a pull on a hooked fish
 * rather than a cast. The yank peaks at `yankAt` of the window and is over by the end.
 */
export const HEAVE = { springBy: 0.4, yankAt: 0.65, yankDepth: 0.38 } as const;
export function rodHeave(age: number, beat = REFERENCE_BEAT): number {
  if (age < 0) return 0;
  const p = clamp01(age / (FISHING_MOTION.heaveBeats * beat));
  const spring = 1 - easeOut(p / HEAVE.springBy);
  const yank = Math.sin(clamp01((p - HEAVE.springBy) / ((1 - HEAVE.springBy))) * Math.PI) * HEAVE.yankDepth;
  return clamp01(spring + yank);
}

/**
 * How near the surface the hooked shadow has come, for the pulls landed so far. Only
 * judged hits shorten the line; the example's beats draw it during the demonstration
 * and it starts again from the bottom at the handover, so nothing is consumed.
 */
export function shadowRise(pulls: number, targets: number): number {
  return clamp01(Math.max(0, pulls) / Math.max(1, targets));
}

export interface HaulFinale {
  /** True once the catch has broken the surface; nothing is drawn above water before it. */
  readonly breached: boolean;
  /** 0 in the water at the line's entry, 1 hanging from the rod tip. A catch is never above the tip. */
  readonly lift: number;
  /** Horizontal travel from the line's entry toward the fisherman, 0 to 1. */
  readonly toward: number;
  /** Rotation of the catch in radians. */
  readonly spin: number;
  /** The water thrown up where it came out, 0 to 1 and back. */
  readonly splash: number;
  /** How far the fisherman leans back into the haul. */
  readonly stagger: number;
  /** The rod's bow while the weight is still on the line. */
  readonly bow: number;
}

const REST: HaulFinale = { breached: false, lift: 0, toward: 0, spin: 0, splash: 0, stagger: 0, bow: 0 };

/**
 * The catch coming out. The flight is the big-fish variation: three fish, three ways out
 * of the water. A small fish is simply lifted clear and left dangling, and the junk comes
 * up heavy and hangs there dripping.
 */
export function haulFinale(age: number, outcome: FishingOutcome, flight: Flight, still = false): HaulFinale {
  if (age < 0) return REST;
  const since = age - FISHING_MOTION.breachSec;
  const breached = since >= 0;
  const splashScale = outcome === 'success' ? 1 : outcome === 'partial' ? 0.45 : 0.7;
  const splash = breached && !still && since < FISHING_MOTION.splashSec ? Math.sin(since / FISHING_MOTION.splashSec * Math.PI) * splashScale : 0;
  // Before the breach the rod is loaded and the fisherman is already leaning into it.
  const load = easeOut(age / FISHING_MOTION.breachSec);
  if (!breached) return { ...REST, splash, stagger: load * 0.5, bow: load };
  if (outcome === 'partial') {
    const lift = easeOut(since / 0.5);
    return { breached, lift, toward: lift * 0.15, spin: still ? 0 : Math.sin(since * 11) * 0.35 * (1 - clamp01(since / 1.1)), splash, stagger: 0.5 * (1 - lift), bow: 0.3 * (1 - lift) };
  }
  if (outcome === 'fail') {
    // Heavy and inert: a slow lift, a slump as the weight comes clear, and a sway on the line.
    const lift = easeOut(since / 0.8) * 0.85;
    const sway = still ? 0 : Math.sin(since * 5) * 0.12 * clamp01(since / 0.4);
    return { breached, lift, toward: lift * 0.2, spin: sway, splash, stagger: 0.5 + 0.3 * lift, bow: 0.5 + 0.2 * lift };
  }
  switch (flight) {
    case 'leap': {
      // Straight up and over: a full somersault on the way, then it hangs on the line.
      const up = easeOut(since / 0.85);
      const spin = still ? 0 : Math.PI * 2 * easeInOutCubic(since / 1.0);
      return { breached, lift: up, toward: 0.2 * up, spin, splash, stagger: 0.5 * (1 - up), bow: 1 - up };
    }
    case 'arc': {
      // One long swing toward the jetty, high in the middle, into the fisherman's arms.
      const toward = easeInOutCubic(since / 1.05);
      const lift = Math.sin(toward * Math.PI) * 0.55 + toward * 0.6;
      return { breached, lift, toward, spin: still ? 0 : -toward * 1.1, splash, stagger: 0.5 * (1 - toward), bow: 1 - toward };
    }
    case 'heave':
    default: {
      // The heavy one: two hard hauls, the rod bowed the whole way, the fisherman leaning back into it.
      const lift = easeOut(since / 1.15) * 0.9 + (still ? 0 : Math.sin(clamp01(since / 0.8) * Math.PI * 2) * 0.05);
      const stagger = 0.5 + 0.5 * easeOut(since / 0.6);
      return { breached, lift: clamp01(lift), toward: 0.15 * lift, spin: still ? 0 : Math.sin(since * 4) * 0.12, splash, stagger, bow: 1 - 0.6 * lift };
    }
  }
}
