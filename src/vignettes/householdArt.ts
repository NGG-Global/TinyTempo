import type Phaser from 'phaser';
import { STYLE } from '@/config/style';
import { paintedContour } from '@/ui/illustration';

export const HOME_INK = 0x493c39;
export function shape(g: Phaser.GameObjects.Graphics, points: readonly number[], colour: number, ink = HOME_INK, weight = STYLE.current.outline * 0.65): void {
  paintedContour(g, points, colour, ink, weight);
}
export function slab(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, colour: number, radius = 12, ink = HOME_INK): void {
  g.fillStyle(colour).fillRoundedRect(x, y, w, h, radius);
  g.lineStyle(STYLE.current.outline * 0.6, ink).strokeRoundedRect(x, y, w, h, radius);
}
export function sparkle(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, alpha = 1): void {
  g.fillStyle(0xfff5cb, alpha);
  g.fillTriangle(x - r, y, x, y - r * 0.22, x + r, y);
  g.fillTriangle(x - r, y, x, y + r * 0.22, x + r, y);
  g.fillTriangle(x, y - r, x - r * 0.22, y, x, y + r);
  g.fillTriangle(x, y - r, x + r * 0.22, y, x, y + r);
}
export function plant(g: Phaser.GameObjects.Graphics, x: number, y: number, size = 1): void {
  g.lineStyle(5 * size, 0x425b4d).lineBetween(x, y - 12 * size, x, y - 95 * size);
  for (let i = 0; i < 5; i++) {
    const side = i % 2 ? 1 : -1;
    g.fillStyle(i % 2 ? 0x5b9479 : 0x8cb68b).fillEllipse(x + side * 15 * size, y - (30 + i * 14) * size, 36 * size, 17 * size);
  }
  shape(g, [x - 26 * size, y - 16 * size, x + 26 * size, y - 16 * size, x + 19 * size, y + 24 * size, x - 19 * size, y + 24 * size], 0xcf8263);
  g.lineStyle(3 * size, 0xf1bb8e).lineBetween(x - 16 * size, y - 7 * size, x - 12 * size, y + 14 * size);
}
