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

export function drawHeart(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, colour: number, alpha = 1): void {
  const points: Phaser.Math.Vector2[] = [];
  for (let i = 0; i <= 28; i++) {
    const t = (i / 28) * Math.PI * 2;
    const hx = 16 * Math.sin(t) ** 3;
    const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    points.push(new Phaser.Math.Vector2(x + hx * r / 16, y - hy * r / 18));
  }
  g.fillStyle(colour, alpha).fillPoints(points, true);
  g.lineStyle(Math.max(1.6, r * 0.18), shade(colour, -0.55), alpha).strokePoints(points, true);
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
