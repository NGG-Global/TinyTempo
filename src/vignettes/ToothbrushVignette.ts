import type Phaser from 'phaser';
import { shade } from '@/ui/colour';
import { fillContour, traceContour } from '@/ui/illustration';
import { HouseholdVignette } from './HouseholdVignette';
import { shape, slab, sparkle } from './householdArt';
import { clamp01, easeOut } from './motion';
import { BRUSH_MOTION, brushFinale, cleanTimes, scrub } from './brushMotion';
import { brushLook, type BrushLook } from './brushLooks';

export const BRUSH_INK = 0x3b3440;

/**
 * The grin, as curves across the mouth: `t` runs -1 (left corner) to 1 (right corner), and
 * every line meets at the corners, `corner` high, sagging by its own amount at the middle.
 */
const MOUTH = { width: 226, corner: -84, top: 16, bite: 74, gum: 130, bottom: 168 } as const;
/** A close-up: the face runs off the glass at the top and bottom, and nearly to the sides. */
const FACE = { x: 0, y: -4, rx: 300, ry: 262, left: -318, right: 318, top: -214, bottom: 214 } as const;
/** How much larger than life the brush is drawn, so its bristles and paste read on a phone. */
const BRUSH_SCALE = 1.35;
/** Where one tooth ends and the next begins: wide at the front, narrowing into the corners. */
const EDGES = [-1, -0.837, -0.604, -0.317, 0, 0.317, 0.604, 0.837, 1] as const;
const TOOTH = { dull: 0xeadbb0, plaque: 0xc4a55a, clean: 0xfdfcf6, shade: 0xdce5ea, edge: 0x9a8f86 } as const;
const MOUTH_INSIDE = 0x3f121b;
const GUM = 0xf4a7ad;
const TONGUE = { face: 0xc34d5c, edge: 0x7e2833 } as const;
const GLINT = { face: 0xffffff, edge: 0xe9b949 } as const;
const FOAM = { face: 0xffffff, rim: 0xc9dde8 } as const;

type Line = 'top' | 'bite' | 'gum' | 'bottom';
interface Point { readonly x: number; readonly y: number }

/** The height of one of the mouth's lines at `t`. */
function lineAt(line: Line, t: number): number {
  return MOUTH.corner + MOUTH[line] * (1 - t * t);
}

/**
 * The toothbrush: a close-up of a grin in the bathroom mirror, brushed once round — along
 * the top teeth and back along the bottom — a tooth or two a judged stroke. A brushed
 * tooth turns from dull to white with a glint, and the foam builds as it goes. The
 * demonstration scrubs where the brush starts and leaves no foam and no clean tooth,
 * because the player's round follows it without a bar between.
 */
export class ToothbrushVignette extends HouseholdVignette {
  private readonly look: BrushLook;
  /** The brush has a layer of its own so it can fade out whole; the frame is over it. */
  private readonly tool: Phaser.GameObjects.Graphics;
  private readonly overlay: Phaser.GameObjects.Graphics;

  public constructor(scene: Phaser.Scene, lap = 0) {
    super(scene, 0xeef1ee, 0xdff0f3);
    this.look = brushLook(lap);
    this.tool = scene.add.graphics();
    this.overlay = scene.add.graphics();
    this.stage.add([this.tool, this.overlay]);
  }

  protected draw(now: number, ending: number): void {
    const g = this.art.clear();
    const beat = this.plan ? 60 / this.plan.bpm : 0.5;
    const targets = this.plan?.targets.length ?? 4;
    const finale = brushFinale(ending, this.successful, this.still);
    const times = cleanTimes(this.watching ? [] : this.hitTimes, targets, this.finishAt, this.successful);
    const cleaned = times.filter(t => t <= now).length;

    slab(g, -340, -228, 680, 460, this.look.glass, 34, this.look.frameInk);
    this.face();
    this.mouth(times, now, finale.gleam);
    this.foam(times, now, cleaned, finale);
    if (this.watching) this.lather(now - this.strikeAt);
    if (finale.ting > 0) this.ting(finale.ting, now);
    this.tool.clear().setAlpha(1 - finale.withdraw);
    this.overlay.clear();
    this.brushFor(now, ending, times, cleaned, beat, finale.withdraw);
    if (ending >= 0 && !this.successful) this.overflow(finale, now, ending);
    this.frame();
  }

