import type Phaser from 'phaser';
import { STYLE } from '@/config/style';
import { reducedMotion } from '@/core/motionPreference';
import type { Viewport } from '@/core/Viewport';
import type { Phase } from '@/game/RoundController';
import type { RoundPlan } from '@/rhythm/RhythmScheduler';
import type { Judgement } from '@/rhythm/judge';
import { MaterialKey } from '@/textures/materials';
import { Backdrop } from '@/ui/backdrop';
import { Feedback } from '@/ui/feedback';
import { cubicContour, fillContour, paintedContour, traceContour } from '@/ui/illustration';
import { kitchenKnife, kitchenBoard, KITCHEN_BOARD } from './kitchenArt';
import type { Vignette } from './Vignette';
import {
  acceptDemoBeat,
  advanceSlice,
  bananaAt,
  bananaCutT,
  bananaOutline,
  BANANA_MOTION,
  bananaTiming,
  clamp01,
  cutFraction,
  easeOut,
  juiceFall,
  knifeLift,
  knifeWindup,
  REFERENCE_BEAT,
  sliceTumble,
} from './bananaMotion';
import { isPlayerTurn, TURN_OPEN_SEC } from './motion';

/**
 * A warm cream kitchen. The banana is the only saturated yellow in it, so it is the
 * subject — away from Hammer's vermilion, Saw's brass and the tomato's red.
 */
export const BREAKFAST = {
  paper: 0xf7f3e8,
  ink: 0x3d3428,
  grout: 0xe0d4bc,
  counter: 0xc2b090,
  board: 0xe6d3a4,
  boardEdge: 0xb08a52,
  boardLine: 0xd0b67c,
  peel: 0xf3c849,
  peelLit: 0xffe88a,
  peelDark: 0xdba331,
  speckle: 0x6b4a18,
  flesh: 0xfff4c4,
  fleshRing: 0xf5e09a,
  pith: 0xe8c870,
  seed: 0x5a4020,
  stem: 0x5a6b28,
  stemLit: 0x7a8c40,
  steel: 0xd3dadd,
  steelLit: 0xf4f7f8,
  steelDark: 0x9aa5aa,
  handle: 0x2b2b30,
  rivet: 0xb9c2c6,
} as const;

const BOARD_LEFT = KITCHEN_BOARD.left;
const BOARD_RIGHT = KITCHEN_BOARD.right;
const BOARD_THICK = KITCHEN_BOARD.thickness;
const PILE_X = 168;
const PILE_STEP = 28;
const SLICE_RX = 46;
const SLICE_RY = 68;
const LEAN = 0.55;
const ARC_STEPS = 28;
const JUICE_DROPS = 4;

const fan = fillContour;

function disc(cx: number, cy: number, a: number, b: number, tilt: number): number[] {
  const pts: number[] = [];
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  for (let i = 0; i < ARC_STEPS; i++) {
    const t = (i / ARC_STEPS) * Math.PI * 2;
    const x = a * Math.cos(t);
    const y = b * Math.sin(t);
    pts.push(cx + x * c - y * s, cy + x * s + y * c);
  }
  return pts;
}

function strokePoly(g: Phaser.GameObjects.Graphics, pts: readonly number[]): void {
  g.beginPath();
  for (let i = 0; i < pts.length; i += 2) g[i === 0 ? 'moveTo' : 'lineTo'](pts[i]!, pts[i + 1]!);
  g.closePath().strokePath();
}

