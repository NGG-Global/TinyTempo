import Phaser from 'phaser';
import { PALETTE, SHELL } from '@/config/theme';
import { fuse, type Handover, type Mark } from '@/game/beatTrack';
import { clamp01, easeInOutCubic, easeOut } from '@/vignettes/motion';
import { mix, shade } from './colour';
import { socketGlint, sweepBand } from './flourish';
import { drawHammerMark, drawTapMark } from './icons';
import { drawPanel } from './panel';
import { squash } from './spring';

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
  /** Seconds since the turn arrived in the player's hand; -Infinity before it has. */
  readonly landed: number;
  /** Seconds since every beat of the task was judged Perfect; omitted or -Infinity otherwise. */
  readonly flawless?: number;
  /** A breather in progress: the face carries its bar tiles instead of the sockets. */
  readonly rest?: BlockRest | null;
}

/**
 * The breather, as the block draws it: four bar tiles of four beat dots on the face, and
 * the shelf at rest. Every value comes from `restProgress` and the audio clock.
 */
export interface BlockRest {
  readonly bar: number;
  /** The last beat heard in the bar, from 0; -1 before the first. */
  readonly beat: number;
  readonly bars: number;
  /** Seconds since that beat, for the tile's press; Infinity before the first. */
  readonly pressAge: number;
  /** Seconds since the current bar's first beat. */
  readonly barAge: number;
  /** 0 → 1 as the baton goes back to the hammer slot in the last bar; 0 during the rest. */
  readonly returning: number;
}

/** A bar tile's place on the face, as offsets from the face's own left edge and centre line. */
export interface RestTile {
  readonly x: number;
  readonly width: number;
  readonly height: number;
  /** The four dot centres, as offsets from the tile's left edge. */
  readonly dots: readonly number[];
}

/**
 * Where the breather's tiles sit on a face of `width`: after the owner slot and its
 * clearance, and in from the right edge by the same inset, evenly split with a gap
 * between. Pure, so the one property that matters — no tile under the slot, none off the
 * face — is checked under node.
 */
export function restTiles(width: number, s: number, bars: number): readonly RestTile[] {
  if (!(bars > 0) || !(width > 0)) return [];
  const left = (TRACK.ownerInset + TRACK.ownerSlotRadius + TRACK.slotClearance) * s;
  const right = width - TRACK.tileInset * s;
  const gap = TRACK.tileGap * s;
  const tile = Math.max(0, (right - left - gap * (bars - 1)) / bars);
  return Array.from({ length: bars }, (_, k) => ({
    x: left + k * (tile + gap),
    width: tile,
    height: TRACK.tileHeight * s,
    dots: [0, 1, 2, 3].map(j => tile / 2 + (j - 1.5) * tile * TRACK.tileDotPitch),
  }));
}

/** How far the last bar's dots have grown toward the count-in's pips. */
export function tileGrowth(rest: BlockRest, still: boolean): number {
  if (rest.bar < rest.bars - 1) return 0;
  return still ? 1 : easeOut(clamp01(rest.barAge / 0.22));
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
 * The baton's place on its arc at crossing `t`, and how far up the arc it is (0 at either
 * slot, 1 at the top of the bow). The bow matters: the token passes *over* the columns it
 * is handing across, rather than sliding down a wall beside them.
 */
export function batonAt(geo: BlockGeometry, s: number, t: number, lift: number, still: boolean): { x: number; y: number; arc: number } {
  const arc = still ? 0 : Math.sin(Math.PI * t);
  return {
    x: geo.shelfSlot.x + (geo.faceSlot.x - geo.shelfSlot.x) * t + TRACK.batonBow * s * arc,
    y: geo.shelfCentreY + (geo.faceCentreY - geo.shelfCentreY) * t - lift * t,
    arc,
  };
}

/**
 * The ghosts a crossing baton leaves behind it on the arc: earlier crossings, fainter
 * with distance, so the token visibly *travels* rather than being somewhere else each
 * frame. Empty at either slot and under reduced motion, where there is no travel to show.
 */
export function batonTrail(t: number, still: boolean, count = 4, spacing = 0.06): readonly { readonly t: number; readonly alpha: number }[] {
  if (still || t <= 0 || t >= 1) return [];
  const ghosts: { t: number; alpha: number }[] = [];
  // Strongest mid-arc, where the baton moves fastest; nothing when it is barely moving.
  const speed = Math.sin(Math.PI * t);
  for (let k = 1; k <= count; k++) {
    const behind = t - k * spacing;
    if (behind <= 0) break;
    ghosts.push({ t: behind, alpha: speed * (0.34 - 0.07 * k) });
  }
  return ghosts;
}

