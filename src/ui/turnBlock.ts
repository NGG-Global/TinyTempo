import Phaser from 'phaser';
import { PALETTE, SHELL } from '@/config/theme';
import { fuse, type Handover, type Mark } from '@/game/beatTrack';
import { easeInOutCubic, easeOut } from '@/vignettes/motion';
import { mix, shade } from './colour';
import { drawHammerMark, drawTapMark } from './icons';
import { drawPanel } from './panel';

/**
 * The turn block: two rows at the thumb that say whose turn it is, and one token that
 * changes hands between them.
 *
 * The turn used to be a word at the top of the screen that flipped on the same frame as
 * the downbeat it announced — while the player's eyes were on the act and their thumb
 * was at the bottom. Three things are wrong with that and this file answers all three.
 * The turn has a *place*: the demonstration's beats land on a recessed shelf and the
 * player answers on the raised row below it, at the same column centres, so the pattern
 * visibly drops from their row into yours. The turn has a *token*: one coral baton that
 * leaves its slot on the shelf and lands in the slot on the face, which is what makes it
 * read as changing hands rather than merely changing colour. And the turn *arrives
 * early*: everything here is a function of `Handover`, which opens two beats before the
 * player's first target, inside the demonstration's own bar. By the downbeat nothing new
 * appears — every cue has already finished arriving. That is the property to protect.
 *
 * No words. The row's coral line, the baton, the fuse and the lift carry the whole cue,
 * which is also what lets the game ship in any locale without the turn being the thing
 * that breaks.
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
} as const;

/**
 * A deep terracotta, deliberately not `PALETTE.coral`. The socket ring has to stay
 * legible once the plate underneath it has warmed to coral, and coral on coral is
 * invisible — which is why the old plate's cue read as a wash rather than as four
 * targets.
 */
const SOCKET_RING = 0x8f3620;
/** The tint a recess takes: a warm brown, so a socket reads as a hole in timber. */
const RECESS = 0x5a4230;

/**
 * A row, as the four numbers a drawer needs. Deliberately not a `Phaser.Geom.Rectangle`:
 * the geometry here imports no Phaser and is worked out under node, the same split
 * `ui/switch.ts` already keeps between where a control sits and how it is painted.
 */
export interface BlockRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly centerX: number;
}

export interface BlockGeometry {
  readonly face: BlockRect;
  readonly shelf: BlockRect;
  readonly faceCentreY: number;
  readonly shelfCentreY: number;
  readonly faceSlot: { readonly x: number; readonly y: number };
  readonly shelfSlot: { readonly x: number; readonly y: number };
}

const rect = (x: number, y: number, width: number, height: number): BlockRect =>
  ({ x, y, width, height, centerX: x + width / 2 });

/**
 * What the owner slot costs a row at each end.
 *
 * Measured on the *shelf*, not the face: the shelf is inset by `shelfInset` per side, so
 * its slot sits that much closer to the columns than the face's does, and it is the one
 * that collides first. The columns are centred on the row, so the allowance is paid at
 * both ends even though only the left end carries a slot.
 */
const SLOT_ROOM = TRACK.shelfInset + TRACK.ownerInset + TRACK.ownerSlotRadius + TRACK.slotClearance;

/**
 * The narrowest the rows may be for the owner slot and the columns not to collide.
 * `beadSpan` is the full width of the row of columns, outer edge to outer edge.
 */
export function blockWidth(beadSpan: number, s: number): number {
  return beadSpan + SLOT_ROOM * 2 * s;
}

/**
 * How much of a row of `width` the columns may use.
 *
 * On the longest patterns the row cannot simply be made wider — it is already at the
 * edges of the screen — so the pitch gives way instead and the beads pack tighter. That
 * is the one place the block trades spacing for the slot, and it is the right trade: a
 * token sitting on top of the first socket is not a tighter row, it is a broken one.
 */
export function columnRoom(width: number, s: number): number {
  return Math.max(160 * s, width - SLOT_ROOM * 2 * s);
}

/**
 * Where the two rows sit. The face keeps the existing track's centre line exactly — the
 * thumb zone does not move — and the shelf is added above it.
 */
