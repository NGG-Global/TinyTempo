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

/** Candy's sprinkles, the same four colours its finale and its ambience use. */
const SPRINKLE_COLOURS = [0xf47aa8, 0x8fd9c4, 0xfff1a8, 0xb38df0] as const;

/** A flat rod `length` long and `width` wide, centred on `(x, y)` and turned by `angle`. */
function rod(g: Phaser.GameObjects.Graphics, x: number, y: number, length: number, width: number, angle: number): void {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const ax = cos * length / 2, ay = sin * length / 2, bx = -sin * width / 2, by = cos * width / 2;
  g.fillTriangle(x - ax - bx, y - ay - by, x + ax - bx, y + ay - by, x + ax + bx, y + ay + by);
  g.fillTriangle(x - ax - bx, y - ay - by, x + ax + bx, y + ay + by, x - ax + bx, y - ay + by);
}

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
    case 'Space': {
      // Deck plating: a panel with a lit seam and four rivets, and a running light on some.
      const plate = shade(area.ground, 0.07);
      g.fillStyle(plate, 0.55).fillRoundedRect(x - 26 * s, y - 12 * s, 52 * s, 24 * s, 4 * s);
      g.fillStyle(shade(area.ground, 0.22), 0.4).fillRect(x - 23 * s, y - 10 * s, 46 * s, 2 * s);
      g.fillStyle(shade(area.ground, 0.3), 0.6);
      for (const [rx, ry] of [[-21, -7], [21, -7], [-21, 7], [21, 7]] as const) g.fillCircle(x + rx * s, y + ry * s, 1.6 * s);
      if (n > 0.72) g.fillStyle(0x7fd3ff, 0.85).fillCircle(x + (n - 0.86) * 60 * s, y + 2 * s, 2.2 * s);
      return;
    }
    case 'Candy': {
      // Sprinkles on the frosting, four to a patch, each lying its own way.
      for (let j = 0; j < 4; j++) {
        const angle = n * 7 + j * 1.9;
        g.fillStyle(SPRINKLE_COLOURS[(j + Math.floor(n * 4)) % 4]!, 0.9);
        rod(g, x + (j - 1.5) * 11 * s + (jitter - 0.5) * 6 * s, y + ((j * 7) % 3 - 1) * 6 * s, 10 * s, 3.2 * s, angle);
      }
      return;
    }
    case 'Haunted': {
      // A tuft of dead grass, the blades splayed from one root and none of them kinked: a
      // two-segment blade read as a stray letter at the map's scale.
      g.lineStyle(2 * s, shade(area.ground, 0.22), 0.5);
      for (let t = -2; t <= 2; t++) {
        const lean = (jitter - 0.5) * 4 * s;
        g.lineBetween(x + t * 1.5 * s, y + 5 * s, x + t * 5 * s + lean, y - (8 + (2 - Math.abs(t)) * 3 + n * 4) * s);
      }
      if (n > 0.5) g.fillStyle(shade(area.ground, 0.16), 0.6).fillEllipse(x + 16 * s, y + 3 * s, 9 * s, 5 * s, 8);
      return;
    }
    case 'Hollywood': {
      // A scrap of film in the pavement: the dark strip and its two rows of sprocket holes.
      const w = (40 + n * 14) * s;
      g.fillStyle(shade(area.ground, -0.42), 0.32).fillRect(x - w / 2, y - 7 * s, w, 14 * s);
      g.fillStyle(shade(area.ground, 0.18), 0.55);
      for (let h = x - w / 2 + 3 * s; h < x + w / 2 - 4 * s; h += 7 * s) {
        g.fillRect(h, y - 5.5 * s, 3.4 * s, 2.4 * s);
        g.fillRect(h, y + 3 * s, 3.4 * s, 2.4 * s);
      }
      return;
    }
    case 'Art Deco': {
      // A gold fan set in the jade: five rays from one point, its edge a stepped arc.
      const gold = mix(0xd8b45a, area.ground, 0.2);
      g.lineStyle(2 * s, gold, 0.5);
      for (let r = 0; r < 5; r++) {
        const a = Math.PI * (1.15 + r * 0.175);
        g.lineBetween(x, y + 6 * s, x + Math.cos(a) * 16 * s, y + 6 * s + Math.sin(a) * 16 * s);
      }
      g.fillStyle(gold, 0.45);
      for (let r = 0; r < 4; r++) {
        const a = Math.PI * (1.2 + r * 0.2);
        g.fillCircle(x + Math.cos(a) * 18 * s, y + 6 * s + Math.sin(a) * 18 * s, 1.8 * s);
      }
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
    case 'Space':
      if (variant === 0) {
        // A radar mast: a lattice tower, a dish turned to the sky and a beacon on top.
        const steel = 0x9aa3c2, dark = shade(steel, -0.35);
        g.fillStyle(dark).fillTriangle(x - 16 * k, y, x - 10 * k, y, x - 2 * k, y - 82 * k);
        g.fillStyle(dark).fillTriangle(x + 16 * k, y, x + 10 * k, y, x + 2 * k, y - 82 * k);
        g.lineStyle(1.6 * k, steel, 0.8);
        for (let c = 0; c < 4; c++) {
          const cy = y - (12 + c * 18) * k, half = (14 - c * 3) * k;
          g.lineBetween(x - half, cy, x + half, cy - 14 * k);
          g.lineBetween(x + half, cy, x - half, cy - 14 * k);
        }
        g.fillStyle(steel).fillEllipse(x + 4 * k, y - 96 * k, 58 * k, 20 * k, 14);
        g.fillStyle(shade(steel, 0.25)).fillEllipse(x + 4 * k, y - 99 * k, 46 * k, 11 * k, 12);
        g.lineStyle(2 * k, dark, 1).lineBetween(x + 4 * k, y - 99 * k, x, y - 116 * k);
        g.fillStyle(0xe86fa8).fillCircle(x, y - 118 * k, 5 * k);
        g.fillStyle(0xffffff, 0.8).fillCircle(x - 1.5 * k, y - 119.5 * k, 1.8 * k);
        return { x, y: y - 118 * k };
      }
      {
        // A rocket on its pad: hull, nose cone, two fins and a porthole.
        const hull = 0xe8edfb, trim = 0xe0703d, pad = 0x5c6488;
        g.fillStyle(pad).fillRect(x - 30 * k, y - 8 * k, 60 * k, 8 * k);
        g.fillStyle(shade(pad, 0.2)).fillRect(x - 30 * k, y - 8 * k, 60 * k, 2.5 * k);
        g.fillStyle(trim).fillTriangle(x - 12 * k, y - 30 * k, x - 12 * k, y - 8 * k, x - 28 * k, y - 8 * k);
        g.fillStyle(trim).fillTriangle(x + 12 * k, y - 30 * k, x + 12 * k, y - 8 * k, x + 28 * k, y - 8 * k);
        g.fillStyle(hull).fillRoundedRect(x - 12 * k, y - 96 * k, 24 * k, 88 * k, 6 * k);
        g.fillStyle(shade(hull, -0.16)).fillRect(x + 4 * k, y - 94 * k, 8 * k, 86 * k);
        g.fillStyle(trim).fillTriangle(x - 12 * k, y - 94 * k, x + 12 * k, y - 94 * k, x, y - 126 * k);
        g.fillStyle(0x2f3760).fillCircle(x, y - 66 * k, 7 * k);
        g.fillStyle(0x7fd3ff).fillCircle(x, y - 66 * k, 5 * k);
        g.fillStyle(0xffffff, 0.7).fillCircle(x - 1.8 * k, y - 68 * k, 1.8 * k);
        g.fillStyle(trim).fillRect(x - 12 * k, y - 30 * k, 24 * k, 5 * k);
      }
      return null;
    case 'Candy':
      if (variant === 0) {
        // A lollipop: a swirl of rings on a white stick.
        g.fillStyle(0xf7f1ea).fillRect(x - 2.5 * k, y - 72 * k, 5 * k, 72 * k);
        g.fillStyle(shade(0xf7f1ea, -0.18)).fillRect(x + 0.5 * k, y - 72 * k, 2 * k, 72 * k);
        const rings = [0xe0457b, 0xfff6fa, 0xe0457b, 0xfff6fa, 0xe0457b];
        rings.forEach((colour, i) => g.fillStyle(colour).fillCircle(x + i * 0.8 * k, y - 96 * k - i * 0.4 * k, (26 - i * 5) * k));
        g.fillStyle(0xffffff, 0.35).fillCircle(x - 10 * k, y - 106 * k, 6 * k);
        return null;
      }
      {
        // A candy cane planted in the frosting, and two gumdrops at its foot.
        const red = 0xd8364a, white = 0xfff6fa;
        for (let c = 0; c < 9; c++) {
          g.fillStyle(c % 2 ? white : red).fillRect(x + 8 * k, y - (c + 1) * 9 * k, 11 * k, 9 * k);
        }
        for (let c = 0; c <= 8; c++) {
          const a = Math.PI * (c / 8);
          g.fillStyle(c % 2 ? white : red).fillCircle(x + 13.5 * k - 13 * k + Math.cos(a) * 13 * k, y - 81 * k - Math.sin(a) * 13 * k, 5.6 * k);
        }
        for (const [gx, w, colour] of [[-24, 22, 0x8fd9c4], [-6, 18, 0xfff1a8]] as const) {
          g.fillStyle(colour).fillEllipse(x + gx * k, y - 9 * k, w * k, 22 * k, 12);
          g.fillStyle(colour).fillRect(x + (gx - w / 2) * k, y - 9 * k, w * k, 9 * k);
          g.fillStyle(0xffffff, 0.45).fillCircle(x + (gx - w / 5) * k, y - 14 * k, 2.4 * k);
        }
      }
      return null;
    case 'Haunted':
      if (variant === 0) {
        // Two gravestones: a rounded headstone, leaning, and a stone cross behind it.
        const stone = 0x8d8a99, dark = shade(stone, -0.25);
        g.fillStyle(dark).fillRect(x + 10 * k, y - 70 * k, 8 * k, 70 * k);
        g.fillStyle(dark).fillRect(x + 1 * k, y - 56 * k, 26 * k, 8 * k);
        quad(x - 30 * k, y, x + 4 * k, y, x + 6 * k, y - 46 * k, x - 26 * k, y - 50 * k);
        g.fillStyle(stone).fillCircle(x - 10 * k, y - 48 * k, 16 * k);
        g.fillStyle(stone);
        quad(x - 26 * k, y, x + 4 * k, y, x + 6 * k, y - 46 * k, x - 26 * k, y - 50 * k);
        g.fillStyle(shade(stone, 0.18), 0.6).fillRect(x - 20 * k, y - 40 * k, 6 * k, 36 * k);
        g.fillStyle(0x6c8a5a, 0.7).fillEllipse(x - 12 * k, y - 2 * k, 40 * k, 8 * k, 10);
        return null;
      }
      {
        // A jack-o'-lantern hung from a crooked post, its face lit: where the glow breathes.
        const wood = 0x4a3b3f, orange = 0xe0702a;
        g.fillStyle(0xf2a03a, 0.16).fillEllipse(x, y + 2 * k, 76 * k, 20 * k, 10);
        g.fillStyle(wood);
        quad(x - 26 * k, y, x - 18 * k, y, x - 20 * k, y - 104 * k, x - 26 * k, y - 100 * k);
        quad(x - 24 * k, y - 104 * k, x - 20 * k, y - 98 * k, x + 4 * k, y - 104 * k, x + 2 * k, y - 110 * k);
        g.lineStyle(1.6 * k, wood, 1).lineBetween(x, y - 104 * k, x, y - 86 * k);
        g.fillStyle(shade(orange, -0.2)).fillEllipse(x - 8 * k, y - 70 * k, 18 * k, 28 * k, 12);
        g.fillStyle(shade(orange, -0.2)).fillEllipse(x + 8 * k, y - 70 * k, 18 * k, 28 * k, 12);
        g.fillStyle(orange).fillEllipse(x, y - 70 * k, 22 * k, 30 * k, 12);
        g.fillStyle(0x4d6b35).fillRect(x - 2 * k, y - 89 * k, 4 * k, 6 * k);
        g.fillStyle(0xffd76a);
        g.fillTriangle(x - 9 * k, y - 76 * k, x - 3 * k, y - 76 * k, x - 6 * k, y - 82 * k);
        g.fillTriangle(x + 3 * k, y - 76 * k, x + 9 * k, y - 76 * k, x + 6 * k, y - 82 * k);
        g.fillTriangle(x - 10 * k, y - 66 * k, x + 10 * k, y - 66 * k, x, y - 60 * k);
      }
      return { x, y: y - 70 * k };
    case 'Hollywood':
      if (variant === 0) {
        // A palm tree, leaning a little toward the light, its fronds splayed.
        const bark = 0x8a6440, frond = 0x4f8a4a;
        for (let c = 0; c < 10; c++) {
          const cx = x + c * c * 0.1 * k, cy = y - c * 10.4 * k;
          g.fillStyle(c % 2 ? bark : shade(bark, -0.14)).fillRoundedRect(cx - 5 * k, cy - 11 * k, 10 * k, 12 * k, 3 * k);
        }
        const crown = { x: x + 8 * k, y: y - 106 * k };
        // Eight fronds, the outer ones drooping past the crown, each a broad leaf: six thin
        // ones left the crown reading as a twig on a tall trunk.
        for (const [a, reach, droop] of [[-3.05, 30, 20], [-2.6, 30, 6], [-2.1, 26, -2], [-1.6, 20, -4], [-1.1, 24, -2], [-0.6, 30, 4], [-0.1, 31, 16], [0.35, 26, 24]] as const) {
          const tipX = crown.x + Math.cos(a) * reach * k, tipY = crown.y + Math.sin(a) * 16 * k + droop * k;
          const midX = (crown.x + tipX) / 2, midY = (crown.y + tipY) / 2 - 6 * k;
          g.fillStyle(a < -1.35 ? shade(frond, 0.12) : frond);
          g.fillTriangle(crown.x, crown.y, midX, midY - 6 * k, tipX, tipY);
          g.fillTriangle(crown.x, crown.y, midX, midY + 5 * k, tipX, tipY);
        }
        g.fillStyle(0x6b4a2c).fillCircle(crown.x - 3 * k, crown.y + 4 * k, 3.4 * k);
        g.fillStyle(0x6b4a2c).fillCircle(crown.x + 3 * k, crown.y + 5 * k, 3.4 * k);
        return null;
      }
      {
        // A film camera on its tripod, two reels on top.
        const body = 0x2e2a2c, metal = 0x8c8a90;
        g.lineStyle(3 * k, body, 1);
        g.lineBetween(x - 2 * k, y - 52 * k, x - 26 * k, y);
        g.lineBetween(x - 2 * k, y - 52 * k, x + 22 * k, y);
        g.lineBetween(x - 2 * k, y - 52 * k, x + 2 * k, y);
        g.fillStyle(body).fillRoundedRect(x - 20 * k, y - 76 * k, 34 * k, 26 * k, 4 * k);
        g.fillStyle(shade(body, 0.25)).fillRect(x - 18 * k, y - 74 * k, 30 * k, 4 * k);
        g.fillStyle(metal).fillRect(x + 14 * k, y - 70 * k, 14 * k, 12 * k);
        g.fillStyle(shade(metal, -0.3)).fillCircle(x + 28 * k, y - 64 * k, 7 * k);
        g.fillStyle(0x9fd0e6, 0.8).fillCircle(x + 28 * k, y - 64 * k, 4 * k);
        for (const [rx, r] of [[-11, 14], [9, 12]] as const) {
          const cy = y - 76 * k - r * k;
          g.fillStyle(body).fillCircle(x + rx * k, cy, r * k);
          g.fillStyle(metal).fillCircle(x + rx * k, cy, r * 0.32 * k);
          for (let h = 0; h < 4; h++) {
            const a = h * Math.PI / 2 + 0.4;
            g.fillStyle(shade(body, 0.35)).fillCircle(x + rx * k + Math.cos(a) * r * 0.62 * k, cy + Math.sin(a) * r * 0.62 * k, r * 0.18 * k);
          }
        }
      }
      return null;
    case 'Art Deco':
      if (variant === 0) {
        // A sunburst on a fluted column: alternate gold and black rays, stepped at the foot.
        const gold = 0xd8b45a, black = 0x10261f, cream = 0xf8f3e6;
        g.fillStyle(black).fillRect(x - 22 * k, y - 8 * k, 44 * k, 8 * k);
        g.fillStyle(black).fillRect(x - 16 * k, y - 16 * k, 32 * k, 8 * k);
        g.fillStyle(cream).fillRect(x - 9 * k, y - 78 * k, 18 * k, 62 * k);
        g.fillStyle(shade(cream, -0.15));
        for (const fx of [-5, 0, 5]) g.fillRect(x + (fx - 0.8) * k, y - 76 * k, 1.6 * k, 58 * k);
        const cx = x, cy = y - 80 * k, r = 36 * k;
        for (let ray = 0; ray < 9; ray++) {
          const a0 = Math.PI + ray * Math.PI / 9, a1 = Math.PI + (ray + 1) * Math.PI / 9;
          g.fillStyle(ray % 2 ? black : gold).fillTriangle(cx, cy, cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
        }
        g.fillStyle(gold).fillCircle(cx, cy, 8 * k);
        g.fillStyle(gold).fillRect(x - 38 * k, y - 82 * k, 76 * k, 4 * k);
        return null;
      }
      {
        // A streamlined lamp: a stepped base, a slim pole with three rings, a frosted globe.
        const black = 0x10261f, gold = 0xd8b45a;
        g.fillStyle(0xf6e6bc, 0.16).fillEllipse(x, y + 2 * k, 70 * k, 18 * k, 10);
        g.fillStyle(black).fillRect(x - 14 * k, y - 8 * k, 28 * k, 8 * k);
        g.fillStyle(black).fillRect(x - 9 * k, y - 16 * k, 18 * k, 8 * k);
        g.fillStyle(black).fillRect(x - 3 * k, y - 100 * k, 6 * k, 84 * k);
        for (const ry of [-40, -64, -88]) g.fillStyle(gold).fillRect(x - 7 * k, y + ry * k, 14 * k, 4 * k);
        g.fillStyle(gold).fillRect(x - 10 * k, y - 102 * k, 20 * k, 4 * k);
        g.fillStyle(0xfff4d6).fillCircle(x, y - 114 * k, 12 * k);
        g.fillStyle(0xffffff, 0.7).fillCircle(x - 4 * k, y - 118 * k, 4 * k);
        g.fillStyle(gold).fillRect(x - 2 * k, y - 130 * k, 4 * k, 5 * k);
      }
      return { x, y: y - 114 * k };
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
