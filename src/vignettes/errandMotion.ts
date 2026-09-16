import { clamp01, easeOut, REFERENCE_BEAT } from './motion';

/**
 * Curves and data for the four errand acts: paint roller, hotel bell, balloon pump and
 * stapler. Pure, so it is unit-tested under node, and shared with the sound voices where
 * a sound and a picture must land together. Every ending settles inside the five-beat
 * hold the household acts established, even at the 150 BPM ceiling.
 */
export const ERRAND_REVEAL_SEC = 1.65;

// ---------------------------------------------------------------- Paint roller

/**
 * A bold graphic, authored as a coarse grid so a stripe of any width paints a whole
 * column of it. Every cell is paint: the roller covers the stripe, background included,
 * and the picture is what the colours make together once the last stripe is down.
 */
export interface PaintImage {
  readonly id: string;
  /** Index 0 is the ground the picture sits on; it is also the paint on the roller. */
  readonly palette: readonly number[];
  readonly rows: readonly string[];
}
export const PAINT_GRID = { columns: 16, rows: 12 } as const;

export const PAINT_IMAGES: readonly PaintImage[] = [
  {
    id: 'sun', palette: [0x7fb7d9, 0xf6c445, 0xf28b3a, 0x7cb56b],
    rows: [
      '0000000100000000', '0010001110001000', '0001011111010000', '0000111111110000',
      '0001112221110000', '1111122222111110', '0001112221110000', '0000111111110000',
      '0001011111010000', '0010001110001000', '3330000100003330', '3333300000033333',
    ],
  },
  {
    id: 'heart', palette: [0xf7ecd9, 0xd9534f, 0xa83a37, 0xf2a09a],
    rows: [
      '0000000000000000', '0001110000111000', '0011311001111100', '0111311111111110',
      '0111111111111110', '0111111111111120', '0011111111111200', '0001111111112000',
      '0000111111120000', '0000011111200000', '0000001112000000', '0000000120000000',
    ],
  },
  {
    id: 'rocket', palette: [0x2d3f66, 0xf3f1ea, 0xd9534f, 0xf6a13a],
    rows: [
      '0000000220000000', '0000002112000000', '0000002112000000', '0000001111000000',
      '0000001001000000', '0000001111000000', '0000021111200000', '0000221111220000',
      '0002211111122000', '0000003333000000', '0000000330000000', '0000000030000000',
    ],
  },
];

/** The picture is chosen before any stripe: the roller's paint and the reveal agree. */
export function paintImage(roundId: number): PaintImage {
  return PAINT_IMAGES[(Math.max(1, Math.floor(roundId)) - 1) % PAINT_IMAGES.length]!;
}

/** Grid columns covered by one stripe when the wall is painted in `stripes` passes. */
export function stripeColumns(stripe: number, stripes: number): { readonly from: number; readonly to: number } {
  const count = Math.max(1, Math.floor(stripes));
  const index = Math.max(0, Math.min(count - 1, Math.floor(stripe)));
  return { from: Math.floor(index * PAINT_GRID.columns / count), to: Math.floor((index + 1) * PAINT_GRID.columns / count) };
}

export const ROLLER_MOTION = { passBeats: 0.42, returnBeats: 0.4 } as const;

/** The roller's descent down a stripe: 0 at the top on the beat, 1 at the skirting. */
export function rollerPass(age: number, beat = REFERENCE_BEAT): number {
  if (age < 0) return 0;
  return easeOut(age / (ROLLER_MOTION.passBeats * beat));
}

/** After the pass, the roller lifts and crosses to the top of the next stripe. */
export function rollerReturn(age: number, beat = REFERENCE_BEAT): number {
  const start = ROLLER_MOTION.passBeats * beat;
  if (age < start) return 0;
  return easeOut((age - start) / (ROLLER_MOTION.returnBeats * beat));
}

// ---------------------------------------------------------------- Hotel bell

