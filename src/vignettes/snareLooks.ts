import { lookAt } from './lookAt';

/**
 * The snare's lacquer. The roll and the sticks are shared; a look is the shell, so a
 * return visit is a different drum. Pure data, unit-tested under node.
 */
export interface SnareLook {
  readonly id: string;
  readonly shell: number;
  readonly shellLit: number;
  /** The lower rim ellipse. It is not the shell highlight: the original red is a hair darker. */
  readonly rim: number;
  readonly shellShine: number;
  readonly shellShade: number;
}

export const SNARE_LOOKS: readonly SnareLook[] = [
  // The original red lacquer. `rim` is the shipped lower ellipse, not `shellLit`.
  { id: 'red', shell: 0x8c3337, shellLit: 0xc6584e, rim: 0xc5594e, shellShine: 0xe07a62, shellShade: 0x672f3a },
  // A blue lacquer.
  { id: 'blue', shell: 0x2a4570, shellLit: 0x3d6a9a, rim: 0x3a628e, shellShine: 0x6a94c4, shellShade: 0x1a3050 },
  // Bare maple, no paint.
  { id: 'maple', shell: 0xa86a38, shellLit: 0xd4925a, rim: 0xc88850, shellShine: 0xe8b87a, shellShade: 0x6b4020 },
];

export function snareLook(lap: number): SnareLook {
  return lookAt(SNARE_LOOKS, lap);
}
