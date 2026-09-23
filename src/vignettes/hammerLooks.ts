import { lookAt } from './lookAt';

/**
 * The hammer, the nail and the bench they meet on. The swing is shared; a look is the
 * handle's paint, the metal of the head and the nail, and the timber, so a return visit
 * is a different bench rather than a new act. Pure data, unit-tested under node.
 */
export interface HammerLook {
  readonly id: string;
  /** The painted handle. */
  readonly handle: number;
  /** The head and the nail. Lap 0 is the workshop ink, so the first visit is unchanged. */
  readonly head: number;
  readonly wood: number;
  readonly woodDark: number;
}

export const HAMMER_LOOKS: readonly HammerLook[] = [
  // The original coral handle, dark head and pine bench.
  { id: 'coral', handle: 0xcf5134, head: 0x243e35, wood: 0xc99460, woodDark: 0x936542 },
  // A teal handle, a brass head and nail, on walnut.
  { id: 'brass', handle: 0x2a8f86, head: 0xc6a15a, wood: 0x8b5a32, woodDark: 0x5c3a22 },
  // A mustard handle, blue steel, on pale ash.
  { id: 'steel', handle: 0xd4a017, head: 0x4d6270, wood: 0xd7c4a0, woodDark: 0xb0956c },
];

export function hammerLook(lap: number): HammerLook {
  return lookAt(HAMMER_LOOKS, lap);
}
