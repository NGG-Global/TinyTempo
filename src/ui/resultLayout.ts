/**
 * The result screen's geometry, in design units at scale 1, and the one function that
 * stacks it on a frame. Pure: no Phaser import, so the rules that keep a medal off a rope
 * and a row off the Continue block are tested under node rather than by eye.
 *
 * The plaque hangs from two ropes on its outer thirds. Its top holds a recessed tray the
 * three medals seat in — the middle one larger and raised — each over a chip naming the
 * accuracy that earns it; under the tray, the score. Nothing crosses the plaque's outline
 * or a rope at rest: the medals used to straddle the top edge, where the outer two
 * overlapped the ropes.
 */
export const PLATE = {
  width: 590,
  height: 480,
  /** With a refunded heart's plate under the score. */
  keptHeight: 548,
  ropeLength: 130,
  /** A short frame takes rope before it takes plaque. */
  minRope: 40,
  minScale: 0.62,
  /** Rope anchors, on the plaque's outer thirds; the eye they end in sits on the top edge. */
  ropeX: 197,
  ropeEye: 7,
  tray: { inset: 40, top: 40, height: 245, radius: 24, shadow: 7 },
  medalGap: 152,
  /** Seat centres measured from the tray's top. The middle medal is lifted 34. */
  outer: { radius: 65, y: 122 },
  middle: { radius: 88, y: 88 },
  chip: { width: 96, height: 37, y: 212, text: 20 },
  scoreY: 350,
  scoreSize: 112,
  noteY: 422,
  noteSize: 24,
  keptY: 490,
  keptWidth: 300,
  keptTall: 60,
} as const;

/** Medal `k`'s seat, in the plaque's own units: x from its centre, y from its top edge. */
export function medalSeat(k: 0 | 1 | 2): { readonly x: number; readonly y: number; readonly radius: number } {
  const seat = k === 1 ? PLATE.middle : PLATE.outer;
  return { x: (k - 1) * PLATE.medalGap, y: PLATE.tray.top + seat.y, radius: seat.radius };
}

/** The threshold chip under seat `k`, centred. */
export function chipSeat(k: 0 | 1 | 2): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  return { x: (k - 1) * PLATE.medalGap, y: PLATE.tray.top + PLATE.chip.y, width: PLATE.chip.width, height: PLATE.chip.height };
}

export function trayRect(): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  return { x: -PLATE.width / 2 + PLATE.tray.inset, y: PLATE.tray.top, width: PLATE.width - 2 * PLATE.tray.inset, height: PLATE.tray.height };
}

/**
 * A keepsake's reveal on the result screen, in design units and seconds from the summary.
 * It waits for the last medal to land — about 0.85 s in — so the stars keep their own
 * moment, and it rises in the space under the plaque, where it never covers the score or
 * intercepts the tap that moves on.
 */
export const KEEPSAKE_CARD = {
  delay: 1.0,
  rise: 0.5,
  /** Its height at the least: the mount and two lines. */
  height: 168,
  art: 124,
  /** Where the note starts under the name, and the room kept under its last line. */
  noteTop: 106,
  pad: 24,
} as const;

/**
 * The card's height from its words. It used to be a fixed 212, and the first keepsake's
 * note ran to a fourth line at a 393-point width and was cut off by the card's own edge.
 */
export function keepsakeCardHeight(noteBottom: number, s: number): number {
  return Math.max(KEEPSAKE_CARD.height * s, noteBottom + KEEPSAKE_CARD.pad * s);
}

/** The rows that can hang under the plaque, in design units at scale 1. */
export const RESULT_ROWS = {
  gap: 20,
  /** A cleared finale's card: the collection and the next area's gate. */
  finale: 112,
  /** A full-level flawless run: the brass plate that says so, under the plaque. */
  mastery: 74,
  /** Short of three stars: what the next one asks. */
  strip: 100,
  replayWidth: 480,
  /** Between the replay block and Continue under it. */
  replayGap: 16,
  /** Kept clear above whatever sits under the last row. */
  margin: 20,
} as const;