/** Owns an illustration and its motion. Judgement arrives already decided; it is never computed here. */
export class BananaKnifeVignette implements Vignette {
  private readonly backdrop: Backdrop;
  private readonly wall: Phaser.GameObjects.Graphics;
  private readonly boardSurface: Phaser.GameObjects.TileSprite;
  private readonly bursts: Feedback;
  private readonly stage: Phaser.GameObjects.Container;
  private readonly boardG: Phaser.GameObjects.Graphics;
  private readonly produce: Phaser.GameObjects.Container;
  private readonly bananaG: Phaser.GameObjects.Graphics;
  private readonly slicesG: Phaser.GameObjects.Graphics;
  private readonly marks: Phaser.GameObjects.Graphics;
  private readonly juice: Phaser.GameObjects.Graphics;
  private readonly knife: Phaser.GameObjects.Container;
  private readonly rings: Phaser.GameObjects.Graphics;
  private plan: RoundPlan | null = null;
  private phase: Phase = 'idle';
  private respondAt = -100;
  private lastDemo = -Infinity;
  private strikes = 0;
  private strikeAt = -100;
  private strikeX = 0;
  private slices = 0;
  private sliceAt: number[] = [];
  private sliceFrom: number[] = [];
  private sliceFromY: number[] = [];
  private sliceWobble: number[] = [];
  private cutT = 1;
  private cutFrom = 1;
  private cutTo = 1;
  private cutAt = -100;
  private uneven = 0;
  private nicks: number[] = [];
  private judderAt = -100;
  private finishAt: number | null = null;
  private finished = false;
  private successful = false;
  private lastNow = 0;
  private baseX = 0;
  private baseY = 0;
  private scale = 1;
  private get reducedMotion(): boolean {
    return reducedMotion();
  }

  public constructor(scene: Phaser.Scene) {
    this.backdrop = new Backdrop(scene, BREAKFAST.paper, BREAKFAST.board, {
      glowAt: { x: 0.42, y: 0.42 },
      glowAlpha: 0.5,
    });
    this.wall = scene.add.graphics().setDepth(-20);
    this.stage = scene.add.container(0, 0).setDepth(-10);
    this.boardG = scene.add.graphics();
    this.boardSurface = scene.add
      .tileSprite(BOARD_LEFT, 0, BOARD_RIGHT - BOARD_LEFT, BOARD_THICK, MaterialKey.wood)
      .setOrigin(0)
      .setTint(BREAKFAST.board)
      .setAlpha(0.18 * STYLE.current.grain);
    this.boardSurface.setTileScale(0.3, 0.3);
    this.produce = scene.add.container(0, 0);
    this.bananaG = scene.add.graphics();
    this.slicesG = scene.add.graphics();
    this.marks = scene.add.graphics();
    this.juice = scene.add.graphics();
    this.produce.add([this.marks, this.bananaG, this.slicesG, this.juice]);
    this.knife = scene.add.container(0, 0);
    this.knife.add(this.drawKnife(scene));
    this.rings = scene.add.graphics();
    this.stage.add([this.boardG, this.boardSurface, this.produce, this.rings, this.knife]);
    this.bursts = new Feedback(scene, -10, this.stage);
    this.cutT = this.cutFrom = this.cutTo = 1;
  }

  private drawKnife(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
    return kitchenKnife(scene, 0x745544);
  }

  public layout(viewport: Viewport): void {
    const { full, safe } = viewport;
    const uiScale = Math.min(safe.width / 720, safe.height / 1150);
    const top = safe.top + 320 * uiScale;
    const bottom = safe.bottom - 410 * uiScale;
    this.scale = Math.min(safe.width / 980, (bottom - top) / 460);
    this.baseX = safe.centerX;
    this.baseY = top + (bottom - top + 250 * this.scale) / 2;
    this.stage.setPosition(this.baseX, this.baseY).setScale(this.scale);
    this.backdrop.layout(viewport);
    const bg = this.wall.clear();
    const tile = 120 * this.scale;
    const counterY = this.baseY + BOARD_THICK * this.scale;
    bg.lineStyle(2 * this.scale, BREAKFAST.grout, 0.6);
    for (let y = counterY - tile; y > full.y - tile; y -= tile) bg.lineBetween(full.x, y, full.right, y);
    for (let x = this.baseX % tile; x < full.right + tile; x += tile) bg.lineBetween(x, full.y, x, counterY);
    bg.fillStyle(BREAKFAST.counter, 0.38).fillRect(full.x, counterY, full.width, full.bottom - counterY);
    bg.fillStyle(BREAKFAST.ink, 0.08).fillRect(full.x, counterY, full.width, 6 * this.scale);
    kitchenBoard(this.boardG, BREAKFAST.board, BREAKFAST.boardEdge);
  }

