import { lookAt } from './lookAt';

/**
 * The banana on the board. The knife is shared; a look is the peel and how freckled it
 * is, so a return visit is a different banana. Pure data, unit-tested under node.
 */
export interface BananaLook {
  readonly id: string;
  readonly peel: number;
  readonly peelLit: number;
  readonly peelDark: number;
  readonly speckle: number;
  /** How strongly the freckles read. Lap 0 keeps the original light speckling. */
  readonly speckleAlpha: number;
  readonly flesh: number;
  readonly fleshRing: number;
  readonly pith: number;
  readonly seed: number;
  readonly stem: number;
  readonly stemLit: number;
}

export const BANANA_LOOKS: readonly BananaLook[] = [
  // The original ripe yellow banana.
  {
    id: 'ripe', peel: 0xf3c849, peelLit: 0xffe88a, peelDark: 0xdba331, speckle: 0x6b4a18, speckleAlpha: 0.65,
    flesh: 0xfff4c4, fleshRing: 0xf5e09a, pith: 0xe8c870, seed: 0x5a4020, stem: 0x5a6b28, stemLit: 0x7a8c40,
  },
  // A green one, barely freckled.
  {
    id: 'green', peel: 0x8fbf4a, peelLit: 0xc6e07a, peelDark: 0x6a9a32, speckle: 0x4a6a28, speckleAlpha: 0.28,
    flesh: 0xf4f6d8, fleshRing: 0xd8e0a0, pith: 0xc8d070, seed: 0x4a4828, stem: 0x3d5a22, stemLit: 0x5a7830,
  },
  // A spotted one: the freckles have taken over.
  {
    id: 'spotted', peel: 0xe6b43a, peelLit: 0xf0d070, peelDark: 0x8a5a28, speckle: 0x4a3018, speckleAlpha: 0.92,
    flesh: 0xfff0b8, fleshRing: 0xf0d090, pith: 0xd8b060, seed: 0x3a2814, stem: 0x5a4020, stemLit: 0x7a5830,
  },
];

export function bananaLook(lap: number): BananaLook {
  return lookAt(BANANA_LOOKS, lap);
}
