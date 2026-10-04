import type Phaser from 'phaser';
import { LAYOUT } from '@/config/design';
import { STYLE } from '@/config/style';
import { mix, relativeLuminance, shade } from '@/ui/colour';
import { castShadow, faces, LIGHT } from '@/ui/light';
import { VERDICT_REACH, verdictLine } from '@/ui/trackMetrics';

/**
 * How a household act stands on the screen: the shelf its card rests on, and the light
 * that falls across the card.
 *
 * The original nine acts sit on a full-width surface — the hammer's bench, the knife's
 * board — and read as lit from the upper left, because their own backdrops put the pool
 * of light where they can be seen. The twenty-three on the household lifecycle draw their
 * scene inside a framed card, and the card used to float in the upper half of the screen
 * on empty paper, with the backdrop's pool of light hidden behind it. Everything here is
 * drawn once per `layout` into two Graphics inside the act's stage, one under its art and
 * one over it, so it slides with the table and costs nothing per frame. See
 * `docs/STAGING.md`.
 *
 * The geometry is pure and imports no Phaser; the two drawers take a Graphics.
 */

/** A card in stage units, as the act draws it. */
export interface StageCard {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly radius: number;
}

/** The 692 x 490 framed card most of the errand and household acts share. */
export const FRAME_CARD: StageCard = Object.freeze({ x: -346, y: -246, width: 692, height: 490, radius: 22 });
/** The 680 x 460 rounder panel the percussion, picnic and grooming acts share. */
export const PANEL_CARD: StageCard = Object.freeze({ x: -340, y: -228, width: 680, height: 460, radius: 34 });

export interface StagingOptions {
  /** The act's card, in stage units. Without one, nothing is grounded or lit. */
  readonly card?: StageCard;
  /** False for an act that already stands on a surface of its own. */
  readonly ground?: boolean;
  /**
   * False for a freestanding object rather than a card against a wall: `card` is then
   * its footprint, it stands on the shelf with a contact shadow under it, and there is no
   * wall behind it to shadow and no card face to light. The paintbrush's easel.
   */
  readonly framed?: boolean;
}

export const SHELF = Object.freeze({
  /** How far the shelf runs past the card at each end. */
  overhang: 30,
  /** The lit top face, as seen from a little above. */
  top: 16,
  /** The front face. */
  front: 18,
  /** The thinnest top face worth drawing; with less room than this there is no shelf. */
  minTop: 5,
  /** How far the card stands off the wall behind it, for the shadow it throws there. */
  cardDepth: 10,
  /** The contact shadow along the line where the card meets the shelf. */
  contact: 6,
});

export interface ShelfGeometry {
  readonly x: number;
  readonly width: number;
  /** Top of the lit top face: just above the card's bottom edge, so the card sits on it. */
  readonly topY: number;
  readonly topHeight: number;
  readonly frontHeight: number;
  /** The shadow the shelf throws on the wall below its front edge. */
  readonly shadow: { readonly dx: number; readonly dy: number; readonly alpha: number };
}

/**
 * Stage units free below the card's bottom edge before the verdict's pill: the one thing
 * on a play screen that sits between the act and the turn block. It is placed from
 * `verdictLine`, the same function PlayScene places the word with.
 */
export function roomBelowCard(card: StageCard, stageY: number, scale: number, safeBottom: number, ui: number): number {
  const trackY = safeBottom - LAYOUT.trackOffsetFromBottom * ui;
  const clear = verdictLine(trackY, ui) - VERDICT_REACH * ui;
  return (clear - stageY) / scale - (card.y + card.height);
}

/**
 * The shelf under a card, fitted to the room there is. The shadow it throws on the wall
 * gives way first, then the front face, and the top face last, so on a frame with little
 * room — a 4:3 tablet, where the verdict already reaches the card — the card still rests
 * on a lip rather than on nothing; with no room at all there is no shelf, and the card
 * keeps only its contact shadow.
 */
