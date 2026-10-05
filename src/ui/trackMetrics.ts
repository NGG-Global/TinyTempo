/**
 * The turn block's metrics, and the verdict line placed from them, in a module that
 * imports no Phaser: the household stage keeps its shelf clear of the verdict
 * (`vignettes/staging.ts`), and an act's tests run under node with Phaser stubbed out,
 * where loading the block's drawing code would not. `ui/turnBlock.ts` re-exports all of
 * it, so the block and PlayScene read it from there as before.
 */

/**
 * The block's metrics, in design units at scale 1. The sockets are deliberately larger
 * than the map's area pips: this is the only thing on screen that says whose turn it is,
 * so it has to read at arm's length rather than merely be present.
 */
export const TRACK = {
  beadGap: 58,
  beadRadius: 19,
  plateHeight: 72,
  plateDepth: 7,
  plateRadius: 28,
  pipGap: 30,
  pipRadius: 6,

  shelfHeight: 46,
  shelfRadius: 22,
  /** The shelf is this much narrower per side, so the face reads as the object in front. */
  shelfInset: 24,
  shelfBeadRadius: 12,
  /** Clear space between the shelf's bottom edge and the face's top. */
  rowGap: 14,

  ownerSlotRadius: 26,
  /** Slot centre, measured in from its row's left edge. */
  ownerInset: 46,
  /** Clear space between the owner slot's edge and the first column's. */
  slotClearance: 10,
  batonRadius: 26,
  /** How far the face rises into the thumb once the turn has passed. */
  faceLift: 15,
  /** How far the baton bows out, over the columns it is handing across. */
  batonBow: 60,

  /** The breather's bar tiles on the face: height, corner, gap, and the right-hand inset. */
  tileHeight: 44,
  tileRadius: 12,
  tileGap: 10,
  tileInset: 22,
  /** A tile's beat dots, and their pitch; in the last bar they grow to `pipRadius`. */
  tileDot: 5,
  tileDotPitch: 0.2,
  /**
   * The narrowest the block is while a breather's tiles are on it, so four bars of four
   * dots stay readable on a short pattern's block. The breather task's own plan carries it
   * from the rest through its response, so nothing moves inside the task.
   */
  restWidth: 560,
} as const;

/** Space between the shelf's top edge and the verdict word's centre line, in design units. */
const VERDICT_ABOVE_SHELF = 34;
/**
 * How far the verdict's pill reaches either side of its line at its largest, in design
 * units: half its height at the pop's peak, and a little air.
 */
export const VERDICT_REACH = 32;

/**
 * The verdict word's centre line, above the shelf rather than above the face: the
 * demonstration row occupies the band the verdict used to sit in, and a word over the
 * beads is a word over the cue. PlayScene places the word here, and the household stage
 * keeps its shelf clear of it, so the two cannot drift apart.
 */
export function verdictLine(trackY: number, s: number): number {
  return trackY - (TRACK.plateHeight / 2 + TRACK.rowGap + TRACK.shelfHeight + VERDICT_ABOVE_SHELF) * s;
}
