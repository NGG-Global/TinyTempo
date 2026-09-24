import type { LookCopy } from './Vignette';
import { lookAt } from './lookAt';

/**
 * Four paintings, one per lap. The easel, the hand and the stroke are shared; a look is
 * which picture the brush is making, and — because a sailboat is not a sunset — the words
 * that name it. Lap 0 keeps the registry's own words. Pure data, unit-tested under node.
 */
export interface PaintStroke {
  readonly colour: number;
  readonly ink: number;
  readonly width: number;
  /** Polyline in canvas space. The brush travels it from the first point to the last. */
  readonly points: readonly (readonly [number, number])[];
}

export interface CanvasLook {
  readonly id: string;
  readonly wall: number;
  readonly frame: number;
  readonly cloth: number;
  readonly handle: number;
  readonly handleInk: number;
  readonly ferrule: number;
  readonly bristle: number;
  readonly strokes: readonly PaintStroke[];
  readonly copy: LookCopy;
}

const sky = (colour: number, ink: number, y: number, width: number): PaintStroke => ({
  colour, ink, width, points: [[-118, y], [118, y]],
});

export const CANVAS_LOOKS: readonly CanvasLook[] = [
  {
    id: 'sunset', wall: 0xf3ead8, frame: 0xc4a574, cloth: 0xf7f1e4,
    handle: 0xc46a3a, handleInk: 0x7a3d22, ferrule: 0xd7d2c8, bristle: 0xf4efe4,
    copy: {},
    strokes: [
      sky(0xf6c9a0, 0xc98462, -108, 36),
      sky(0xf08a62, 0xc45a3e, -78, 28),
      { colour: 0xffe7a3, ink: 0xd7a85a, width: 34, points: [[-46, -96], [-28, -112], [-8, -96], [-28, -80], [-46, -96]] },
      { colour: 0x7f6aa8, ink: 0x534478, width: 22, points: [[-130, -20], [-70, -48], [-10, -28], [50, -44], [130, -16]] },
      { colour: 0x4f6b52, ink: 0x2e4634, width: 28, points: [[-130, 18], [-40, -8], [30, 16], [130, 4]] },
      { colour: 0x6e8fb5, ink: 0x3e5e80, width: 18, points: [[-120, 48], [-20, 36], [40, 52], [120, 40]] },
      { colour: 0x5a3d2e, ink: 0x3a261c, width: 12, points: [[46, 10], [50, -20], [48, -52]] },
      { colour: 0x3e7a48, ink: 0x245430, width: 26, points: [[22, -48], [48, -70], [74, -46], [48, -36], [22, -48]] },
    ],
  },
  {
    id: 'sail', wall: 0xe7eef2, frame: 0xb7c3cc, cloth: 0xf4f7f8,
    handle: 0x3d8f8a, handleInk: 0x1d5552, ferrule: 0xd5dbe0, bristle: 0xf7fbfb,
    copy: {
      title: 'Sailboat', intro: 'Out on\nthe water.',
      success: ['Fair\nwinds.', 'Every line of the rigging.'],
      rough: ['A bit\nadrift.', 'The sea can wait.'],
    },
    strokes: [
      sky(0xb9ddf2, 0x6fa4c4, -100, 40),
      { colour: 0xfff3c4, ink: 0xd7c07a, width: 30, points: [[70, -112], [88, -128], [106, -112], [88, -96], [70, -112]] },
      { colour: 0xf7f4ea, ink: 0xc9c2b0, width: 16, points: [[-90, -78], [-60, -92], [-30, -74]] },
      { colour: 0x3f7eae, ink: 0x245678, width: 22, points: [[-130, 8], [-40, -6], [40, 12], [130, 2]] },
      { colour: 0x2f6f98, ink: 0x1c4a68, width: 14, points: [[-120, 42], [-10, 30], [70, 48], [120, 36]] },
      { colour: 0xc4553a, ink: 0x8a3424, width: 16, points: [[-36, 22], [-8, 8], [48, 10], [62, 28], [-28, 30], [-36, 22]] },
      { colour: 0x5c4636, ink: 0x3a2c22, width: 8, points: [[8, 12], [6, -18], [4, -78]] },
      { colour: 0xf4f0e4, ink: 0xc4bba6, width: 14, points: [[6, -70], [48, -36], [8, 4]] },
    ],
  },
  {
    id: 'cat', wall: 0xf6efe6, frame: 0xd2b48a, cloth: 0xfff8ef,
    handle: 0xe07a3d, handleInk: 0x8f4520, ferrule: 0xe4d8c8, bristle: 0xfff8ef,
    copy: {
      title: 'Tabby', intro: 'Hold\nstill.',
      success: ['There you\nare.', 'Whiskers and all.'],
      rough: ['Smudged\nthe whiskers.', 'The cat has left the sitting.'],
    },
    strokes: [
      { colour: 0xe7a15a, ink: 0xb57232, width: 44, points: [[-50, 36], [10, 56], [70, 28], [40, -8], [-20, 4], [-50, 36]] },
      { colour: 0xf0b56a, ink: 0xc08040, width: 40, points: [[-16, -8], [6, -52], [46, -22], [16, 6], [-16, -8]] },
      { colour: 0xe7a15a, ink: 0xb57232, width: 16, points: [[-6, -44], [-28, -96], [8, -48]] },
      { colour: 0xe7a15a, ink: 0xb57232, width: 16, points: [[24, -46], [42, -98], [36, -42]] },
      { colour: 0xd4894a, ink: 0xa4622c, width: 16, points: [[58, 22], [108, 8], [120, -48], [88, -16]] },
      { colour: 0x3a2a24, ink: 0x241814, width: 9, points: [[2, -36], [12, -30]] },
      { colour: 0x3a2a24, ink: 0x241814, width: 9, points: [[26, -34], [36, -28]] },
      { colour: 0x3a2a24, ink: 0x241814, width: 5, points: [[-40, -16], [4, -24], [30, -18], [64, -26]] },
    ],
  },
  {
    id: 'flower', wall: 0xeef3e6, frame: 0xc6b48a, cloth: 0xf8f6ee,
    handle: 0x6aaa55, handleInk: 0x3a6a32, ferrule: 0xd9d4c8, bristle: 0xf4f8ef,
    copy: {
      title: 'Flower', intro: 'In\nbloom.',
      success: ['Freshly\npicked.', 'Every petal in its place.'],
      rough: ['A little\nwilted.', 'The vase can try again.'],
    },
    strokes: [
      { colour: 0x3f8a48, ink: 0x245c2e, width: 10, points: [[4, 56], [2, 10], [0, -30]] },
      { colour: 0x5aaa5a, ink: 0x2e6e36, width: 14, points: [[2, 8], [-40, -8], [-18, 16], [2, 8]] },
      { colour: 0x5aaa5a, ink: 0x2e6e36, width: 14, points: [[2, -4], [40, -16], [22, 10], [2, -4]] },
      { colour: 0xf07088, ink: 0xc0445c, width: 18, points: [[0, -36], [-28, -62], [-8, -40]] },
      { colour: 0xf07088, ink: 0xc0445c, width: 18, points: [[0, -36], [28, -64], [10, -38]] },
      { colour: 0xe85a78, ink: 0xb03c58, width: 18, points: [[0, -36], [-34, -28], [-6, -28]] },
      { colour: 0xe85a78, ink: 0xb03c58, width: 18, points: [[0, -36], [34, -26], [8, -28]] },
      { colour: 0xf2c14e, ink: 0xc4922a, width: 16, points: [[-8, -40], [0, -28], [10, -42], [0, -48], [-8, -40]] },
    ],
  },
];

export function canvasLook(lap: number): CanvasLook {
  return lookAt(CANVAS_LOOKS, lap);
}
