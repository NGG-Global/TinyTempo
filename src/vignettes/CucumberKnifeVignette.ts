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
  clamp01,
  clipLeft,
  cucumberBody,
  cucumberHalfAt,
  CUCUMBER_MOTION,
  cucumberTiming,
  cutAt,
  cutFraction,
  cutStart,
  easeOut,
  juiceFall,
  knifeLift,
  knifeWindup,
  REFERENCE_BEAT,
  sliceTumble,
} from './cucumberMotion';
import { isPlayerTurn, TURN_OPEN_SEC } from './motion';

/**
 * A cool tiled kitchen. The cucumber is the only saturated green in it, so it is the
 * subject — away from Window's glass, Bug's sage and Curl's teal tank.
 */
export const CRISP = {
  paper: 0xf1f5f3,
  ink: 0x2c4038,
  grout: 0xb7c9c4,
  counter: 0x8aa198,
  board: 0xddd0a8,
  boardEdge: 0xb08d58,
  boardLine: 0xc9b47e,
  skin: 0x4c8848,
  skinLit: 0x77a85d,
  stripe: 0x93bd75,
  blossom: 0xf0c35a,
  flesh: 0xeef6d4,
  fleshRing: 0xd4e8a4,
  gel: 0xc5d86a,
  seed: 0x6a7a32,
  stem: 0x3a5c32,
  stemLit: 0x5a7c48,
  steel: 0xd3dadd,
  steelLit: 0xf4f7f8,
  steelDark: 0x9aa5aa,
  handle: 0x2b2b30,
  rivet: 0xb9c2c6,
} as const;

const BOARD_LEFT = KITCHEN_BOARD.left;
const BOARD_RIGHT = KITCHEN_BOARD.right;
const BOARD_THICK = KITCHEN_BOARD.thickness;
const CX = CUCUMBER_MOTION.x;
const RX = CUCUMBER_MOTION.radiusX;
const RY = CUCUMBER_MOTION.radiusY;
// Coins come off the flower end and lean in a pile to the right of the remaining fruit.
const PILE_X = 186;
const PILE_STEP = 22;
const SLICE_R = 58;
const LEAN = 0.38;
const ARC_STEPS = 28;
const JUICE_DROPS = 8;

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

