import Phaser from 'phaser';
import type { AchievementArt } from '../config/achievementImport';
import { PALETTE, SHELL } from '../config/theme';
import { finaleTreatment } from '../game/finale';
import { AREAS } from '../game/levels';
import { firstLevelOfArea } from '../game/stars';
import { drawAreaBadge } from './areaBadge';
import { mix, shade } from './colour';
import { drawBook, drawChecklist, drawInfinity, drawNote } from './icons';
import { drawKeepsake } from './keepsakes';
import { faces } from './light';
import { BRASS } from './panel';
import { drawStar, STAR_PRIZE } from './star';

/**
 * The Play Console icons for the imported achievements (`config/achievementImport.ts`),
 * drawn by the game's own hand: the area badges, the prize stars, the keepsakes and the
 * control glyphs, in the workshop's key light. Nothing in the game draws these;
 * `scripts/achievement-import.mjs` rasterises each through the canvas renderer, as
 * `BakedLayer` does, and writes the PNGs the import ZIP carries.
 *
 * Google's rules shape the layout. The icon is 512 px square, but an unlock toast crops it
 * to a circle, so everything that says what the achievement is sits on a medallion inside
 * that circle and the corners carry only ground. Play makes the locked look by turning the
 * icon grey, so each one keeps a strong colour and a strong silhouette. And the same icon
 * serves every language, so there are no words: digits are drawn as strokes where one is
 * the point.
 */
type G = Phaser.GameObjects.Graphics;

/** The rim says the tier, by the points the achievement is worth. */
const RIM = { bronze: 0xc2834f, silver: 0xbcc5cf, gold: BRASS, platinum: 0xd9e2e8 } as const;
type Rim = keyof typeof RIM;

const NIGHT = 0x223052;
const LEAF = 0x5b8c3a;

const v = (x: number, y: number): Phaser.Math.Vector2 => new Phaser.Math.Vector2(x, y);

/** Every art id the import names, so a test can hold the list to the drawers. */
export function achievementArtIds(): readonly AchievementArt[] {
  return [...Object.keys(DRAWERS) as AchievementArt[], ...AREAS.map((_, i) => `area-${i}` as const)];
}

/** Draw one icon into a `size`-square at the Graphics' origin. */
export function drawAchievementIcon(g: G, art: AchievementArt, size: number, rim: Rim = 'bronze'): void {
  const area = /^area-(\d+)$/.exec(art);
  if (area) { drawFinale(g, Number(area[1]), size); return; }
  const draw = DRAWERS[art as keyof typeof DRAWERS];
  if (!draw) throw new Error(`No icon for ${art}`);
  draw(g, size, rim);
}

/** The canvas renderer's entry point on a Graphics, which Phaser's typings leave out. */
interface CanvasDrawn {
  renderCanvas(renderer: unknown, src: G, camera: Phaser.Cameras.Scene2D.BaseCamera, parentMatrix: null, ctx: CanvasRenderingContext2D, allowClip: boolean): void;
}

/**
 * One icon as a `size`-square canvas, drawn at twice that and halved. Through the canvas
 * renderer, as `BakedLayer` rasterises, with a camera that is never pre-rendered so its
 * scroll is identity and the drawing lands at its own coordinates.
 */
