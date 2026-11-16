import Phaser from 'phaser';
import { PALETTE, SHELL } from '../config/theme';
import { PRODUCT, type ProductId } from '../monetization/types';
import { mix, shade } from './colour';
import { drawHeart, drawInfinity, drawRestart } from './icons';
import { faces } from './light';
import { BRASS } from './panel';

/**
 * The Play Console icons for the in-app products (`docs/PLAY_PRODUCTS.md`), drawn by the
 * game's own hand so the store's listing looks like the thing it sells. Nothing in the
 * game draws these; `scripts/product-icons.mjs` rasterises each through the canvas
 * renderer, as the achievement icons are, and writes the PNGs the Console takes.
 *
 * Google's rules shape them: a 1:1 PNG between 512 and 1080 px a side, and the same icon
 * for every language, so there are no words, no prices and no branding. What tells the
 * products apart is the thing itself. The refill is the five hearts, full. Each replay
 * timer is the stopwatch the game's own sheet uses, with its span on the dial: a half-dial
 * sweep for thirty minutes, a full one for an hour, a second lap inside the first for two
 * hours, and a dial turned to day and night for a day — each in a colour of its own, so a
 * shelf of four reads as four spans and not as four copies.
 */
type G = Phaser.GameObjects.Graphics;

/** Every product that has an icon, so a test can hold the drawers to the catalogue. */
export function productArtIds(): readonly ProductId[] {
  return Object.keys(DRAWERS) as ProductId[];
}

/** Draw one product's icon into a `size`-square at the Graphics' origin. */
export function drawProductIcon(g: G, product: ProductId, size: number): void {
  const draw = DRAWERS[product];
  if (!draw) throw new Error(`No icon for ${product}`);
  draw(g, size);
}

/** The canvas renderer's entry point on a Graphics, which Phaser's typings leave out. */
interface CanvasDrawn {
  renderCanvas(renderer: unknown, src: G, camera: Phaser.Cameras.Scene2D.BaseCamera, parentMatrix: null, ctx: CanvasRenderingContext2D, allowClip: boolean): void;
}

/** One icon as a `size`-square canvas, drawn at twice that and halved for antialiasing. */
export function rasterProductIcon(scene: Phaser.Scene, product: ProductId, size: number): HTMLCanvasElement {
  const big = size * 2;
  const g = scene.add.graphics();
  const full = document.createElement('canvas');
  full.width = big; full.height = big;
  const ctx = full.getContext('2d');
  if (!ctx) throw new Error('No 2D canvas');
  ctx.lineJoin = 'round';
  const camera = new Phaser.Cameras.Scene2D.BaseCamera(0, 0, big, big);
  camera.setScene(scene, false);
  try {
    drawProductIcon(g, product, big);
    (g as unknown as CanvasDrawn).renderCanvas(scene.game.renderer, g, camera, null, ctx, false);
  } finally {
    g.destroy();
  }
  const out = document.createElement('canvas');
  out.width = size; out.height = size;
  const half = out.getContext('2d');
  if (!half) throw new Error('No 2D canvas');
  half.imageSmoothingEnabled = true;
  half.imageSmoothingQuality = 'high';
  half.drawImage(full, 0, 0, size, size);
  return out;
}

interface Stage { readonly c: number; readonly s: number }

/**
 * The square's ground: a coloured field with a soft pool of light behind the subject, as
 * every act stands in, and a faint vignette toward the corners. Returns the centre and one
 * unit of stroke.
 */
function ground(g: G, size: number, colour: number): Stage {
  const c = size / 2, s = size / 512;
  g.fillStyle(colour, 1).fillRect(0, 0, size, size);
  for (let i = 8; i >= 1; i--) {
    g.fillStyle(mix(colour, 0xffffff, 0.22), 0.09).fillCircle(c, c - size * 0.04, size * 0.09 * i);
  }
  g.fillStyle(shade(colour, -0.5), 0.1).fillRect(0, size - 18 * s, size, 18 * s);
  return { c, s };
}

/** The pattern every stroke of the dial reads: twelve ticks, the quarters longer. */
function dialTicks(g: G, c: number, R: number, s: number, colour: number): void {
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const long = i % 3 === 0;
    const inner = R * (long ? 0.74 : 0.82), outer = R * 0.9;
    g.lineStyle((long ? 9 : 6) * s, colour, 1);
    g.lineBetween(c + Math.cos(a) * inner, c + Math.sin(a) * inner, c + Math.cos(a) * outer, c + Math.sin(a) * outer);
  }
}

/**
 * The stopwatch: a steel case with its crown and a shoulder button, a cream face with twelve
 * ticks, and a sweep from twelve o'clock through `turns` of the dial in the product's colour
 * — the span the timer buys. The hand points where the sweep ends.
 */
