import type Phaser from 'phaser';
import { STYLE } from '@/config/style';
import { faces } from '@/ui/light';
import { canvasFinale, brushTravel, CANVAS_MOTION, strokePose, strokeTimes } from './canvasMotion';
import { canvasLook, type CanvasLook, type PaintStroke } from './canvasLooks';
import { HOME_INK, shape, slab, sparkle } from './householdArt';
import { HouseholdVignette } from './HouseholdVignette';
import { clamp01 } from './motion';

/** The canvas the brush paints on, in the easel's frame. Strokes are authored in this box. */
const CANVAS = { x: -150, y: -168, w: 300, h: 250 } as const;

/**
 * A paintbrush on an easel. Each beat is one stroke of the painting the lap chose.
 * The demonstration paints on the example's own clock and leaves the player's canvas
 * blank: only judged hits lay paint, and a clean round's flurry finishes the picture.
 */
export class PaintbrushVignette extends HouseholdVignette {
  private readonly look: CanvasLook;

  public constructor(scene: Phaser.Scene, lap = 0) {
    const look = canvasLook(lap);
    super(scene, look.wall, 0xf6e2b8);
    this.look = look;
  }

  protected draw(now: number, ending: number): void {
    const g = this.art.clear();
    const beat = this.plan ? 60 / this.plan.bpm : 0.5;
    const targets = Math.max(1, this.plan?.targets.length ?? 4);
    const times = this.watching ? this.demoTimes : this.hitTimes;
    const contact = this.finishAt;
    const laidAt = strokeTimes(times, targets, ending >= 0 ? contact : null, ending >= 0 && this.successful);
    const finale = canvasFinale(ending, this.successful, this.still);
    this.studio();
    this.canvasCloth();
    for (let i = 0; i < this.look.strokes.length; i++) {
      const at = laidAt[i]!;
      if (!Number.isFinite(at)) continue;
      const amount = brushTravel(now - at, beat);
      if (amount <= 0) continue;
      this.ribbon(this.look.strokes[i]!, amount);
    }
    if (ending >= 0 && !this.successful) this.smear(finale.smear);
    if (ending >= 0 && this.successful) this.signature(finale.sign);
    const pose = this.brushPose(now, beat, laidAt);
    const lift = finale.lift * 70;
    const nudge = !this.still && now - this.errorAt < 0.22 ? Math.sin((now - this.errorAt) * 62) * 5 : 0;
    this.brush(pose.x + nudge, pose.y - lift, pose.angle, finale.drip);
    if (ending >= 0 && this.successful && !this.still) {
      const a = Math.sin(clamp01((ending - 0.7) / 0.7) * Math.PI);
      sparkle(g, CANVAS.x + CANVAS.w - 28, CANVAS.y + CANVAS.h - 28, 12 * a, a);
    }
  }

  /** The bristles follow the stroke in progress: the latest one that has started, or the next empty start. */
  private brushPose(now: number, beat: number, laidAt: readonly number[]): { x: number; y: number; angle: number } {
    const strokes = this.look.strokes;
    let index = 0;
    let travel = 0;
    if (this.finishAt !== null && this.successful) {
      for (let i = 0; i < laidAt.length; i++) {
        const at = laidAt[i]!;
        if (Number.isFinite(at) && at <= now) { index = i; travel = brushTravel(now - at, beat); }
      }
    } else if (this.strokes > 0) {
      const laid = laidAt.filter(at => Number.isFinite(at)).length;
      // A hit grows the stroke it just laid. A miss sweeps the next empty one and leaves no paint.
      index = Math.min(laid, CANVAS_MOTION.strokes - 1);
      travel = brushTravel(now - this.strikeAt, beat);
    }
    return strokePose(strokes[index]!.points, travel);
  }

  private studio(): void {
    const g = this.art;
    const wood = faces(this.look.frame);
    g.fillStyle(this.look.wall).fillRect(-380, -280, 760, 560);
    g.lineStyle(2, HOME_INK, 0.08);
    for (let i = 0; i < 8; i++) g.lineBetween(-380, -240 + i * 64, 380, -250 + i * 64);
    // Easel legs, behind the canvas.
    shape(g, [-40, 210, -18, 210, 70, -190, 48, -190], wood.shade, wood.edge, 3);
    shape(g, [40, 210, 18, 210, -70, -190, -48, -190], wood.face, wood.edge, 3);
    slab(g, -170, 150, 340, 18, wood.face, 6, wood.edge);
    // A thumb palette of the picture's colours, clear of the canvas.
    slab(g, 198, -88, 44, 196, wood.face, 10, wood.edge);
    this.look.strokes.forEach((stroke, i) => {
      g.fillStyle(stroke.colour).fillCircle(220, -68 + i * 22, 9);
      g.lineStyle(2, stroke.ink).strokeCircle(220, -68 + i * 22, 9);
    });
  }

