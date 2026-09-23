import { lookAt } from './lookAt';

/**
 * The horn and the player. The slide is shared; a look is the brass and the clothes,
 * so a return visit is a different instrument in a different outfit.
 * Pure data, unit-tested under node.
 */
export interface TromboneLook {
  readonly id: string;
  readonly brass: number;
  readonly skin: number;
  readonly shirt: number;
  readonly stripe: number;
  readonly braces: number;
  readonly trousers: number;
  readonly cap: number;
  readonly tie: number;
  readonly shoe: number;
  readonly hair: number;
}

export const TROMBONE_LOOKS: readonly TromboneLook[] = [
  // The original gold horn, cream shirt, green cap.
  {
    id: 'gold', brass: 0xd9a33a, skin: 0xd9a07a, shirt: 0xf3ede0, stripe: 0x3b6e9e, braces: 0x7a3b3b,
    trousers: 0x3a3f5c, cap: 0x4f6e5a, tie: 0xd9534f, shoe: 0x2b2a3d, hair: 0x5a3a2a,
  },
  // A silver horn, a navy shirt, a black cap.
  {
    id: 'silver', brass: 0xc5cdd4, skin: 0xc48862, shirt: 0x2c3e5c, stripe: 0xd4a24a, braces: 0x1a2838,
    trousers: 0x2a2e38, cap: 0x2a2a30, tie: 0xc6a15a, shoe: 0x1a1a20, hair: 0x2a2420,
  },
  // A rose-gold horn, a burgundy shirt, a plum cap.
  {
    id: 'rose', brass: 0xd4786a, skin: 0xf0c4a0, shirt: 0x8a3a48, stripe: 0xf2d6a8, braces: 0x5c2830,
    trousers: 0x3a3048, cap: 0x6a3a58, tie: 0xf2d6a8, shoe: 0x2a2430, hair: 0xc4a060,
  },
];

export function tromboneLook(lap: number): TromboneLook {
  return lookAt(TROMBONE_LOOKS, lap);
}
