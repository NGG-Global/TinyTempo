import { lookAt } from './lookAt';

/**
 * Who is on the jetty. The haul is shared; a look is the coat, the waders, the hat and
 * the scarf, so a return visit is a different person at the same water.
 * Pure data, unit-tested under node.
 */
export interface FishermanLook {
  readonly id: string;
  readonly skin: number;
  readonly coat: number;
  readonly coatInk: number;
  readonly waders: number;
  readonly boot: number;
  readonly hat: number;
  readonly beard: number;
  readonly scarf: number;
  readonly buckle: number;
}

export const FISHERMAN_LOOKS: readonly FishermanLook[] = [
  // The original yellow mac, straw hat and red scarf.
  {
    id: 'mac', skin: 0xe8b48a, coat: 0xf0b429, coatInk: 0x9a6d10, waders: 0x3f5a48, boot: 0x2c2f33,
    hat: 0xf0c04b, beard: 0xd8d2c4, scarf: 0xc4463c, buckle: 0xd9853c,
  },
  // A navy coat, a green hat and a mustard scarf.
  {
    id: 'navy', skin: 0xc48a62, coat: 0x2c4a6e, coatInk: 0x1a2e44, waders: 0x3a3f45, boot: 0x1e2228,
    hat: 0x2f4a3a, beard: 0x6a5344, scarf: 0xd4a24a, buckle: 0xc6a15a,
  },
  // A rust coat, a white hat and a teal scarf.
  {
    id: 'rust', skin: 0xf0c8a4, coat: 0xc45c3a, coatInk: 0x6b2e1c, waders: 0x6a6248, boot: 0x4a3028,
    hat: 0xf4efe4, beard: 0x3a2a22, scarf: 0x3d8a8a, buckle: 0xe8c49a,
  },
];

export function fishermanLook(lap: number): FishermanLook {
  return lookAt(FISHERMAN_LOOKS, lap);
}