/** How long the landing's ring and squash last, in seconds. */
const LANDING_SEC = 0.46;

/** The ring the baton throws across the face as it lands: spread 0 → 1 and the alpha left. */
export function landingRipple(age: number, still: boolean): { readonly spread: number; readonly alpha: number } {
  if (still || !Number.isFinite(age) || age < 0 || age >= LANDING_SEC) return { spread: 1, alpha: 0 };
  const p = age / LANDING_SEC;
  return { spread: easeOut(p), alpha: (1 - p) ** 1.5 * 0.7 };
}

/** The baton's compression on landing: wider than tall for an instant, then round again. */
export function landingSquash(age: number, still: boolean): number {
  return still ? 0 : squash(age, LANDING_SEC * 0.7, 0.22);
}

/**
 * The glyph on the baton, shrinking to a sliver at the midpoint of the crossing and
 * growing back as the other owner's — a coin turning over, which is what a token that
 * has changed hands should look like, rather than one whose face was swapped.
 */
export function glyphFlip(t: number): number {
  return 0.25 + 0.75 * Math.abs(Math.cos(Math.PI * clamp01(t)));
}

/** A pending socket swells as the fuse reaches it — a small pop, gone once it is fully lit. */
export function socketPop(lit: number): number {
  return Math.sin(Math.PI * clamp01(lit)) * 0.14;
}

/**
 * How visible the line dropping from a shelf bead to its socket is. It arrives with the
 * fuse — the pattern is visibly handed *down* from their row to yours, which is the whole
 * metaphor — and thins once the turn has arrived, so it never competes with the answer.
 */
export function dropLine(turn: Handover, index: number, still: boolean): number {
  return socketFuse(turn, index, still) * (1 - 0.7 * turn.yours) * 0.42;
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
  if (state.rest) { drawRestBlock(g, geo, s, state, state.rest); return; }
  const { turn, still, rattle } = state;
  const heat = faceHeat(turn, still);
  const lift = faceLift(turn, still);
  drawShelf(g, geo, s, state, rattle);
  const face = drawFace(g, geo, s, state, heat, lift, rattle);
  drawOwnerSlots(g, geo, s, turn, face, lift, rattle);
  drawBaton(g, geo, s, turn, still, lift, rattle, state.landed);
}

/**
 * The block through a breather: the shelf at rest, the face carrying four bar tiles, and —
 * in the last bar only — the baton going back to the hammer slot and the example's beads
 * returning to the shelf, so the next demonstration is expected before it starts. Nothing
 * here is warmed or lifted: the turn is nobody's.
 */