  // ------------------------------------------------------------------ The face

  private face(): void {
    const g = this.art, look = this.look;
    const outline: number[] = [];
    for (let k = 0; k <= 64; k++) {
      const a = k / 64 * Math.PI * 2;
      const x = FACE.x + Math.cos(a) * FACE.rx, y = FACE.y + Math.sin(a) * FACE.ry;
      outline.push(Math.max(FACE.left, Math.min(FACE.right, x)), Math.max(FACE.top, Math.min(FACE.bottom, y)));
    }
    shape(g, outline, look.skin, look.skinInk, 3);
    for (const side of [-1, 1]) g.fillStyle(look.blush, 0.4).fillEllipse(side * 236, -40, 90, 50);
    // The underside of the nose, peeking in at the top of the mirror.
    shape(g, [-58, -214, 58, -214, 62, -186, 40, -166, 14, -162, 0, -170, -14, -162, -40, -166, -62, -186], shade(look.skin, 0.04), look.skinInk, 3);
    for (const side of [-1, 1]) g.fillStyle(shade(look.skin, -0.45)).fillEllipse(side * 24, -178, 22, 11);
    g.fillStyle(0xffffff, 0.3).fillEllipse(-18, -204, 40, 12);
    g.lineStyle(3, shade(look.skin, -0.2), 0.8).lineBetween(-10, -150, -12, -118).lineBetween(10, -150, 12, -118);
  }

  private mouth(times: readonly number[], now: number, gleam: number): void {
    const g = this.art, look = this.look, W = MOUTH.width;
    const along = (line: Line, from: number, to: number, offset = 0, steps = 24): number[] => {
      const points: number[] = [];
      for (let k = 0; k <= steps; k++) {
        const t = from + (to - from) * k / steps;
        points.push(t * W, lineAt(line, t) + offset);
      }
      return points;
    };
    // The lips: fuller below, with a small dip at the middle of the upper.
    const lips: number[] = [];
    for (let k = 0; k <= 32; k++) {
      const t = -1.07 + 2.14 * k / 32, c = Math.max(0, 1 - t * t);
      lips.push(t * W, lineAt('top', Math.max(-1, Math.min(1, t))) - 20 * Math.sqrt(c) + 6 * Math.exp(-((t / 0.07) ** 2)));
    }
    for (let k = 32; k >= 0; k--) {
      const t = -1.07 + 2.14 * k / 32, c = Math.max(0, 1 - t * t);
      lips.push(t * W, lineAt('bottom', Math.max(-1, Math.min(1, t))) + 26 * Math.sqrt(c));
    }
    shape(g, lips, look.lip, look.lipInk, 3);
    g.fillStyle(0xffffff, 0.3).fillEllipse(-40, lineAt('bottom', 0.2) + 14, 90, 9);
    shape(g, [...along('top', -1, 1), ...along('bottom', 1, -1)], MOUTH_INSIDE, MOUTH_INSIDE, 0);
    // The tongue, under the bottom teeth.
    const tongue = [...along('gum', -0.64, 0.64, 2), ...along('bottom', 0.64, -0.64, -2)];
    shape(g, tongue, TONGUE.face, TONGUE.edge, 0);
    g.lineStyle(3, TONGUE.edge, 0.7).lineBetween(0, lineAt('gum', 0) + 12, 0, lineAt('bottom', 0) - 10);
    for (let k = 0; k < 8; k++) this.tooth(k, false, times[k]!, now, gleam);
    for (let k = 0; k < 8; k++) this.tooth(k, true, times[8 + k]!, now, gleam);
    // Gums over the teeth's roots, top and bottom.
    shape(g, [...along('top', -1, 1), ...along('top', 1, -1, 12)], GUM, 0xb85d63, 0);
    shape(g, [...along('gum', -1, 1, -11), ...along('gum', 1, -1, 3)], GUM, 0xb85d63, 0);
    g.lineStyle(2, 0xc9747b, 0.8);
    traceContour(g, along('top', -0.97, 0.97, 12));
    g.strokePath();
    traceContour(g, along('gum', -0.97, 0.97, -11));
    g.strokePath();
    g.lineStyle(3, look.lipInk).beginPath();
    const rim = [...along('top', -1, 1), ...along('bottom', 1, -1)];
    traceContour(g, rim);
    g.closePath().strokePath();
  }

