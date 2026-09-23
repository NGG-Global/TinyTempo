import { lookAt } from './lookAt';

/**
 * The plank under the saw. The stroke, the kerf and the fall are shared; a look is the
 * timber and the glove on the handle, so a return visit is a different board.
 * Pure data, unit-tested under node.
 */
export interface SawLook {
  readonly id: string;
  readonly sapwood: number;
  readonly lit: number;
  readonly grain: number;
  readonly kerf: number;
  readonly grip: number;
  readonly glove: number;
  readonly sleeve: number;
  readonly sawdust: number;
}

export const SAW_LOOKS: readonly SawLook[] = [
  // The original pine, cool glove, brass sawdust.
  {
    id: 'pine', sapwood: 0xcbb999, lit: 0xe4d8c0, grain: 0xa89070, kerf: 0x544a39,
    grip: 0x3f5a63, glove: 0x6b7f88, sleeve: 0x2f4650, sawdust: 0xd8a24a,
  },
  // Cherry: a warm red plank and a burgundy glove.
  {
    id: 'cherry', sapwood: 0xc4846a, lit: 0xe0a890, grain: 0x8f5340, kerf: 0x4a3028,
    grip: 0x6b3038, glove: 0x8a4038, sleeve: 0x3d2428, sawdust: 0xe8c07a,
  },
  // Walnut: a dark plank and a green glove.
  {
    id: 'walnut', sapwood: 0x6e4b32, lit: 0x8d6848, grain: 0x4a3020, kerf: 0x2a1c14,
    grip: 0x2f4a3a, glove: 0x3d6a48, sleeve: 0x1e3328, sawdust: 0xd4b06a,
  },
];

export function sawLook(lap: number): SawLook {
  return lookAt(SAW_LOOKS, lap);
}
