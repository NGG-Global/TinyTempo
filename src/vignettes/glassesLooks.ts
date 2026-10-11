import { lookAt } from './lookAt';

/** Which glasses are raised, and so how they are drawn and held. */
export type Glassware = 'flute' | 'tumbler' | 'goblet';

/** One of the two people toasting: the hand, the sleeve, and what is at the wrist. */
export interface Toaster {
  readonly skin: number;
  readonly sleeve: number;
  readonly cuff: number;
}

/**
 * Three toasts, by lap: sparkling flutes at an evening party, pink lemonade on a terrace at
 * sunset, and grape juice at a candlelit dinner. A glass is a glass, so the words never
 * change; the drinks are deliberately soft ones. Lap 0 is the original look.
 */
export interface GlassesLook {
  readonly glass: Glassware;
  /** The lights the hits switch on: a festoon of bulbs, or candles on the mantel. */
  readonly lights: 'festoon' | 'candles';
  readonly scene: 'party' | 'terrace' | 'dinner';
  /** The wall or sky, top and bottom. */
  readonly wallTop: number;
  readonly wallLow: number;
  /** The tablecloth, its shaded front, and its pattern. */
  readonly cloth: number;
  readonly clothShade: number;
  readonly clothPattern: number;
  /** The drink, its lit side and its shade. */
  readonly drink: number;
  readonly drinkLight: number;
  readonly drinkDark: number;
  /** A lit bulb or flame. */
  readonly lit: number;
  /** The colour "Cheers!" is lettered in. */
  readonly cheer: number;
  readonly left: Toaster;
  readonly right: Toaster;
  /** The backdrop's paper and its pool of light. */
  readonly paper: number;
  readonly glow: number;
}

export const GLASSES_LOOKS: readonly GlassesLook[] = [
  {
    glass: 'flute', lights: 'festoon', scene: 'party',
    wallTop: 0x342b4f, wallLow: 0x5b4672,
    cloth: 0xf5ede0, clothShade: 0xdccdb6, clothPattern: 0xe0b85a,
    drink: 0xf3cf62, drinkLight: 0xffeaa4, drinkDark: 0xd6a238,
    lit: 0xffd978, cheer: 0xe08c2a,
    left: { skin: 0xebb790, sleeve: 0x2f3f69, cuff: 0xf6f2ea },
    right: { skin: 0x9c6542, sleeve: 0xc4455a, cuff: 0xf2c94c },
    paper: 0xe6e1ec, glow: 0xf6dca0,
  },
  {
    glass: 'tumbler', lights: 'festoon', scene: 'terrace',
    wallTop: 0x8d8fc6, wallLow: 0xfac79c,
    cloth: 0xf7f6f0, clothShade: 0xd8dfe6, clothPattern: 0x8db3d8,
    drink: 0xf6a5b6, drinkLight: 0xffd3dd, drinkDark: 0xdc7c93,
    lit: 0xffe08c, cheer: 0xd9536f,
    left: { skin: 0xf2caa6, sleeve: 0x5fa892, cuff: 0xfaf4e6 },
    right: { skin: 0xc68b5f, sleeve: 0xeeb04a, cuff: 0xfaf4e6 },
    paper: 0xf6e9e0, glow: 0xfbd7a8,
  },
  {
    glass: 'goblet', lights: 'candles', scene: 'dinner',
    wallTop: 0x24392f, wallLow: 0x37574a,
    cloth: 0xf3ebdc, clothShade: 0xd9c9ae, clothPattern: 0x8a2f4a,
    drink: 0x7a2a52, drinkLight: 0xa9477c, drinkDark: 0x531638,
    lit: 0xffcf6a, cheer: 0x9a3263,
    left: { skin: 0xd69c73, sleeve: 0x4d3b60, cuff: 0xece0c4 },
    right: { skin: 0xf3d0b4, sleeve: 0x2f5f63, cuff: 0xd9b45a },
    paper: 0xe2e8e2, glow: 0xf8d68e,
  },
];
export const glassesLook = (lap: number): GlassesLook => lookAt(GLASSES_LOOKS, lap);
