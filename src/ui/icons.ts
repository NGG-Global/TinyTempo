import Phaser from 'phaser';
import { shade } from './colour';
import { faces } from './light';

/**
 * Controls drawn as geometry. `♪ × ← ↻` were set as text, and `gear.ts` already records
 * why a glyph is a risk: enough Android system fonts lack it to show a tofu box on a
 * handset. Geometry also takes the treatment's outline and lighting like everything else.
 */

export function drawSpeaker(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, colour: number, muted: boolean, alpha = 1): void {
  g.fillStyle(colour, alpha);
  // Cabinet and horn.
  g.fillRect(x - r * 0.75, y - r * 0.3, r * 0.45, r * 0.6);
  g.fillTriangle(x - r * 0.35, y - r * 0.3, x + r * 0.15, y - r * 0.75, x + r * 0.15, y + r * 0.75);
  g.fillRect(x - r * 0.35, y - r * 0.3, r * 0.5, r * 0.6);
  g.lineStyle(Math.max(2, r * 0.16), colour, alpha);
  if (muted) {
    g.lineBetween(x + r * 0.35, y - r * 0.35, x + r * 0.85, y + r * 0.35);
    g.lineBetween(x + r * 0.85, y - r * 0.35, x + r * 0.35, y + r * 0.35);
  } else {
    g.beginPath(); g.arc(x + r * 0.1, y, r * 0.5, -0.9, 0.9); g.strokePath();
    g.beginPath(); g.arc(x + r * 0.1, y, r * 0.8, -0.9, 0.9); g.strokePath();
  }
}

export function drawBack(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, colour: number, alpha = 1): void {
  g.lineStyle(Math.max(2.5, r * 0.22), colour, alpha);
  g.lineBetween(x - r * 0.7, y, x + r * 0.7, y);
  g.lineBetween(x - r * 0.7, y, x - r * 0.1, y - r * 0.6);
  g.lineBetween(x - r * 0.7, y, x - r * 0.1, y + r * 0.6);
}

export function drawRestart(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, colour: number, alpha = 1): void {
  const w = Math.max(2.5, r * 0.22);
  g.lineStyle(w, colour, alpha);
  g.beginPath(); g.arc(x, y, r * 0.65, -Math.PI * 0.35, Math.PI * 1.35); g.strokePath();
  // Arrowhead at the open end.
  const ax = x + Math.cos(-Math.PI * 0.35) * r * 0.65, ay = y + Math.sin(-Math.PI * 0.35) * r * 0.65;
  g.fillStyle(colour, alpha);
  g.fillTriangle(ax - r * 0.3, ay - r * 0.05, ax + r * 0.18, ay - r * 0.42, ax + r * 0.22, ay + r * 0.2);
}

export function drawPlay(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, colour: number, alpha = 1): void {
  g.fillStyle(colour, alpha);
  g.fillTriangle(x - r * 0.5, y - r * 0.7, x - r * 0.5, y + r * 0.7, x + r * 0.75, y);
}

export function heartPoints(x: number, y: number, r: number): Phaser.Math.Vector2[] {
  const points: Phaser.Math.Vector2[] = [];
  for (let i = 0; i <= 28; i++) {
    const t = (i / 28) * Math.PI * 2;
    const hx = 16 * Math.sin(t) ** 3;
    const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    points.push(new Phaser.Math.Vector2(x + hx * r / 16, y - hy * r / 18));
  }
  return points;
}

export function drawHeart(
  g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, colour: number, alpha = 1, outline?: number,
): void {
  const points = heartPoints(x, y, r);
  g.fillStyle(colour, alpha).fillPoints(points, true);
  g.lineStyle(Math.max(1.6, r * 0.18), outline ?? shade(colour, -0.55), alpha).strokePoints(points, true);
}

/** The silhouette alone, for laying back over a partial fill. */
export function strokeHeart(
  g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, colour: number, alpha = 1,
): void {
  g.lineStyle(Math.max(1.6, r * 0.18), colour, alpha).strokePoints(heartPoints(x, y, r), true);
}

/**
 * The lower `part` of a heart, over an empty one already drawn: the regenerating heart
 * filling up. Graphics has no clip, so the outline is clipped against the waterline
 * instead — one half-plane, which for a convex-enough silhouette is a single pass.
 */