function drawRestBlock(g: Phaser.GameObjects.Graphics, geo: BlockGeometry, s: number, state: BlockState, rest: BlockRest): void {
  const last = rest.bar >= rest.bars - 1;
  drawShelf(g, geo, s, state, 0, last);
  const fill = mix(PALETTE.paper, SHELL.wood, 0.16);
  const plate = new Phaser.Geom.Rectangle(geo.face.x, geo.face.y, geo.face.width, geo.face.height);
  drawPanel(g, plate, s, { fill, depth: TRACK.plateDepth, radius: TRACK.plateRadius });
  const grow = tileGrowth(rest, state.still);
  const press = state.still ? 0 : squash(rest.pressAge, 0.24, 1);
  restTiles(geo.face.width, s, rest.bars).forEach((tile, k) => {
    const done = k < rest.bar;
    const current = k === rest.bar;
    // The current tile dips on each beat, the press a key gives under a finger.
    const dip = current ? press * 2.5 * s : 0;
    const x = geo.face.x + tile.x, y = geo.faceCentreY - tile.height / 2 + dip;
    const r = TRACK.tileRadius * s;
    if (done) {
      // Recessed: the hole first and the tile inside it, a hard shadow along the top.
      g.fillStyle(0x000000, 0.2).fillRoundedRect(x, y, tile.width, tile.height, r);
      g.fillStyle(mix(fill, RECESS, 0.2), 1).fillRoundedRect(x, y + 3 * s, tile.width, tile.height - 3 * s, r);
    } else {
      g.fillStyle(shade(fill, -0.18), 1).fillRoundedRect(x, y + 3 * s, tile.width, tile.height, r);
      g.fillStyle(mix(fill, SHELL.cream, 0.6), 1).fillRoundedRect(x, y, tile.width, tile.height, r);
    }
    if (current) g.lineStyle(3 * s, PALETTE.ink, 1).strokeRoundedRect(x, y, tile.width, tile.height, r);
    const lastTile = k === rest.bars - 1;
    const radius = (TRACK.tileDot + (lastTile ? (TRACK.pipRadius - TRACK.tileDot) * grow : 0)) * s;
    tile.dots.forEach((dx, j) => {
      const played = done || (current && j <= rest.beat);
      const cx = x + dx, cy = y + tile.height / 2 + (done ? 1.5 * s : 0);
      if (played) {
        const pop = current && j === rest.beat && !state.still ? squash(rest.pressAge, 0.24, 0.35) : 0;
        g.fillStyle(PALETTE.ink, done ? 0.8 : 1).fillCircle(cx, cy, radius * (1 + pop));
      } else {
        g.lineStyle(2 * s, PALETTE.muted, 1).strokeCircle(cx, cy, radius);
      }
    });
  });
  drawOwnerSlots(g, geo, s, { runway: 0, yours: 0 }, fill, 0, 0, last ? 1 : 0.4);
  // In the last bar the baton goes back to the hammer slot, over the face it was handed
  // to: the turn is about to be theirs again. Under reduced motion it is simply there.
  if (last) drawBaton(g, geo, s, { runway: 1 - rest.returning, yours: 0 }, state.still, 0, 0, -Infinity);
}

