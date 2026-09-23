import type { PaintImage } from './errandMotion';
import { PAINT_IMAGES } from './errandMotion';
import { lookAt } from './lookAt';

/**
 * The wall the roller paints, and which set of pictures it is loaded with. The pass
 * down a stripe is shared; a look is the room and the gallery, so a return visit rolls
 * a different set onto a different wall. Lap 0 is the original three pictures.
 * Pure data, unit-tested under node.
 */
export interface RollerLook {
  readonly id: string;
  readonly paper: number;
  readonly glow: number;
  readonly plaster: number;
  readonly wall: number;
  readonly wallLine: number;
  readonly handle: number;
}

export const ROLLER_LOOKS: readonly RollerLook[] = [
  // The original cream plaster and the orange handle.
  { id: 'plaster', paper: 0xebe4d6, glow: 0xf4d9a4, plaster: 0xd9d0c1, wall: 0xcfc5b4, wallLine: 0xbfb4a2, handle: 0xd9853c },
  // A sage nursery wall and a green handle.
  { id: 'sage', paper: 0xe4ebe4, glow: 0xcfe3b8, plaster: 0xc5d0c4, wall: 0xb7c4b4, wallLine: 0x9aab98, handle: 0x3d8f6e },
  // A dusk-blue wall and a coral handle.
  { id: 'dusk', paper: 0xe4e6ee, glow: 0xc8c4e8, plaster: 0xc5c8d4, wall: 0xb4b8c8, wallLine: 0x989cb0, handle: 0xc45c4a },
];

/** Pictures after the original three. Each row is sixteen cells; index 0 is the ground. */
const LATER_GALLERIES: readonly (readonly PaintImage[])[] = [
  [
    {
      id: 'tree', palette: [0x8ec8e8, 0x3d8f4a, 0x2a6b36, 0x8a5a32],
      rows: [
        '0000000000000000', '0000000110000000', '0000001111000000', '0000012221000000',
        '0000122222100000', '0001122222110000', '0000122222100000', '0000012221000000',
        '0000003330000000', '0000003330000000', '0000003330000000', '3333333333333333',
      ],
    },
    {
      id: 'flower', palette: [0xf6efe2, 0xe25c6a, 0xb43a48, 0x4f9a55, 0xf2c14e],
      rows: [
        '0000000000000000', '0000110000110000', '0001220001220000', '0012224112222100',
        '0001220001220000', '0000110300110000', '0000003330000000', '0000003330000000',
        '0000033333000000', '0000330003300000', '0003300000330000', '0033000000033000',
      ],
    },
    {
      id: 'boat', palette: [0x7eb6d9, 0xf7f4ea, 0xc4493a, 0x3d7ea8, 0xf2c14e],
      rows: [
        '0000000000000000', '0000000400000000', '0000001400000000', '0000011140000000',
        '0000111114000000', '0001111111400000', '0011111111140000', '0000000000000000',
        '2222222222222222', '3333333333333333', '3333333333333333', '3333333333333333',
      ],
    },
  ],
  [
    {
      id: 'moon', palette: [0x1e2a4a, 0xf6e7b8, 0xe0c878, 0xfff8e0],
      rows: [
        '0300000000003000', '0000001110000000', '0000012221000000', '3000122222100300',
        '0000122222100000', '0000012221000000', '0000001110000000', '0030000000003000',
        '0000000000000000', '0003000000030000', '0000000000000000', '0000003000000000',
      ],
    },
    {
      id: 'star', palette: [0x243056, 0xf6d34a, 0xfff3c4, 0xf7f4ea],
      rows: [
        '0000000100000000', '0000001110000000', '0000012221000000', '0111122222111110',
        '0000012221000000', '0000001110000000', '0000000100000000', '0003000000030000',
        '0000000000000000', '0030000000003000', '0000000000000000', '0000000000000000',
      ],
    },
    {
      id: 'lamp', palette: [0x2a3358, 0xf6d56a, 0xfff1b0, 0x6b4a32],
      rows: [
        '0000000000000000', '0000003330000000', '0000031113000000', '0000312221300000',
        '0000312221300000', '0000312221300000', '0000031113000000', '0000003330000000',
        '0000000000000000', '0000000000000000', '0000000000000000', '0000000000000000',
      ],
    },
  ],
];

export const ROLLER_GALLERIES: readonly (readonly PaintImage[])[] = [PAINT_IMAGES, ...LATER_GALLERIES];

export function rollerLook(lap: number): RollerLook {
  return lookAt(ROLLER_LOOKS, lap);
}

/** The picture a round paints, from the gallery this lap of the rotation is using. */
export function rollerImage(roundId: number, lap: number): PaintImage {
  const gallery = lookAt(ROLLER_GALLERIES, lap);
  const index = (Math.max(1, Math.floor(Number.isFinite(roundId) ? roundId : 1)) - 1) % gallery.length;
  return gallery[index]!;
}
