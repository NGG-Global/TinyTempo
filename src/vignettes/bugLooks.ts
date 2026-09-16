/**
 * The three bugs that take turns under the sneaker, each with its own colourway on the
 * shoe so the whole act reads as a different day. The drop, the squash and the floor are
 * shared. Pure data, so it is unit-tested under node.
 */
export type BugMarkings = 'sheen' | 'spots' | 'stripe';

export interface BugLook {
  readonly id: string;
  readonly body: number;
  /** The sheen patch, the dots or the metallic stripe, depending on the markings. */
  readonly marking: number;
  readonly markings: BugMarkings;
  /** The sneaker's canvas upper and its heel tab. */
  readonly upper: number;
  readonly trim: number;
}

export const BUG_LOOKS: readonly BugLook[] = [
  // The original: a rubbery plum bug under a slate sneaker with a coral heel tab.
  { id: 'plum', body: 0x8b6085, marking: 0xb68da2, markings: 'sheen', upper: 0x303f43, trim: 0xd87d62 },
  // A red ladybird with a dark head, under a navy sneaker with a mustard tab.
  { id: 'ladybird', body: 0xd3543e, marking: 0x303f43, markings: 'spots', upper: 0x2f4a6e, trim: 0xd9a441 },
  // A green beetle with a metallic stripe, under a burgundy sneaker with a sky-blue tab.
  { id: 'beetle', body: 0x3f7f6f, marking: 0x9fd6c2, markings: 'stripe', upper: 0x6b3a44, trim: 0x6f9fc6 },
];

/** Which bug is out on this lap of the rotation. Never out of range. */
export function bugLook(lap: number): BugLook {
  const index = Number.isFinite(lap) ? Math.max(0, Math.floor(lap)) % BUG_LOOKS.length : 0;
  return BUG_LOOKS[index]!;
}
