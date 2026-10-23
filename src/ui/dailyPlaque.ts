import { CHROME } from './chrome';
import { PLATE } from './resultLayout';

/**
 * The Daily Tempo result's layout, as a pure function of the frame and what it has to
 * show. Under the pucks' row: the mode's pill, the headline, then the plaque — the result
 * tray a level's plaque has (`resultLayout.ts`: three seats, three chips, the score and its
 * line), hung on two ropes from the top edge — the reward ladder, the won timer's toast
 * when the run won or lengthened one, and Continue anchored where every screen's block
 * sits. The plaque, the ladder and the toast scale down together on a short frame, never
 * below `PLATE.minScale`; past that Continue gives ground and the frame scrolls nothing,
 * since the block is the only way on. An interrupted run shows the pill, the headline, a
 * line saying so and the two blocks, and no plaque: nothing was scored. No Phaser import.
 */
export const DAILY_PLAQUE = Object.freeze({
  pillY: 140,
  pillHeight: 44,
  headlineY: 200,
  stackTop: 300,
  ladder: { head: 60, row: 92, rowGap: 14, pad: 24 },
  toast: 150,
  gap: 24,
  /** Between the stack's last row and Continue. */
  continueGap: 24,
  /** The interrupted run's note and the gap over its blocks. */
  noteY: 300,
  noteGap: 40,
  edge: 24,
});

export interface DailyPlaqueFrame { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface DailyPlaqueInput {
  readonly s: number;
  readonly safe: DailyPlaqueFrame;
  readonly controlSize: number;
  readonly toast: boolean;
  readonly interrupted: boolean;
}

export interface DailyPlaquePlan {
  /** The scale the plaque, ladder and toast are drawn at: `s` times the shrink. */
  readonly k: number;
  readonly pillY: number;
  readonly headlineY: number;
  /** The plaque's frame, and the rope length from the safe top to it; null when interrupted. */
  readonly plaque: DailyPlaqueFrame | null;
  readonly rope: number;
  readonly ladder: DailyPlaqueFrame | null;
  readonly ladderHead: DailyPlaqueFrame | null;
  readonly ladderRows: readonly DailyPlaqueFrame[];
  readonly toast: DailyPlaqueFrame | null;
  readonly noteY: number | null;
  /** Continue, or on an interrupted run the Try again block; `exit` is its way back. */
  readonly action: DailyPlaqueFrame;
  readonly exit: DailyPlaqueFrame | null;
}

export function planDailyPlaque(input: DailyPlaqueInput): DailyPlaquePlan {
  const m = DAILY_PLAQUE;
  const { s, safe } = input;
  const blockH = Math.max(CHROME.block.height * s, input.controlSize);
  const blockW = Math.min(CHROME.block.width * s, safe.width - 2 * m.edge * s);
  const anchoredTop = safe.y + safe.height - CHROME.block.fromBottom * s - blockH;
  const centreX = safe.x + safe.width / 2;
  if (input.interrupted) {
    const gap = 20 * s;
    const half = (blockW - gap) / 2;
    return {
      k: 1, pillY: safe.y + m.pillY * s, headlineY: safe.y + m.headlineY * s, plaque: null, rope: 0,
      ladder: null, ladderHead: null, ladderRows: [], toast: null, noteY: safe.y + m.noteY * s,
      action: { x: centreX - blockW / 2, y: anchoredTop, width: half, height: blockH },
      exit: { x: centreX - blockW / 2 + half + gap, y: anchoredTop, width: half, height: blockH },
    };
  }
  const ladderH = m.ladder.pad * 2 + m.ladder.head + 3 * m.ladder.row + 2 * m.ladder.rowGap;
  const stackUnits = PLATE.height + m.gap + ladderH + (input.toast ? m.gap + m.toast : 0);
  const stackTop = safe.y + m.stackTop * s;
  const available = anchoredTop - m.continueGap * s - stackTop;
  const k = Math.max(PLATE.minScale, Math.min(1, available / (stackUnits * s)));
  const ks = s * k;
  // Below the floor the stack is taller than the room: Continue moves down to the edge.
  const actionTop = Math.max(anchoredTop, stackTop + stackUnits * ks + m.continueGap * s);
  const action = { x: centreX - blockW / 2, y: Math.min(actionTop, safe.y + safe.height - m.edge * s - blockH), width: blockW, height: blockH };
  const plaqueW = Math.min(PLATE.width * ks, safe.width - 2 * m.edge * s);
  let y = stackTop;
  const plaque = { x: centreX - plaqueW / 2, y, width: plaqueW, height: PLATE.height * ks };
  y += plaque.height + m.gap * ks;
  const ladder = { x: plaque.x, y, width: plaqueW, height: ladderH * ks };
  const ladderHead = { x: ladder.x + m.ladder.pad * ks, y: y + m.ladder.pad * ks, width: plaqueW - 2 * m.ladder.pad * ks, height: m.ladder.head * ks };
  const rowTop = ladderHead.y + ladderHead.height;
  const rows = [0, 1, 2].map((i): DailyPlaqueFrame => ({ x: ladderHead.x, y: rowTop + i * (m.ladder.row + m.ladder.rowGap) * ks, width: ladderHead.width, height: m.ladder.row * ks }));
  y += ladder.height;
  let toast: DailyPlaqueFrame | null = null;
  if (input.toast) {
    y += m.gap * ks;
    toast = { x: plaque.x, y, width: plaqueW, height: m.toast * ks };
  }
  return {
    k, pillY: safe.y + m.pillY * s, headlineY: safe.y + m.headlineY * s,
    plaque, rope: plaque.y - safe.y, ladder, ladderHead, ladderRows: rows, toast, noteY: null, action, exit: null,
  };
}