export function rasterAchievementIcon(scene: Phaser.Scene, art: AchievementArt, size: number, rim: Rim): HTMLCanvasElement {
  const big = size * 2;
  const g = scene.add.graphics();
  const full = document.createElement('canvas');
  full.width = big; full.height = big;
  const ctx = full.getContext('2d');
  if (!ctx) throw new Error('No 2D canvas');
  ctx.lineJoin = 'bevel';
  const camera = new Phaser.Cameras.Scene2D.BaseCamera(0, 0, big, big);
  camera.setScene(scene, false);
  try {
    drawAchievementIcon(g, art, big, rim);
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

/** The rim for a point value: the tier a player can read at a glance. */
export function rimFor(points: number): Rim {
  return points >= 40 ? 'gold' : points >= 15 ? 'silver' : 'bronze';
}

interface Medal { readonly c: number; readonly r: number; readonly s: number }

/**
 * The square's ground, a burst of light from behind the medallion, and the medallion: a
 * raised rim in the tier's metal round an inset face. Returns the face's centre and radius
 * and one unit of stroke.
 */
function medal(g: G, size: number, ground: number, rim: Rim, face: number): Medal {
  const c = size / 2, s = size / 512;
  g.fillStyle(ground, 1).fillRect(0, 0, size, size);
  // Sixteen rays, alternate ones lit: a badge's sunburst, quiet enough to stay ground.
  for (let i = 0; i < 16; i += 2) {
    const a0 = (i / 16) * Math.PI * 2, a1 = ((i + 1) / 16) * Math.PI * 2;
    g.fillStyle(0xffffff, 0.09).fillTriangle(c, c, c + Math.cos(a0) * size, c + Math.sin(a0) * size, c + Math.cos(a1) * size, c + Math.sin(a1) * size);
  }
  const R = size * 0.42;
  const metal = faces(RIM[rim]);
  g.fillStyle(shade(ground, -0.4), 0.45).fillCircle(c + 6 * s, c + 12 * s, R);
  g.fillStyle(metal.edge, 1).fillCircle(c, c + 7 * s, R);
  g.fillStyle(metal.face, 1).fillCircle(c, c, R);
  // The key light from the upper left: a lit crescent on the rim.
  g.fillStyle(metal.rim, 0.75).fillCircle(c - R * 0.05, c - R * 0.06, R * 0.95);
  g.fillStyle(metal.face, 1).fillCircle(c + R * 0.02, c + R * 0.02, R * 0.92);
  // The face sits in a well: a shaded lip on its upper edge, lit on its lower.
  const r = R * 0.79;
  g.fillStyle(metal.edge, 1).fillCircle(c, c, r + 5 * s);
  g.fillStyle(shade(face, -0.3), 1).fillCircle(c, c, r);
  g.fillStyle(face, 1).fillCircle(c + 2 * s, c + 5 * s, r - 3 * s);
  g.lineStyle(7 * s, metal.edge, 1).strokeCircle(c, c, R);
  return { c, r, s };
}

function note(g: G, x: number, y: number, k: number, colour: number, hollow = false): void {
  // A note head leaning as engraved, and its stem up the right side.
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 24; i++) {
    const t = (i / 24) * Math.PI * 2, a = -0.38;
    const ex = Math.cos(t) * 22 * k, ey = Math.sin(t) * 15 * k;
    pts.push(v(x + ex * Math.cos(a) - ey * Math.sin(a), y + ex * Math.sin(a) + ey * Math.cos(a)));
  }
  if (hollow) g.lineStyle(7 * k, colour, 1).strokePoints(pts, true);
  else g.fillStyle(colour, 1).fillPoints(pts, true);
  g.fillStyle(colour, 1).fillRect(x + 15 * k, y - 112 * k, 7 * k, 110 * k);
}

/** Beamed notes: heads along a baseline, stems up to `beams` beams. */
function beamed(g: G, xs: readonly number[], y: number, k: number, colour: number, beams: number): void {
  for (const x of xs) note(g, x, y, k, colour);
  const left = xs[0]! + 15 * k, right = xs[xs.length - 1]! + 22 * k;
  for (let b = 0; b < beams; b++) g.fillStyle(colour, 1).fillRect(left, y - 112 * k + b * 24 * k, right - left, 15 * k);
}

/** A "3" drawn as two strokes, for the triplet's bracket. */
function digitThree(g: G, x: number, y: number, h: number, colour: number, width: number): void {
  const r = h / 4;
  g.lineStyle(width, colour, 1);
  g.beginPath(); g.arc(x, y - r, r, Math.PI * 1.05, Math.PI * 0.5, false); g.strokePath();
  g.beginPath(); g.arc(x, y + r, r, -Math.PI * 0.5, Math.PI * 0.95, false); g.strokePath();
}

/** A round rubber stamp's print: a ring and a star, in ink with a little give. */
function stampPrint(g: G, x: number, y: number, r: number, colour: number, tilt = 0): void {
  g.lineStyle(r * 0.16, colour, 0.92).strokeCircle(x, y, r);
  g.lineStyle(r * 0.06, colour, 0.92).strokeCircle(x, y, r * 0.74);
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 10; i++) {
    const a = tilt - Math.PI / 2 + (i / 10) * Math.PI * 2, d = i % 2 === 0 ? r * 0.5 : r * 0.22;
    pts.push(v(x + Math.cos(a) * d, y + Math.sin(a) * d));
  }
  g.fillStyle(colour, 0.92).fillPoints(pts, true);
}

