/**
 * Where a first-visit hint's parts sit (`ui/screenHint.ts`): a card stacked from its rows'
 * measured heights, centred in the safe frame, and pushed down from the top rather than
 * off it when a short frame cannot hold it centred. Pure, so the stack is tested under node.
 */

/** Design-unit metrics, scaled by the scene's `s`. */
export const HINT = Object.freeze({
  width: 600,
  /** Kept clear between the card and the frame's edges. */
  margin: 20,
  pad: 40,
  eyebrowY: 46,
  titleTop: 76,
  titleGap: 30,
  rowGap: 22,
  /** The numbered bead beside each line. */
  bead: 17,
  beadGap: 18,
  buttonGap: 34,
  buttonWidth: 280,
  buttonHeight: 78,
  foot: 34,
  enterSec: 0.35,
  /** A tap this soon after the card opens is still the tap that opened the screen. */
  armSec: 0.5,
});

export interface HintStack {
  readonly y: number;
  readonly height: number;
  /** The title's top edge; it hangs from it, so a second line grows down. */
  readonly titleY: number;
  /** Each row's top edge. */
  readonly rows: readonly number[];
  /** The button's top edge. */
  readonly buttonY: number;
}

/**
 * `titleHeight` and `rowHeights` are the texts' wrapped heights, already at scale `s`; a
 * row is never shorter than its bead. `top` and `bottom` are the safe frame's edges.
 */
export function planHint(top: number, bottom: number, s: number, titleHeight: number, rowHeights: readonly number[]): HintStack {
  const rows = rowHeights.map(h => Math.max(h, HINT.bead * 2 * s));
  const body = rows.reduce((sum, h) => sum + h, 0) + Math.max(0, rows.length - 1) * HINT.rowGap * s;
  const height = (HINT.titleTop + HINT.titleGap + HINT.buttonGap + HINT.buttonHeight + HINT.foot) * s + titleHeight + body;
  const centred = (top + bottom) / 2 - height / 2;
  const y = Math.max(top + HINT.margin * s, centred);
  const titleY = y + HINT.titleTop * s;
  let rowY = titleY + titleHeight + HINT.titleGap * s;
  const rowTops = rows.map(h => {
    const at = rowY;
    rowY += h + HINT.rowGap * s;
    return at;
  });
  return { y, height, titleY, rows: rowTops, buttonY: y + height - (HINT.foot + HINT.buttonHeight) * s };
}