export function shelfFor(card: StageCard, room: number): ShelfGeometry | null {
  if (!Number.isFinite(room)) return null;
  // The top face starts a third of its height above the card's foot, so the card stands
  // on it; only the part below the foot spends room.
  const sink = 0.35;
  const topHeight = Math.min(SHELF.top, room / (1 - sink));
  if (topHeight < SHELF.minTop) return null;
  const used = topHeight * (1 - sink);
  const frontHeight = Math.max(0, Math.min(SHELF.front, room - used));
  const cast = castShadow((topHeight + frontHeight) * 1.6);
  return {
    x: card.x - SHELF.overhang,
    width: card.width + SHELF.overhang * 2,
    topY: card.y + card.height - topHeight * sink,
    topHeight,
    frontHeight,
    shadow: { dx: cast.dx, dy: Math.max(0, Math.min(cast.dy, room - used - frontHeight)), alpha: cast.alpha },
  };
}

/** The unit direction the light travels: from the upper left toward the lower right. */
const AWAY = (() => {
  const length = Math.hypot(LIGHT.x, LIGHT.y);
  return { x: -LIGHT.x / length, y: -LIGHT.y / length };
})();

/**
 * How much a point inside the card is darkened, as a fraction of `peak`: nothing over the
 * half that faces the light, rising linearly to `peak` at the corner furthest from it.
 * Linear, so a triangle fan from the card's centre carries it exactly on the GPU.
 */
export function falloff(card: StageCard, x: number, y: number, peak: number): number {
  const cx = card.x + card.width / 2, cy = card.y + card.height / 2;
  const reach = (card.width / 2) * AWAY.x + (card.height / 2) * AWAY.y;
  const along = ((x - cx) * AWAY.x + (y - cy) * AWAY.y) / reach;
  return peak * Math.max(0, Math.min(1, along));
}

/** The card's outline as a closed ring of points, its corners as `segments` chords each. */
export function cardOutline(card: StageCard, inset = 0, segments = 6): readonly number[] {
  const x = card.x + inset, y = card.y + inset;
  const w = card.width - inset * 2, h = card.height - inset * 2;
  const r = Math.max(0, Math.min(card.radius - inset, w / 2, h / 2));
  const corners = [
    { cx: x + w - r, cy: y + r, from: -Math.PI / 2 },
    { cx: x + w - r, cy: y + h - r, from: 0 },
    { cx: x + r, cy: y + h - r, from: Math.PI / 2 },
    { cx: x + r, cy: y + r, from: Math.PI },
  ];
  const points: number[] = [];
  for (const corner of corners) {
    for (let i = 0; i <= segments; i++) {
      const a = corner.from + (Math.PI / 2) * (i / segments);
      points.push(corner.cx + Math.cos(a) * r, corner.cy + Math.sin(a) * r);
    }
  }
  return points;
}

/** The warm dark every cast shadow in the game is painted in (`ui/panel.ts`). */
const SHADOW = 0x1a1410;
/** How dark the corner furthest from the light gets. Enough to read as falloff, not as dirt. */
const FALLOFF_PEAK = 0.26;
/** The lit rim's strength at the corner nearest the light. */
const RIM_ALPHA = 0.72;

/**
 * The shelf's timber, from the act's own paper and glow: a step darker than a light paper
 * and a step lighter than a dark one, warmed toward the glow, so a pale salon, a teal room
 * and the trombone's night sky each get a ledge in their own family rather than one brown.
 */
export function shelfColour(paper: number, glow: number): number {
  return relativeLuminance(paper) > 0.25 ? shade(mix(paper, glow, 0.45), -0.3) : shade(mix(paper, glow, 0.18), 0.2);
}

/**
 * Under the act's art: the card's shadow on the wall behind it, the shelf, the shelf's own
 * shadow below its front edge, and the contact shadow where the card meets it. All of it
 * falls down and to the right of what casts it, as every shadow in the game does.
 */
