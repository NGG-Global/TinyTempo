import type Phaser from 'phaser';

import type { Area } from '@/game/levels';
import { mix, shade } from '@/ui/colour';
import { castShadow } from '@/ui/light';

/**
 * What stands on the map's ground in each area: a quiet repeating motif in the terrain, and
 * two silhouettes beside the road, so a band has variety without a sprite sheet.
 *
 * Keyed by the area's base name (`AREAS` in `game/levels.ts`), as the finale treatments are,
 * so Grass II dresses like Grass and a new area is a new case here rather than a renumbering.
 * An area without a case falls back to Grass's, which is a road that looks plain, never one
 * that throws.
 *
 * Both draw into one of the map's strip layers, which are rasterised once
 * (`ui/bakedLayer.ts`): nothing here is drawn per frame, so a detailed prop costs the bake,
 * not the frame rate. Limits the map relies on:
 * - a motif reaches no more than `MAP.overhang.motif` above its row, since strips claim it by
 *   its top;
 * - a prop stands inside x ± 40k and no taller than 132k (the box `drawScenery` keeps off a
 *   finale's stage and the crest), with its foot at `y`.
 */

/** A lit point on a prop, a lamp's glass or a torch's flame, where the ambience breathes a glow. */
export interface PropLight { readonly x: number; readonly y: number }

/**
 * One cell of an area's terrain motif, centred on `(x, y)`. `n` and `jitter` are the map's
 * stable per-cell and per-row noise, `row` the row's index in its band.
 */
