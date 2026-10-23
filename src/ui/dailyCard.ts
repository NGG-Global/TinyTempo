import { CHROME } from './chrome';

/**
 * The Daily Tempo card's layout — the screen a run starts from — as a pure function of the
 * frame and what the card has to show. Rows from the top: the header (the back puck, the
 * title and the leaderboard puck, on the one row every sub-screen shares), the date line,
 * the act's tile (its keepsake drawing over the act's name and the day's best), the reward
 * ladder, then either the dashed explainer or, once a won timer is on the shelf, that
 * timer's row with Start; and Play anchored where every screen's block sits, with a
 * footnote under it. On a short frame the gaps close first, then the tile's picture
 * shrinks to `minArt`, and only then does everything scale down together, never below
 * `minScale`, so the ladder's rows stay readable before the picture does. No Phaser import.
 */
export const DAILY_CARD = Object.freeze({
  width: 640,
  margin: 20,
  dateY: 118,
  stackTop: 160,
  tile: { art: 250, words: 140, pad: 22 },
  ladder: { head: 60, row: 92, rowGap: 14, pad: 24 },
  explainer: 130,
  shelf: 150,
  gap: 24,
  minGap: 10,
  minArt: 110,
  minScale: 0.72,
  /** Between the stack's last row and Play. */
  playGap: 24,
  footnote: 30,
});

export interface DailyCardFrame { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface DailyCardInput {
  readonly s: number;
  readonly safe: DailyCardFrame;
  readonly controlSize: number;
  /** A won timer on the shelf takes the explainer's place. */
  readonly shelfRow: boolean;
}

export interface DailyCardPlan {
  /** The scale the stack is drawn at: `s` times the shrink. */
  readonly k: number;
  readonly dateY: number;
  readonly tile: DailyCardFrame;
  readonly art: DailyCardFrame;
  readonly ladder: DailyCardFrame;
  readonly ladderHead: DailyCardFrame;
  readonly ladderRows: readonly [DailyCardFrame, DailyCardFrame, DailyCardFrame];
  readonly explainer: DailyCardFrame | null;
  readonly shelf: DailyCardFrame | null;
  readonly play: DailyCardFrame;
  readonly footnoteY: number;
}

export function planDailyCard(input: DailyCardInput): DailyCardPlan {
  const m = DAILY_CARD;
  const { s, safe } = input;
  const playH = Math.max(CHROME.block.height * s, input.controlSize);
  const playTop = safe.y + safe.height - CHROME.block.fromBottom * s - playH;
  const available = playTop - m.playGap * s - (safe.y + m.stackTop * s);
  const ladderH = m.ladder.pad * 2 + m.ladder.head + 3 * m.ladder.row + 2 * m.ladder.rowGap;
  const lastRow = input.shelfRow ? m.shelf : m.explainer;
  const fixed = m.tile.words + ladderH + lastRow;
  // Gaps close first, then the picture, then the whole stack scales.
  let gap: number = m.gap, art: number = m.tile.art, k = 1;
  const needed = (g: number, a: number, kk: number) => (fixed + a + 2 * g) * s * kk;
  if (needed(gap, art, k) > available) gap = Math.max(m.minGap, gap - (needed(gap, art, k) - available) / (2 * s));
  if (needed(gap, art, k) > available) art = Math.max(m.minArt, art - (needed(gap, art, k) - available) / s);
  if (needed(gap, art, k) > available) k = Math.max(m.minScale, available / needed(gap, art, 1));
  const ks = s * k;
  const width = Math.min(m.width * ks, safe.width - 2 * m.margin * s);
  const x = safe.x + (safe.width - width) / 2;
  let y = safe.y + m.stackTop * s;
  const tileH = (art + m.tile.words) * ks;
  const tile = { x, y, width, height: tileH };
  const pad = m.tile.pad * ks;
  const artFrame = { x: x + pad, y: y + pad, width: width - 2 * pad, height: art * ks - pad };
  y += tileH + gap * ks;
  const ladder = { x, y, width, height: ladderH * ks };
  const ladderHead = { x: x + m.ladder.pad * ks, y: y + m.ladder.pad * ks, width: width - 2 * m.ladder.pad * ks, height: m.ladder.head * ks };
  const rowTop = ladderHead.y + ladderHead.height;
  const row = (i: number): DailyCardFrame => ({ x: ladderHead.x, y: rowTop + i * (m.ladder.row + m.ladder.rowGap) * ks, width: ladderHead.width, height: m.ladder.row * ks });
  y += ladder.height + gap * ks;
  const last = { x, y, width, height: lastRow * ks };
  return {
    k, dateY: safe.y + m.dateY * s,
    tile, art: artFrame, ladder, ladderHead, ladderRows: [row(0), row(1), row(2)],
    explainer: input.shelfRow ? null : last,
    shelf: input.shelfRow ? last : null,
    play: { x: safe.x + (safe.width - CHROME.block.width * s) / 2, y: playTop, width: CHROME.block.width * s, height: playH },
    footnoteY: playTop + playH + m.footnote * s,
  };
}