function stopwatch(g: G, stage: Stage, body: number, sweep: number, turns: number, faceFill: number = SHELL.cream): { readonly R: number } {
  const { c, s } = stage;
  const cy = c + 22 * s;
  const R = 158 * s;
  const metal = faces(body);
  // Crown and stem, then the shoulder button at two o'clock.
  g.fillStyle(metal.edge, 1).fillRect(c - 16 * s, cy - R - 40 * s, 32 * s, 46 * s);
  g.fillStyle(metal.edge, 1).fillRoundedRect(c - 38 * s, cy - R - 62 * s, 76 * s, 30 * s, 10 * s);
  g.fillStyle(metal.lit, 1).fillRoundedRect(c - 38 * s, cy - R - 64 * s, 76 * s, 24 * s, 10 * s);
  const bx = c + Math.cos(-Math.PI * 0.3) * (R + 10 * s), by = cy + Math.sin(-Math.PI * 0.3) * (R + 10 * s);
  g.fillStyle(metal.edge, 1).fillCircle(bx, by, 24 * s);
  g.fillStyle(metal.lit, 1).fillCircle(bx - 3 * s, by - 4 * s, 18 * s);
  // The case: shadow, edge, face, a lit crescent from the upper left.
  g.fillStyle(shade(body, -0.6), 0.35).fillCircle(c + 8 * s, cy + 18 * s, R + 8 * s);
  g.fillStyle(metal.edge, 1).fillCircle(c, cy + 8 * s, R);
  g.fillStyle(metal.face, 1).fillCircle(c, cy, R);
  g.fillStyle(metal.rim, 0.8).fillCircle(c - R * 0.06, cy - R * 0.07, R * 0.94);
  g.fillStyle(metal.face, 1).fillCircle(c + R * 0.02, cy + R * 0.02, R * 0.9);
  g.lineStyle(10 * s, PALETTE.ink, 1).strokeCircle(c, cy, R);
  // The face in its well.
  const r = R * 0.78;
  g.fillStyle(metal.edge, 1).fillCircle(c, cy, r + 6 * s);
  g.fillStyle(shade(faceFill, -0.25), 1).fillCircle(c, cy, r);
  g.fillStyle(faceFill, 1).fillCircle(c + 2 * s, cy + 4 * s, r - 4 * s);
  dialTicks(g, c, r, s, PALETTE.ink);
  // The sweep: a thick arc from twelve, one lap per turn, each lap a little further in.
  for (let lap = 0; lap < Math.ceil(turns); lap++) {
    const part = Math.min(1, turns - lap);
    const radius = r * (0.62 - lap * 0.22);
    g.lineStyle((turns > 1 ? 18 : 26) * s, sweep, 1);
    g.beginPath();
    g.arc(c, cy, radius, -Math.PI / 2, -Math.PI / 2 + part * Math.PI * 2, false);
    g.strokePath();
  }
  // The hand, to where the sweep ends; its boss over the centre.
  const end = -Math.PI / 2 + (turns % 1 === 0 ? 0 : (turns % 1)) * Math.PI * 2;
  g.lineStyle(11 * s, PALETTE.ink, 1).lineBetween(c, cy, c + Math.cos(end) * r * 0.66, cy + Math.sin(end) * r * 0.66);
  g.fillStyle(PALETTE.ink, 1).fillCircle(c, cy, 14 * s);
  g.fillStyle(sweep, 1).fillCircle(c, cy, 7 * s);
  return { R };
}

/** The restart's circular arrow, small, in the lower corner: what the timer is for. */
function restartMark(g: G, stage: Stage, colour: number): void {
  const { c, s } = stage;
  const x = c + 152 * s, y = c + 162 * s;
  g.fillStyle(SHELL.cream, 1).fillCircle(x, y, 48 * s);
  g.lineStyle(8 * s, PALETTE.ink, 1).strokeCircle(x, y, 48 * s);
  drawRestart(g, x, y, 40 * s, colour);
}