  public reset(plan: RoundPlan): void {
    this.plan = plan;
    this.phase = 'prepare';
    this.lastDemo = -Infinity;
    this.strikes = this.slices = 0;
    this.strikeAt = -100;
    this.strikeX = bananaAt(1).x;
    this.respondAt = -100;
    this.sliceAt = [];
    this.sliceFrom = [];
    this.sliceFromY = [];
    this.bananaG.setY(0);
    this.sliceWobble = [];
    this.cutT = this.cutFrom = this.cutTo = 1;
    this.cutAt = -100;
    this.uneven = 0;
    this.nicks = [];
    this.judderAt = -100;
    this.finishAt = null;
    this.finished = false;
    this.successful = false;
  }

  public onPhase(phase: Phase, now: number): void {
    this.phase = phase;
    if (phase === 'respond') {
      this.setCut(0, now);
      this.respondAt = now;
    }
  }

  private setCut(fraction: number, now: number): void {
    this.cutFrom = this.cutT;
    this.cutTo = bananaCutT(clamp01(fraction));
    this.cutAt = now;
  }

  private strike(now: number): void {
    this.strikes++;
    this.strikeAt = now;
    this.strikeX = bananaAt(this.cutTo).x;
  }

  private takeSlice(now: number, targets: number): void {
    const at = bananaAt(this.cutTo);
    if (!this.reducedMotion)
      this.bursts.burst('dust', at.x, at.y, [BREAKFAST.flesh, BREAKFAST.peel, BREAKFAST.pith], 6);
    this.sliceAt.push(now);
    this.sliceFrom.push(at.x);
    this.sliceFromY.push(at.y + this.bananaG.y);
    this.sliceWobble.push(this.uneven * (((this.slices * 7 + 3) % 5) / 5 - 0.5));
    this.setCut(cutFraction(this.slices, targets), now);
  }

  public onDemonstrationBeat(time: number): void {
    const accepted = acceptDemoBeat(this.lastDemo, time);
    if (accepted === null) return;
    this.lastDemo = accepted;
    this.strike(time);
  }

  public onPlayerHit(now: number): void {
    if (!isPlayerTurn(this.phase)) return;
    this.strike(now);
  }

  public onAccuracy(result: Judgement, now: number): void {
    const slices = advanceSlice(this.slices, result.kind);
    if (slices !== this.slices) {
      this.slices = slices;
      this.takeSlice(now, this.plan?.targets.length ?? 3);
      return;
    }
    if (result.kind === 'extra') {
      this.strikeX = bananaAt(this.cutTo).x + 96 + this.nicks.length * 12;
      this.nicks.push(this.strikeX);
    } else {
      this.judderAt = now;
    }
    this.uneven = Math.min(1, this.uneven + 0.22);
  }

  public finish(successful: boolean, contactSec: number): void {
    this.successful = successful;
    this.finishAt = contactSec;
  }
  public pause(): void {
    this.phase = 'paused';
    this.finishAt = null;
    this.strikeAt = -100;
  }

  private beat(): number {
    return this.plan ? 60 / this.plan.bpm : REFERENCE_BEAT;
  }

  private upcoming(now: number): number | null {
    if (this.finishAt !== null && !this.finished) return this.finishAt;
    if (this.phase !== 'prepare' && this.phase !== 'demonstrate') return null;
    return this.plan?.cues.find((cue) => cue.kind === 'action' && cue.time > now)?.time ?? null;
  }

  private openStage(now: number): void {
    const offered = this.phase === 'respond' || this.phase === 'result';
    this.backdrop.open(offered ? easeOut((now - this.respondAt) / TURN_OPEN_SEC) : 0);
  }

