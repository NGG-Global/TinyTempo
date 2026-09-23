import { lookAt } from './lookAt';

/**
 * The stapler and the desk it sits on. The jaw and the pile are shared; a look is the
 * body's paint and the leather under the papers. Pure data, unit-tested under node.
 */
export interface StaplerLook {
  readonly id: string;
  readonly body: number;
  readonly highlight: number;
  readonly leather: number;
  readonly leatherInk: number;
}

export const STAPLER_LOOKS: readonly StaplerLook[] = [
  // The original red stapler on green leather.
  { id: 'red', body: 0xc7423a, highlight: 0xe8837b, leather: 0x3f6b57, leatherInk: 0x24443a },
  // A teal stapler on burgundy leather.
  { id: 'teal', body: 0x2a7a72, highlight: 0x5aada4, leather: 0x6b3038, leatherInk: 0x3e1c22 },
  // A black stapler on navy leather.
  { id: 'black', body: 0x2c3140, highlight: 0x5a6278, leather: 0x3a4a6a, leatherInk: 0x1e2c44 },
];

export function staplerLook(lap: number): StaplerLook {
  return lookAt(STAPLER_LOOKS, lap);
}
