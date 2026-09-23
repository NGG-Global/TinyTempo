import { lookAt } from './lookAt';

/**
 * What is outside the pane, and the frame it is seen through. The wipe is shared; a
 * look is the view and the paint on the wood, so a return visit is a different window.
 * Pure data, unit-tested under node.
 */
export type WindowScene = 'garden' | 'harbour' | 'dusk';

export interface WindowLook {
  readonly id: string;
  readonly scene: WindowScene;
  readonly frame: number;
  readonly glove: number;
  readonly sill: number;
  readonly sky: number;
  readonly sun: number;
}

export const WINDOW_LOOKS: readonly WindowLook[] = [
  // The original lilac frame and the garden with its cottage.
  { id: 'garden', scene: 'garden', frame: 0x82718a, glove: 0xdc9775, sill: 0xd1c1cd, sky: 0xb7d9db, sun: 0xf7de9e },
  // A white frame onto a harbour: water, a sail, a headland.
  { id: 'harbour', scene: 'harbour', frame: 0xf4efe4, glove: 0x3d6a8a, sill: 0xc8bfb0, sky: 0x9fd0e4, sun: 0xfff6d8 },
  // A dark frame onto dusk: a low sun, lit windows, a moon.
  { id: 'dusk', scene: 'dusk', frame: 0x4a3d55, glove: 0xc46a4a, sill: 0x6a5a68, sky: 0x3a3a6a, sun: 0xf2a65a },
];

export function windowLook(lap: number): WindowLook {
  return lookAt(WINDOW_LOOKS, lap);
}