function starRing(g: G, c: number, radius: number, count: number, size: number, colour: number): void {
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (i / count) * Math.PI * 2;
    drawStar(g, c + Math.cos(a) * radius, c + Math.sin(a) * radius, size, colour);
  }
}

function grooves(g: G, m: Medal, rings: number): void {
  const { c, r, s } = m;
  for (let i = 0; i < rings; i++) {
    const rr = r * (0.9 - i * 0.14);
    g.lineStyle(9 * s, shade(BRASS, -0.35), 1).strokeCircle(c, c + 3 * s, rr);
    g.lineStyle(7 * s, BRASS, 1).strokeCircle(c, c, rr);
  }
  g.fillStyle(PALETTE.coral, 1).fillCircle(c, c, r * 0.36);
  g.fillStyle(mix(PALETTE.coral, 0xffffff, 0.3), 1).fillCircle(c - r * 0.08, c - r * 0.08, r * 0.2);
  note(g, c - 8 * s, c + 34 * s, 0.62 * s, SHELL.cream);
}

const DRAWERS = {
  'first-downbeat': (g: G, size: number, rim: Rim) => {
    const m = medal(g, size, PALETTE.coral, rim, SHELL.cream);
    const { c, r, s } = m;
    // A plank, the nail driven home in it, and the hammer's head just off the strike.
    g.fillStyle(SHELL.wood, 1).fillRect(c - r * 0.75, c + r * 0.28, r * 1.5, r * 0.34);
    g.fillStyle(shade(SHELL.wood, -0.3), 1).fillRect(c - r * 0.75, c + r * 0.52, r * 1.5, r * 0.1);
    g.fillStyle(0x8d969e, 1).fillRect(c - 7 * s, c + r * 0.06, 14 * s, r * 0.24);
    g.fillStyle(0xb7c0c8, 1).fillEllipse(c, c + r * 0.06, 64 * s, 16 * s);
    // The hammer, drawn whole: a timber handle up to the right, the steel head just lifted.
    const ax = c + r * 0.2, ay = c - r * 0.3, tilt = -0.55;
    const along = (d: number, side: number): Phaser.Math.Vector2 =>
      v(ax + Math.cos(tilt) * d - Math.sin(tilt) * side, ay + Math.sin(tilt) * d + Math.cos(tilt) * side);
    const box = (d0: number, d1: number, w: number) => [along(d0, -w), along(d1, -w), along(d1, w), along(d0, w)];
    g.fillStyle(shade(SHELL.wood, -0.45), 1).fillPoints(box(-r * 0.05, r * 0.7, 19 * s), true);
    g.fillStyle(SHELL.wood, 1).fillPoints(box(-r * 0.05, r * 0.7, 13 * s), true);
    const head = [along(-r * 0.12, -r * 0.42), along(r * 0.12, -r * 0.42), along(r * 0.12, r * 0.2), along(-r * 0.12, r * 0.2)];
    g.fillStyle(0x5d6b73, 1).fillPoints(head, true);
    g.fillStyle(0x9aa6ae, 1).fillPoints([along(-r * 0.12, -r * 0.42), along(-r * 0.02, -r * 0.42), along(-r * 0.02, r * 0.2), along(-r * 0.12, r * 0.2)], true);
    g.lineStyle(6 * s, PALETTE.ink, 1).strokePoints(head, true);
    g.lineStyle(8 * s, PALETTE.coral, 1);
    for (const a of [-2.7, -2.2, -0.9, -0.45]) g.lineBetween(c + Math.cos(a) * r * 0.2, c + r * 0.06 + Math.sin(a) * r * 0.14, c + Math.cos(a) * r * 0.4, c + r * 0.06 + Math.sin(a) * r * 0.28);
  },
  offbeat: (g: G, size: number, rim: Rim) => {
    const { c, r, s } = medal(g, size, 0x3f6b35, rim, SHELL.cream);
    // Three beats on a line, and the note landing between the first two.
    g.fillStyle(PALETTE.ink, 1).fillRect(c - r * 0.78, c + r * 0.4, r * 1.56, 8 * s);
    for (const dx of [-0.6, 0, 0.6]) g.fillStyle(PALETTE.ink, 1).fillCircle(c + dx * r, c + r * 0.4 + 4 * s, 15 * s);
    drawNote(g, c - r * 0.26, c - r * 0.1, r * 0.62, PALETTE.coral);
  },
  'long-phrase': (g: G, size: number, rim: Rim) => {
    const { c, r, s } = medal(g, size, 0x2d4759, rim, SHELL.cream);
    // Two held notes across a bar line, tied.
    g.fillStyle(PALETTE.ink, 0.5).fillRect(c - 4 * s, c - r * 0.62, 8 * s, r * 1.1);
    note(g, c - r * 0.5, c + r * 0.3, 1.1 * s, PALETTE.ink, true);
    note(g, c + r * 0.34, c + r * 0.3, 1.1 * s, PALETTE.ink, true);
    g.lineStyle(13 * s, PALETTE.coral, 1);
    g.beginPath(); g.arc(c - r * 0.07, c + r * 0.12, r * 0.43, Math.PI * 0.18, Math.PI * 0.82, false); g.strokePath();
  },
  triplets: (g: G, size: number, rim: Rim) => {
    const { c, r, s } = medal(g, size, 0x433856, rim, SHELL.cream);
    const k = 1.05 * s, y = c + r * 0.42;
    beamed(g, [c - r * 0.55, c - r * 0.12, c + r * 0.31], y, k, PALETTE.ink, 1);
    // The bracket over the beam, open in the middle for its 3.
    const top = y - 150 * k, left = c - r * 0.5, right = c + r * 0.62;
    g.lineStyle(8 * s, PALETTE.coral, 1);
    g.lineBetween(left, top + 18 * s, left, top); g.lineBetween(left, top, c - 26 * s, top);
    g.lineBetween(c + 50 * s, top, right, top); g.lineBetween(right, top, right, top + 18 * s);
    digitThree(g, c + 12 * s, top, 58 * s, PALETTE.coral, 10 * s);
  },
  sixteenths: (g: G, size: number, rim: Rim) => {
    const { c, r } = medal(g, size, 0x7f8c5e, rim, SHELL.cream);
    const k = r * 0.0058;
    beamed(g, [c - r * 0.66, c - r * 0.3, c + r * 0.06, c + r * 0.42], c + r * 0.36, k, PALETTE.coral, 2);
  },
  'three-stars': (g: G, size: number, rim: Rim) => {
    const { c, r } = medal(g, size, 0x3f6b35, rim, PALETTE.coral);
    // The result plaque's tray: the middle medal larger and raised.
    drawStar(g, c - r * 0.52, c + r * 0.1, r * 0.3, STAR_PRIZE);
    drawStar(g, c + r * 0.52, c + r * 0.1, r * 0.3, STAR_PRIZE);
    drawStar(g, c, c - r * 0.12, r * 0.42, STAR_PRIZE);
  },
  'first-keepsake': (g: G, size: number, rim: Rim) => {
    const { c, r } = medal(g, size, 0x8f3620, rim, SHELL.cream);
    drawKeepsake(g, 'hammer-lucky-nail', c, c + r * 0.04, r * 1.45, false, SHELL.cream);
  },
  'pocket-1': (g: G, size: number, rim: Rim) => grooves(g, medal(g, size, 0x1d3a30, rim, PALETTE.ink), 1),
  'pocket-10': (g: G, size: number, rim: Rim) => grooves(g, medal(g, size, 0x1d3a30, rim, PALETTE.ink), 2),
  'pocket-25': (g: G, size: number, rim: Rim) => grooves(g, medal(g, size, 0x1d3a30, rim, PALETTE.ink), 3),
  'stamp-day': (g: G, size: number, rim: Rim) => {
    const { c, r } = medal(g, size, 0x5a8fa8, rim, SHELL.cream);
    drawChecklist(g, c - r * 0.12, c + r * 0.02, r * 0.52, PALETTE.ink, 3, LEAF);
    stampPrint(g, c + r * 0.42, c + r * 0.4, r * 0.3, PALETTE.coral, 0.2);
  },
  'stamp-week': (g: G, size: number, rim: Rim) => {
    const { c, r } = medal(g, size, 0x5a8fa8, rim, SHELL.cream);
    // Seven days: four over three, as a week's card lays them.
    const row = (y: number, n: number) => {
      for (let i = 0; i < n; i++) stampPrint(g, c + (i - (n - 1) / 2) * r * 0.42, y, r * 0.17, PALETTE.coral, i * 0.4);
    };
    row(c - r * 0.2, 4);
    row(c + r * 0.22, 3);
  },
  'stamp-month': (g: G, size: number, rim: Rim) => {
    const { c, r, s } = medal(g, size, 0x5a8fa8, rim, SHELL.cream);
    // A month's page: its binding in coral, then five weeks of days, nearly all stamped.
    const w = r * 1.18, h = r * 1.12, x0 = c - w / 2, y0 = c - h / 2 + r * 0.04;
    g.fillStyle(shade(SHELL.cream, -0.12), 1).fillRoundedRect(x0 + 6 * s, y0 + 8 * s, w, h, 12 * s);
    g.fillStyle(0xffffff, 1).fillRoundedRect(x0, y0, w, h, 12 * s);
    g.fillStyle(PALETTE.coral, 1).fillRoundedRect(x0, y0, w, h * 0.2, { tl: 12 * s, tr: 12 * s, bl: 0, br: 0 });
    g.lineStyle(5 * s, PALETTE.ink, 1).strokeRoundedRect(x0, y0, w, h, 12 * s);
    const cw = w / 6, ch = (h * 0.8) / 5;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 6; col++) {
        const x = x0 + cw * (col + 0.5), y = y0 + h * 0.2 + ch * (row + 0.5);
        if ((row * 6 + col) % 11 === 7) g.lineStyle(3 * s, PALETTE.muted, 0.6).strokeCircle(x, y, cw * 0.3);
        else g.fillStyle(PALETTE.coral, 0.9).fillCircle(x, y, cw * 0.3);
      }
    }
  },
  'stars-50': (g: G, size: number, rim: Rim) => {
    const { c, r } = medal(g, size, 0x8f3620, rim, PALETTE.coral);
    drawStar(g, c, c + r * 0.04, r * 0.7, STAR_PRIZE);
  },
  'stars-150': (g: G, size: number, rim: Rim) => {
    const { c, r, s } = medal(g, size, NIGHT, rim, 0x2f3760);
    // A constellation: stars joined by the faint lines a chart draws between them.
    const at = [[-0.5, 0.32, 0.2], [-0.12, -0.42, 0.24], [0.48, -0.08, 0.3], [0.2, 0.5, 0.16]] as const;
    g.lineStyle(5 * s, 0xe8edfb, 0.5);
    for (let i = 0; i < at.length - 1; i++) g.lineBetween(c + at[i]![0] * r, c + at[i]![1] * r, c + at[i + 1]![0] * r, c + at[i + 1]![1] * r);
    for (const [x, y, k] of at) drawStar(g, c + x * r, c + y * r, k * r, STAR_PRIZE);
  },
  'stars-300': (g: G, size: number, rim: Rim) => {
    const { c, r, s } = medal(g, size, 0x141c33, rim, NIGHT);
    // A sky full of them, a moon, and one star larger than the rest.
    let seed = 7;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 38; i++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * r * 0.88;
      g.fillStyle(0xfff4dc, 0.5 + rand() * 0.5).fillCircle(c + Math.cos(a) * d, c + Math.sin(a) * d, (2 + rand() * 4) * s);
    }
    g.fillStyle(0xfff0c2, 1).fillCircle(c - r * 0.42, c - r * 0.38, r * 0.24);
    g.fillStyle(NIGHT, 1).fillCircle(c - r * 0.32, c - r * 0.45, r * 0.21);
    drawStar(g, c + r * 0.14, c + r * 0.14, r * 0.5, STAR_PRIZE);
  },
  'clean-sweep': (g: G, size: number, rim: Rim) => {
    const { c, r, s } = medal(g, size, 0x3f6b35, rim, 0xe7ead5);
    // Every stop of one area starred, round a hill with the finale's flag on it.
    g.fillStyle(0xb0bb91, 1).fillEllipse(c, c + r * 0.36, r * 1.0, r * 0.52);
    g.fillStyle(0x8e9b6f, 1).fillEllipse(c + r * 0.05, c + r * 0.42, r * 0.8, r * 0.3);
    g.lineStyle(7 * s, PALETTE.ink, 1).lineBetween(c, c + r * 0.14, c, c - r * 0.34);
    g.fillStyle(PALETTE.coral, 1).fillTriangle(c, c - r * 0.34, c + r * 0.34, c - r * 0.22, c, c - r * 0.1);
    starRing(g, c, r * 0.76, 10, r * 0.13, STAR_PRIZE);
  },
  'keepsakes-12': (g: G, size: number, rim: Rim) => {
    const { c, r } = medal(g, size, 0x8f3620, rim, SHELL.cream);
    drawBook(g, c, c + r * 0.05, r * 0.82, SHELL.wood);
    drawStar(g, c + r * 0.36, c - r * 0.02, r * 0.14, STAR_PRIZE);
  },
  'keepsakes-36': (g: G, size: number, rim: Rim) => {
    const { c, r } = medal(g, size, 0x8f3620, rim, SHELL.cream);
    // The book open, with keepsakes heaped in front of it.
    drawBook(g, c, c - r * 0.18, r * 0.7, SHELL.wood);
    drawKeepsake(g, 'tomato-slice', c - r * 0.42, c + r * 0.42, r * 0.56, false, SHELL.cream);
    drawKeepsake(g, 'bug-plum-beetle', c + r * 0.42, c + r * 0.42, r * 0.56, false, SHELL.cream);
    drawKeepsake(g, 'hammer-lucky-nail', c, c + r * 0.5, r * 0.56, false, SHELL.cream);
  },
  'full-cast': (g: G, size: number, rim: Rim) => {
    const { c, r, s } = medal(g, size, 0x5a1f3d, rim, 0x2a2236);
    // A spotlight on an empty stage between drawn curtains: the whole company has been on.
    g.fillStyle(0xfff0c2, 0.22).fillTriangle(c, c - r * 0.95, c - r * 0.5, c + r * 0.62, c + r * 0.5, c + r * 0.62);
    g.fillStyle(0xfff0c2, 0.5).fillEllipse(c, c + r * 0.6, r * 1.0, r * 0.22);
    drawStar(g, c, c + r * 0.22, r * 0.3, STAR_PRIZE);
    for (const side of [-1, 1]) {
      const folds: Phaser.Math.Vector2[] = [];
      const x0 = c + side * r * 1.0, x1 = c + side * r * 0.42;
      folds.push(v(x0, c - r), v(x1, c - r));
      for (let i = 0; i <= 12; i++) {
        const t = i / 12, y = c - r + t * r * 1.9;
        folds.push(v(x1 + side * (Math.sin(t * Math.PI) * r * 0.22 + Math.sin(t * 20) * 6 * s), y));
      }
      folds.push(v(x0, c + r * 0.9));
      g.fillStyle(PALETTE.coral, 1).fillPoints(folds, true);
      g.lineStyle(5 * s, shade(PALETTE.coral, -0.4), 1);
      for (const f of [0.35, 0.65]) g.lineBetween(x1 + side * r * f * 0.6, c - r * 0.9, x1 + side * r * (f * 0.6 + 0.12), c + r * 0.8);
    }
    g.fillStyle(PALETTE.coral, 1).fillRect(c - r, c - r * 0.98, r * 2, r * 0.2);
    g.fillStyle(BRASS, 1).fillRect(c - r, c - r * 0.8, r * 2, 7 * s);
  },
  'endless-900s': (g: G, size: number, rim: Rim) => {
    const { c, r, s } = medal(g, size, 0x1b2036, rim === 'gold' ? 'platinum' : rim, PALETTE.ink);
    // Fifteen minute marks round the dial, every one passed.
    for (let i = 0; i < 15; i++) {
      const a = -Math.PI / 2 + (i / 15) * Math.PI * 2;
      g.lineStyle(9 * s, i % 5 === 0 ? 0xffffff : RIM.platinum, 1)
        .lineBetween(c + Math.cos(a) * r * 0.8, c + Math.sin(a) * r * 0.8, c + Math.cos(a) * r * 0.94, c + Math.sin(a) * r * 0.94);
    }
    drawInfinity(g, c, c + 4 * s, r * 0.66, shade(BRASS, -0.4));
    drawInfinity(g, c, c, r * 0.66, mix(RIM.platinum, 0xffffff, 0.3));
  },
  'endless-runs-25': (g: G, size: number, rim: Rim) => {
    const { c, r, s } = medal(g, size, 0x1b2036, rim, SHELL.cream);
    drawInfinity(g, c, c - r * 0.06, r * 0.66, PALETTE.coral);
    // A bouquet thrown on: the encore's applause, as three blooms.
    for (const [dx, col] of [[-0.24, 0xf2c14e], [0, PALETTE.coral], [0.24, 0x9edcc8]] as const) {
      g.lineStyle(6 * s, LEAF, 1).lineBetween(c, c + r * 0.72, c + dx * r, c + r * 0.4);
      g.fillStyle(col, 1).fillCircle(c + dx * r, c + r * 0.38, r * 0.12);
      g.fillStyle(0xfff4dc, 1).fillCircle(c + dx * r, c + r * 0.38, r * 0.04);
    }
  },
} satisfies Record<string, (g: G, size: number, rim: Rim) => void>;

