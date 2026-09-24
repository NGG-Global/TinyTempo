import { lookAt } from './lookAt';

/**
 * Whose grin is in the bathroom mirror. The mouth, the brushing order, the foam and both
 * endings are shared; a look is the face, the brush and its paste, and the mirror's frame.
 * Pure data, unit-tested under node.
 */
export interface BrushLook {
  readonly id: string;
  /** The glass behind the face, and the frame round it. */
  readonly glass: number;
  readonly frame: number;
  readonly frameInk: number;
  readonly skin: number;
  readonly skinInk: number;
  readonly blush: number;
  readonly lip: number;
  readonly lipInk: number;
  readonly brush: number;
  readonly brushInk: number;
  /** The bristles' two colours, and the stripe in the paste. */
  readonly bristle: number;
  readonly bristleTip: number;
  readonly paste: number;
}

export const BRUSH_LOOKS: readonly BrushLook[] = [
  // The original: a teal brush with mint paste, in a chrome-framed mirror.
  {
    id: 'mint', glass: 0xe1eef1, frame: 0xb7c4cc, frameInk: 0x5f6d76, skin: 0xf3c7a4, skinInk: 0xa8704e, blush: 0xec9c8d,
    lip: 0xd9767a, lipInk: 0x8f3e44, brush: 0x2f9e97, brushInk: 0x1b5f5b, bristle: 0xf7fbfb, bristleTip: 0x7fc4e8, paste: 0x6fd1a9,
  },
  // A pink brush with strawberry paste, in a wooden frame.
  {
    id: 'berry', glass: 0xf1e6ea, frame: 0xcfa577, frameInk: 0x7a5431, skin: 0xd09a74, skinInk: 0x8a5a3c, blush: 0xd9826f,
    lip: 0xb9585f, lipInk: 0x6f2c32, brush: 0xe0628f, brushInk: 0x8f2f55, bristle: 0xfbf7f8, bristleTip: 0xf2a7c1, paste: 0xe8505c,
  },
  // An orange brush with blue gel, in a green enamel frame.
  {
    id: 'citrus', glass: 0xe5eee3, frame: 0x7aa37f, frameInk: 0x3f5f44, skin: 0x8a5a3c, skinInk: 0x4f3020, blush: 0xa35d4a,
    lip: 0x7f3f3c, lipInk: 0x45201f, brush: 0xf0a53a, brushInk: 0x9a6417, bristle: 0xf8f6ef, bristleTip: 0xf3d36b, paste: 0x5b8fe0,
  },
];

export function brushLook(lap: number): BrushLook {
  return lookAt(BRUSH_LOOKS, lap);
}