export function drawGroundMotif(g: Phaser.GameObjects.Graphics, area: Area, x: number, y: number, s: number, n: number, jitter: number, row: number): void {
  const ink = shade(area.ground, -0.14);
  const pale = shade(area.ground, 0.16);
  switch (area.name) {
    case 'Pavement': {
      // Staggered slabs, courses offset by row, so it reads as laid paving.
      const off = (row % 2 ? 26 : -8) * s;
      g.fillStyle(shade(area.ground, -0.07), 0.5).fillRoundedRect(x - 36 * s + off, y - 17 * s, 70 * s, 33 * s, 4 * s);
      g.fillStyle(pale, 0.28).fillRect(x - 33 * s + off, y - 14 * s, 64 * s, 3 * s);
      return;
    }
    case 'Sand':
      g.lineStyle(2.4 * s, ink, 0.32);
      g.beginPath();
      for (let a = 0; a <= 8; a++) g[a === 0 ? 'moveTo' : 'lineTo'](x - 36 * s + a * 9 * s, y + Math.sin(a * 0.8 + jitter * 6) * 5 * s);
      g.strokePath();
      return;
    case 'Snow':
      g.fillStyle(pale, 0.7).fillEllipse(x, y, (56 + n * 30) * s, 17 * s, 10);
      return;
    case 'Dusk':
      g.fillStyle(shade(area.ground, -0.22), 0.55).fillEllipse(x, y, (18 + n * 12) * s, (11 + n * 5) * s, 8);
      g.fillStyle(pale, 0.35).fillEllipse(x - 3 * s, y - 3 * s, 8 * s, 5 * s, 6);
      return;
    case 'Garden': {
      // Three small blooms in the lawn, no two the same colour.
      const blooms = [0xf4a3b4, 0xfff4dc, 0xf2c14e];
      for (let j = 0; j < 3; j++) {
        const fx = x + (j - 1) * 13 * s + (n - 0.5) * 6 * s, fy = y + (j === 1 ? -7 : 3) * s;
        g.fillStyle(shade(area.ground, -0.16), 0.55).fillEllipse(fx, fy + 4 * s, 9 * s, 4 * s, 6);
        g.fillStyle(blooms[(j + Math.floor(n * 3)) % 3]!, 0.9).fillCircle(fx, fy, 4.4 * s);
        g.fillStyle(0xd98a2b, 0.9).fillCircle(fx, fy, 1.6 * s);
      }
      return;
    }
    case 'Swamp': {
      // Standing water with a glint, a lily pad on some.
      const water = mix(area.ground, 0x2e4a44, 0.55);
      const w = (44 + n * 28) * s;
      g.fillStyle(water, 0.6).fillEllipse(x, y, w, 15 * s, 12);
      g.lineStyle(2 * s, shade(area.ground, 0.22), 0.45).lineBetween(x - w * 0.28, y - 3 * s, x + w * 0.05, y - 3 * s);
      if (n > 0.55) {
        const px = x + w * 0.18;
        g.fillStyle(0x6c9a4c, 0.95).fillEllipse(px, y + 1 * s, 13 * s, 7 * s, 10);
        g.fillStyle(water, 0.95).fillTriangle(px, y + 1 * s, px + 7 * s, y - 2 * s, px + 7 * s, y + 3 * s);
      }
      return;
    }
    case 'Village': {
      // Fallen leaves, three to a patch, each lying its own way.
      const leaves = [0xc8553d, 0xe0913a, 0xa8642c];
      for (let j = 0; j < 3; j++) {
        const lx = x + (j - 1) * 14 * s + (jitter - 0.5) * 8 * s, ly = y + (((j * 5) % 3) - 1) * 5 * s;
        const a = n * 6 + j * 2.1;
        const cos = Math.cos(a), sin = Math.sin(a), length = 7 * s, width = 3.4 * s;
        g.fillStyle(leaves[j]!, 0.8);
        g.fillTriangle(lx - cos * length, ly - sin * length, lx - sin * width, ly + cos * width, lx + cos * length, ly + sin * length);
        g.fillTriangle(lx - cos * length, ly - sin * length, lx + sin * width, ly - cos * width, lx + cos * length, ly + sin * length);
      }
      return;
    }
    case 'Castle': {
      // Worn flagstones set unevenly, no two the same size, each with a lit top edge. A
      // regular cluster read as dice; turning the set by the cell's noise breaks the grid.
      const stones = [[-12, -2, 16, 10], [3, -7, 12, 8], [14, 2, 11, 7], [-1, 6, 14, 8]] as const;
      const turn = n * Math.PI * 2, cos = Math.cos(turn), sin = Math.sin(turn);
      stones.forEach(([sx, sy, w, h], j) => {
        if (j === 3 && n < 0.4) return;
        const cx = x + (sx * cos - sy * sin * 0.6) * s, cy = y + (sx * sin * 0.4 + sy * cos) * s;
        const size = 0.85 + ((j * 7 + Math.floor(n * 10)) % 4) * 0.08;
        g.fillStyle(shade(area.ground, j % 2 ? -0.13 : -0.07), 0.55).fillRoundedRect(cx - w * size * s / 2, cy - h * size * s / 2, w * size * s, h * size * s, 3 * s);
        g.fillStyle(shade(area.ground, 0.2), 0.35).fillRect(cx - (w * size / 2 - 2) * s, cy - (h * size / 2 - 1) * s, (w * size - 4) * s, 1.6 * s);
      });
      return;
    }
    default:
      // Grass: a tuft.
      g.lineStyle(2.5 * s, ink, 0.5);
      for (let t = -1; t <= 1; t++) g.lineBetween(x + t * 7 * s, y + 6 * s, x + t * 10 * s, y - (10 + n * 8) * s);
  }
}

/**
 * One of the area's two silhouettes, standing on `(x, y)` at scale `k`, with its cast shadow.
 * Returns where its light is, if it has one.
 */
