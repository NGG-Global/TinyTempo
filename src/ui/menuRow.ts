/**
 * The row over Play on the title screen: which blocks stand on it, and where. Pure, so the
 * eight cases are tested under node (`tests/menuRow.test.ts`).
 *
 * The row holds at most two blocks, because a third would run under the objectives puck on
 * its left and shrink every label past reading. **Daily Tempo goes first whenever it is
 * shipped**: it is the thing that is new every day. Beside it stands Endless once level 100
 * is cleared, or How to play while the lesson has not been passed — and with all three
 * wanted, How to play leaves the row, since Settings → Help carries the lesson in every
 * build and the other two have no other door on this screen. One block takes the single
 * width; two split the wider row with a gap, each with the smaller label.
 */
export type MenuBlock = 'daily' | 'endless' | 'lesson';

export const MENU_ROW = Object.freeze({
  single: 400,
  split: 480,
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

/** The blocks' frames on a row centred at `centerX`, with its top at `y`, at the scene's scale. */
export function menuRow(input: MenuRowInput, centerX: number, y: number, height: number, s: number): MenuRowPlan {
  const blocks = rowBlocks(input);
  const frames: Partial<Record<MenuBlock, MenuRowFrame>> = {};
  if (blocks.length === 1) {
    frames[blocks[0]!] = { x: centerX - MENU_ROW.single / 2 * s, y, width: MENU_ROW.single * s, height };
  } else if (blocks.length === 2) {
    const half = (MENU_ROW.split - MENU_ROW.gap) / 2 * s;
    frames[blocks[0]!] = { x: centerX - MENU_ROW.split / 2 * s, y, width: half, height };
    frames[blocks[1]!] = { x: centerX + MENU_ROW.gap / 2 * s, y, width: half, height };
  }
  return {
    blocks,
    daily: frames.daily ?? null,
    endless: frames.endless ?? null,
    lesson: frames.lesson ?? null,
    labelSize: blocks.length === 2 ? MENU_ROW.splitLabel : MENU_ROW.label,
  };
}