export interface ResultNeeds {
  readonly refund: boolean;
  readonly finale: boolean;
  /** Every scored task flawless: the mastery plate. Never with `strip`, since it is three stars. */
  readonly mastery?: boolean;
  readonly strip: boolean;
  /** The keepsake card's height in world units, or 0 for none. */
  readonly keepsake: number;
  readonly replay: boolean;
}

export interface ResultFrame {
  readonly s: number;
  /** The widest the plaque may be. */
  readonly width: number;
  /** The highest the ropes may hang from: under the headline. */
  readonly top: number;
  /** Where the ropes hang from when there is room to spare. */
  readonly preferredTop: number;
  /** The top of the Continue block, and the replay block's height when it is shown. */
  readonly blockTop: number;
  readonly replayHeight: number;
}

export type ResultRowKind = 'finale' | 'mastery' | 'strip' | 'keepsake';

export interface ResultPlan {
  /** The ropes' ceiling anchor, and their length. */
  readonly anchorY: number;
  readonly rope: number;
  /** The plaque's scale on top of `s`: 1 unless the frame is short or narrow. */
  readonly k: number;
  readonly plaqueHeight: number;
  readonly plaqueBottom: number;
  readonly rows: readonly { readonly kind: ResultRowKind; readonly y: number; readonly height: number }[];
  readonly replayY: number | null;
}

/**
 * Stacks the plaque, the rows under it and the replay block over Continue. Rows go in one
 * order — the finale's card, the mastery plate, then the next star or the keepsake — so the same thing is
 * always in the same place. On a tall frame this hangs the plaque exactly as it hung
 * before: a fifth of the spare room down from `preferredTop`. On a short one it takes rope
 * first and then shrinks the plaque, never below `minScale`, rather than letting a row run
 * into the block the thumb is on.
 */
export function planResult(frame: ResultFrame, needs: ResultNeeds): ResultPlan {
  const s = frame.s, gap = RESULT_ROWS.gap * s;
  const replayY = needs.replay ? frame.blockTop - RESULT_ROWS.replayGap * s - frame.replayHeight : null;
  const floor = (replayY ?? frame.blockTop) - RESULT_ROWS.margin * s;
  const heights: { kind: ResultRowKind; height: number }[] = [];
  if (needs.finale) heights.push({ kind: 'finale', height: RESULT_ROWS.finale * s });
  if (needs.mastery) heights.push({ kind: 'mastery', height: RESULT_ROWS.mastery * s });
  if (needs.strip) heights.push({ kind: 'strip', height: RESULT_ROWS.strip * s });
  if (needs.keepsake > 0) heights.push({ kind: 'keepsake', height: needs.keepsake });
  const rowsH = heights.reduce((sum, row) => sum + gap + row.height, 0);
  const full = (needs.refund ? PLATE.keptHeight : PLATE.height) * s;
  const room = floor - frame.top;
  let rope = PLATE.ropeLength * s;
  let k = Math.min(1, frame.width / (PLATE.width * s));
  let over = rope + full * k + rowsH - room;
  if (over > 0) {
    const cut = Math.min(over, rope - PLATE.minRope * s);
    rope -= cut;
    over -= cut;
  }
  if (over > 0) k = Math.max(PLATE.minScale, k - over / full);
  const plaqueHeight = full * k;
  const stack = rope + plaqueHeight + rowsH;
  const free = Math.max(0, floor - frame.preferredTop - stack);
  const anchorY = Math.max(frame.top, Math.min(frame.preferredTop + free * 0.22, floor - stack));
  const plaqueBottom = anchorY + rope + plaqueHeight;
  let cursor = plaqueBottom;
  const rows = heights.map(row => {
    const y = cursor + gap;
    cursor = y + row.height;
    return { kind: row.kind, y, height: row.height };
  });
  return { anchorY, rope, k, plaqueHeight, plaqueBottom, rows, replayY };
}