  public update(now: number): void {
    if (this.phase === 'paused') now = this.lastNow;
    else this.lastNow = now;
    this.openStage(now);
    if (this.phase === 'prepare' || this.phase === 'demonstrate') {
      for (const cue of this.plan?.cues ?? []) {
        if (cue.kind === 'action' && cue.time <= now) this.onDemonstrationBeat(cue.time);
      }
    }
    this.cutT = this.cutFrom + (this.cutTo - this.cutFrom) * easeOut((now - this.cutAt) / 0.09);
    if (this.finishAt !== null && now >= this.finishAt && !this.finished) {
      this.finished = true;
      this.strike(this.finishAt);
      this.slices++;
      this.sliceAt.push(this.finishAt);
      this.sliceFrom.push(bananaAt(this.cutTo).x);
      this.sliceFromY.push(bananaAt(this.cutTo).y + this.bananaG.y);
      this.sliceWobble.push(this.successful ? 0 : 0.5);
      this.setCut(1, this.finishAt);
      if (!this.successful) this.uneven = Math.max(this.uneven, 0.6);
    }
    const beat = this.beat();
    const age = now - this.strikeAt;
    const press = age >= 0 && age < 0.16 ? Math.sin((age / 0.16) * Math.PI) * STYLE.current.exaggeration : 0;
    const shake =
      this.reducedMotion || age < 0 || age > 0.16
        ? 0
        : Math.sin(age * 120) * Math.exp(-age * 24) * 1.8 * STYLE.current.exaggeration;
    this.stage.setPosition(this.baseX + shake * this.scale, this.baseY + shake * this.scale * 0.5);
    this.produce.setPosition(0, this.reducedMotion ? 0 : press * 1.6);
    this.poseKnife(now, beat, age);
    this.drawBanana();
    this.drawSlices(now, beat);
    this.drawMarks();
    this.drawJuice(beat, age);
    this.drawRings(age);
  }

  private poseKnife(now: number, beat: number, age: number): void {
    const parked = age > 0.5 && (this.phase === 'idle' || this.phase === 'prepare');
    let lift = knifeLift(age, beat);
    const next = this.upcoming(now);
    if (next !== null && next - now < bananaTiming(beat).windupSec) lift = knifeWindup(next - now, lift, beat);
    let tremble = 0;
    if (now - this.judderAt < 0.24 && !this.finished) {
      tremble = Math.sin((now - this.judderAt) * 92) * Math.exp(-(now - this.judderAt) * 12) * 0.035;
    }
    let x = this.strikeX + 6;
    if (parked) {
      lift = 1;
      x = bananaAt(this.cutTo).x - 22;
      if (!this.reducedMotion) lift += Math.sin(now * 1.6) * 0.02;
    }
    this.knife.setPosition(x, -lift * BANANA_MOTION.lift);
    this.knife.setRotation(-0.12 - 0.42 * Math.min(1.12, lift) + tremble);
  }