export function blockGeometry(centreX: number, trackY: number, width: number, s: number): BlockGeometry {
  const faceHeight = TRACK.plateHeight * s;
  const shelfHeight = TRACK.shelfHeight * s;
  const shelfCentreY = trackY - (TRACK.plateHeight / 2 + TRACK.rowGap + TRACK.shelfHeight / 2) * s;
  const face = rect(centreX - width / 2, trackY - faceHeight / 2, width, faceHeight);
  const inset = TRACK.shelfInset * s;
  const shelf = rect(face.x + inset, shelfCentreY - shelfHeight / 2, Math.max(0, width - inset * 2), shelfHeight);
  return {
    face,
    shelf,
    faceCentreY: trackY,
    shelfCentreY,
    faceSlot: { x: face.x + TRACK.ownerInset * s, y: trackY },
    shelfSlot: { x: shelf.x + TRACK.ownerInset * s, y: shelfCentreY },
  };
}

/** The guiding ring, for the one level that still teaches where the sockets are. */
export interface Ghost {
  readonly index: number;
  /** 1 at its widest, 0 landed on the socket. */
  readonly radius: number;
  readonly alpha: number;
}

export interface BlockState {
  /** Column centres, as offsets from the block's centre. Both rows share them. */
  readonly centres: readonly number[];
  readonly socketRadius: number;
  /** How many of the demonstration's beats have sounded. */
  readonly played: number;
  readonly marks: readonly Mark[];
  readonly turn: Handover;
  /** The socket the player just answered, and how far into its swell. */
  readonly struck: { readonly index: number; readonly amount: number };
  /** Both rows shake together: an extra tap answered no beat, so it marks none. */
  readonly rattle: number;
  readonly still: boolean;
  readonly ghost: Ghost | null;
  /** The act's ink, for the bar through a missed socket. */
  readonly ink: number;
}

/** How far the face has warmed toward coral, and how far it has risen into the thumb. */
export function faceHeat(turn: Handover, still: boolean): number {
  if (still) return turn.yours > 0 ? 1 : turn.runway > 0 ? 0.44 : 0;
  return Math.max(turn.yours, turn.runway * 0.44);
}

export function faceLift(turn: Handover, still: boolean): number {
  // Under reduced motion the row does not travel; the information is in the colour.
  return still ? 0 : Math.max(turn.yours, easeInOutCubic(turn.runway) * 0.5) * TRACK.faceLift;
}

/** How far the turn has crossed, 0 on the shelf and 1 in the player's hand. */
export function batonCrossing(turn: Handover, still: boolean): number {
  // Two states and no travel: the token is on their side, and then it is on yours.
  return still ? (turn.runway > 0 ? 1 : 0) : easeInOutCubic(turn.runway);
}

/**
 * How lit one socket's ring is. A fuse burning left to right during the runway, so the
 * row reads as a sequence being handed over rather than a bank of lamps coming on
 * together; under reduced motion all of them, in two steps.
 */
export function socketFuse(turn: Handover, index: number, still: boolean): number {
  return still ? (turn.yours > 0 ? 1 : turn.runway > 0 ? 0.5 : 0) : fuse(turn, index);
}

/** The whole block, in one pass over one Graphics. */
export function drawBlock(g: Phaser.GameObjects.Graphics, geo: BlockGeometry, s: number, state: BlockState): void {
  const { turn, still, rattle } = state;
  const heat = faceHeat(turn, still);
  const lift = faceLift(turn, still);
  drawShelf(g, geo, s, state, rattle);
  const face = drawFace(g, geo, s, state, heat, lift, rattle);
  drawOwnerSlots(g, geo, s, turn, face, lift, rattle);
  drawBaton(g, geo, s, turn, still, lift, rattle);
}