export function drawProp(g: Phaser.GameObjects.Graphics, area: Area, variant: number, x: number, y: number, k: number): PropLight | null {
  const ink = shade(area.ink, 0.06);
  const quad = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): void => {
    g.fillTriangle(ax, ay, bx, by, cx, cy);
    g.fillTriangle(ax, ay, cx, cy, dx, dy);
  };
  const shadow = castShadow(6);
  g.fillStyle(0x1a1410, shadow.alpha).fillEllipse(x + shadow.dx * k, y + shadow.dy * k, (variant ? 62 : 74) * k, 19 * k, 10);
  switch (area.name) {
    case 'Pavement':
      if (variant === 0) {
        // Street lamp: the only tall vertical in a flat band, so it sells the light direction.
        g.fillStyle(ink).fillRect(x - 4 * k, y - 106 * k, 8 * k, 106 * k);
        g.fillStyle(ink).fillEllipse(x, y, 24 * k, 8 * k, 8);
        g.fillStyle(0xf6e6bc, 0.18).fillTriangle(x, y - 96 * k, x - 40 * k, y + 4 * k, x + 40 * k, y + 4 * k);
        g.fillStyle(ink);
        quad(x - 5 * k, y - 128 * k, x + 5 * k, y - 128 * k, x + 19 * k, y - 104 * k, x - 19 * k, y - 104 * k);
        g.fillStyle(0xf6e6bc, 0.95).fillRoundedRect(x - 14 * k, y - 106 * k, 28 * k, 7 * k, 3 * k);
        return { x, y: y - 103 * k };
      }
      // Bollard and litter bin: low street furniture at kerb height.
      g.fillStyle(ink).fillRoundedRect(x - 26 * k, y - 46 * k, 20 * k, 48 * k, 6 * k);
      g.fillStyle(shade(ink, 0.3), 0.5).fillRect(x - 22 * k, y - 40 * k, 4 * k, 36 * k);
      g.fillStyle(shade(area.ground, -0.32)).fillRoundedRect(x + 2 * k, y - 34 * k, 30 * k, 36 * k, 5 * k);
      g.fillStyle(ink, 0.8).fillRoundedRect(x, y - 38 * k, 34 * k, 7 * k, 3 * k);
      return null;
    case 'Sand':
      if (variant === 0) {
        // Cactus.
        const green = 0x6f8f5a;
        g.fillStyle(green).fillRoundedRect(x - 11 * k, y - 96 * k, 22 * k, 96 * k, 11 * k);
        g.fillStyle(green).fillRoundedRect(x + 6 * k, y - 74 * k, 26 * k, 15 * k, 7 * k);
        g.fillStyle(green).fillRoundedRect(x + 19 * k, y - 96 * k, 14 * k, 30 * k, 7 * k);
        g.fillStyle(shade(green, 0.22), 0.7).fillRoundedRect(x - 7 * k, y - 90 * k, 5 * k, 78 * k, 3 * k);
        return null;
      }
      {
        // Rock cluster with a dry shrub.
        const rock = shade(area.ground, -0.3);
        g.fillStyle(rock).fillEllipse(x - 12 * k, y - 14 * k, 46 * k, 32 * k, 10);
        g.fillStyle(shade(rock, 0.14)).fillEllipse(x + 14 * k, y - 10 * k, 32 * k, 22 * k, 10);
        g.fillStyle(shade(rock, 0.26), 0.6).fillEllipse(x - 18 * k, y - 22 * k, 20 * k, 11 * k, 8);
        g.lineStyle(2.4 * k, shade(0x8a7a4a, -0.1), 0.8);
        for (let t = -1; t <= 1; t++) g.lineBetween(x + 20 * k, y - 18 * k, x + (20 + t * 14) * k, y - (42 + Math.abs(t) * -8) * k);
      }
      return null;
    case 'Snow':
      if (variant === 0) {
        // Snow-capped fir.
        g.fillStyle(shade(0x3f5a4a, -0.1)).fillRect(x - 5 * k, y - 22 * k, 10 * k, 24 * k);
        for (let t = 0; t < 3; t++) {
          const w = (54 - t * 13) * k;
          const cy = y - (22 + t * 28) * k;
          g.fillStyle(mix(0x3f5a4a, area.sky, 0.1 + t * 0.12)).fillTriangle(x - w / 2, cy, x + w / 2, cy, x, cy - 40 * k);
          g.fillStyle(0xffffff, 0.8).fillTriangle(x - w / 3.4, cy - 22 * k, x + w / 3.4, cy - 22 * k, x, cy - 40 * k);
        }
        return null;
      }
      // Drift banked against a marker post: the pole gives the drift its scale.
      g.fillStyle(shade(area.ink, 0.1)).fillRect(x + 12 * k, y - 76 * k, 6 * k, 78 * k);
      g.fillStyle(0xd2604a).fillRect(x + 12 * k, y - 76 * k, 6 * k, 18 * k);
      g.fillStyle(0xffffff, 0.92).fillEllipse(x - 4 * k, y - 8 * k, 84 * k, 40 * k, 12);
      g.fillStyle(mix(0xffffff, area.sky, 0.5), 0.9).fillEllipse(x + 6 * k, y + 2 * k, 62 * k, 24 * k, 10);
      return null;
    case 'Dusk':
      if (variant === 0) {
        // Dusk lantern: a warm pool is the one warm note in a cool band.
        g.fillStyle(ink).fillRect(x - 3 * k, y - 88 * k, 6 * k, 88 * k);
        g.fillStyle(0xe8b878, 0.22).fillCircle(x, y - 94 * k, 40 * k);
        g.fillStyle(0xf0c98a).fillRoundedRect(x - 12 * k, y - 110 * k, 24 * k, 30 * k, 9 * k);
        g.fillStyle(ink).fillRoundedRect(x - 15 * k, y - 116 * k, 30 * k, 8 * k, 4 * k);
        g.fillStyle(0xe8b878, 0.16).fillEllipse(x, y + 2 * k, 96 * k, 26 * k, 10);
        return null;
      }
      {
        // Standing stone, catching the last of the light on one face.
        const stone = shade(area.ground, 0.12);
        g.fillStyle(stone);
        quad(x - 20 * k, y, x + 22 * k, y, x + 14 * k, y - 86 * k, x - 12 * k, y - 94 * k);
        g.fillStyle(shade(stone, 0.2), 0.55);
        quad(x - 20 * k, y, x - 4 * k, y, x - 2 * k, y - 90 * k, x - 12 * k, y - 94 * k);
        g.fillStyle(shade(area.ink, 0.05), 0.35).fillEllipse(x + 2 * k, y - 2 * k, 52 * k, 14 * k, 8);
      }
      return null;
    case 'Garden':
      if (variant === 0) {
        // A rose bush in flower.
        const leaf = 0x4f8a3c;
        g.fillStyle(shade(leaf, -0.2)).fillEllipse(x, y - 6 * k, 60 * k, 18 * k, 10);
        g.fillStyle(leaf).fillCircle(x - 15 * k, y - 24 * k, 19 * k);
        g.fillStyle(leaf).fillCircle(x + 15 * k, y - 22 * k, 17 * k);
        g.fillStyle(mix(leaf, area.sky, 0.1)).fillCircle(x, y - 38 * k, 21 * k);
        g.fillStyle(0xffffff, 0.14).fillCircle(x - 7 * k, y - 48 * k, 8 * k);
        for (const [bx, by] of [[-20, -30], [-5, -48], [11, -38], [21, -22], [-1, -24]] as const) {
          g.fillStyle(0xd9506e).fillCircle(x + bx * k, y + by * k, 5.5 * k);
          g.fillStyle(0xf7b2c1, 0.9).fillCircle(x + (bx - 1.5) * k, y + (by - 1.5) * k, 2.2 * k);
        }
        return null;
      }
      {
        // Two sunflowers, one a head taller than the other.
        const stem = 0x4d7a33;
        const leaf = mix(stem, 0x7fae5a, 0.4);
        const flower = (fx: number, height: number): void => {
          const top = y - height * k;
          g.fillStyle(stem).fillRect(fx - 2.5 * k, top, 5 * k, height * k);
          g.fillStyle(leaf).fillTriangle(fx, y - height * 0.45 * k, fx - 18 * k, y - height * 0.58 * k, fx - 3 * k, y - height * 0.32 * k);
          g.fillStyle(leaf).fillTriangle(fx, y - height * 0.3 * k, fx + 16 * k, y - height * 0.4 * k, fx + 3 * k, y - height * 0.18 * k);
          g.fillStyle(0xe9a72f);
          for (let p = 0; p < 10; p++) {
            const a = p / 10 * Math.PI * 2;
            g.fillCircle(fx + Math.cos(a) * 10 * k, top + Math.sin(a) * 10 * k, 5.2 * k);
          }
          g.fillStyle(0xf6cf4a);
          for (let p = 0; p < 10; p++) {
            const a = (p + 0.5) / 10 * Math.PI * 2;
            g.fillCircle(fx + Math.cos(a) * 8.5 * k, top + Math.sin(a) * 8.5 * k, 4.4 * k);
          }
          g.fillStyle(0x6b4423).fillCircle(fx, top, 7.5 * k);
          g.fillStyle(0x8a5a2e, 0.8).fillCircle(fx - 2 * k, top - 2 * k, 3 * k);
        };
        flower(x - 8 * k, 100);
        flower(x + 14 * k, 72);
      }
      return null;
    case 'Swamp':
      if (variant === 0) {
        // Bulrushes: blades, stalks, and the brown heads on three of them.
        const reed = 0x5d6b3a;
        g.fillStyle(shade(reed, -0.1));
        g.fillTriangle(x - 18 * k, y, x - 12 * k, y, x - 26 * k, y - 58 * k);
        g.fillTriangle(x + 14 * k, y, x + 20 * k, y, x + 30 * k, y - 50 * k);
        for (const [dx, height, head] of [[-10, 96, true], [0, 112, true], [10, 88, true], [-3, 70, false]] as const) {
          const sx = x + dx * k;
          g.fillStyle(reed).fillRect(sx - 1.5 * k, y - height * k, 3 * k, height * k);
          if (!head) continue;
          g.fillStyle(0x6b4128).fillRoundedRect(sx - 4.5 * k, y - (height - 6) * k, 9 * k, 22 * k, 4.5 * k);
          g.fillStyle(0x8f5d3a, 0.8).fillRect(sx - 2.5 * k, y - (height - 9) * k, 2 * k, 15 * k);
        }
        return null;
      }
      {
        // A crooked bare tree hung with moss.
        const bark = shade(area.ground, -0.45);
        g.fillStyle(bark);
        quad(x - 9 * k, y, x + 9 * k, y, x + 5 * k, y - 70 * k, x - 3 * k, y - 74 * k);
        g.fillTriangle(x - 9 * k, y, x - 18 * k, y + 1 * k, x - 6 * k, y - 10 * k);
        g.fillTriangle(x + 9 * k, y, x + 17 * k, y + 1 * k, x + 6 * k, y - 9 * k);
        quad(x - 1 * k, y - 66 * k, x + 4 * k, y - 70 * k, x + 30 * k, y - 98 * k, x + 26 * k, y - 102 * k);
        quad(x - 2 * k, y - 58 * k, x + 1 * k, y - 54 * k, x - 28 * k, y - 84 * k, x - 31 * k, y - 80 * k);
        quad(x + 1 * k, y - 72 * k, x + 4 * k, y - 72 * k, x + 6 * k, y - 112 * k, x + 2 * k, y - 112 * k);
        g.lineStyle(2.4 * k, 0x9aa86a, 0.8);
        for (const [mx, my, length] of [[20, -92, 22], [26, -99, 14], [-22, -78, 26], [-28, -82, 16], [4, -100, 18], [-12, -68, 12]] as const) {
          g.lineBetween(x + mx * k, y + my * k, x + (mx + 1) * k, y + (my + length) * k);
        }
      }
      return null;
    case 'Village':
      if (variant === 0) {
        // A cottage, its windows lit.
        const wall = 0xf0e3c8, roof = 0xb5523b, timber = 0x6b4a32;
        const w = 54 * k, h = 38 * k, left = x - w / 2, top = y - h;
        g.fillStyle(shade(roof, -0.3)).fillRect(x + 12 * k, top - 34 * k, 9 * k, 22 * k);
        g.fillStyle(wall).fillRect(left, top, w, h);
        g.fillStyle(shade(wall, -0.12)).fillRect(left + w * 0.66, top, w * 0.34, h);
        g.fillStyle(roof).fillTriangle(left - 7 * k, top + 2 * k, left + w + 7 * k, top + 2 * k, x, top - 36 * k);
        g.fillStyle(shade(roof, 0.2), 0.55).fillTriangle(left - 7 * k, top + 2 * k, x - 6 * k, top + 2 * k, x, top - 36 * k);
        g.fillStyle(timber).fillRoundedRect(x - 6 * k, y - 22 * k, 12 * k, 22 * k, { tl: 5 * k, tr: 5 * k, bl: 0, br: 0 });
        for (const wx of [left + 6 * k, left + w - 17 * k]) {
          g.fillStyle(0xf6d98a).fillRect(wx, top + 10 * k, 11 * k, 10 * k);
          g.lineStyle(1.6 * k, timber, 1).strokeRect(wx, top + 10 * k, 11 * k, 10 * k);
          g.lineBetween(wx + 5.5 * k, top + 10 * k, wx + 5.5 * k, top + 20 * k);
        }
        return null;
      }
      {
        // The village well: a stone ring under a little roof, its bucket on the rope.
        const stone = 0x9a948c, timber = 0x6b4a32, roof = 0xb5523b;
        g.fillStyle(timber).fillRect(x - 20 * k, y - 70 * k, 5 * k, 54 * k);
        g.fillStyle(timber).fillRect(x + 15 * k, y - 70 * k, 5 * k, 54 * k);
        g.fillStyle(roof).fillTriangle(x - 30 * k, y - 64 * k, x + 30 * k, y - 64 * k, x, y - 88 * k);
        g.fillStyle(shade(roof, 0.2), 0.55).fillTriangle(x - 30 * k, y - 64 * k, x - 4 * k, y - 64 * k, x, y - 88 * k);
        g.fillStyle(shade(timber, -0.2)).fillRect(x - 18 * k, y - 58 * k, 36 * k, 3.5 * k);
        g.lineStyle(1.6 * k, 0xcfc0a0, 1).lineBetween(x, y - 56 * k, x, y - 40 * k);
        g.fillStyle(timber).fillRect(x - 5 * k, y - 40 * k, 10 * k, 8 * k);
        g.fillStyle(stone).fillRect(x - 25 * k, y - 20 * k, 50 * k, 20 * k);
        g.fillStyle(stone).fillEllipse(x, y, 50 * k, 12 * k, 12);
        g.fillStyle(shade(stone, 0.12)).fillEllipse(x, y - 20 * k, 50 * k, 14 * k, 12);
        g.fillStyle(shade(stone, -0.45)).fillEllipse(x, y - 20 * k, 40 * k, 9 * k, 12);
        g.lineStyle(1.4 * k, shade(stone, -0.25), 0.7);
        g.lineBetween(x - 25 * k, y - 10 * k, x + 25 * k, y - 10 * k);
        for (const sx of [-14, 2, 16]) g.lineBetween(x + sx * k, y - 20 * k, x + sx * k, y - 10 * k);
        for (const sx of [-6, 9]) g.lineBetween(x + sx * k, y - 10 * k, x + sx * k, y + 4 * k);
      }
      return null;
    case 'Castle':
      if (variant === 0) {
        // A tower: battlements, an arrow slit, a door and a pennant on its pole.
        const stone = 0xa9aeb8, dark = shade(stone, -0.22);
        const w = 40 * k, h = 84 * k, left = x - w / 2, top = y - h;
        g.fillStyle(stone).fillRect(left, top, w, h);
        g.fillStyle(dark, 0.55).fillRect(left + w * 0.66, top, w * 0.34, h);
        g.fillStyle(stone).fillRect(left - 3 * k, top - 2 * k, w + 6 * k, 7 * k);
        for (const mx of [left - 3 * k, x - 5 * k, left + w - 7 * k]) g.fillStyle(stone).fillRect(mx, top - 12 * k, 10 * k, 11 * k);
        g.lineStyle(1.4 * k, dark, 0.5);
        for (let c = 1; c < 6; c++) {
          const cy = top + c * 14 * k;
          g.lineBetween(left, cy, left + w, cy);
          const stagger = c % 2 ? 0.3 : 0.6;
          g.lineBetween(left + w * stagger, cy - 14 * k, left + w * stagger, cy);
        }
        g.fillStyle(0x2a2f3a).fillRoundedRect(x - 2.5 * k, top + 18 * k, 5 * k, 14 * k, 2.5 * k);
        g.fillStyle(0x3b2f28).fillRoundedRect(x - 8 * k, y - 20 * k, 16 * k, 20 * k, { tl: 8 * k, tr: 8 * k, bl: 0, br: 0 });
        g.fillStyle(shade(area.ink, 0.2)).fillRect(x - 1.2 * k, top - 42 * k, 2.4 * k, 30 * k);
        g.fillStyle(0xb8323a).fillTriangle(x + 1.2 * k, top - 42 * k, x + 1.2 * k, top - 30 * k, x + 21 * k, top - 36 * k);
        return null;
      }
      // A torch on a stone pillar, burning: where the ambience lights a glow.
      {
        const stone = 0xa9aeb8;
        g.fillStyle(0xf2b35a, 0.14).fillEllipse(x, y + 2 * k, 80 * k, 22 * k, 10);
        g.fillStyle(shade(stone, -0.1)).fillRect(x - 7 * k, y - 58 * k, 14 * k, 58 * k);
        g.fillStyle(shade(stone, -0.3), 0.6).fillRect(x + 2 * k, y - 58 * k, 5 * k, 58 * k);
        g.fillStyle(stone).fillRect(x - 10 * k, y - 5 * k, 20 * k, 6 * k);
        g.fillStyle(0x3b3f48).fillEllipse(x, y - 60 * k, 26 * k, 9 * k, 10);
        g.fillStyle(0x3b3f48).fillTriangle(x - 13 * k, y - 61 * k, x + 13 * k, y - 61 * k, x, y - 52 * k);
        g.fillStyle(0xe0703d, 0.95).fillTriangle(x - 10 * k, y - 63 * k, x + 10 * k, y - 63 * k, x + 1 * k, y - 94 * k);
        g.fillStyle(0xe0703d, 0.95).fillCircle(x, y - 67 * k, 9 * k);
        g.fillStyle(0xf6cf4a).fillTriangle(x - 5 * k, y - 64 * k, x + 5 * k, y - 64 * k, x - 1 * k, y - 83 * k);
        g.fillStyle(0xf6cf4a).fillCircle(x, y - 67 * k, 5 * k);
      }
      return { x, y: y - 72 * k };
    default:
      if (variant === 0) {
        // Pine: stacked canopy, each tier hazed a little further toward the sky.
        g.fillStyle(shade(0x4a6b3a, -0.15)).fillRect(x - 5 * k, y - 26 * k, 10 * k, 28 * k);
        for (let t = 0; t < 3; t++) {
          const w = (52 - t * 12) * k;
          const cy = y - (26 + t * 30) * k;
          g.fillStyle(mix(0x4a6b3a, area.sky, t * 0.14)).fillTriangle(x - w / 2, cy, x + w / 2, cy, x, cy - 42 * k);
        }
        g.fillStyle(0xffffff, 0.16).fillTriangle(x - 22 * k, y - 26 * k, x - 4 * k, y - 26 * k, x - 13 * k, y - 62 * k);
        return null;
      }
      // Round bush, to break up a run of conifers.
      g.fillStyle(shade(0x4a6b3a, -0.2)).fillRect(x - 4 * k, y - 16 * k, 8 * k, 18 * k);
      g.fillStyle(0x5b7d45).fillCircle(x - 14 * k, y - 28 * k, 19 * k);
      g.fillStyle(0x5b7d45).fillCircle(x + 13 * k, y - 24 * k, 16 * k);
      g.fillStyle(mix(0x5b7d45, area.sky, 0.1)).fillCircle(x - 1 * k, y - 42 * k, 22 * k);
      g.fillStyle(0xffffff, 0.14).fillCircle(x - 8 * k, y - 50 * k, 9 * k);
      return null;
  }
}