const DRAWERS: Record<ProductId, (g: G, size: number) => void> = {
  [PRODUCT.heartRefill]: (g, size) => {
    const { c, s } = ground(g, size, 0xf2d9c4);
    // Five hearts, full, in the row the game draws them in, the middle one forward.
    // One shadow under the whole row, so the hearts stand on the ground rather than on five balls.
    g.fillStyle(shade(0xf2d9c4, -0.35), 0.4).fillEllipse(c, c + 118 * s, 400 * s, 54 * s);
    // Outer first, the middle one last and forward.
    for (const i of [2, -2, 1, -1, 0]) {
      const near = 1 - Math.abs(i) * 0.13;
      const x = c + i * 96 * s, y = c + 8 * s + Math.abs(i) * 30 * s;
      drawHeart(g, x, y, 70 * s * near, PALETTE.coral, 1, PALETTE.ink);
      // A gloss on the upper-left lobe.
      g.fillStyle(0xffffff, 0.35).fillEllipse(x - 26 * s * near, y - 36 * s * near, 28 * s * near, 18 * s * near);
    }
    // A brass sparkle over the middle heart: the bar just filled.
    const sx = c + 64 * s, sy = c - 104 * s;
    for (const [len, w] of [[30, 8], [20, 6]] as const) {
      g.fillStyle(BRASS, 1);
      g.fillTriangle(sx - len * s, sy, sx, sy - w * s, sx + len * s, sy);
      g.fillTriangle(sx - len * s, sy, sx, sy + w * s, sx + len * s, sy);
      g.fillTriangle(sx, sy - len * s, sx - w * s, sy, sx, sy + len * s);
      g.fillTriangle(sx, sy - len * s, sx + w * s, sy, sx, sy + len * s);
    }
  },
  [PRODUCT.timer30m]: (g, size) => {
    const stage = ground(g, size, 0xf6e3c6);
    // Half the dial: the sweep stops at six.
    stopwatch(g, stage, 0xb8c2c9, PALETTE.coral, 0.5);
    restartMark(g, stage, PALETTE.coral);
  },
  [PRODUCT.timer1h]: (g, size) => {
    const stage = ground(g, size, 0xdfe8dc);
    // One full lap.
    stopwatch(g, stage, BRASS, 0x5b8c3a, 1);
    restartMark(g, stage, 0x5b8c3a);
  },
  [PRODUCT.timer2h]: (g, size) => {
    const stage = ground(g, size, 0xdbe3ec);
    // Two laps, the second inside the first.
    stopwatch(g, stage, 0x6f8aa6, 0x2d5f8a, 2);
    restartMark(g, stage, 0x2d5f8a);
  },
  [PRODUCT.timer1d]: (g, size) => {
    const stage = ground(g, size, 0x2b3550);
    const { c, s } = stage;
    // A day: the face is day on the left and night on the right, a sun and a moon on it,
    // under a full lap in the sun's colour.
    const { R } = stopwatch(g, stage, 0x4c5a7a, SHELL.sun, 1, 0xf7ecd2);
    const cy = c + 22 * s, r = R * 0.78;
    g.fillStyle(0x3a4466, 0.9).beginPath();
    g.arc(c, cy, r - 5 * s, -Math.PI / 2, Math.PI / 2, false);
    g.closePath(); g.fillPath();
    dialTicks(g, c, r, s, PALETTE.ink);
    // Three stars on the night half, between the sweep and the ticks; the day half is light.
    for (const [a, k] of [[0.08, 5], [0.3, 4], [-0.22, 4]] as const) {
      g.fillStyle(0xf7ecd2, 1).fillCircle(c + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78, k * s);
    }
    // The full lap and the hand again, over the halves.
    g.lineStyle(26 * s, SHELL.sun, 1).beginPath(); g.arc(c, cy, r * 0.62, -Math.PI / 2, Math.PI * 1.5, false); g.strokePath();
    g.lineStyle(11 * s, PALETTE.ink, 1).lineBetween(c, cy, c, cy - r * 0.66);
    g.fillStyle(PALETTE.ink, 1).fillCircle(c, cy, 14 * s);
    g.fillStyle(SHELL.sun, 1).fillCircle(c, cy, 7 * s);
    restartMark(g, stage, 0x2b3550);
  },
  [PRODUCT.premium]: (g, size) => {
    // The legacy unlock, should the Console ever want its icon again: a brass medallion
    // carrying the infinity the game drew for it, on coral.
    const { c, s } = ground(g, size, PALETTE.coral);
    const metal = faces(BRASS);
    const R = 180 * s;
    g.fillStyle(shade(PALETTE.coral, -0.5), 0.4).fillCircle(c + 6 * s, c + 14 * s, R);
    g.fillStyle(metal.edge, 1).fillCircle(c, c + 8 * s, R);
    g.fillStyle(metal.face, 1).fillCircle(c, c, R);
    g.fillStyle(metal.rim, 0.75).fillCircle(c - R * 0.05, c - R * 0.06, R * 0.95);
    g.fillStyle(metal.face, 1).fillCircle(c + R * 0.02, c + R * 0.02, R * 0.92);
    g.lineStyle(8 * s, metal.edge, 1).strokeCircle(c, c, R);
    g.fillStyle(metal.edge, 1).fillCircle(c, c, R * 0.72);
    g.fillStyle(SHELL.cream, 1).fillCircle(c + 2 * s, c + 4 * s, R * 0.68);
    drawInfinity(g, c, c, R * 0.52, PALETTE.ink);
    for (const dx of [-1, 1]) drawHeart(g, c + dx * R * 0.78, c - R * 0.72, 30 * s, PALETTE.coral, 1, PALETTE.ink);
  },
};