export function fillHeart(
  g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, colour: number, part: number, alpha = 1,
): void {
  const clamped = Math.max(0, Math.min(1, part));
  if (clamped <= 0) return;
  const points = heartPoints(x, y, r);
  const top = Math.min(...points.map(p => p.y));
  const bottom = Math.max(...points.map(p => p.y));
  const line = bottom - (bottom - top) * clamped;
  const kept: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!, b = points[(i + 1) % points.length]!;
    const aIn = a.y >= line, bIn = b.y >= line;
    if (aIn) kept.push(a);
    if (aIn !== bIn) {
      const k = (line - a.y) / (b.y - a.y);
      kept.push(new Phaser.Math.Vector2(a.x + (b.x - a.x) * k, line));
    }
  }
  if (kept.length < 3) return;
  g.fillStyle(colour, alpha).fillPoints(kept, true);
}

/**
 * A shackle and body. Geometry rather than a glyph, because enough Android fonts lack
 * a padlock and would show a tofu box. `y` is the top of the body.
 */
export function drawPadlock(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  body: number,
  colour: number,
  keyhole = colour,
): void {
  const f = faces(colour);
  const outline = Math.max(1.6, body * 0.12);
  const w = body;
  const h = body * 0.73;
  const shackleR = body * 0.35;
  const shackleY = y + body * 0.04;
  const bar = Math.max(2.4, body * 0.16);
  g.lineStyle(bar + outline * 2, shade(colour, -0.6), 1).beginPath().arc(x, shackleY, shackleR, Math.PI, 0).strokePath();
  g.lineStyle(bar, colour, 1).beginPath().arc(x, shackleY, shackleR, Math.PI, 0).strokePath();
  g.lineStyle(outline, shade(colour, -0.6), 1).strokeRoundedRect(x - w / 2, y, w, h, body * 0.19);
  g.fillStyle(f.shade).fillRoundedRect(x - w / 2, y, w, h, body * 0.19);
  g.fillStyle(f.face).fillRoundedRect(x - w / 2, y - body * 0.08, w, h * 0.9, body * 0.19);
  g.fillStyle(keyhole).fillCircle(x, y + h * 0.42, body * 0.12);
}

export function drawMap(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, colour: number, alpha = 1): void {
  // A folded map: three panels, the middle one dropped.
  g.fillStyle(colour, alpha);
  const w = r * 0.5, h = r * 1.2;
  g.fillPoints(new Phaser.Geom.Polygon([
    { x: x - w * 1.5, y: y - h / 2 }, { x: x - w * 0.5, y: y - h / 2 + r * 0.25 }, { x: x - w * 0.5, y: y + h / 2 + r * 0.25 }, { x: x - w * 1.5, y: y + h / 2 },
  ]).points, true);
  g.fillStyle(colour, alpha * 0.7);
  g.fillPoints(new Phaser.Geom.Polygon([
    { x: x - w * 0.5, y: y - h / 2 + r * 0.25 }, { x: x + w * 0.5, y: y - h / 2 }, { x: x + w * 0.5, y: y + h / 2 }, { x: x - w * 0.5, y: y + h / 2 + r * 0.25 },
  ]).points, true);
  g.fillStyle(colour, alpha);
  g.fillPoints(new Phaser.Geom.Polygon([
    { x: x + w * 0.5, y: y - h / 2 }, { x: x + w * 1.5, y: y - h / 2 + r * 0.25 }, { x: x + w * 1.5, y: y + h / 2 + r * 0.25 }, { x: x + w * 0.5, y: y + h / 2 },
  ]).points, true);
}

/** An open scrapbook: two pages off a spine, the right one holding a mounted square. */
export function drawBook(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, colour: number, alpha = 1): void {
  const w = r * 0.8, h = r * 1.05, dip = r * 0.16;
  g.fillStyle(colour, alpha);
  g.fillTriangle(x, y - h / 2 + dip, x - w, y - h / 2, x - w, y + h / 2);
  g.fillTriangle(x, y - h / 2 + dip, x - w, y + h / 2, x, y + h / 2 + dip);
  g.fillStyle(colour, alpha * 0.72);
  g.fillTriangle(x, y - h / 2 + dip, x + w, y - h / 2, x + w, y + h / 2);
  g.fillTriangle(x, y - h / 2 + dip, x + w, y + h / 2, x, y + h / 2 + dip);
  // A mounted square on the right-hand page: the thing a scrapbook is for.
  g.fillStyle(0xfff4dc, alpha).fillRect(x + w * 0.28, y - h * 0.18, w * 0.46, w * 0.46);
}

/** A chevron pointing right: "this opens its own screen". */
export function drawChevron(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, colour: number, alpha = 1): void {
  g.lineStyle(Math.max(2.4, r * 0.34), colour, alpha);
  g.lineBetween(x - r * 0.3, y - r * 0.55, x + r * 0.3, y);
  g.lineBetween(x + r * 0.3, y, x - r * 0.3, y + r * 0.55);
}

