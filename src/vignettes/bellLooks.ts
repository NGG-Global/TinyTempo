import { lookAt } from './lookAt';

/**
 * The desk bell and the bellboy it summons. The press and the arrival are shared; a
 * look is the metal, the livery and the lobby paper. Pure data, unit-tested under node.
 */
export interface BellLook {
  readonly id: string;
  readonly paper: number;
  readonly glow: number;
  readonly wall: number;
  readonly stripe: number;
  readonly metal: number;
  readonly livery: number;
  readonly liveryInk: number;
  readonly trim: number;
}

export const BELL_LOOKS: readonly BellLook[] = [
  // The original chrome bell, red livery, warm striped lobby.
  {
    id: 'chrome', paper: 0xefe3d3, glow: 0xf2cf98, wall: 0xd8b98f, stripe: 0xe6cfa9,
    metal: 0xd5dbe0, livery: 0xc0392b, liveryInk: 0x7a231b, trim: 0xf1c40f,
  },
  // A brass bell, navy livery, a lilac lobby.
  {
    id: 'brass', paper: 0xefe6f0, glow: 0xe8d0a8, wall: 0xc9b8d4, stripe: 0xddd0e6,
    metal: 0xd4a84b, livery: 0x243e5c, liveryInk: 0x152438, trim: 0xe8d6a8,
  },
  // A copper bell, forest livery, a green lobby.
  {
    id: 'copper', paper: 0xe8efe4, glow: 0xe8c898, wall: 0xb7c4b0, stripe: 0xd0ddc8,
    metal: 0xc46b45, livery: 0x2f5a45, liveryInk: 0x1a3328, trim: 0xf2e2b0,
  },
];

export function bellLook(lap: number): BellLook {
  return lookAt(BELL_LOOKS, lap);
}
