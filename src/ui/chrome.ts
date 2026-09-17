import type Phaser from 'phaser';
import { STYLE } from '@/config/style';
import { PALETTE, SHELL } from '@/config/theme';
import { shade } from './colour';
import { drawHeart, fillHeart, strokeHeart } from './icons';
import { faces } from './light';
import { BRASS, drawDisc } from './panel';

/**
 * Shared chrome: the hanging-sign ropes, the utility pucks, the coral action block.
 * Menu, map, play and settings used to each invent a slightly different puck radius,
 * rope weight and press spring, which is how the same control read as three objects.
 */
export const CHROME = {
  puckRadius: 34,
  puckDepth: 7,
  pressSec: 0.42,
  block: { width: 560, height: 110, fromBottom: 96, depth: 16 },
} as const;

export { pressAmount } from './spring';

export function puckSink(s: number, press: number): number {
  return CHROME.puckDepth * s * press * 0.8;
}

export function drawPuck(
  g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, press = 0, fill = SHELL.puck,
): void {
  drawDisc(g, x, y, CHROME.puckRadius * s, s, { fill, depth: CHROME.puckDepth, press });
}

/**
 * Two ropes in local space, origin at the ceiling anchor. `weight` is the rope's
 * design-unit thickness: the menu sign is larger than the map's, so it hangs on
 * heavier line rather than a copy of the same stroke.
 */
export function drawRopes(
  g: Phaser.GameObjects.Graphics,
  s: number,
  length: number,
  xs: readonly number[],
  weight: number,
  wood = SHELL.wood,
  rope = SHELL.rope,
): void {
  const outline = STYLE.current.outline * s * 0.55;
  const thick = weight * s;
  const eye = weight * s;
  for (const x of xs) {
    g.lineStyle(outline + thick, shade(rope, -0.5), 1).lineBetween(x, 0, x, length);
    g.lineStyle(thick, rope, 1).lineBetween(x, 0, x, length);
    g.lineStyle(weight * 0.28 * s, shade(rope, 0.35), 0.6).lineBetween(x - 2 * s, 0, x - 2 * s, length);
    g.fillStyle(faces(BRASS).edge, 1).fillCircle(x, length + 2 * s, eye);
    g.fillStyle(BRASS, 1).fillCircle(x, length, eye);
    g.fillStyle(shade(wood, -0.6), 1).fillCircle(x, length, eye * 0.38);
  }
}

/**
 * The cream disc with a coral arrowhead that rides inside a coral block. Continue, Watch
 * and the map's rewarded offer all carry it: the block says what happens and the disc says
 * that a thumb starts it, which is what tells a rewarded watch apart from a purchase.
 */
export function drawActionDisc(
  g: Phaser.GameObjects.Graphics, x: number, y: number, radius: number, s: number, glyph = PALETTE.coral,
): void {
  drawDisc(g, x, y, radius, s, { fill: SHELL.cream, depth: 5 });
  g.fillStyle(shade(glyph, -0.5), 1);
  g.fillTriangle(x - radius * 0.28, y - radius * 0.48, x - radius * 0.28, y + radius * 0.48, x + radius * 0.52, y);
  g.fillStyle(glyph, 1);
  g.fillTriangle(x - radius * 0.3, y - radius * 0.42, x - radius * 0.3, y + radius * 0.42, x + radius * 0.46, y);
}

export interface HeartRowSpec {
  readonly centreX: number;
  readonly y: number;
  readonly count: number;
  readonly radius: number;
  readonly gap: number;
  /** Whole hearts held. */
  readonly filled: number;
  /** 0-1 of the way to the next one; fills the following heart from the bottom. */
  readonly part?: number;
  readonly full: number;
  readonly empty: number;
  /** Outline for the empty hearts, where the plate needs a lighter edge than the fill gives. */
  readonly emptyOutline?: number;
  readonly fullOutline?: number;
  /** Fill alpha of an empty heart. Low over a dimmed act, so the row reads as glass. */
  readonly emptyAlpha?: number;
}

/**
 * The row of five hearts that states the player's health everywhere it is stated. The
 * heart after the last full one carries the wait toward it, so the countdown has a
 * picture beside its number rather than only a string that has to be read.
 */
export function drawHeartRow(g: Phaser.GameObjects.Graphics, spec: HeartRowSpec): void {
  const part = Math.max(0, Math.min(1, spec.part ?? 0));
  for (let i = 0; i < spec.count; i++) {
    const x = spec.centreX + (i - (spec.count - 1) / 2) * spec.gap;
    const held = i < spec.filled;
    const alpha = held ? 1 : spec.emptyAlpha ?? 1;
    drawHeart(g, x, spec.y, spec.radius, held ? spec.full : spec.empty, alpha,
      held ? spec.fullOutline : spec.emptyOutline);
    if (i !== spec.filled || part <= 0.02) continue;
    fillHeart(g, x, spec.y, spec.radius, spec.full, part);
    // The waterline cuts the silhouette, so the outline goes back on over it: without
    // this the rising level reads as a red wedge floating inside an empty heart.
    strokeHeart(g, x, spec.y, spec.radius, spec.emptyOutline ?? spec.empty);
  }
}
