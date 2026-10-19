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
  /**
   * How far the baton bows out, over the columns it is handing across. Far enough to
   * read as a throw, and no further: at 60 the disc sat over the first socket at the top
   * of its bow, covering that socket's own pop as its fuse reached it.
   */
  batonBow: 52,

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

/**
 * How much larger the block is drawn than the scene's own scale, around the same centre
 * line. The block is what the player watches through their turn, and at 1 it was the
 * smallest thing on screen under a stage several times its height. It grows in place: the
 * face keeps its distance from the bottom edge (`LAYOUT.trackOffsetFromBottom`), because
 * thumb reach is an absolute distance from the grip. 1.2 rather than the 1.4 first
 * proposed, because the frame's width caps the row and the owner slots grow too: on a
 * 720-unit-wide phone an eight-beat row's sockets come out at radius 22.6 at 1.2 and only
 * 20.4 at 1.4, smaller than at 1.2, with the whole block taller.
 *
 * Scenes draw the block at `scale * BLOCK_SCALE` (`blockScale`); the verdict word and the
 * chrome stay at the scene's scale.
 */
export const BLOCK_SCALE = 1.2;

/** The scale the block, its count-in and its rest words are drawn at, from the scene's own. */
export function blockScale(s: number): number {
  return s * BLOCK_SCALE;
}

/**
 * Space between the shelf's top edge and the verdict word's centre line, in design units.
 *
 * The block stands on a sheet that reaches `BACKING_PAD` above the shelf and feathers
 * further, and the verdict's pill is a little over 49 units tall at rest. At 34 the pill's
 * bottom edge sat on the sheet's top edge and "Flawless!", taller still, touched the shelf,
 * so a word that is meant to hover over the block read as resting on it. The line is now
 * high enough that the pill clears the sheet at rest and the flawless word clears the
 * shelf; the stage reads the same line through `roomBelowCard`, so the act's shelf gives
 * way by the same amount rather than drifting into the band.
 */
const VERDICT_ABOVE_SHELF = 48;
/**
 * How far the verdict's pill reaches either side of its line at its largest, in design
 * units: half its height at the pop's peak, and a little air.
 */
export const VERDICT_REACH = 32;

/**
 * The verdict word's centre line, above the shelf rather than above the face, for a scene
 * whose own scale is `s` (the block is drawn at `blockScale(s)`): the
 * demonstration row occupies the band the verdict used to sit in, and a word over the
 * beads is a word over the cue. PlayScene places the word here, and the household stage
 * keeps its shelf clear of it, so the two cannot drift apart.
 */
export function verdictLine(trackY: number, s: number): number {
  // The rows are the block's and grow with it; the gap above them is the verdict pill's.
  return trackY - ((TRACK.plateHeight / 2 + TRACK.rowGap + TRACK.shelfHeight) * BLOCK_SCALE + VERDICT_ABOVE_SHELF) * s;
}
