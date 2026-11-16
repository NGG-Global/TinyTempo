/**
 * The row over Play on the title screen: which blocks stand on it, and where. Pure, so the
 * eight cases are tested under node (`tests/menuRow.test.ts`).
 *
 * The row holds at most two blocks, because a third would shrink every label past reading.
 * **Daily Tempo goes first whenever it is shipped**: it is the thing that is new every day.
 * Beside it stands Endless once level 100 is cleared, or How to play while the lesson has
 * not been passed — and with all three wanted, How to play leaves the row, since Settings →
 * Help carries the lesson in every build and the other two have no other door on this
 * screen.
 *
 * **The row is laid along a span, not centred on the screen.** It runs from the objectives
 * puck's right to the Play block's right edge, so the puck, the row and the block square up
 * as one object on the bench: the puck's left edge on Play's, the row's right edge on Play's.
 * Centred on the screen at a fixed width, the row sat inside the block's edges by a different
 * amount on every frame and the puck stood off on its own at the screen's edge. One block
 * takes the whole span; two split it with a gap, each with the smaller label.
 */
export type MenuBlock = 'daily' | 'endless' | 'lesson';

export const MENU_ROW = Object.freeze({
  gap: 20,
  label: 32,
  splitLabel: 30,
});

export interface MenuRowInput {
  readonly daily: boolean;
  readonly endless: boolean;
  readonly lesson: boolean;
}

export interface MenuRowFrame { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

/** The horizontal span the row fills, in the scene's own units. */
export interface MenuRowSpan { readonly left: number; readonly right: number }

export interface MenuRowPlan {
  readonly blocks: readonly MenuBlock[];
  readonly daily: MenuRowFrame | null;
  readonly endless: MenuRowFrame | null;
  readonly lesson: MenuRowFrame | null;
  /** The label size for every block on the row, in design units. */
  readonly labelSize: number;
}

/** Which blocks stand on the row, in order, left to right. */
export function rowBlocks(input: MenuRowInput): readonly MenuBlock[] {
  const blocks: MenuBlock[] = [];
  if (input.daily) blocks.push('daily');
  if (input.endless) blocks.push('endless');
  else if (input.lesson) blocks.push('lesson');
  if (blocks.length < 2 && input.lesson && !blocks.includes('lesson')) blocks.push('lesson');
  return blocks.slice(0, 2);
}

/** The blocks' frames along `span`, with their top at `y`, at the scene's scale. */
export function menuRow(input: MenuRowInput, span: MenuRowSpan, y: number, height: number, s: number): MenuRowPlan {
  const blocks = rowBlocks(input);
  const frames: Partial<Record<MenuBlock, MenuRowFrame>> = {};
  const width = Math.max(0, span.right - span.left);
  if (blocks.length === 1) {
    frames[blocks[0]!] = { x: span.left, y, width, height };
  } else if (blocks.length === 2) {
    const gap = MENU_ROW.gap * s;
    const half = Math.max(0, (width - gap) / 2);
    frames[blocks[0]!] = { x: span.left, y, width: half, height };
    frames[blocks[1]!] = { x: span.left + half + gap, y, width: half, height };
  }
  return {
    blocks,
    daily: frames.daily ?? null,
    endless: frames.endless ?? null,
    lesson: frames.lesson ?? null,
    labelSize: blocks.length === 2 ? MENU_ROW.splitLabel : MENU_ROW.label,
  };
}
