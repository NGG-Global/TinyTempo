import { lookAt } from './lookAt';

/**
 * The cucumber on the board. The knife is shared; a look is the skin, its ridges and
 * the flesh a coin shows, so a return visit is a different cucumber. Pure data,
 * unit-tested under node.
 */
export interface CucumberLook {
  readonly id: string;
  readonly skin: number;
  readonly skinLit: number;
  readonly stripe: number;
  readonly ridge: number;
  readonly ridgeDark: number;
  readonly pore: number;
  readonly skinInk: number;
  readonly flesh: number;
  readonly fleshRing: number;
  readonly fleshInk: number;
  readonly gel: number;
  readonly seed: number;
  readonly seedLit: number;
  readonly stem: number;
  readonly blossom: number;
}

export const CUCUMBER_LOOKS: readonly CucumberLook[] = [
  // The original garden cucumber.
  {
    id: 'garden', skin: 0x4c8848, skinLit: 0x77a85d, stripe: 0x93bd75, ridge: 0x73a55b, ridgeDark: 0x396b3e,
    pore: 0xb4ce93, skinInk: 0x304d33, flesh: 0xeef6d4, fleshRing: 0xd4e8a4, fleshInk: 0x406638,
    gel: 0xc5d86a, seed: 0xf5f3ca, seedLit: 0xf7f4ce, stem: 0x3a5c32, blossom: 0xf0c35a,
  },
  // A dark greenhouse cucumber: near-black skin, pale flesh.
  {
    id: 'dark', skin: 0x2a4a32, skinLit: 0x3d6a42, stripe: 0x4a7a48, ridge: 0x345838, ridgeDark: 0x1e3424,
    pore: 0x6a9470, skinInk: 0x1a3024, flesh: 0xf4f8e4, fleshRing: 0xdce8c0, fleshInk: 0x2a4830,
    gel: 0xc8d890, seed: 0xf8f6d8, seedLit: 0xfaf8e4, stem: 0x243c28, blossom: 0xe8d070,
  },
  // A pale, yellow-striped one, still a cucumber.
  {
    id: 'pale', skin: 0x8aaa55, skinLit: 0xb8d07a, stripe: 0xe2d06a, ridge: 0x9ab868, ridgeDark: 0x5a7840,
    pore: 0xd4e4a8, skinInk: 0x3d5430, flesh: 0xf6f8e0, fleshRing: 0xe4ecc0, fleshInk: 0x4a6840,
    gel: 0xd8e090, seed: 0xf8f4d0, seedLit: 0xfaf6dc, stem: 0x4a6838, blossom: 0xf2d878,
  },
];

export function cucumberLook(lap: number): CucumberLook {
  return lookAt(CUCUMBER_LOOKS, lap);
}
