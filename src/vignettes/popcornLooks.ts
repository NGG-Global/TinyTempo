import { lookAt } from './lookAt';

/**
 * What the popcorn is popped into. The pan, the burner, the flights and both endings are
 * shared; a look is the bowl, the popcorn's own colour, and the kitchen's walls. Caramel
 * corn is still popcorn, so no look renames the act. Pure data, unit-tested under node.
 */
export type BowlPattern = 'glaze' | 'stripes' | 'grain';

export interface PopcornLook {
  readonly id: string;
  readonly wall: number;
  readonly tile: number;
  readonly bowl: number;
  readonly bowlInk: number;
  /** The inside of the bowl, seen through its mouth. */
  readonly inside: number;
  readonly pattern: BowlPattern;
  /** The pattern's second colour: the glaze's band, the stripes, the grain. */
  readonly trim: number;
  /** A popped piece's puff, its shaded side, and the husk still clinging to it. */
  readonly puff: number;
  readonly puffShade: number;
  readonly hull: number;
}

export const POPCORN_LOOKS: readonly PopcornLook[] = [
  // The original: buttered popcorn in a blue glazed bowl.
  {
    id: 'butter', wall: 0xf1e7c8, tile: 0xe2d3a8, bowl: 0x3f7fb5, bowlInk: 0x24507a, inside: 0x9cc3e2, pattern: 'glaze',
    trim: 0xf4efe0, puff: 0xfff4d6, puffShade: 0xeed49a, hull: 0xd99a2b,
  },
  // Cinema popcorn in a red-and-white striped tub.
  {
    id: 'cinema', wall: 0xe8dcea, tile: 0xd3c2d6, bowl: 0xd8463a, bowlInk: 0x8f2820, inside: 0xf2d9cf, pattern: 'stripes',
    trim: 0xfbf6ee, puff: 0xfffae8, puffShade: 0xf1dfad, hull: 0xc98a26,
  },
  // Caramel corn in a turned wooden bowl.
  {
    id: 'caramel', wall: 0xdcebe1, tile: 0xc3d9ca, bowl: 0xa7703f, bowlInk: 0x5e3a1c, inside: 0xd7a877, pattern: 'grain',
    trim: 0x8a5a2f, puff: 0xf0c574, puffShade: 0xd29a45, hull: 0x9a5a1c,
  },
];

export function popcornLook(lap: number): PopcornLook {
  return lookAt(POPCORN_LOOKS, lap);
}
