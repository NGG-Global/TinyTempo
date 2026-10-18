/**
 * The Endless result plaque's layout, as a pure function of what it has to hold.
 *
 * The plaque used to be a fixed 630 or 720 units tall with every row at a fixed offset
 * from its top, whatever the run had to say: a clean run with no badge left a band of
 * empty cream between the stats and the buttons, an interrupted one a dash the size of the
 * time set where the time would have been, and a two-line note could not push anything
 * down. Now the rows are stacked from their measured heights, a row with nothing to say
 * takes no room, and the plaque is as tall as its rows. No Phaser import, so it is tested
 * under node.
 */

/** Design-unit metrics, multiplied by the scene's `s`. */
export const ENDLESS_PLAQUE = Object.freeze({
  width: 600,
  /** The plaque's side margin inside the safe frame. */
  margin: 20,
  padTop: 34,
  padBottom: 28,
  padSide: 28,
  /** The gap above each row, by the row it opens. */
  gap: { title: 8, time: 14, stats: 4, best: 16, note: 12, controls: 30, buttons: 20 },
  boardHeight: 72,
  boardWidth: 360,
  blockHeight: 96,
  /** The Try again block's share of the row; the way out takes the rest. */
  againShare: 0.6,
  buttonGap: 20,
  /** How far the plaque keeps from the safe frame's top and bottom. */
  edge: 24,
});

/** The measured height of each row, in screen units; 0 for a row the run has nothing for. */
export interface PlaqueRows {
  readonly eyebrow: number;
  readonly title: number;
  readonly time: number;
  readonly stats: number;
  readonly best: number;
  readonly note: number;
}

export interface PlaqueFrame { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

export interface PlaqueInput {
  readonly s: number;
  readonly safe: PlaqueFrame;
  readonly rows: PlaqueRows;
  /** Whether the leaderboard chip takes a row. */
  readonly board: boolean;
  /** The accessible floor for a block's height, in screen units. */
  readonly controlSize: number;
}

export interface PlaquePlan {
  readonly frame: PlaqueFrame;
  readonly centerX: number;
  /** The top edge of each text row; null for a row that takes no room. */
  readonly tops: { readonly [K in keyof PlaqueRows]: number | null };
  readonly board: PlaqueFrame | null;
  readonly again: PlaqueFrame;
  readonly exit: PlaqueFrame;
}

/** Stack the rows top to bottom, then the leaderboard and the two blocks, and centre the plaque. */
export function planEndlessPlaque(input: PlaqueInput): PlaquePlan {
  const { s, safe, rows } = input;
  const m = ENDLESS_PLAQUE;
  const width = Math.min(m.width * s, safe.width - 2 * m.margin * s);
  const inner = width - 2 * m.padSide * s;
  const blockHeight = Math.max(m.blockHeight * s, input.controlSize);

  // Offsets from the plaque's top; the plaque's y is only known once its height is.
  const offsets: { -readonly [K in keyof PlaqueRows]: number | null } = { eyebrow: null, title: null, time: null, stats: null, best: null, note: null };
  let cursor = m.padTop * s;
  const order: (keyof PlaqueRows)[] = ['eyebrow', 'title', 'time', 'stats', 'best', 'note'];
  let first = true;
  for (const key of order) {
    const height = rows[key];
    if (height <= 0) continue;
    if (!first) cursor += m.gap[key as Exclude<keyof PlaqueRows, 'eyebrow'>] * s;
    offsets[key] = cursor;
    cursor += height;
    first = false;
  }
  cursor += m.gap.controls * s;
  let boardOffset: number | null = null;
  if (input.board) {
    boardOffset = cursor;
    cursor += m.boardHeight * s + m.gap.buttons * s;
  }
  const buttonsOffset = cursor;
  const height = cursor + blockHeight + m.padBottom * s;

  const x = safe.x + (safe.width - width) / 2;
  const centred = safe.y + (safe.height - height) / 2;
  // Centred in the safe frame and inside its edges. A plaque taller than the frame gives up
  // its top before its buttons, since the buttons are the only way on.
  const y = Math.min(Math.max(centred, safe.y + m.edge * s), safe.y + safe.height - m.edge * s - height);
  const top = (offset: number | null) => (offset === null ? null : y + offset);
  const againWidth = (inner - m.buttonGap * s) * m.againShare;
  const buttonsY = y + buttonsOffset;
  const boardWidth = Math.min(m.boardWidth * s, inner);
  return {
    frame: { x, y, width, height },
    centerX: x + width / 2,
    tops: {
      eyebrow: top(offsets.eyebrow), title: top(offsets.title), time: top(offsets.time),
      stats: top(offsets.stats), best: top(offsets.best), note: top(offsets.note),
    },
    board: boardOffset === null ? null : { x: x + (width - boardWidth) / 2, y: y + boardOffset, width: boardWidth, height: m.boardHeight * s },
    again: { x: x + m.padSide * s, y: buttonsY, width: againWidth, height: blockHeight },
    exit: { x: x + m.padSide * s + againWidth + m.buttonGap * s, y: buttonsY, width: inner - againWidth - m.buttonGap * s, height: blockHeight },
  };
}