/** The demonstration's row: a plank recessed into the scene, and the beats landing on it. */
function drawShelf(g: Phaser.GameObjects.Graphics, geo: BlockGeometry, s: number, state: BlockState, rattle: number, beads = true): void {
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
  // At rest the shelf carries its label instead of the example's beads; the scene sets it.
  if (!beads) return;

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
  // The pattern dropping from their row into yours: one thin line per column, from the
  // bead on the shelf to the socket under it, arriving with the fuse. Drawn before the
  // sockets so a socket's own ring sits over the line's end.
  const shelfBead = TRACK.shelfBeadRadius * s;
  for (let i = 0; i < state.centres.length; i++) {
    const alpha = dropLine(state.turn, i, state.still);
    if (alpha <= 0.01) continue;
    const x = geo.face.centerX + state.centres[i]! + rattle;
    g.lineStyle(2.4 * s, SOCKET_RING, alpha)
      .lineBetween(x, geo.shelfCentreY + shelfBead + 3 * s, x, y - state.socketRadius - 2 * s);
  }
  for (let i = 0; i < state.centres.length; i++) {
    const x = geo.face.centerX + state.centres[i]! + rattle;
    const mark = state.marks[i] ?? 'pending';
    const lit = socketFuse(state.turn, i, state.still);
    const struck = mark === 'perfect' || mark === 'good';
    // The struck swell for an answered socket; for a pending one, the pop as its fuse
    // reaches it, so the row visibly counts itself off left to right.
    const swell = i === state.struck.index ? state.struck.amount : struck ? 0 : state.still ? 0 : socketPop(lit);
    const r = state.socketRadius * (1 + swell);
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

  drawFlawless(g, geo, s, state, plate, y);

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
 * The flourish for a flawless task, on the row it was earned on: a band of light crosses
 * the face left to right and each socket glints as it passes. The word is the scene's;
 * this is the part that belongs to the block, and under reduced motion it is the glint
 * alone — every ring at once, without the sweep — since the information is in the glint.
 */
function drawFlawless(
  g: Phaser.GameObjects.Graphics, geo: BlockGeometry, s: number, state: BlockState, plate: Phaser.Geom.Rectangle, y: number,
): void {
  const age = state.flawless;
  if (age === undefined || !Number.isFinite(age) || age < 0) return;
  const band = state.still ? { at: 0, alpha: 0 } : sweepBand(age);
  if (band.alpha > 0.01) {
    // A vertical band, clipped to the plate by arithmetic since Graphics cannot clip: its
    // left and right edges are held inside the plate and it simply narrows at either end.
    const half = plate.width * 0.09;
    const centre = plate.x + plate.width * band.at;
    const left = Math.max(plate.x, centre - half);
    const right = Math.min(plate.x + plate.width, centre + half);
    if (right > left) {
      const inset = 4 * s;
      g.fillStyle(SHELL.cream, band.alpha).fillRect(left, plate.y + inset, right - left, plate.height - inset * 2);
    }
  }
  for (let i = 0; i < state.centres.length; i++) {
    const glint = state.still ? Math.min(1, age / 0.4) : socketGlint(age, i, state.centres.length);
    if (glint < 0 || glint >= 1) continue;
    const x = geo.face.centerX + state.centres[i]! + state.rattle;
    const r = state.socketRadius;
    const fade = (1 - glint) ** 1.4;
    g.lineStyle((5 - 3 * glint) * s, 0xffe7a0, fade * 0.85).strokeCircle(x, y, r * (1.05 + 1.6 * glint));
    g.fillStyle(SHELL.cream, fade * 0.45).fillCircle(x, y, r * 0.9);
  }
}

/**
 * The baton's home on each side. A slot is what makes the token read as changing hands
 * rather than merely moving, and each slot carries the glyph for whose side it is.
 */
function drawOwnerSlots(
  g: Phaser.GameObjects.Graphics, geo: BlockGeometry, s: number, turn: Handover, face: number, lift: number, rattle: number,
  dim = 1,
): void {
  const r = TRACK.ownerSlotRadius * s;
  const glyph = r * 0.62;
  const shelfAlpha = (1 - 0.5 * turn.yours) * dim;
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
 * it is handing across, rather than sliding down a wall beside them. On the way it leaves
 * a trail of itself, turns over like a coin so the glyph that arrives is the player's, and
 * lands with a squash and a ring across the face — all of which is what makes one coral
 * disc read as an object being handed to you rather than as a light that moved.
 */
function drawBaton(
  g: Phaser.GameObjects.Graphics, geo: BlockGeometry, s: number, turn: Handover, still: boolean, lift: number, rattle: number, landed: number,
): void {
  const t = batonCrossing(turn, still);
  const at = batonAt(geo, s, t, lift, still);
  const x = at.x + rattle;
  const y = at.y;
  const arc = at.arc;
  const r = TRACK.batonRadius * s * (1 + 0.16 * arc);

  for (const ghost of batonTrail(t, still)) {
    const past = batonAt(geo, s, ghost.t, lift, still);
    const pr = TRACK.batonRadius * s * (1 + 0.16 * past.arc) * (0.72 + 0.2 * ghost.alpha);
    g.fillStyle(PALETTE.coral, ghost.alpha).fillCircle(past.x + rattle, past.y, pr);
  }

  const ripple = landingRipple(landed, still);
  if (ripple.alpha > 0.01) {
    const reach = r * (1 + 3.2 * ripple.spread);
    g.lineStyle((6 - 4 * ripple.spread) * s, PALETTE.coral, ripple.alpha).strokeCircle(x, y, reach);
    g.lineStyle(2 * s, SHELL.cream, ripple.alpha * 0.6).strokeCircle(x, y, reach * 0.82);
  }

  const glow = (10 + 30 * arc) * s;
  for (let i = 3; i >= 1; i--) {
    g.fillStyle(PALETTE.coral, 0.5 * (i === 3 ? 0.18 : i === 2 ? 0.26 : 0.34)).fillCircle(x, y, r + glow * (i / 3));
  }
  // Wider than tall for an instant as it lands, then round again; Graphics has no
  // rotation for an ellipse, and a landing is the one moment the squash is on an axis.
  const sq = landingSquash(landed, still);
  const w = r * 2 * (1 + sq), h = r * 2 * (1 - sq);
  g.fillStyle(mix(PALETTE.coral, PALETTE.ink, 0.45), 1).fillEllipse(x, y + 3 * s, w, h);
  g.fillStyle(PALETTE.coral, 1).fillEllipse(x, y, w, h);
  // A catch of light on the top-left, so the disc has the thickness the pucks have.
  g.fillStyle(SHELL.cream, 0.28).fillEllipse(x - r * 0.22, y - r * 0.3, w * 0.36, h * 0.22);
  const glyph = r * 0.5 * (still ? 1 : glyphFlip(t));
  if (t < 0.5) drawHammerMark(g, x, y, glyph, SHELL.cream);
  else drawTapMark(g, x, y, glyph, SHELL.cream);
}