export function drawGround(g: Phaser.GameObjects.Graphics, card: StageCard, shelf: ShelfGeometry | null, paper: number, glow: number, framed = true): void {
  g.clear();
  const bottom = card.y + card.height;
  const wall = castShadow(SHELF.cardDepth);
  if (framed) g.fillStyle(SHADOW, wall.alpha * 0.8).fillRoundedRect(card.x + wall.dx, card.y + wall.dy, card.width, card.height, card.radius);
  if (shelf) {
    const front = shelf.topY + shelf.topHeight + shelf.frontHeight;
    if (shelf.shadow.dy > 0.5) {
      g.fillStyle(SHADOW, shelf.shadow.alpha).fillRect(shelf.x + shelf.shadow.dx, front, shelf.width, shelf.shadow.dy);
    }
    const f = faces(shelfColour(paper, glow));
    g.fillStyle(f.lit, 1).fillRect(shelf.x, shelf.topY, shelf.width, shelf.topHeight);
    if (shelf.frontHeight > 0) {
      g.fillStyle(f.face, 1).fillRect(shelf.x, shelf.topY + shelf.topHeight, shelf.width, shelf.frontHeight);
      g.fillStyle(f.edge, 1).fillRect(shelf.x, front - 2, shelf.width, 2);
    }
    // The catch of light along the edge the top and front faces share.
    g.fillStyle(f.rim, 0.6).fillRect(shelf.x + 2, shelf.topY + shelf.topHeight - 1.5, shelf.width - 4, 1.5);
    const outline = STYLE.current.outline * 0.6;
    if (outline > 0) g.lineStyle(outline, shade(f.face, -0.55), 1).strokeRect(shelf.x, shelf.topY, shelf.width, front - shelf.topY);
  }
  // Where the card's foot meets whatever is under it: a dark seam, pushed toward the right
  // by the light, so the card sits rather than hovers. A freestanding object stands on a
  // pool of shadow under its footprint instead.
  const reach = SHELF.contact;
  if (!framed) {
    g.fillStyle(SHADOW, 0.22).fillEllipse(card.x + card.width / 2 + wall.dx, bottom + reach * 0.3, card.width * 1.1, reach * 2.2);
    return;
  }
  g.fillStyle(SHADOW, 0.26).fillRoundedRect(card.x + card.radius * 0.5 + wall.dx, bottom - reach * 0.5, card.width - card.radius + wall.dx * 0.5, reach, reach / 2);
}

/**
 * Over the act's art: the card's falloff — nothing over the half facing the light, darker
 * toward the lower right — and a rim of light along its top and left edges, strongest at
 * the corner nearest the light. The falloff is a triangle fan whose vertices carry their
 * own alpha, which WebGL interpolates exactly; the canvas renderer ignores per-vertex
 * colour, so there the fan is invisible and the rim is flat, and nothing is wrong.
 */
export function drawCardLight(g: Phaser.GameObjects.Graphics, card: StageCard, glow: number): void {
  g.clear();
  const stroke = STYLE.current.outline * 0.6;
  const inset = stroke / 2 + 1;
  const ring = cardOutline(card, inset);
  const cx = card.x + card.width / 2, cy = card.y + card.height / 2;
  const centre = falloff(card, cx, cy, FALLOFF_PEAK);
  // Alpha 0 for the canvas renderer, which keeps this fill and skips the gradient.
  g.fillStyle(SHADOW, 0);
  const n = ring.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = ring[i * 2]!, ay = ring[i * 2 + 1]!, bx = ring[j * 2]!, by = ring[j * 2 + 1]!;
    const a = falloff(card, ax, ay, FALLOFF_PEAK), b = falloff(card, bx, by, FALLOFF_PEAK);
    if (centre <= 0.001 && a <= 0.001 && b <= 0.001) continue;
    g.fillGradientStyle(SHADOW, SHADOW, SHADOW, SHADOW, centre, a, b, 0);
    g.fillTriangle(cx, cy, ax, ay, bx, by);
  }

  const light = mix(0xffffff, glow, 0.35);
  const r = Math.max(0, card.radius - inset);
  const thick = 4;
  const x = card.x + inset, y = card.y + inset;
  const w = card.width - inset * 2, h = card.height - inset * 2;
  // The flat colour is what the canvas renderer draws; WebGL takes the gradient after it.
  g.fillStyle(light, RIM_ALPHA * 0.5);
  g.fillGradientStyle(light, light, light, light, RIM_ALPHA, 0, RIM_ALPHA, 0);
  g.fillRect(x + r, y, Math.max(0, w - r * 2), thick);
  g.fillGradientStyle(light, light, light, light, RIM_ALPHA, RIM_ALPHA, 0, 0);
  g.fillRect(x, y + r, thick, Math.max(0, h - r * 2));
  if (r > 0) {
    g.lineStyle(thick, light, RIM_ALPHA);
    g.beginPath();
    g.arc(x + r, y + r, r - thick / 2, Math.PI, Math.PI * 1.5);
    g.strokePath();
  }
}