/**
 * A lemniscate for "unlimited". Drawn rather than set as `∞`, for the reason `gear.ts`
 * records: the glyph is missing from enough Android system fonts to show a tofu box, and
 * the bundled display face is not guaranteed to carry it either.
 */
export function drawInfinity(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, colour: number, alpha = 1): void {
  const points: Phaser.Math.Vector2[] = [];
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * Math.PI * 2;
    const d = 1 + Math.sin(t) ** 2;
    points.push(new Phaser.Math.Vector2(x + r * Math.cos(t) / d, y + r * 0.62 * Math.sin(t) * Math.cos(t) / d));
  }
  g.lineStyle(Math.max(2.2, r * 0.2), colour, alpha).strokePoints(points, true);
}

/** A phone buzzing: the handset plus a motion mark either side. The Haptics switch. */
export function drawVibrate(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, colour: number, alpha = 1): void {
  const w = r * 0.62, h = r * 1.3;
  g.fillStyle(colour, alpha).fillRoundedRect(x - w / 2, y - h / 2, w, h, r * 0.2);
  g.lineStyle(Math.max(2.2, r * 0.19), colour, alpha);
  for (const side of [-1, 1]) {
    g.lineBetween(x + side * r * 0.72, y - r * 0.4, x + side * r * 0.72, y + r * 0.4);
  }
}

/**
 * A rounded rectangle as a point list, rotated about `(ox, oy)`.
 *
 * Graphics can fill a rounded rect and it can fill a polygon, but it cannot rotate
 * either without a canvas transform. The turn glyphs are drawn at an angle and are the
 * only marks here that are, so the rotation happens in the points rather than in the
 * renderer — the same approach `heartPoints` already takes to a shape Graphics has no
 * primitive for.
 */
function rotatedRoundedRect(
  cx: number, cy: number, w: number, h: number, radius: number, angle: number, ox: number, oy: number,
): Phaser.Math.Vector2[] {
  const r = Math.min(radius, w / 2, h / 2);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const points: Phaser.Math.Vector2[] = [];
  const corners: readonly (readonly [number, number, number])[] = [
    [cx + w / 2 - r, cy - h / 2 + r, -Math.PI / 2],
    [cx + w / 2 - r, cy + h / 2 - r, 0],
    [cx - w / 2 + r, cy + h / 2 - r, Math.PI / 2],
    [cx - w / 2 + r, cy - h / 2 + r, Math.PI],
  ];
  for (const [kx, ky, from] of corners) {
    for (let i = 0; i <= 4; i++) {
      const a = from + (i / 4) * (Math.PI / 2);
      const px = kx + Math.cos(a) * r, py = ky + Math.sin(a) * r;
      points.push(new Phaser.Math.Vector2(
        ox + (px - ox) * cos - (py - oy) * sin,
        oy + (px - ox) * sin + (py - oy) * cos,
      ));
    }
  }
  return points;
}

/** The angle the hammer mark is carried at. Level, it reads as a mallet lying down. */
const HAMMER_TILT = -36 * Math.PI / 180;

/**
 * The tool's turn: a hammer in profile, head low-left.
 *
 * Paired with {@link drawTapMark} on the two owner slots and on the baton, so whose turn
 * it is is a picture of the thing acting rather than a word that has to be translated.
 */
export function drawHammerMark(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, colour: number, alpha = 1): void {
  g.fillStyle(colour, alpha);
  g.fillPoints(rotatedRoundedRect(x - r * 0.28, y, r * 0.71, r * 1.0, r * 0.18, HAMMER_TILT, x, y), true);
  g.fillPoints(rotatedRoundedRect(x + r * 0.33, y, r * 1.0, r * 0.35, r * 0.18, HAMMER_TILT, x, y), true);
}

/** The player's turn: a fingertip on the surface, two ripples above it. */
export function drawTapMark(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, colour: number, alpha = 1): void {
  const cy = y + r * 0.28;
  g.fillStyle(colour, alpha).fillCircle(x, cy, r * 0.42);
  g.lineStyle(r * 0.2, colour, alpha);
  g.beginPath(); g.arc(x, cy, r * 0.7, -2.55, -0.59); g.strokePath();
  g.lineStyle(r * 0.2, colour, alpha * 0.6);
  g.beginPath(); g.arc(x, cy, r * 1.05, -2.42, -0.72); g.strokePath();
}
