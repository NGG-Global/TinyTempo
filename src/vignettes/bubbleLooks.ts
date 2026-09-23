import { lookAt } from './lookAt';

/**
 * The sheet of bubble wrap. The pops are shared; a look is the plastic's tint, so a
 * return visit is a different sheet. Pure data, unit-tested under node.
 */
export interface BubbleLook {
  readonly id: string;
  readonly sheet: number;
  readonly sheetEdge: number;
  readonly shadow: number;
  readonly bubble: number;
  readonly bubbleInk: number;
  readonly popped: number;
  readonly highlight: number;
}

export const BUBBLE_LOOKS: readonly BubbleLook[] = [
  // The original pale green sheet.
  {
    id: 'mint', sheet: 0xe1f2e7, sheetEdge: 0x8eaeab, shadow: 0xb9cfc6,
    bubble: 0xaed4d1, bubbleInk: 0x6d999e, popped: 0xcde0d6, highlight: 0xe5faf1,
  },
  // A pink sheet.
  {
    id: 'pink', sheet: 0xf8e4ea, sheetEdge: 0xc48a9a, shadow: 0xe0c4cc,
    bubble: 0xf4c6d4, bubbleInk: 0xc47a90, popped: 0xf8e0e8, highlight: 0xfff0f4,
  },
  // An ice-blue sheet.
  {
    id: 'ice', sheet: 0xe4eef8, sheetEdge: 0x7a9ec4, shadow: 0xc4d4e4,
    bubble: 0xb8d4f0, bubbleInk: 0x5a88b0, popped: 0xd4e4f4, highlight: 0xf4faff,
  },
];

export function bubbleLook(lap: number): BubbleLook {
  return lookAt(BUBBLE_LOOKS, lap);
}
