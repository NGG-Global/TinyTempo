import { lookAt } from './lookAt';

/**
 * The balloons the pump fills. The stroke and the burst are shared; a look is the set
 * of colours, the bunting and the pump's barrel, so a return visit is a different party.
 * Pure data, unit-tested under node.
 */
export interface BalloonLook {
  readonly id: string;
  readonly balloons: readonly [number, number, number];
  readonly bunting: readonly [number, number, number, number];
  readonly barrel: number;
  readonly grip: number;
}

export const BALLOON_LOOKS: readonly BalloonLook[] = [
  // The original red, blue and yellow, on a teal pump.
  {
    id: 'party', balloons: [0xe25c5c, 0x4fa3c9, 0xf1c04f], bunting: [0xe25c5c, 0xf1c04f, 0x4fa3c9, 0x7cb56b],
    barrel: 0x3c8f8c, grip: 0xd9853c,
  },
  // Pastels: coral, mint and cream, on a rose pump.
  {
    id: 'pastel', balloons: [0xf29a8f, 0x7ec8c3, 0xf2d56a], bunting: [0xf29a8f, 0x7ec8c3, 0xf2d56a, 0xc9a6d6],
    barrel: 0xc46a8a, grip: 0x5a6a78,
  },
  // Fairground: purple, orange and green, on a navy pump.
  {
    id: 'fair', balloons: [0x6b4c9a, 0xe07a2f, 0x3faf6a], bunting: [0x6b4c9a, 0xe07a2f, 0x3faf6a, 0xf2d56a],
    barrel: 0x3d5a8a, grip: 0xc9a06a,
  },
];

export function balloonLook(lap: number): BalloonLook {
  return lookAt(BALLOON_LOOKS, lap);
}