  /** Curved peel bands follow the actual silhouette, including the freshly cut end. */
  private drawBanana(): void {
    const g = this.bananaG.clear();
    const pts = bananaOutline(this.cutT, 40);
    if (pts.length < 6) return;
    const bottom = Math.max(...pts.filter((_, i) => i % 2 === 1));
    // The heel settles onto the board as its curved support is sliced away.
    const settle = -bottom;
    g.setY(settle);
    const cut = bananaAt(this.cutT);
    const mid = bananaAt(this.cutT * 0.5);
    g.fillStyle(BREAKFAST.ink, 0.12);
    fan(g, disc(mid.x, 5 - settle, Math.max(20, (cut.x - BANANA_MOTION.stemX) * 0.43), 10, 0));
    paintedContour(g, pts, BREAKFAST.peel, 0x85602b, STYLE.current.outline);
    const band = (from: number, to: number): number[] => {
      const out: number[] = [];
      for (let i = 0; i <= 32; i++) {
        const p = bananaAt(0.025 + ((this.cutT - 0.025) * i) / 32);
        out.push(p.x + p.nx * p.half * from, p.y + p.ny * p.half * from);
      }
      for (let i = 32; i >= 0; i--) {
        const p = bananaAt(0.025 + ((this.cutT - 0.025) * i) / 32);
        out.push(p.x + p.nx * p.half * to, p.y + p.ny * p.half * to);
      }
      return out;
    };
    g.fillStyle(BREAKFAST.peelDark);
    fan(g, band(-0.94, -0.42));
    g.fillStyle(BREAKFAST.peelLit);
    fan(g, band(0.16, 0.84));
    g.lineStyle(2.5, 0xffef9d, 0.9);
    const ridge: number[] = [];
    for (let i = 0; i <= 32; i++) {
      const p = bananaAt(0.05 + (Math.max(0, this.cutT - 0.07) * i) / 32);
      ridge.push(p.x + p.nx * p.half * 0.6, p.y + p.ny * p.half * 0.6);
    }
    traceContour(g, ridge);
    g.strokePath();
    // Sparse, small freckles, never a repeating polka-dot row.
    for (const [t, side, r] of [
      [0.12, 0.0, 2],
      [0.18, -0.14, 1.5],
      [0.37, -0.18, 2.4],
      [0.4, -0.24, 1.5],
      [0.65, -0.1, 1.7],
      [0.77, -0.2, 2.1],
    ]) {
      if (t! >= this.cutT - 0.035) continue;
      const p = bananaAt(t!);
      g.fillStyle(BREAKFAST.speckle, 0.65).fillCircle(p.x + p.nx * p.half * side!, p.y + p.ny * p.half * side!, r!);
    }
    if (this.cutT < 0.995) {
      const tilt = Math.atan2(cut.ny, cut.nx) + Math.PI / 2;
      paintedContour(g, disc(cut.x, cut.y, 12, cut.half, tilt), BREAKFAST.flesh, 0x9a742e, 3);
      g.fillStyle(BREAKFAST.fleshRing);
      fan(g, disc(cut.x + 1, cut.y, 5, cut.half * 0.64, tilt));
      g.fillStyle(BREAKFAST.pith);
      fan(g, disc(cut.x + 2, cut.y, 3, cut.half * 0.22, tilt));
    } else {
      paintedContour(g, disc(cut.x, cut.y, 8, cut.half * 0.92, -0.45), BREAKFAST.speckle, 0x71502b, 2);
    }
    const stem = bananaAt(0);
    paintedContour(
      g,
      cubicContour(stem.x - 4, stem.y - 8, [
        [stem.x - 18, stem.y - 15, stem.x - 25, stem.y - 35, stem.x - 27, stem.y - 46],
        [stem.x - 23, stem.y - 53, stem.x - 10, stem.y - 52, stem.x - 5, stem.y - 48],
        [stem.x - 7, stem.y - 30, stem.x + 4, stem.y - 18, stem.x + 8, stem.y - 5],
        [stem.x + 4, stem.y + 3, stem.x - 3, stem.y + 1, stem.x - 4, stem.y - 8],
      ]),
      BREAKFAST.stem,
      0x675637,
      4,
    );
    g.lineStyle(4, BREAKFAST.stemLit).lineBetween(stem.x - 17, stem.y - 41, stem.x - 10, stem.y - 23);
  }