/** How far the bell boy has come: up from behind the counter, then a tip of the cap. */
export function bellboyArrival(age: number, successful: boolean, still = false): { readonly rise: number; readonly tip: number } {
  if (!successful || age < 0) return { rise: 0, tip: 0 };
  if (still) return { rise: age >= 0.2 ? 1 : 0, tip: age >= 0.9 ? 1 : 0 };
  return { rise: easeOut((age - 0.18) / 0.62), tip: Math.sin(clamp01((age - 0.85) / 0.6) * Math.PI) };
}

/** The card that says nobody is coming, on a rough round. */
export function backSoonCard(age: number, successful: boolean, still = false): number {
  if (successful || age < 0) return 0;
  return still ? (age >= 0.3 ? 1 : 0) : easeOut((age - 0.3) / 0.45);
}

// ---------------------------------------------------------------- Balloon pump

export const BALLOON_MOTION = { restSize: 0.26, popAtSec: 0.16, tieSec: 0.22, riseFromSec: 0.42 } as const;

/** Balloon size for the strokes pumped so far, as a fraction of a full balloon. */
export function balloonSize(strokes: number, targets: number): number {
  const fill = clamp01(Math.max(0, strokes) / Math.max(1, targets));
  return BALLOON_MOTION.restSize + (1 - BALLOON_MOTION.restSize) * fill;
}

/** The pump handle's travel: 1 fully down on the beat, back up before the next half beat. */
export function pumpStroke(age: number, beat = REFERENCE_BEAT): number {
  if (age < 0) return 0;
  return 1 - easeOut(age / (0.4 * beat));
}

export interface BalloonFinale {
  /** 0 intact, 1 gone. Fragments are drawn from the moment it passes zero. */
  readonly pop: number;
  readonly burst: number;
  readonly tied: number;
  readonly rise: number;
  readonly sway: number;
}

/** A full balloon ties off and floats away; a slack one bursts. */
export function balloonFinale(age: number, successful: boolean, still = false): BalloonFinale {
  if (age < 0) return { pop: 0, burst: 0, tied: 0, rise: 0, sway: 0 };
  if (!successful) {
    const popped = age >= BALLOON_MOTION.popAtSec ? 1 : 0;
    return { pop: popped, burst: popped ? easeOut((age - BALLOON_MOTION.popAtSec) / 0.55) : 0, tied: 0, rise: 0, sway: 0 };
  }
  const tied = easeOut(age / BALLOON_MOTION.tieSec);
  const rise = easeOut((age - BALLOON_MOTION.riseFromSec) / 1.1);
  return { pop: 0, burst: 0, tied, rise, sway: still ? 0 : Math.sin(age * 4.2) * rise * 0.12 };
}

// ---------------------------------------------------------------- Stapler

/** The stapler's jaw: 1 closed on the beat, open again well before the next half beat. */
export function staplerClose(age: number, beat = REFERENCE_BEAT): number {
  if (age < 0) return 0;
  return 1 - easeOut(age / (0.36 * beat));
}

export interface PileFinale {
  /** 1 while the pile is still fanned; 0 once it is squared and bound. */
  readonly fan: number;
  /** The bound pile is lifted and set down once, to show it moves as one. */
  readonly lift: number;
  /** A jammed stapler stays open by this much on a rough round. */
  readonly jam: number;
}

export function pileFinale(age: number, successful: boolean, still = false): PileFinale {
  if (age < 0) return { fan: 1, lift: 0, jam: 0 };
  if (!successful) return { fan: 1 + easeOut((age - 0.1) / 0.5) * 0.8, lift: 0, jam: easeOut(age / 0.2) };
  const squared = easeOut((age - 0.12) / 0.4);
  const lift = still ? 0 : Math.sin(clamp01((age - 0.55) / 0.7) * Math.PI);
  return { fan: 1 - squared, lift, jam: 0 };
}
