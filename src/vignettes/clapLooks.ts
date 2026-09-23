import { lookAt } from './lookAt';

/**
 * The pair of hands. The clap is shared; a look is the skin and the sleeve, so a
 * return visit is a different pair. Pure data, unit-tested under node.
 */
export interface ClapLook {
  readonly id: string;
  readonly skin: number;
  readonly nail: number;
  readonly sleeve: number;
  readonly cuff: number;
}

export const CLAP_LOOKS: readonly ClapLook[] = [
  // The original pair: warm skin, a green sleeve, a cream cuff.
  { id: 'green', skin: 0xdb9d6e, nail: 0xf3ddc4, sleeve: 0x4f7a6a, cuff: 0xf2e6d2 },
  // A deeper skin and a plum sleeve.
  { id: 'plum', skin: 0x8d5a38, nail: 0xe8c4a8, sleeve: 0x7a3a62, cuff: 0xf0d8e4 },
  // A light skin and a navy sleeve.
  { id: 'navy', skin: 0xf0c4a0, nail: 0xfff0e0, sleeve: 0x2f4568, cuff: 0xe4eaf2 },
];

export function clapLook(lap: number): ClapLook {
  return lookAt(CLAP_LOOKS, lap);
}