/** Owns an illustration and its motion. Judgement arrives already decided; it is never computed here. */
export class CucumberKnifeVignette implements Vignette {
  private readonly backdrop: Backdrop;
  private readonly wall: Phaser.GameObjects.Graphics;
  private readonly boardSurface: Phaser.GameObjects.TileSprite;
  private readonly bursts: Feedback;
  private readonly stage: Phaser.GameObjects.Container;
  private readonly boardG: Phaser.GameObjects.Graphics;
  private readonly produce: Phaser.GameObjects.Container;
  private readonly cucumberG: Phaser.GameObjects.Graphics;
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
  private sliceWobble: number[] = [];
  private cut = 0;
  private cutFrom = 0;
  private cutTo = 0;
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
    this.backdrop = new Backdrop(scene, CRISP.paper, CRISP.board, { glowAt: { x: 0.42, y: 0.42 }, glowAlpha: 0.4 });
    this.wall = scene.add.graphics().setDepth(-20);
    this.stage = scene.add.container(0, 0).setDepth(-10);
    this.boardG = scene.add.graphics();
    this.boardSurface = scene.add
      .tileSprite(BOARD_LEFT, 0, BOARD_RIGHT - BOARD_LEFT, BOARD_THICK, MaterialKey.wood)
      .setOrigin(0)
      .setTint(CRISP.board)
      .setAlpha(0.18 * STYLE.current.grain);
    this.boardSurface.setTileScale(0.3, 0.3);
    this.produce = scene.add.container(0, 0);
    this.cucumberG = scene.add.graphics();
    this.slicesG = scene.add.graphics();
    this.marks = scene.add.graphics();
    this.juice = scene.add.graphics();
    this.produce.add([this.marks, this.cucumberG, this.slicesG, this.juice]);
    this.knife = scene.add.container(0, 0);
    this.knife.add(this.drawKnife(scene));
    this.rings = scene.add.graphics();
    this.stage.add([this.boardG, this.boardSurface, this.produce, this.rings, this.knife]);
    this.bursts = new Feedback(scene, -10, this.stage);
    this.cut = this.cutFrom = this.cutTo = cutStart();
  }

  private drawKnife(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
    return kitchenKnife(scene, 0x355d59);
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
    bg.lineStyle(2 * this.scale, CRISP.grout, 0.55);
    for (let y = counterY - tile; y > full.y - tile; y -= tile) bg.lineBetween(full.x, y, full.right, y);
    for (let x = this.baseX % tile; x < full.right + tile; x += tile) bg.lineBetween(x, full.y, x, counterY);
    bg.fillStyle(CRISP.counter, 0.35).fillRect(full.x, counterY, full.width, full.bottom - counterY);
    bg.fillStyle(CRISP.ink, 0.08).fillRect(full.x, counterY, full.width, 6 * this.scale);
    kitchenBoard(this.boardG, CRISP.board, CRISP.boardEdge);
  }

  public reset(plan: RoundPlan): void {
    this.plan = plan;
    this.phase = 'prepare';
    this.lastDemo = -Infinity;
    this.strikes = this.slices = 0;
    this.strikeAt = -100;
    this.strikeX = cutStart();
    this.respondAt = -100;
    this.sliceAt = [];
    this.sliceFrom = [];
    this.sliceWobble = [];
    this.cut = this.cutFrom = this.cutTo = cutStart();
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
    this.cutFrom = this.cut;
    this.cutTo = cutAt(clamp01(fraction));
    this.cutAt = now;
  }

  private strike(now: number): void {
    this.strikes++;
    this.strikeAt = now;
    this.strikeX = this.cutTo;
  }

  private takeSlice(now: number, targets: number): void {
    if (!this.reducedMotion) this.bursts.burst('water', this.cutTo, -RY, [CRISP.flesh, CRISP.gel, CRISP.fleshRing], 7);
    this.sliceAt.push(now);
    this.sliceFrom.push(this.cutTo);
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
      this.strikeX = this.cutTo + 96 + this.nicks.length * 12;
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
    this.cut = this.cutFrom + (this.cutTo - this.cutFrom) * easeOut((now - this.cutAt) / 0.09);
    if (this.finishAt !== null && now >= this.finishAt && !this.finished) {
      this.finished = true;
      this.strike(this.finishAt);
      this.slices++;
      this.sliceAt.push(this.finishAt);
      this.sliceFrom.push(this.cutTo);
      this.sliceWobble.push(this.successful ? 0 : 0.5);
      this.setCut(1, this.finishAt);
      if (!this.successful) this.uneven = Math.max(this.uneven, 0.6);
    }
    const beat = this.beat();
    const age = now - this.strikeAt;
    const press = age >= 0 && age < 0.14 ? Math.sin((age / 0.14) * Math.PI) * STYLE.current.exaggeration : 0;
    const shake =
      this.reducedMotion || age < 0 || age > 0.16
        ? 0
        : Math.sin(age * 120) * Math.exp(-age * 24) * 1.8 * STYLE.current.exaggeration;
    this.stage.setPosition(this.baseX + shake * this.scale, this.baseY + shake * this.scale * 0.5);
    this.produce.setPosition(0, this.reducedMotion ? 0 : press * 1.2);
    this.poseKnife(now, beat, age);
    this.drawCucumber();
    this.drawSlices(now, beat);
    this.drawMarks();
    this.drawJuice(beat, age);
    this.drawRings(age);
  }

  private poseKnife(now: number, beat: number, age: number): void {
    const parked = age > 0.5 && (this.phase === 'idle' || this.phase === 'prepare');
    let lift = knifeLift(age, beat);
    const next = this.upcoming(now);
    if (next !== null && next - now < cucumberTiming(beat).windupSec) lift = knifeWindup(next - now, lift, beat);
    let tremble = 0;
    if (now - this.judderAt < 0.24 && !this.finished) {
      tremble = Math.sin((now - this.judderAt) * 92) * Math.exp(-(now - this.judderAt) * 12) * 0.035;
    }
    let x = this.strikeX + 6;
    if (parked) {
      lift = 1;
      x = this.cutTo - 22;
      if (!this.reducedMotion) lift += Math.sin(now * 1.6) * 0.02;
    }
    this.knife.setPosition(x, -lift * CUCUMBER_MOTION.lift);
    this.knife.setRotation(-0.12 - 0.42 * Math.min(1.12, lift) + tremble);
  }

  /** Long tonal ridges, restrained pores and a moist, dimensional cut face. */
  private drawCucumber(): void {
    const g = this.cucumberG.clear();
    const pts = cucumberBody(this.cut, 48);
    if (pts.length < 6) return;
    const half = cucumberHalfAt(this.cut);
    const left = CX - RX;
    g.fillStyle(CRISP.ink, 0.12);
    fan(g, disc((left + this.cut) / 2 + 4, 5, Math.max(0, (this.cut - left) / 2), 10, 0));
    paintedContour(g, pts, CRISP.skin, 0x304d33, STYLE.current.outline);
    // All bands are clipped with the fruit; there are no floating highlights at a late cut.
    const ribbon = (y: number, w: number, colour: number): void => {
      const p = cubicContour(left + 17, -RY, [
        [left + 44, y, CX + 75, y, CX + RX - 15, -RY],
        [CX + 75, y + w, left + 44, y + w, left + 17, -RY],
      ]);
      g.fillStyle(colour);
      fan(g, clipLeft(p, this.cut));
    };
    ribbon(-123, 24, CRISP.skinLit);
    ribbon(-118, 7, CRISP.stripe);
    ribbon(-77, 9, 0x73a55b);
    ribbon(-35, 17, 0x396b3e);
    g.fillStyle(0xb4ce93, 0.55);
    for (let i = 0; i < 24; i++) {
      const x = left + 50 + ((i * 67) % 390);
      const y = -113 + ((i * 31) % 85);
      if (x > this.cut - 16) continue;
      const h = cucumberHalfAt(x);
      if (Math.abs(y + RY) > h - 12) continue;
      g.fillEllipse(x, y, 3.5, 5, 8);
    }
    if (half > 4 && this.cut < CX + RX - 2) {
      const a = Math.min(19, half * 0.3);
      paintedContour(g, disc(this.cut, -RY, a, half, 0), CRISP.flesh, 0x406638, 4);
      g.fillStyle(CRISP.fleshRing);
      fan(g, disc(this.cut + 1, -RY, a * 0.7, half * 0.78, 0));
      g.fillStyle(CRISP.gel, 0.7);
      fan(g, disc(this.cut + 2, -RY, a * 0.43, half * 0.58, 0));
      g.fillStyle(0xf5f3ca);
      for (const offset of [-0.38, 0, 0.38]) g.fillEllipse(this.cut + 3, -RY + half * offset, 4, 9, 8);
    }
    if (this.cut > left + 24) {
      paintedContour(
        g,
        cubicContour(left + 9, -RY - 10, [
          [left - 3, -RY - 15, left - 12, -RY - 12, left - 16, -RY - 18],
          [left - 24, -RY - 17, left - 22, -RY - 3, left - 16, -RY + 1],
          [left - 8, -RY + 7, left + 4, -RY + 8, left + 9, -RY + 5],
          [left + 12, -RY, left + 12, -RY - 6, left + 9, -RY - 10],
        ]),
        CRISP.stem,
        0x304d33,
        3,
      );
    }
    if (this.cut > CX + RX - 2) {
      g.lineStyle(4, 0x827240).lineBetween(CX + RX - 1, -RY - 4, CX + RX + 9, -RY + 2);
      g.fillStyle(CRISP.blossom).fillEllipse(CX + RX + 11, -RY, 10, 7);
    }
  }

  /** Each slice is a round coin that topples from the cut and leans on the last one. */
  private drawSlices(now: number, beat: number): void {
    const g = this.slicesG.clear();
    for (let i = 0; i < this.sliceAt.length; i++) {
      const p = sliceTumble(now - this.sliceAt[i]!, beat);
      const wobble = this.sliceWobble[i] ?? 0;
      const restX = PILE_X + i * Math.min(PILE_STEP, 140 / Math.max(1, this.sliceAt.length - 1));
      const restLean = LEAN + wobble * 0.5;
      const squash = this.finished && !this.successful && i === this.sliceAt.length - 1 ? 0.55 : 1;
      const x = this.sliceFrom[i]! + (restX - this.sliceFrom[i]!) * p;
      const lean = restLean * p;
      const b = SLICE_R * squash;
      const a = 5 + (SLICE_R - 5) * Math.sin((Math.min(1, p) * Math.PI) / 2);
      const restY = -Math.hypot(a * Math.sin(lean), b * Math.cos(lean)) - 2;
      const cy = -RY + (restY + RY) * p;
      g.fillStyle(CRISP.ink, 0.1);
      fan(g, disc(x + 8, 6, a * 0.9 + 6, 10, 0));
      // A shaded rind sidewall makes each coin a slice, not a flat target.
      paintedContour(g, disc(x - 8 * p, cy + 2, a, b, lean), 0x376941, 0x304d33, STYLE.current.outline * 0.75);
      paintedContour(g, disc(x, cy, a, b, lean), CRISP.skin, 0x304d33, STYLE.current.outline * 0.65);
      g.fillStyle(CRISP.flesh);
      fan(g, disc(x, cy, a * 0.88, b * 0.88, lean));
      g.fillStyle(CRISP.fleshRing);
      fan(g, disc(x, cy, a * 0.72, b * 0.72, lean));
      if (a > 18) {
        for (let chamber = 0; chamber < 3; chamber++) {
          const t = (chamber * Math.PI * 2) / 3 - 0.5;
          const ox = Math.cos(t) * a * 0.27,
            oy = Math.sin(t) * b * 0.27;
          const gx = x + ox * Math.cos(lean) - oy * Math.sin(lean);
          const gy = cy + ox * Math.sin(lean) + oy * Math.cos(lean);
          g.fillStyle(CRISP.gel, 0.65);
          fan(g, disc(gx, gy, a * 0.26, b * 0.3, lean + t));
          for (let seed = 0; seed < 2; seed++) {
            const st = t + (seed ? -0.3 : 0.3);
            const sx = Math.cos(st) * a * 0.36,
              sy = Math.sin(st) * b * 0.36;
            g.fillStyle(0xf7f4ce);
            fan(
              g,
              disc(
                x + sx * Math.cos(lean) - sy * Math.sin(lean),
                cy + sx * Math.sin(lean) + sy * Math.cos(lean),
                3.5,
                7,
                lean + t,
              ),
            );
          }
        }
        g.lineStyle(2, 0xffffff, 0.55);
        traceContour(g, disc(x, cy, a * 0.79, b * 0.79, lean).slice(2, 18));
        g.strokePath();
      }
    }
  }

  private drawMarks(): void {
    const g = this.marks.clear();
    for (const x of this.nicks) {
      g.lineStyle(3, CRISP.boardEdge, 0.7).lineBetween(x - 28, 5, x + 30, 5);
      g.lineStyle(1.5, CRISP.ink, 0.25).lineBetween(x - 22, 7, x + 26, 7);
    }
  }

  private drawJuice(beat: number, age: number): void {
    const g = this.juice.clear();
    const { juiceSec } = cucumberTiming(beat);
    if (age < 0 || age > juiceSec || this.sliceAt.length === 0) return;
    if (Math.abs((this.sliceAt[this.sliceAt.length - 1] ?? -100) - this.strikeAt) > 0.001) return;
    const fall = juiceFall(age, beat);
    const spread = easeOut(age / juiceSec) * 80;
    const life = 1 - age / juiceSec;
    for (let i = 0; i < JUICE_DROPS; i++) {
      const seed = (i * 29 + 7) % 17;
      const x = this.strikeX + (seed / 17 - 0.5) * spread * 1.4;
      const y = -RY - 12 - Math.sin(i * 1.9) * spread * 0.5 + fall * (0.7 + seed / 34);
      g.fillStyle(i % 3 ? CRISP.flesh : CRISP.gel, life * 0.85);
      g.fillEllipse(x, y, 4 + (seed % 3), 7 + (seed % 4), 6);
    }
  }

  private drawRings(age: number): void {
    const g = this.rings.clear();
    if (age < 0 || age > 0.2) return;
    const p = age / 0.2;
    g.lineStyle(3, CRISP.paper, 1 - p).strokeEllipse(this.strikeX + 60, 3, 150 + p * 160, 12 + p * 18);
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