  private canvasCloth(): void {
    const g = this.art;
    const wood = faces(this.look.frame);
    const cloth = faces(this.look.cloth);
    slab(g, CANVAS.x - 16, CANVAS.y - 16, CANVAS.w + 32, CANVAS.h + 32, wood.face, 8, wood.edge);
    g.fillStyle(cloth.shade).fillRect(CANVAS.x + 6, CANVAS.y + 6, CANVAS.w, CANVAS.h);
    g.fillStyle(cloth.face).fillRect(CANVAS.x, CANVAS.y, CANVAS.w, CANVAS.h);
    g.lineStyle(STYLE.current.outline * 0.45, wood.edge).strokeRect(CANVAS.x, CANVAS.y, CANVAS.w, CANVAS.h);
    g.lineStyle(1.5, cloth.edge, 0.35);
    g.lineBetween(CANVAS.x + 18, CANVAS.y, CANVAS.x + 18, CANVAS.y + CANVAS.h);
    g.lineBetween(CANVAS.x + CANVAS.w - 18, CANVAS.y, CANVAS.x + CANVAS.w - 18, CANVAS.y + CANVAS.h);
  }

  /** A brush ribbon along the stroke, as far as `amount`. The head is round, like wet bristles. */
  private ribbon(stroke: PaintStroke, amount: number): void {
    const points = stroke.points;
    if (points.length < 2 || amount <= 0) return;
    const lengths = [0];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!, b = points[i]!;
      lengths.push(lengths[i - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    const total = lengths[lengths.length - 1] || 1;
    const along = Math.min(1, amount) * total;
    const samples: (readonly [number, number])[] = [points[0]!];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!, b = points[i]!;
      const span = lengths[i]! - lengths[i - 1]! || 1;
      if (lengths[i]! <= along) samples.push(b);
      else {
        const f = (along - lengths[i - 1]!) / span;
        samples.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
        break;
      }
    }
    if (samples.length < 2) return;
    const left: number[] = [];
    const right: number[] = [];
    for (let i = 0; i < samples.length; i++) {
      const p = samples[i]!;
      const q = samples[Math.min(samples.length - 1, i + 1)]!;
      const prev = samples[Math.max(0, i - 1)]!;
      const dx = (i === samples.length - 1 ? p[0] - prev[0] : q[0] - p[0]);
      const dy = (i === samples.length - 1 ? p[1] - prev[1] : q[1] - p[1]);
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len * stroke.width / 2;
      const ny = dx / len * stroke.width / 2;
      left.push(p[0] + nx, p[1] + ny);
      right.push(p[0] - nx, p[1] - ny);
    }
    const poly = [...left];
    for (let i = right.length - 2; i >= 0; i -= 2) poly.push(right[i]!, right[i + 1]!);
    shape(this.art, poly, stroke.colour, stroke.ink, 2.2);
    const g = this.art;
    const tail = samples[0]!, head = samples[samples.length - 1]!;
    g.fillStyle(stroke.colour).fillCircle(tail[0], tail[1], stroke.width / 2).fillCircle(head[0], head[1], stroke.width / 2);
    g.lineStyle(2.2, stroke.ink).strokeCircle(tail[0], tail[1], stroke.width / 2).strokeCircle(head[0], head[1], stroke.width / 2);
  }

  /** A diagonal smear and nothing else: the picture is still there, under too much paint. */
  private smear(amount: number): void {
    if (amount <= 0) return;
    const muddy: PaintStroke = {
      colour: 0x6d5344, ink: 0x3e2e26, width: 22,
      points: [[-110, -40], [-20, 10], [70, -16], [120, 30]],
    };
    this.ribbon(muddy, amount);
  }

  /** Two quick flicks in the lower corner, the way a picture gets a name. */
  private signature(amount: number): void {
    if (amount <= 0) return;
    const flick: PaintStroke = {
      colour: 0x3a2c28, ink: 0x241816, width: 4,
      points: [[78, 52], [96, 40], [108, 56], [124, 36]],
    };
    this.ribbon(flick, amount);
  }

  private brush(x: number, y: number, angle: number, drip: number): void {
    const g = this.art;
    const handle = faces(this.look.handle);
    const c = Math.cos(angle), s = Math.sin(angle);
    const px = (ox: number, oy: number) => x - c * ox + -s * oy;
    const py = (ox: number, oy: number) => y - s * ox + c * oy;
    const quad = (ox1: number, oy1: number, ox2: number, oy2: number, half: number) => [
      px(ox1, oy1 + half), py(ox1, oy1 + half), px(ox2, oy2 + half), py(ox2, oy2 + half),
      px(ox2, oy2 - half), py(ox2, oy2 - half), px(ox1, oy1 - half), py(ox1, oy1 - half),
    ];
    // Handle runs back from the ferrule; the fist closes around its far end.
    shape(g, quad(28, 0, 108, 0, 7), handle.face, this.look.handleInk, 2.4);
    shape(g, quad(16, 0, 30, 0, 8), this.look.ferrule, 0x8d877c, 2);
    shape(g, quad(-2, 0, 18, 0, 9), this.look.bristle, 0xb7a890, 2);
    g.fillStyle(0xf3c7a4).fillCircle(px(96, 0), py(96, 0), 16);
    g.lineStyle(2.4, 0xa8704e).strokeCircle(px(96, 0), py(96, 0), 16);
    g.fillStyle(0xf3c7a4).fillCircle(px(112, 8), py(112, 8), 7);
    g.lineStyle(2, 0xa8704e).strokeCircle(px(112, 8), py(112, 8), 7);
    if (drip > 0) {
      g.fillStyle(0x6d5344, 0.9).fillEllipse(x, y + 8 + drip * 46, 8, 14 + drip * 18);
    }
  }
}
