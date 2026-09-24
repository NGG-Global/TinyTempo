import { clamp01, easeOut, REFERENCE_BEAT } from './motion';

/**
 * Curves and data for the popcorn. Pure, so it is unit-tested under node and shared with
 * the synthesized voices: the enormous final pop is heard on the frame it bursts, and the
 * burnt kernel lands where its tick is. Every ending settles inside the five-beat hold.
 */
export const POPCORN_REVEAL_SEC = 1.8;

/** The bowl's mouth: where the heap is built from, in stage units. */
export const BOWL = { x: 130, y: 96, rx: 140, ry: 40 } as const;
/** The mouth of the pan every kernel leaves from. */
export const PAN = { x: -150, y: 62, rx: 82 } as const;

export const POPCORN_MOTION = {
  /** A round fills this much of the bowl; the rest, and the crowning piece, are a clean round's. */
  reach: 0.8,
  /** Seconds a popped piece is in the air, and how far apart one pop's pieces leave. */
  flightSec: 0.5,
  staggerSec: 0.035,
  /** The pan's jolt on a pop, in beats. */
  joltBeats: 0.3,
  /** A clean round: the giant kernel swells, then bursts. */
  swellFrom: 0.04,
  bigPopAt: 0.42,
  /** The crowning piece is in the air for longer; it is heavier. */
  crownFlightSec: 0.56,
  /**
   * The rest of the bowl rains in just after the big pop, spread over one window however
   * much is left, so the last piece has landed well inside the hold.
   */
  rainFrom: 0.46,
  rainSec: 0.4,
  /** A rough round: smoke from here, and one burnt kernel that hops out and lands. */
  smokeFrom: 0.12,
  burntFrom: 0.42,
  burntLands: 0.82,
} as const;

export interface HeapSlot { readonly x: number; readonly y: number; readonly turn: number; readonly layer: number }

/**
 * Where each piece sits once it has landed, in the order they fill: layer by layer from
 * inside the bowl to a dome above the rim, each layer from the middle outwards, with a
 * little scatter so it reads as a heap rather than a stack.
 */
export const HEAP: readonly HeapSlot[] = (() => {
  const layers = [[16, 104, 6], [0, 120, 7], [-16, 116, 7], [-32, 102, 6], [-48, 84, 5], [-64, 64, 4], [-80, 44, 3], [-96, 24, 2], [-112, 0, 1]] as const;
  const slots: HeapSlot[] = [];
  layers.forEach(([dy, half, count], layer) => {
    const row = Array.from({ length: count }, (_, k) => {
      const x = count === 1 ? 0 : -half + (2 * half) * k / (count - 1);
      return {
        x: BOWL.x + x + ((k * 7 + layer * 3) % 5 - 2) * 3,
        y: BOWL.y + dy + ((k * 5 + layer) % 3 - 1) * 3,
        turn: ((k * 13 + layer * 7) % 11) / 11 * Math.PI * 2,
        layer,
      };
    });
    row.sort((a, b) => Math.abs(a.x - BOWL.x) - Math.abs(b.x - BOWL.x));
    slots.push(...row);
  });
  return slots;
})();

/** Where the enormous last piece comes to rest: on top of the full heap. */
export const CROWN = { x: BOWL.x + 4, y: BOWL.y - 136 } as const;

/** Pieces in the bowl after `hits` judged hits of `targets`. A round alone never fills it. */
export function piecesAfter(hits: number, targets: number): number {
  const share = clamp01(Math.max(0, hits) / Math.max(1, targets));
  return Math.floor(HEAP.length * POPCORN_MOTION.reach * share);
}

/**
 * When each heap slot's piece leaves the pan: the judged hit that added it, one pop's
 * pieces a stagger apart, and on a clean round the rest of the bowl just after the big pop.
 * Infinity for a slot that stays empty.
 */
export function launchTimes(hitTimes: readonly number[], targets: number, contact: number | null, successful: boolean): number[] {
  const times = HEAP.map(() => Infinity);
  let filled = 0;
  hitTimes.forEach((time, i) => {
    const reached = piecesAfter(i + 1, targets);
    for (let k = 0; filled < reached; filled++, k++) times[filled] = time + k * POPCORN_MOTION.staggerSec;
  });
  if (contact !== null && successful) {
    const left = HEAP.length - filled;
    for (let k = 0; filled < HEAP.length; filled++, k++) times[filled] = contact + POPCORN_MOTION.rainFrom + POPCORN_MOTION.rainSec * k / left;
  }
  return times;
}

export interface Flight { readonly x: number; readonly y: number; readonly landed: boolean; readonly squash: number }

/**
 * A piece's arc from the pan's mouth up and over into its slot: 0 is the moment it left, 1
 * the landing, then a little squash as it settles into the heap.
 */
export function flight(age: number, from: { x: number; y: number }, to: { x: number; y: number }, duration: number = POPCORN_MOTION.flightSec, arc = 190): Flight {
  const t = clamp01(age / duration);
  const lift = 4 * t * (1 - t) * arc;
  const settle = age - duration;
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t - lift,
    landed: age >= duration,
    squash: settle < 0 ? 0 : Math.max(0, 1 - settle / 0.14),
  };
}

/** Where a slot's piece leaves the pan: spread across the mouth, so the pops do not all stack. */
export function launchPoint(slot: number): { x: number; y: number } {
  return { x: PAN.x + (((slot * 37) % 9) - 4) * 12, y: PAN.y - 4 };
}

/** The pan jumping on its burner: 1 on the pop, settled within a third of a beat. */
export function panJolt(age: number, beat = REFERENCE_BEAT): number {
  if (age < 0) return 0;
  const t = age / (POPCORN_MOTION.joltBeats * beat);
  return t >= 1 ? 0 : Math.sin(t * Math.PI) * (1 - t);
}

/** The demonstration's kernel: up out of the pan and straight back in, filling nothing. */
export function demoHop(age: number, beat = REFERENCE_BEAT): number {
  if (age < 0) return -1;
  const t = age / (0.7 * beat);
  return t >= 1 ? -1 : 4 * t * (1 - t);
}

export interface PopcornFinale {
  /** The giant kernel in the pan, growing until it bursts: 0 not yet, 1 at the pop. */
  readonly swell: number;
  /** The burst: 0 until the pop, then 0→1 as it spreads and fades. */
  readonly burst: number;
  /** How hard the scene shakes with the pop. */
  readonly shake: number;
  /** A rough round's smoke, and its one burnt kernel's hop (-1 until it leaves). */
  readonly smoke: number;
  readonly burnt: number;
}

export function popcornFinale(age: number, successful: boolean, still = false): PopcornFinale {
  const M = POPCORN_MOTION;
  if (age < 0) return { swell: 0, burst: 0, shake: 0, smoke: 0, burnt: -1 };
  if (successful) {
    const popped = age >= M.bigPopAt;
    const since = age - M.bigPopAt;
    return {
      swell: popped ? 0 : clamp01((age - M.swellFrom) / (M.bigPopAt - M.swellFrom)),
      burst: popped ? (still ? 1 : clamp01(since / 0.42)) : 0,
      shake: popped && !still ? Math.max(0, 1 - since / 0.32) : 0,
      smoke: 0,
      burnt: -1,
    };
  }
  const hop = (age - M.burntFrom) / (M.burntLands - M.burntFrom);
  return {
    swell: 0, burst: 0, shake: 0,
    smoke: still ? (age >= M.smokeFrom ? 1 : 0) : easeOut((age - M.smokeFrom) / 0.9),
    burnt: age < M.burntFrom ? -1 : still ? 1 : clamp01(hop),
  };
}