/** The demonstration's row: a plank recessed into the scene, and the beats landing on it. */
function drawShelf(g: Phaser.GameObjects.Graphics, geo: BlockGeometry, s: number, state: BlockState, rattle: number): void {
  // Their side goes quiet once the turn has passed, rather than disappearing: the
  // pattern that has just been played is what the player is answering.
  const alpha = 1 - 0.5 * state.turn.yours;
  if (alpha <= 0.01) return;
  const { shelf } = geo;
  const x = shelf.x + rattle;
  // Recessed rather than proud, and the order is the whole effect: the hole is drawn
  // first and the plank sits *inside* it, so what is left showing is a hard shadow along
  // the top edge and the light that bounces back out along the bottom. Drawing the
  // highlight before the plank instead put the catch of light on the top lip, which is
  // where a plank standing proud of the bench would have it.
  const lid = 4 * s;
  const lip = 2 * s;
  const r = Math.min(TRACK.shelfRadius * s, shelf.height / 2);
  g.fillStyle(0x000000, 0.3 * alpha).fillRoundedRect(x, shelf.y, shelf.width, shelf.height, r);
  const plankTop = shelf.y + lid;
  const plankHeight = Math.max(0, shelf.height - lid - lip);
  const plankRadius = Math.min(r, plankHeight / 2);
  g.fillStyle(mix(SHELL.wood, PALETTE.ink, 0.28), alpha)
    .fillRoundedRect(x, plankTop, shelf.width, plankHeight, plankRadius);
  // The lighter tone along the bottom of the plank, as a straight band inside the
  // rounded corners: Graphics has no gradient and no clip, so a second rounded rect
  // here would show its own corners as a seam.
  const inner = Math.min(plankRadius, shelf.width / 2);
  g.fillStyle(mix(SHELL.wood, PALETTE.ink, 0.16), alpha)
    .fillRect(x + inner, plankTop + plankHeight * 0.55, Math.max(0, shelf.width - inner * 2), plankHeight * 0.45);
  g.fillStyle(SHELL.cream, 0.14 * alpha)
    .fillRect(x + inner, shelf.y + shelf.height - lip, Math.max(0, shelf.width - inner * 2), lip);

  const radius = TRACK.shelfBeadRadius * s;
  for (let i = 0; i < state.centres.length; i++) {
    const bx = geo.face.centerX + state.centres[i]! + rattle;
    if (i < state.played) {
      g.fillStyle(0x000000, 0.22 * alpha).fillCircle(bx, geo.shelfCentreY + 2 * s, radius);
      g.fillStyle(SHELL.cream, alpha).fillCircle(bx, geo.shelfCentreY, radius);
    } else {
      g.fillStyle(0x000000, 0.3 * alpha).fillCircle(bx, geo.shelfCentreY, radius);
      g.fillStyle(0x000000, 0.26 * alpha).fillCircle(bx, geo.shelfCentreY + 2 * s, radius * 0.9);
    }
  }
}

/** The player's row, and the sockets they answer into. Returns the face's own fill. */
function drawFace(
  g: Phaser.GameObjects.Graphics, geo: BlockGeometry, s: number, state: BlockState,
  heat: number, lift: number, rattle: number,
): number {
  const rest = mix(PALETTE.paper, SHELL.wood, 0.16);
  const hot = mix(PALETTE.paper, PALETTE.coral, 0.54);
  const fill = mix(rest, hot, easeOut(heat));
  const plate = new Phaser.Geom.Rectangle(geo.face.x + rattle, geo.face.y - lift, geo.face.width, geo.face.height);
  drawPanel(g, plate, s, { fill, depth: TRACK.plateDepth + lift / s, radius: TRACK.plateRadius });
  if (state.turn.yours > 0.01) {
    // A painted line inside the face, the same device the menu's one action carries.
    const inset = 7 * s;
    g.lineStyle(2 * s, PALETTE.coral, state.turn.yours * 0.72)
      .strokeRoundedRect(plate.x + inset, plate.y + inset, plate.width - inset * 2, plate.height - inset * 2, (TRACK.plateRadius - 7) * s);
  }

  const y = geo.faceCentreY - lift;
  for (let i = 0; i < state.centres.length; i++) {
    const x = geo.face.centerX + state.centres[i]! + rattle;
    const mark = state.marks[i] ?? 'pending';
    const lit = socketFuse(state.turn, i, state.still);
    const struck = mark === 'perfect' || mark === 'good';
    const r = state.socketRadius * (1 + (i === state.struck.index ? state.struck.amount : 0));
    if (struck) {
      // Good sits inside a full ring, so a Perfect and a Good still read apart at a glance.
      const disc = mark === 'good' ? r * 0.62 : r;
      g.fillStyle(PALETTE.ink, 0.35).fillCircle(x, y + 2 * s, disc);
      g.fillStyle(SHELL.cream, 1).fillCircle(x, y, disc);
      g.lineStyle(4.6 * s, SOCKET_RING, 1).strokeCircle(x, y, r);
    } else {
      g.fillStyle(shade(PALETTE.ink, -0.1), 0.3).fillCircle(x, y, r);
      g.fillStyle(mix(fill, RECESS, 0.26), 1).fillCircle(x, y + 2 * s, r * 0.92);
      const ring = mark === 'miss' ? PALETTE.muted : mix(mix(PALETTE.ink, fill, 0.5), SOCKET_RING, lit);
      g.lineStyle((3 + 1.6 * lit) * s, ring, 1).strokeCircle(x, y, r);
      // Struck out in the ink rather than in the grey of the ring, or the bar vanishes
      // into the very socket it is there to cancel.
      if (mark === 'miss') g.lineStyle(4 * s, shade(state.ink, -0.1), 1).lineBetween(x - r * 1.2, y, x + r * 1.2, y);
    }
  }

  const ghost = state.ghost;
  if (ghost && ghost.alpha > 0.01) {
    const gx = geo.face.centerX + (state.centres[ghost.index] ?? 0) + rattle;
    const radius = (26 + 30 * ghost.radius) * s;
    // Graphics cannot blur, so the glow is a wider, fainter pass under the ring itself.
    g.lineStyle(12 * s, SHELL.cream, ghost.alpha * 0.28).strokeCircle(gx, y, radius);
    g.lineStyle(4 * s, SHELL.cream, ghost.alpha).strokeCircle(gx, y, radius);
  }
  return fill;
}