  /** One tooth: dull and speckled until it is brushed, then white, with a glint that stays. */
  private tooth(k: number, lower: boolean, cleanAt: number, now: number, gleam: number): void {
    const g = this.art, W = MOUTH.width;
    const a = EDGES[k]!, b = EDGES[k + 1]!;
    const upperLine: Line = lower ? 'bite' : 'top', lowerLine: Line = lower ? 'gum' : 'bite';
    const inset = 2.6 / W, points: number[] = [];
    const round = 7;
    // Round the biting corners, so a row reads as teeth rather than a fence.
    for (let s = 0; s <= 8; s++) {
      const t = a + inset + (b - a - 2 * inset) * s / 8, edge = s === 0 || s === 8;
      points.push(t * W, lineAt(upperLine, t) + (lower ? 2 + (edge ? round : 0) : 6));
    }
    for (let s = 8; s >= 0; s--) {
      const t = a + inset + (b - a - 2 * inset) * s / 8, edge = s === 0 || s === 8;
      points.push(t * W, lineAt(lowerLine, t) + (lower ? -6 : -1 - (edge ? round : 0)));
    }
    const clean = cleanAt <= now;
    shape(g, points, clean ? TOOTH.clean : TOOTH.dull, TOOTH.edge, 2);
    const c = (a + b) / 2, x = c * W, top = lineAt(upperLine, c), bottom = lineAt(lowerLine, c);
    const y = (top + bottom) / 2, w = (b - a) * W, h = bottom - top;
    if (!clean) {
      g.fillStyle(TOOTH.plaque, 0.55).fillCircle(x - w * 0.18, y + h * 0.18, Math.max(1.5, w * 0.07));
      g.fillStyle(TOOTH.plaque, 0.45).fillCircle(x + w * 0.2, y - h * 0.05, Math.max(1.2, w * 0.05));
      return;
    }
    g.fillStyle(TOOTH.shade, 0.8).fillRect(x + w * 0.18, top + 8, w * 0.16, Math.max(0, h - 16));
    g.fillStyle(0xffffff).fillCircle(x - w * 0.18, top + h * 0.3, Math.max(1.5, w * 0.08));
    // It sparkles once as it comes clean.
    const age = now - cleanAt;
    if (age < 0.5 && !this.still) this.glint(g, x, y, Math.min(w, 34) * 0.6 * easeOut(age / 0.12), 1 - age / 0.5);
    if (gleam >= 0) {
      // The gleam: a slanted band of light crossing the smile, left to right.
      const lit = Math.exp(-((((c + 1) / 2 - gleam) / 0.1) ** 2));
      if (lit > 0.02) {
        const band = Math.max(4, w * 0.2);
        g.fillStyle(0xffffff, lit);
        fillContour(g, [x - w * 0.34, bottom - 7, x - w * 0.34 + band, bottom - 7, x + w * 0.22 + band, top + 9, x + w * 0.22, top + 9]);
        g.fillStyle(GLINT.edge, lit * 0.35).fillRect(x - w * 0.42, top + 6, w * 0.84, 3);
      }
    }
  }

  // ------------------------------------------------------------------ Foam

