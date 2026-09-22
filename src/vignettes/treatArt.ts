import type Phaser from 'phaser';
import { cubicContour } from '@/ui/illustration';
import { shape, sparkle } from './householdArt';

export const TREAT_INK = 0x423638;
type Graphics = Phaser.GameObjects.Graphics;

/** A rounded palm, four distinct fingers, thumb and a ribbed cuff. */
export function palm(g: Graphics, x: number, y: number, side: number, colour = 0xd89168, raised = false): void {
  const s = side === 0 ? 1 : -1;
  const at = (u: number, v: number): [number, number] => [x + u * s, y + v];
  const path = cubicContour(...at(-22, -50), [
    [...at(-32, -32), ...at(-34, -4), ...at(-22, 11)],
    [...at(-10, 22), ...at(15, 18), ...at(23, 1)],
    [...at(30, -12), ...at(27, -32), ...at(19, -47)],
    [...at(6, -55), ...at(-7, -56), ...at(-22, -50)],
  ]);
  shape(g, path, colour, 0x825140, 2.5);
  for (let i = 0; i < 4; i++) {
    const [fx, fy] = at(-20 + i * 12, raised ? -68 - (i % 3) * 4 : -6 + Math.sin(i) * 3);
    g.fillStyle(colour).fillRoundedRect(fx - 5, fy, 11, raised ? 42 : 26, 5);
    g.lineStyle(1.5, 0x825140, 0.6).lineBetween(fx + 5, fy + 8, fx + 5, fy + 20);
    g.fillStyle(0xf4c3a0, 0.75).fillEllipse(fx, fy + (raised ? 5 : 20), 6, 4);
  }
  const [tx, ty] = at(24, -19);
  g.fillStyle(colour).fillEllipse(tx, ty, 20, 34);
  g.lineStyle(2, 0x825140, 0.7).lineBetween(...at(18, -8), ...at(15, 2));
  g.fillStyle(0xf8cf9b, 0.35).fillEllipse(x - 9, y - 25, 13, 24);
  g.fillStyle(0x368987).fillRoundedRect(x - 27, y - 68, 54, 22, 6);
  g.lineStyle(2, 0x225b61).strokeRoundedRect(x - 27, y - 68, 54, 22, 6);
  g.lineStyle(2, 0xa5d4c0, 0.65);
  for (let i = 0; i < 6; i++) g.lineBetween(x - 20 + i * 8, y - 64, x - 20 + i * 8, y - 50);
}

export function rings(g: Graphics, x: number, y: number, pulse: number, colour = 0xffefc0): void {
  if (pulse <= 0) return;
  g.lineStyle(3, colour, pulse * 0.85).strokeEllipse(x, y, 55 + (1 - pulse) * 95, 18 + (1 - pulse) * 30);
  for (let i = 0; i < 3; i++) {
    const a = -2.3 + i * 0.7;
    g.lineStyle(3, colour, pulse).lineBetween(x + Math.cos(a) * 48, y + Math.sin(a) * 28, x + Math.cos(a) * 65, y + Math.sin(a) * 45);
  }
}

export function celebration(g: Graphics, age: number, still: boolean): void {
  if (age < 0.65) return;
  const alpha = Math.min(1, (age - 0.65) * 4);
  for (let i = 0; i < 5; i++) {
    const angle = Math.PI + i * Math.PI / 4;
    sparkle(g, Math.cos(angle) * 238, Math.sin(angle) * 168 + 15,
      8 + (still ? 2 : Math.sin(age * 5 + i) * 3), alpha * 0.85);
  }
}

export function note(g: Graphics, x: number, y: number, colour: number, alpha = 1): void {
  g.fillStyle(colour, alpha).fillEllipse(x, y, 13, 9);
  g.lineStyle(3, colour, alpha).lineBetween(x + 5, y, x + 5, y - 25).lineBetween(x + 5, y - 25, x + 16, y - 20);
}
