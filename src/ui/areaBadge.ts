import Phaser from 'phaser';
import { STYLE } from '../config/style';
import { AREAS } from '../game/levels';
import { faces } from './light';
import { mix, shade } from './colour';
import { drawProp } from './mapScenery';
import { BRASS } from './panel';

/**
 * An area's badge: a brass-rimmed medallion with the area's own sky over its ground, and
 * the first of its two roadside props standing on the horizon — the lamp for Pavement, the
 * cactus for Sand — so a badge is recognisably the place it was earned rather than a
 * coloured coin. A badge from a later lap of the road (Grass II) carries a brass dot under
 * the horizon for every lap past the first.
 *
 * Unearned, it is the same medallion pressed into the page as a silhouette, as an unfound
 * keepsake is: the prop's outline shows what to look for and nothing else does.
 */
export function drawAreaBadge(g: Phaser.GameObjects.Graphics, areaIndex: number, x: number, y: number, r: number, owned: boolean, well = 0xe6dcc4): void {
  const area = AREAS[((areaIndex % AREAS.length) + AREAS.length) % AREAS.length]!;
  const lap = Math.floor(Math.max(0, areaIndex) / AREAS.length);
  const outline = Math.max(1.5, STYLE.current.outline * (r / 40) * 0.6);
  const horizon = y + r * 0.3;
  if (!owned) {
    const face = shade(well, -0.08), mark = shade(well, -0.3);
    g.fillStyle(shade(well, -0.16), 1).fillCircle(x, y, r);
    g.fillStyle(face, 1).fillCircle(x, y, r * 0.84);
    g.lineStyle(outline, shade(well, -0.28), 0.7).strokeCircle(x, y, r);
    // A pressed lock, not the prop: several props carry colours of their own (a lollipop's
    // swirl, a roof's tiles), and a silhouette that keeps them gives the place away.
    drawGateLock(g, x, y + r * 0.08, r * 0.62, mark, 0);
    return;
  }
  const rim = faces(BRASS);
  // The rim: a raised brass ring with its shade under it.
  g.fillStyle(rim.shade, 1).fillCircle(x, y + r * 0.06, r);
  g.fillStyle(rim.face, 1).fillCircle(x, y, r);
  g.fillStyle(rim.rim, 0.7).fillCircle(x - r * 0.18, y - r * 0.2, r * 0.82);
  g.fillStyle(rim.face, 1).fillCircle(x, y, r * 0.88);
  // The place: ground, then the sky cut off at the horizon.
  const inner = r * 0.8;
  g.fillStyle(area.ground, 1).fillCircle(x, y, inner);
  const dy = horizon - y;
  if (dy < inner) {
    const half = Math.acos(Math.max(-1, Math.min(1, dy / inner)));
    const points: Phaser.Math.Vector2[] = [];
    // From the horizon's right end, over the top, to its left end.
    const steps = 28;
    for (let i = 0; i <= steps; i++) {
      const a = Math.PI / 2 - half - (Math.PI * 2 - 2 * half) * (i / steps);
      points.push(new Phaser.Math.Vector2(x + Math.cos(a) * inner, y + Math.sin(a) * inner));
    }
    g.fillStyle(area.sky, 1).fillPoints(points, true);
  }
  // A low sun in the sky, warm against any area's palette.
  g.fillStyle(0xfff4d6, 0.5).fillCircle(x - inner * 0.42, y - inner * 0.38, inner * 0.3);
  g.fillStyle(0xfff0c2, 1).fillCircle(x - inner * 0.42, y - inner * 0.38, inner * 0.18);
  // A light line along the horizon, so a ground close to its sky still reads as land.
  g.lineStyle(Math.max(1, r * 0.04), mix(area.ground, 0xffffff, 0.35), 0.8).lineBetween(x - Math.sqrt(Math.max(0, inner * inner - dy * dy)), horizon, x + Math.sqrt(Math.max(0, inner * inner - dy * dy)), horizon);
  // The area's own prop, large, standing in the middle of its ground.
  drawProp(g, area, 0, x + inner * 0.12, horizon + r * 0.2, r / 96);
  for (let k = 0; k < Math.min(lap, 5); k++) {
    const dx = (k - (Math.min(lap, 5) - 1) / 2) * r * 0.2;
    g.fillStyle(rim.face, 1).fillCircle(x + dx, y + r * 0.66, r * 0.07);
    g.lineStyle(Math.max(1, outline * 0.5), shade(BRASS, -0.55), 1).strokeCircle(x + dx, y + r * 0.66, r * 0.07);
  }
  g.lineStyle(outline, shade(BRASS, -0.62), 1).strokeCircle(x, y, r);
  g.lineStyle(Math.max(1, outline * 0.6), shade(BRASS, -0.45), 0.9).strokeCircle(x, y, inner);
}

/**
 * A padlock whose hasp springs: `open` 0 is shut, 1 sprung (the hasp up and swung off its
 * left post), and `tilt` shakes the whole lock about its body. Drawn glyph, no symbol font.
 */
export function drawGateLock(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number, colour: number, open: number, tilt = 0): void {
  const f = faces(colour);
  const dark = shade(colour, -0.6);
  const outline = Math.max(1.4, size * 0.11);
  const w = size, h = size * 0.74;
  const cos = Math.cos(tilt), sin = Math.sin(tilt);
  const at = (px: number, py: number): Phaser.Math.Vector2 => new Phaser.Math.Vector2(x + px * cos - py * sin, y + px * sin + py * cos);
  // The hasp: a stroked arch, lifted and swung out as it opens.
  const r = size * 0.32;
  const lift = open * size * 0.34;
  const swing = open * 0.55;
  const arch: Phaser.Math.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI + (Math.PI * i) / 16;
    const px = Math.cos(a) * r, py = Math.sin(a) * r - h * 0.5 - lift;
    // Swing about the right leg: rotate the arch's points about (r, -h/2 - lift).
    const qx = r + (px - r) * Math.cos(swing) - (py + h * 0.5 + lift) * Math.sin(swing);
    const qy = -h * 0.5 - lift + (px - r) * Math.sin(swing) + (py + h * 0.5 + lift) * Math.cos(swing);
    arch.push(at(qx, qy));
  }
  const legR = at(r, -h * 0.5);
  g.lineStyle(size * 0.17 + outline * 2, dark, 1).strokePoints(arch, false);
  g.lineStyle(size * 0.17, mix(colour, 0xffffff, 0.25), 1).strokePoints(arch, false);
  g.lineStyle(size * 0.17, mix(colour, 0xffffff, 0.25), 1).lineBetween(legR.x, legR.y, at(r, -h * 0.5 - lift).x, at(r, -h * 0.5 - lift).y);
  // The body, as a rotated rounded box: four corners are enough at this size.
  const body = [at(-w / 2, -h / 2), at(w / 2, -h / 2), at(w / 2, h / 2), at(-w / 2, h / 2)];
  g.fillStyle(dark, 1).fillPoints(body.map(p => new Phaser.Math.Vector2(p.x + outline * 0.6, p.y + outline)), true);
  g.fillStyle(f.face, 1).fillPoints(body, true);
  g.lineStyle(outline, dark, 1).strokePoints(body, true);
  const hole = at(0, -h * 0.05);
  g.fillStyle(dark, 1).fillCircle(hole.x, hole.y, size * 0.1);
  const slot = at(0, h * 0.18);
  g.lineStyle(size * 0.08, dark, 1).lineBetween(hole.x, hole.y, slot.x, slot.y);
}