/**
 * An area finale: the Scrapbook's badge for that area, its finale's crown of three stars
 * over the rim, and the area's bunting strung across the corners the toast hides.
 */
function drawFinale(g: G, area: number, size: number): void {
  const look = AREAS[((area % AREAS.length) + AREAS.length) % AREAS.length]!;
  const c = size / 2, s = size / 512;
  g.fillStyle(look.sky, 1).fillRect(0, 0, size, size);
  g.fillStyle(look.ground, 1).fillRect(0, size * 0.62, size, size * 0.38);
  for (let i = 0; i < 16; i += 2) {
    const a0 = (i / 16) * Math.PI * 2, a1 = ((i + 1) / 16) * Math.PI * 2;
    g.fillStyle(0xffffff, 0.1).fillTriangle(c, c, c + Math.cos(a0) * size, c + Math.sin(a0) * size, c + Math.cos(a1) * size, c + Math.sin(a1) * size);
  }
  const pennants = finaleTreatment(firstLevelOfArea(area) + 9).pennants;
  for (const [x0, x1, y0, y1] of [[0, size * 0.34, size * 0.06, size * 0.3], [size, size * 0.66, size * 0.06, size * 0.3]] as const) {
    g.lineStyle(3 * s, shade(look.ink, 0.1), 1).lineBetween(x0, y0, x1, y1);
    for (let i = 0; i < 4; i++) {
      const t = (i + 0.5) / 4, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      const dir = Math.sign(x1 - x0) * 14 * s;
      g.fillStyle(pennants[i % pennants.length]!, 1).fillTriangle(x - dir, y - 4 * s, x + dir, y + 4 * s, x, y + 34 * s);
    }
  }
  const R = size * 0.38, y = c + 14 * s;
  g.fillStyle(shade(look.ground, -0.4), 0.45).fillCircle(c + 6 * s, y + 8 * s, R);
  drawAreaBadge(g, area, c, y, R, true);
  // The crown sits on the rim, inside the circle a toast crops to.
  drawStar(g, c - R * 0.4, y - R * 0.9, 25 * s, STAR_PRIZE);
  drawStar(g, c + R * 0.4, y - R * 0.9, 25 * s, STAR_PRIZE);
  drawStar(g, c, y - R * 1.0, 33 * s, STAR_PRIZE);
}
