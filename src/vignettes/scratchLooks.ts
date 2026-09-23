import { lookAt } from './lookAt';

/**
 * The night in the booth. The scratch is shared; a look is the sleeve, the wristband
 * and the two lights, so a return visit is a different set. Pure data, unit-tested
 * under node.
 */
export interface ScratchLook {
  readonly id: string;
  readonly paper: number;
  readonly glow: number;
  readonly sleeve: number;
  readonly band: number;
  readonly warm: number;
  readonly cool: number;
}

export const SCRATCH_LOOKS: readonly ScratchLook[] = [
  // The original purple sleeve, gold band, magenta and cyan.
  { id: 'magenta', paper: 0x3a3344, glow: 0xe04f9a, sleeve: 0x6a4c93, band: 0xf1c04f, warm: 0xe04f9a, cool: 0x4fd3e0 },
  // A black sleeve, a red band, amber and red.
  { id: 'amber', paper: 0x2e2824, glow: 0xe08a3c, sleeve: 0x2a2428, band: 0xd94a3a, warm: 0xe08a3c, cool: 0xd94a3a },
  // A teal sleeve, a lime band, lime and violet.
  { id: 'lime', paper: 0x243038, glow: 0x7ed36a, sleeve: 0x1e6a62, band: 0xb6e04a, warm: 0x7ed36a, cool: 0x8a5ad4 },
];

export function scratchLook(lap: number): ScratchLook {
  return lookAt(SCRATCH_LOOKS, lap);
}