/**
 * The baton's home on each side. A slot is what makes the token read as changing hands
 * rather than merely moving, and each slot carries the glyph for whose side it is.
 */
function drawOwnerSlots(
  g: Phaser.GameObjects.Graphics, geo: BlockGeometry, s: number, turn: Handover, face: number, lift: number, rattle: number,
): void {
  const r = TRACK.ownerSlotRadius * s;
  const glyph = r * 0.62;
  const shelfAlpha = 1 - 0.5 * turn.yours;
  if (shelfAlpha > 0.01) {
    const sx = geo.shelfSlot.x + rattle;
    g.fillStyle(0x000000, 0.3 * shelfAlpha).fillCircle(sx, geo.shelfSlot.y, r);
    g.fillStyle(0x000000, 0.2 * shelfAlpha).fillCircle(sx, geo.shelfSlot.y + 3 * s, r * 0.92);
    drawHammerMark(g, sx, geo.shelfSlot.y, glyph, SHELL.cream, (1 - 0.58 * turn.yours) * shelfAlpha);
  }
  const fx = geo.faceSlot.x + rattle;
  const fy = geo.faceSlot.y - lift;
  g.fillStyle(shade(PALETTE.ink, -0.1), 0.26).fillCircle(fx, fy, r);
  g.fillStyle(mix(face, RECESS, 0.2), 1).fillCircle(fx, fy + 3 * s, r * 0.92);
  // Both glyphs are drawn and cross-faded rather than swapped, so the slot never pops.
  if (turn.yours < 0.99) drawTapMark(g, fx, fy, glyph, PALETTE.ink, 0.62 * (1 - turn.yours));
  if (turn.yours > 0.01) drawTapMark(g, fx, fy, glyph, SHELL.cream, turn.yours);
}

/**
 * The turn itself, changing hands. The bow matters: the token passes *over* the columns
 * it is handing across, rather than sliding down a wall beside them.
 */
function drawBaton(
  g: Phaser.GameObjects.Graphics, geo: BlockGeometry, s: number, turn: Handover, still: boolean, lift: number, rattle: number,
): void {
  const t = batonCrossing(turn, still);
  const arc = still ? 0 : Math.sin(Math.PI * t);
  const x = geo.shelfSlot.x + (geo.faceSlot.x - geo.shelfSlot.x) * t + TRACK.batonBow * s * arc + rattle;
  const y = geo.shelfCentreY + (geo.faceCentreY - geo.shelfCentreY) * t - lift * t;
  const r = TRACK.batonRadius * s * (1 + 0.16 * arc);
  const glow = (10 + 30 * arc) * s;
  for (let i = 3; i >= 1; i--) {
    g.fillStyle(PALETTE.coral, 0.5 * (i === 3 ? 0.18 : i === 2 ? 0.26 : 0.34)).fillCircle(x, y, r + glow * (i / 3));
  }
  g.fillStyle(mix(PALETTE.coral, PALETTE.ink, 0.45), 1).fillCircle(x, y + 3 * s, r);
  g.fillStyle(PALETTE.coral, 1).fillCircle(x, y, r);
  const glyph = r * 0.5;
  if (t < 0.5) drawHammerMark(g, x, y, glyph, SHELL.cream);
  else drawTapMark(g, x, y, glyph, SHELL.cream);
}