  /** Bubbles where each tooth was brushed, and a froth gathering at the corners. */
  private foam(times: readonly number[], now: number, cleaned: number, finale: ReturnType<typeof brushFinale>): void {
    const W = MOUTH.width;
    const grow = 1 + finale.swell * 0.7;
    times.forEach((time, tooth) => {
      if (time > now) return;
      const lower = tooth >= 8, k = tooth % 8, a = EDGES[k]!, b = EDGES[k + 1]!;
      const pop = this.still ? 1 : easeOut((now - time) / 0.18);
      for (let i = 0; i < 4; i++) {
        const t = a + (b - a) * (0.2 + 0.6 * ((i * 0.37 + k * 0.21) % 1));
        const line: Line = lower ? (i % 2 ? 'gum' : 'bite') : (i % 2 ? 'top' : 'bite');
        const y = lineAt(line, t) + (line === 'top' ? 12 : line === 'gum' ? -10 : lower ? 4 : -4);
        const rinse = clamp01(finale.rinse * 1.7 - (t + 1) / 2 * 0.7);
        const r = (5 + ((i * 5 + k * 3) % 6)) * pop * grow * (1 - rinse);
        if (r > 0.5) this.bubble(t * W, y, r);
      }
    });
    // The corners froth up as the brushing goes on.
    const froth = Math.min(16, cleaned) * (1 - finale.rinse) * grow;
    if (froth > 0.5) {
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const r = (4 + froth * (0.55 - i * 0.12));
          this.bubble(side * (W - 4 - i * 12), MOUTH.corner + (i - 1) * 9 + 4, r);
        }
      }
    }
  }

  private bubble(x: number, y: number, r: number, alpha = 1, g: Phaser.GameObjects.Graphics = this.art): void {
    g.fillStyle(FOAM.rim, alpha).fillCircle(x, y, r + 1.5);
    g.fillStyle(FOAM.face, alpha).fillCircle(x, y, r);
    g.fillStyle(0xe8f2f7, alpha).fillCircle(x + r * 0.25, y + r * 0.25, r * 0.55);
    g.fillStyle(0xffffff, alpha).fillCircle(x - r * 0.35, y - r * 0.35, r * 0.25);
  }

  /** The example's lather: a few bubbles off the brush that pop straight away. */
  private lather(age: number): void {
    if (age < 0 || age > 0.45) return;
    const at = this.toothCentre(BRUSH_MOTION.order[0]);
    const p = age / 0.45;
    for (let i = 0; i < 5; i++) {
      const a = -1.2 + i * 0.6;
      this.bubble(at.x + Math.cos(a) * (20 + p * 30), at.y - 12 + Math.sin(a) * (14 + p * 22) - p * 10, (4 + i % 3 * 2) * (1 - p * 0.5), 1 - p);
    }
  }

  private ting(amount: number, now: number): void {
    const g = this.art, twinkle = this.still ? 1 : 0.85 + Math.sin(now * 10) * 0.15;
    const y = (lineAt('top', 0) + lineAt('bite', 0)) / 2;
    this.glint(g, -34, y - 8, 70 * amount * twinkle, 1);
    this.glint(g, 126, lineAt('top', 0.5) + 20, 30 * amount, 0.95);
    this.glint(g, -146, lineAt('bite', -0.58) + 12, 24 * amount, 0.9);
    sparkle(g, 190, -150, 16 * amount * twinkle, amount);
    sparkle(g, -210, -120, 12 * amount, amount);
  }

  /** A four-point glint with a gold edge: plain cream would vanish against a white tooth. */
  private glint(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, alpha: number): void {
    if (r <= 0.5 || alpha <= 0) return;
    const star = (size: number): number[] => {
      const points: number[] = [];
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4 - Math.PI / 2, d = k % 2 ? size * 0.24 : size;
        points.push(x + Math.cos(a) * d, y + Math.sin(a) * d);
      }
      return points;
    };
    g.fillStyle(GLINT.edge, alpha);
    fillContour(g, star(r * 1.25));
    g.fillStyle(GLINT.face, alpha);
    fillContour(g, star(r));
  }

  /** A rough round: the foam swells over the lip, runs down the chin, and one bubble bursts. */
  private overflow(finale: ReturnType<typeof brushFinale>, now: number, ending: number): void {
    const g = this.overlay, W = MOUTH.width;
    for (let k = 0; k < 9; k++) {
      const t = -0.72 + k * 0.18, r = (8 + (k % 3) * 4) * finale.swell;
      if (r > 0.5) this.bubble(t * W, lineAt('bottom', t) + 16 + (k % 2) * 6, r, 1, g);
    }
    for (const [t, reach] of [[-0.4, 70], [0.12, 96], [0.52, 58]] as const) {
      const x = t * W, from = lineAt('bottom', t) + 22, length = finale.drip * reach;
      if (length < 1) continue;
      g.fillStyle(FOAM.rim).fillRoundedRect(x - 8, from, 16, length + 2, 8);
      g.fillStyle(FOAM.face).fillRoundedRect(x - 6.5, from, 13, length, 6.5);
      this.bubble(x, from + length, 9, 1, g);
    }
    const bx = W + 20, by = MOUTH.corner + 6;
    if (finale.bubble > 0) {
      const r = 8 + finale.bubble * 36, wobble = this.still ? 0 : Math.sin(now * 14) * 0.04;
      g.fillStyle(0xffffff, 0.35).fillEllipse(bx + r * 0.5, by, r * 2 * (1 + wobble), r * 2 * (1 - wobble));
      g.lineStyle(3, 0x9fd0e6, 0.9).strokeEllipse(bx + r * 0.5, by, r * 2 * (1 + wobble), r * 2 * (1 - wobble));
      g.lineStyle(2, 0xf2b6d2, 0.7).beginPath().arc(bx + r * 0.5, by, r * 0.8, Math.PI * 1.1, Math.PI * 1.5).strokePath();
      g.fillStyle(0xffffff, 0.9).fillCircle(bx + r * 0.1, by - r * 0.45, r * 0.14);
    } else if (finale.bubble < 0 && !this.still) {
      // Burst: a ring of spray where it was.
      const since = ending - BRUSH_MOTION.blorpAt;
      if (since >= 0 && since < 0.25) {
        const p = since / 0.25;
        g.lineStyle(3, 0xffffff, 1 - p);
        for (let k = 0; k < 8; k++) {
          const a = k / 8 * Math.PI * 2, r = 20 + p * 30;
          g.lineBetween(bx + 22 + Math.cos(a) * r, by + Math.sin(a) * r, bx + 22 + Math.cos(a) * (r + 10), by + Math.sin(a) * (r + 10));
        }
      }
    }
  }

  // ------------------------------------------------------------------ The brush

  private toothCentre(tooth: number): Point & { readonly angle: number; readonly lower: boolean } {
    const lower = tooth >= 8, k = tooth % 8, c = (EDGES[k]! + EDGES[k + 1]!) / 2;
    const top = lineAt(lower ? 'bite' : 'top', c), bottom = lineAt(lower ? 'gum' : 'bite', c);
    // Most of the row's own slope there, so the head lies along the teeth it is scrubbing.
    const sag = (MOUTH[lower ? 'bite' : 'top'] + MOUTH[lower ? 'gum' : 'bite']) / 2;
    return { x: c * MOUTH.width, y: (top + bottom) / 2, angle: Math.atan(-2 * sag * c / MOUTH.width) * 0.6, lower };
  }

  private brushFor(now: number, ending: number, times: readonly number[], cleaned: number, beat: number, withdraw: number): void {
    const { order, teeth } = BRUSH_MOTION;
    const next = this.toothCentre(order[Math.min(cleaned, teeth - 1)]!);
    let at: { x: number; y: number; angle: number } = next;
    if (!this.watching && cleaned > 0) {
      const last = times[order[cleaned - 1]!]!;
      const from = this.toothCentre(order.find(tooth => times[tooth] === last)!);
      const travel = easeOut((now - last) / BRUSH_MOTION.travelSec);
      at = { x: from.x + (next.x - from.x) * travel, y: from.y + (next.y - from.y) * travel, angle: from.angle + (next.angle - from.angle) * travel };
    }
    // Strokes: the player's and the example's, and on a clean round the finishing scrubs.
    let struck = this.strikeAt;
    if (ending >= 0 && this.successful) for (const t of BRUSH_MOTION.flurry) if (t <= ending) struck = this.finishAt! + t;
    const stroke = scrub(now - struck, beat) * 18;
    const slip = now - this.errorAt;
    const jerk = !this.still && slip >= 0 && slip < 0.3 ? Math.sin(slip * 40) * 10 * (1 - slip / 0.3) : 0;
    // Put down: it drops away to the lower right as its layer fades.
    this.brush(at.x + Math.cos(at.angle) * stroke + withdraw * 150, at.y + Math.sin(at.angle) * stroke + jerk + withdraw * 110, at.angle, next.lower, cleaned);
  }

  /** The brush lying along the teeth, bristles to the gum, its handle away to the right. */
  private brush(x: number, y: number, angle: number, lower: boolean, cleaned: number): void {
    const g = this.tool, look = this.look, k = BRUSH_SCALE;
    const c = Math.cos(angle), s = Math.sin(angle);
    const at = (u: number, v: number): [number, number] => [x + (u * c - v * s) * k, y + (u * s + v * c) * k];
    const box = (u0: number, v0: number, u1: number, v1: number): number[] => [...at(u0, v0), ...at(u1, v0), ...at(u1, v1), ...at(u0, v1)];
    // A straight handle behind the head, running on until it passes under the frame.
    const [sx, sy] = at(58, 0), reach = c > 0.05 ? Math.min(330, (324 - sx) / c) : 330;
    const ex = sx + c * reach, ey = sy + s * reach;
    g.lineStyle(30, look.brushInk).lineBetween(sx, sy, ex, ey);
    g.lineStyle(23, look.brush).lineBetween(sx, sy, ex, ey);
    g.lineStyle(7, shade(look.brush, 0.35), 0.8).lineBetween(sx + s * 6, sy - c * 6, ex + s * 6, ey - c * 6);
    const [nx, ny] = at(40, 0);
    g.lineStyle(15, look.brushInk).lineBetween(nx, ny, sx, sy);
    g.lineStyle(9, look.brush).lineBetween(nx, ny, sx, sy);
    // Bristles on the side facing the gum: up for the top row, down for the bottom.
    const side = lower ? 1 : -1;
    for (let i = 0; i < 9; i++) {
      const u = -40 + i * 10;
      shape(g, box(u - 3.5, side * 9, u + 3.5, side * 24), i % 2 ? look.bristleTip : look.bristle, shade(look.bristleTip, -0.4), 1.2);
    }
    shape(g, box(-46, -11, 48, 11), look.brush, look.brushInk, 3);
    g.fillStyle(0xffffff, 0.35);
    fillContour(g, box(-40, -8, 40, -3));
    // The paste on the bristles is used up as the mouth gets brushed.
    const paste = 1 - Math.min(1, cleaned / BRUSH_MOTION.teeth);
    if (paste > 0.05) {
      for (let i = 0; i < 4; i++) {
        const u = -26 + i * 17, [px, py] = at(u, side * (28 + paste * 4));
        g.fillStyle(0xffffff).fillCircle(px, py, (7 * paste + 2) * k);
        g.fillStyle(look.paste).fillCircle(px + 1, py, (3.2 * paste + 0.8) * k);
      }
    }
  }

  /** The mirror's frame, over everything, with a streak of light across the glass. */
  private frame(): void {
    const g = this.overlay, look = this.look;
    g.fillStyle(0xffffff, 0.16);
    fillContour(g, [-300, -214, -236, -214, -326, -110, -326, -186]);
    fillContour(g, [-214, -214, -196, -214, -326, -62, -326, -84]);
    g.lineStyle(24, look.frame).strokeRoundedRect(-328, -216, 656, 436, 24);
    g.lineStyle(3, shade(look.frame, 0.35), 0.9).strokeRoundedRect(-334, -222, 668, 448, 30);
    g.lineStyle(3, look.frameInk).strokeRoundedRect(-316, -204, 632, 412, 14);
    g.lineStyle(3, look.frameInk).strokeRoundedRect(-340, -228, 680, 460, 34);
  }
}
