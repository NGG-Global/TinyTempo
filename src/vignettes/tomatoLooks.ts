import { lookAt } from './lookAt';

/**
 * The tomato on the board. The knife and the kitchen are shared; a look is the fruit's
 * skin and what a slice shows, so a return visit is a different tomato. Still a tomato,
 * so the act keeps its words. Pure data, unit-tested under node.
 */
export interface TomatoLook {
  readonly id: string;
  readonly skin: number;
  readonly skinLit: number;
  /** The deeper band under the skin, and the specular patch on the shoulder. */
  readonly skinDeep: number;
  readonly shine: number;
  readonly flesh: number;
  readonly fleshRing: number;
  /** The chambers in a slice, and the jelly in them. */
  readonly locule: number;
  readonly loculeLit: number;
  readonly seed: number;
  readonly stem: number;
  readonly stemLit: number;
}

export const TOMATO_LOOKS: readonly TomatoLook[] = [
  // The original red tomato.
  {
    id: 'red', skin: 0xd94a3a, skinLit: 0xee7c6a, skinDeep: 0xe15c47, shine: 0xffb79a,
    flesh: 0xe35f4a, fleshRing: 0xf0a08e, locule: 0xc95536, loculeLit: 0xeaa15b, seed: 0xf5d98a,
    stem: 0x4d7c3a, stemLit: 0x6f9c4c,
  },
  // A golden tomato: yellow skin, pale flesh, amber chambers.
  {
    id: 'gold', skin: 0xe8b23a, skinLit: 0xf6d56a, skinDeep: 0xd49a28, shine: 0xfff0b0,
    flesh: 0xf0c45a, fleshRing: 0xf8e0a0, locule: 0xc48a28, loculeLit: 0xf2c56a, seed: 0xfff6d0,
    stem: 0x5a7a32, stemLit: 0x7a9a48,
  },
  // A purple heirloom: dark skin, pink flesh.
  {
    id: 'purple', skin: 0x7a3058, skinLit: 0xa85078, skinDeep: 0x5c2040, shine: 0xd488a8,
    flesh: 0xc47088, fleshRing: 0xe0a0b0, locule: 0x8a3858, loculeLit: 0xc47898, seed: 0xf5e0a0,
    stem: 0x3d5c32, stemLit: 0x5a7c48,
  },
];

export function tomatoLook(lap: number): TomatoLook {
  return lookAt(TOMATO_LOOKS, lap);
}