  /** Each slice is an oval that flops from the cut and leans on the last one. */
  private drawSlices(now: number, beat: number): void {
    const g = this.slicesG.clear();
    for (let i = 0; i < this.sliceAt.length; i++) {
      const p = Math.min(1.08, sliceTumble(now - this.sliceAt[i]!, beat));
      const wobble = this.sliceWobble[i] ?? 0;
      const restX = PILE_X + i * Math.min(PILE_STEP, 140 / Math.max(1, this.sliceAt.length - 1));
      const restLean = LEAN + wobble * 0.55;
      const squash = this.finished && !this.successful && i === this.sliceAt.length - 1 ? 0.5 : 1;
      const x = this.sliceFrom[i]! + (restX - this.sliceFrom[i]!) * Math.min(1, p);
      const lean = restLean * Math.min(1, p);
      const b = SLICE_RY * squash;
      const a = 5 + (SLICE_RX - 5) * Math.sin((Math.min(1, p) * Math.PI) / 2);
      const restY = -Math.hypot(a * Math.sin(lean), b * Math.cos(lean)) - 2;
      const cy = (this.sliceFromY[i] ?? -SLICE_RY) + (restY - (this.sliceFromY[i] ?? -SLICE_RY)) * Math.min(1, p);
      g.fillStyle(BREAKFAST.ink, 0.1);
      fan(g, disc(x + 10, 6, a * 0.9 + 8, 12, 0));
      paintedContour(
        g,
        disc(x - 9 * Math.min(1, p), cy + 2, a, b, lean),
        BREAKFAST.peelDark,
        0x98743c,
        STYLE.current.outline * 0.65,
      );
      paintedContour(g, disc(x, cy, a, b, lean), BREAKFAST.peel, 0x98743c, STYLE.current.outline * 0.65);
      g.fillStyle(BREAKFAST.flesh);
      fan(g, disc(x, cy, a * 0.89, b * 0.9, lean));
      g.lineStyle(2, BREAKFAST.fleshRing);
      strokePoly(g, disc(x, cy, a * 0.73, b * 0.76, lean));
      if (a > 16) {
        for (let lobe = 0; lobe < 3; lobe++) {
          const t = (lobe * Math.PI * 2) / 3 - 0.7;
          const sx = Math.cos(t) * a * 0.54,
            sy = Math.sin(t) * b * 0.54;
          g.lineStyle(2.5, BREAKFAST.pith, 0.7).lineBetween(
            x,
            cy,
            x + sx * Math.cos(lean) - sy * Math.sin(lean),
            cy + sx * Math.sin(lean) + sy * Math.cos(lean),
          );
          for (let seed = 0; seed < 2; seed++) {
            const st = t + (seed ? -0.3 : 0.3);
            const dx = Math.cos(st) * a * 0.16,
              dy = Math.sin(st) * b * 0.16;
            g.fillStyle(BREAKFAST.seed, 0.7).fillEllipse(
              x + dx * Math.cos(lean) - dy * Math.sin(lean),
              cy + dx * Math.sin(lean) + dy * Math.cos(lean),
              3,
              4,
              8,
            );
          }
        }
      }
    }
  }

  private drawMarks(): void {
    const g = this.marks.clear();
    for (const x of this.nicks) {
      g.lineStyle(3, BREAKFAST.boardEdge, 0.7).lineBetween(x - 28, 5, x + 30, 5);
      g.lineStyle(1.5, BREAKFAST.ink, 0.25).lineBetween(x - 22, 7, x + 26, 7);
    }
  }

  private drawJuice(beat: number, age: number): void {
    const g = this.juice.clear();
    const { juiceSec } = bananaTiming(beat);
    if (age < 0 || age > juiceSec || this.sliceAt.length === 0) return;
    if (Math.abs((this.sliceAt[this.sliceAt.length - 1] ?? -100) - this.strikeAt) > 0.001) return;
    const fall = juiceFall(age, beat);
    const spread = easeOut(age / juiceSec) * 48;
    const life = 1 - age / juiceSec;
    const at = bananaAt(this.cutT);
    for (let i = 0; i < JUICE_DROPS; i++) {
      const seed = (i * 29 + 7) % 17;
      const x = this.strikeX + (seed / 17 - 0.5) * spread * 1.2;
      const y = at.y - 8 - Math.sin(i * 1.7) * spread * 0.4 + fall * (0.65 + seed / 34);
      g.fillStyle(i % 2 ? BREAKFAST.flesh : BREAKFAST.pith, life * 0.9);
      g.fillEllipse(x, y, 5 + (seed % 3), 7 + (seed % 3), 6);
    }
  }

  private drawRings(age: number): void {
    const g = this.rings.clear();
    if (age < 0 || age > 0.2) return;
    const p = age / 0.2;
    g.lineStyle(3, BREAKFAST.paper, 1 - p).strokeEllipse(this.strikeX + 60, 3, 150 + p * 160, 12 + p * 18);
  }

  public translate(offset: number): void {
    this.stage.x += this.reducedMotion ? 0 : offset;
  }
  public destroy(): void {
    this.bursts.destroy();
    this.wall.destroy();
    this.stage.destroy(true);
    this.backdrop.destroy();
  }
}
