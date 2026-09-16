import type Phaser from 'phaser';
import { STYLE } from '@/config/style';
import { reducedMotion } from '@/core/motionPreference';
import type { Viewport } from '@/core/Viewport';
import type { Phase } from '@/game/RoundController';
import type { RoundPlan } from '@/rhythm/RhythmScheduler';
import type { Judgement } from '@/rhythm/judge';
import { Backdrop } from '@/ui/backdrop';
import { mix, shade } from '@/ui/colour';
import { faces } from '@/ui/light';
import type { Vignette } from './Vignette';
import { isPlayerTurn, TURN_OPEN_SEC } from './motion';
import {
  acceptDemoBeat, clamp01, easeOut, PAPER_CONTOURS, paperCutPoint, paperHandoff, paperOutcome, paperReveal,
  paperShape, scissorOpening, type PaperOutcome, type PaperPoint, type PaperShape,
} from './paperMotion';

export const CRAFT = {
  paper: 0xeee8d8, ink: 0x30493f, mat: 0x8fa996, grid: 0xb9cbb5, edge: 0x5d7c69,
  coral: 0xcf5134, steel: 0xc7d4d2, steelLight: 0xf5f4e7, steelDark: 0x79908a,
  star: 0xf0ce7e, heart: 0xf29c87, angel: 0xfff1d7,
} as const;

const MAT = { left: -346, top: -258, width: 692, height: 536 } as const;
const FOLD = { top: -194, bottom: 194, width: 194 } as const;
const PAPER_OFFSET = -65;
const CUT_FULL = 0.88;

function polygon(g: Phaser.GameObjects.Graphics, points: readonly PaperPoint[], fill: number, outline = 0, alpha = 1): void {
  if (!points.length) return;
  g.fillStyle(fill, alpha).beginPath().moveTo(points[0]!.x, points[0]!.y);
  for (const p of points.slice(1)) g.lineTo(p.x, p.y);
  g.closePath().fillPath();
  if (outline > 0) g.lineStyle(outline, shade(fill, -0.56), alpha).strokePath();
}

/** Folded paper is cut along a real half-silhouette; opening the fold supplies its other half. */
export class ScissorsPaperVignette implements Vignette {
  private readonly backdrop: Backdrop;
  private readonly stage: Phaser.GameObjects.Container;
  private readonly mat: Phaser.GameObjects.Graphics;
  private readonly shadow: Phaser.GameObjects.Graphics;
  private readonly scraps: Phaser.GameObjects.Graphics;
  private readonly paper: Phaser.GameObjects.Container;
  private readonly left: Phaser.GameObjects.Graphics;
  private readonly right: Phaser.GameObjects.Graphics;
  private readonly detail: Phaser.GameObjects.Graphics;
  private readonly glints: Phaser.GameObjects.Graphics;
  private readonly scissors: Phaser.GameObjects.Container;
  private readonly bladeA: Phaser.GameObjects.Graphics;
  private readonly bladeB: Phaser.GameObjects.Graphics;
  private readonly contact: Phaser.GameObjects.Graphics;
  private plan: RoundPlan | null = null;
  private phase: Phase = 'idle';
  private shape: PaperShape = 'star';
  private outcome: PaperOutcome = 'fail';
  private progress = 0;
  private progressFrom = 0;
  private progressAt = -100;
  private hitCount = 0;
  private demoCount = 0;
  /** Demo travel along the fold, eased back to the start as the player's turn opens. */
  private handoffFrom = 0;
  private mistakes = 0;
  private lastDemo = -Infinity;
  private strikeAt = -100;
  private judderAt = -100;
  private respondAt = -100;
  private finishAt: number | null = null;
  private finished = false;
  private lastNow = 0;
  private baseX = 0;
  private baseY = 0;
  private scale = 1;
  private chips: { at: number; x: number; y: number; seed: number }[] = [];

  public constructor(scene: Phaser.Scene) {
    this.backdrop = new Backdrop(scene, CRAFT.paper, 0xdfc37f, { glowAt: { x: 0.42, y: 0.43 }, glowAlpha: 0.6 });
    this.stage = scene.add.container(0, 0).setDepth(-10);
    this.mat = scene.add.graphics();
    this.shadow = scene.add.graphics();
    this.scraps = scene.add.graphics();
    this.paper = scene.add.container(PAPER_OFFSET, 0);
    this.left = scene.add.graphics();
    this.right = scene.add.graphics();
    this.detail = scene.add.graphics();
    this.paper.add([this.left, this.right, this.detail]);
    this.glints = scene.add.graphics();
    this.scissors = scene.add.container(0, 0);
    this.bladeA = scene.add.graphics();
    this.bladeB = scene.add.graphics();
    this.drawBlade(this.bladeA, -1);
    this.drawBlade(this.bladeB, 1);
    const hinge = scene.add.graphics();
    hinge.fillStyle(CRAFT.ink).fillCircle(0, 0, 13);
    hinge.fillStyle(CRAFT.steelLight).fillCircle(-1, -2, 9);
    hinge.lineStyle(3, CRAFT.steelDark).lineBetween(-5, -5, 3, 3);
    this.scissors.add([this.bladeA, this.bladeB, hinge]);
    this.contact = scene.add.graphics();
    this.stage.add([this.mat, this.shadow, this.scraps, this.paper, this.glints, this.scissors, this.contact]);
  }

  private drawBlade(g: Phaser.GameObjects.Graphics, side: number): void {
    const line = STYLE.current.outline * 1.05;
    const steel = side < 0 ? CRAFT.steelDark : CRAFT.steel;
    polygon(g, [{ x: -148, y: 0 }, { x: -116, y: -12 }, { x: -16, y: -15 }, { x: 15, y: -7 },
      { x: 19, y: 7 }, { x: -127, y: 7 }], steel, line);
    polygon(g, [{ x: -138, y: 2 }, { x: -20, y: 2 }, { x: -20, y: 7 }, { x: -127, y: 7 }], CRAFT.steelLight);
    g.lineStyle(2, CRAFT.steelLight, 0.8).lineBetween(-110, -10, -25, -12);
    const handle = faces(CRAFT.coral);
    g.lineStyle(21 + line, handle.edge).lineBetween(10, 0, 45, side * 23);
    g.lineStyle(18, handle.face).lineBetween(10, 0, 45, side * 23);
    // True open loops: the paper and mat remain visible through both finger holes.
    g.lineStyle(18 + line, handle.edge).strokeEllipse(73, side * 26, 70, 56);
    g.lineStyle(17, handle.face).strokeEllipse(73, side * 26, 70, 56);
    g.lineStyle(4, handle.rim, 0.8).beginPath().arc(73, side * 26, 30, Math.PI * 1.15, Math.PI * 1.8).strokePath();
  }

  public layout(viewport: Viewport): void {
    const { safe } = viewport;
    const uiScale = Math.min(safe.width / 720, safe.height / 1150);
    const top = safe.top + 320 * uiScale, bottom = safe.bottom - 330 * uiScale;
    this.scale = Math.min(safe.width / 790, safe.height / 1210, (bottom - top) / (MAT.height + 21));
    this.baseX = safe.centerX;
    this.baseY = Math.max(top - MAT.top * this.scale, Math.min(safe.top + safe.height * 0.53, bottom - (MAT.top + MAT.height + 21) * this.scale));
    this.stage.setPosition(this.baseX, this.baseY).setScale(this.scale);
    this.backdrop.layout(viewport);
    const g = this.mat.clear(), f = faces(CRAFT.mat), line = STYLE.current.outline;
    g.fillStyle(CRAFT.ink, 0.12).fillRoundedRect(MAT.left + 10, MAT.top + 21, MAT.width, MAT.height, 28);
    g.fillStyle(f.shade).fillRoundedRect(MAT.left, MAT.top + 9, MAT.width, MAT.height, 26);
    g.fillStyle(f.face).fillRoundedRect(MAT.left, MAT.top, MAT.width, MAT.height, 26);
    g.lineStyle(line * 0.7, CRAFT.edge).strokeRoundedRect(MAT.left, MAT.top, MAT.width, MAT.height, 26);
    g.lineStyle(2, CRAFT.grid, 0.35);
    for (let x = -310; x <= 310; x += 31) g.lineBetween(x, -232, x, 250);
    for (let y = -226; y <= 240; y += 31) g.lineBetween(-322, y, 322, y);
    g.lineStyle(3, CRAFT.grid, 0.65).strokeRoundedRect(-322, -234, 644, 484, 12);
    // A cutting mat's small measurement ticks, kept away from the paper silhouette.
    g.lineStyle(2, CRAFT.ink, 0.45);
    for (let i = 0; i < 31; i++) {
      const x = -300 + i * 20;
      g.lineBetween(x, 250, x, i % 5 === 0 ? 237 : 244);
    }
  }

  public reset(plan: RoundPlan): void {
    this.plan = plan;
    this.shape = paperShape(plan.id);
    this.phase = 'prepare';
    this.outcome = 'fail';
    this.progress = this.progressFrom = this.hitCount = this.demoCount = this.handoffFrom = this.mistakes = 0;
    this.strikeAt = this.judderAt = this.progressAt = this.respondAt = -100;
    this.lastDemo = -Infinity;
    this.finishAt = null;
    this.finished = false;
    this.chips = [];
  }

  public onPhase(phase: Phase, now: number): void {
    this.phase = phase;
    if (phase === 'respond') {
      this.respondAt = now;
      this.handoffFrom = clamp01(this.demoCount / Math.max(1, this.plan?.targets.length ?? 4)) * CUT_FULL;
    }
  }

  public onDemonstrationBeat(time: number): void {
    const accepted = acceptDemoBeat(this.lastDemo, time);
    if (accepted === null) return;
    this.lastDemo = accepted;
    this.demoCount++;
    this.strikeAt = time;
    // Only the scissors perform. The player receives an intact fold, with no reset gap.
  }

  public onPlayerHit(now: number): void {
    if (isPlayerTurn(this.phase)) this.strikeAt = now;
  }

  public onAccuracy(result: Judgement, now: number): void {
    if (result.kind === 'hit') {
      this.progressFrom = this.currentProgress(now);
      this.hitCount++;
      this.progress = Math.min(CUT_FULL, this.hitCount / (this.plan?.targets.length ?? 4) * CUT_FULL);
      this.progressAt = now;
      const p = paperCutPoint(this.shape, this.progress);
      this.chips.push({ at: now, x: p.x + PAPER_OFFSET, y: p.y, seed: this.hitCount * 13 });
    } else {
      this.mistakes = Math.min(12, this.mistakes + 1);
      this.judderAt = now;
    }
  }

  public finish(successful: boolean, contactSec: number, accuracy = successful ? 100 : 0): void {
    this.outcome = paperOutcome(accuracy);
    this.finishAt = contactSec;
  }

  public pause(): void { this.phase = 'paused'; }
  private currentProgress(now: number): number { return this.progressFrom + (this.progress - this.progressFrom) * easeOut((now - this.progressAt) / 0.12); }

  public update(now: number): void {
    if (this.phase === 'paused') now = this.lastNow; else this.lastNow = now;
    const still = reducedMotion();
    this.stage.setPosition(this.baseX, this.baseY);
    this.backdrop.open(isPlayerTurn(this.phase) || this.phase === 'result' ? easeOut((now - this.respondAt) / TURN_OPEN_SEC) : 0);
    const demo = this.phase === 'prepare' || this.phase === 'demonstrate';
    if (demo) for (const cue of this.plan?.cues ?? []) if (cue.kind === 'action' && cue.time <= now) this.onDemonstrationBeat(cue.time);
    const age = this.finishAt === null ? -1 : now - this.finishAt;
    if (age >= 0 && !this.finished) {
      this.finished = true;
      this.strikeAt = this.finishAt!;
      for (let i = 0; i < 6; i++) this.chips.push({ at: this.finishAt!, x: PAPER_OFFSET + 40 + i * 23, y: -150 + i * 53, seed: 41 + i * 17 });
    }
    const reveal = paperReveal(age, this.outcome, this.shape, still);
    const demoProgress = clamp01(this.demoCount / Math.max(1, this.plan?.targets.length ?? 4)) * CUT_FULL;
    const progress = demo
      ? demoProgress
      : this.hitCount > 0 || this.progress > 0
        ? this.currentProgress(now)
        : paperHandoff(this.handoffFrom, now - this.respondAt);
    this.drawPaper(now, age, reveal.open, reveal.crumple);
    const wobble = still ? 0 : Math.sin((now - this.judderAt) * 60) * Math.exp(-Math.max(0, now - this.judderAt) * 15) * 5;
    this.paper.setPosition(PAPER_OFFSET * (1 - reveal.open) + wobble, -reveal.lift + reveal.drop)
      .setRotation(reveal.tilt).setScale(1 - reveal.crumple * 0.55, 1 - reveal.crumple * 0.7);
    const breathe = !still && age >= 0 && this.outcome === 'success' && this.shape === 'heart'
      ? Math.sin(Math.min(1, age / 0.9) * Math.PI * 2) * Math.exp(-age * 2) * 0.035 : 0;
    this.paper.scaleX += breathe; this.paper.scaleY += breathe;
    this.drawShadow(reveal.open, reveal.lift, reveal.crumple);
    this.drawScraps(now, still);
    this.drawScissors(now, age, progress, demo, still);
    this.drawGlints(age, reveal.open, still);
  }

  private drawPaper(now: number, age: number, open: number, crumple: number): void {
    const right = this.right.clear(), left = this.left.clear(), d = this.detail.clear();
    const colour = CRAFT[this.shape], line = STYLE.current.outline * 0.8;
    const unfolding = age >= 0;
    const contour = PAPER_CONTOURS[this.shape];
    const rectangle = [{ x: 0, y: FOLD.top }, { x: FOLD.width, y: FOLD.top + 3 }, { x: FOLD.width, y: FOLD.bottom }, { x: 0, y: FOLD.bottom }];
    const ragged = [{ x: 0, y: -180 }, { x: 151, y: -171 }, { x: 113, y: -101 }, { x: 172, y: -72 },
      { x: 119, y: -23 }, { x: 178, y: 31 }, { x: 116, y: 94 }, { x: 151, y: 151 }, { x: 0, y: 176 }];
    const points = unfolding ? this.outcome === 'fail' ? ragged : contour : rectangle;
    polygon(right, points.map(p => ({ x: p.x + 3, y: p.y + 6 })), shade(colour, -0.3), line * 0.6);
    polygon(right, points, colour, line);
    if (unfolding) {
      const leftPoints = this.outcome === 'partial'
        ? contour.map((p, i) => ({ x: p.x + (i > contour.length * 0.55 && p.x > 0 ? (i % 2 ? 25 : -15) : 0), y: p.y })) : points;
      polygon(left, leftPoints, mix(shade(colour, -0.22), colour, open), line);
    }
    left.setScale(-Math.max(0.001, open), 1).setVisible(unfolding);
    if (!unfolding) {
      // A pencil template underneath the cut. Only judged hits turn it into an incision.
      d.lineStyle(2, CRAFT.ink, 0.4);
      for (let i = 0; i < 40; i += 2) {
        const a = paperCutPoint(this.shape, i / 40), b = paperCutPoint(this.shape, (i + 1) / 40);
        d.lineBetween(a.x, a.y, b.x, b.y);
      }
      const progress = this.currentProgress(now);
      if (progress > 0) {
        d.lineStyle(4, shade(colour, -0.48)).beginPath();
        for (let i = 0; i <= 30; i++) { const p = paperCutPoint(this.shape, progress * i / 30); d[i === 0 ? 'moveTo' : 'lineTo'](p.x, p.y); }
        d.strokePath();
      }
      d.lineStyle(3, shade(colour, -0.22), 0.8).lineBetween(7, FOLD.top + 10, 7, FOLD.bottom - 10);
      d.lineStyle(2, 0xfff8e7, 0.8).lineBetween(11, FOLD.top + 10, 11, FOLD.bottom - 10);
      for (let i = 0; i < this.mistakes; i++) {
        const y = -136 + i * 25;
        d.lineStyle(3, shade(colour, -0.45), 0.8).lineBetween(194, y, 179 - i % 3 * 8, y + 9);
      }
    } else if (this.outcome === 'fail') {
      d.lineStyle(3, shade(colour, -0.4), crumple);
      for (let i = 0; i < 7; i++) d.beginPath().moveTo(0, -155 + i * 48).lineTo(89 + i % 3 * 23, -121 + i * 41).lineTo(32, -85 + i * 41).strokePath();
      polygon(d, [{ x: 22, y: -88 }, { x: 141, y: -64 }, { x: 76, y: 35 }], shade(colour, -0.2), 0, crumple * 0.65);
    } else {
      const alpha = easeOut(age / 0.5);
      d.lineStyle(2, shade(colour, -0.26), 0.42 * alpha).lineBetween(0, contour[0]!.y + 18, 0, contour.at(-1)!.y - 12);
      d.lineStyle(2, 0xfffae9, 0.65 * alpha).lineBetween(3, contour[0]!.y + 22, 3, contour.at(-1)!.y - 16);
      if (this.shape === 'star') {
        for (const p of [contour[0]!, contour[2]!, contour[4]!]) {
          d.lineStyle(2, shade(colour, -0.18), 0.55 * alpha).lineBetween(0, 0, p.x * 0.83, p.y * 0.83);
          d.lineBetween(0, 0, -p.x * open * 0.83, p.y * 0.83);
        }
      } else if (this.shape === 'heart') {
        d.lineStyle(6, 0xffe3c9, 0.8 * alpha).beginPath().moveTo(47, -104).lineTo(70, -125).lineTo(92, -131).strokePath();
      } else {
        // Feather scores, a pleated gown and a little golden halo make the angel legible at phone size.
        for (const side of [-open, 1]) {
          for (let i = 0; i < 3; i++) {
            d.lineStyle(3, shade(colour, -0.28), 0.65 * alpha).beginPath().moveTo(48 * side, -61)
              .lineTo((88 + i * 24) * side, -72 - i * 19).lineTo((115 + i * 19) * side, -104 - i * 13).strokePath();
          }
          d.lineStyle(2.5, shade(colour, -0.22), 0.65 * alpha).lineBetween(28 * side, -19, 76 * side, 136);
        }
        d.lineStyle(5, 0xc9963b, alpha).strokeEllipse(0, -202, 61, 16);
        d.lineStyle(2, 0xffecc0, alpha).strokeEllipse(0, -204, 59, 14);
      }
      if (this.outcome === 'partial') {
        // The missed cut leaves an attached, folded flap instead of a flawless silhouette.
        polygon(d, [{ x: -62 * open, y: 46 }, { x: -178 * open, y: 99 }, { x: -104 * open, y: 169 }, { x: -38 * open, y: 121 }], shade(colour, -0.15), line);
        d.lineStyle(3, shade(colour, -0.4), 0.8).lineBetween(-62 * open, 46, -38 * open, 121);
      }
    }
  }

  private drawShadow(open: number, lift: number, crumple: number): void {
    const g = this.shadow.clear();
    g.fillStyle(CRAFT.ink, 0.12 - lift / 1000).fillEllipse(PAPER_OFFSET * (1 - open) + 80 * (1 - open), 34 + crumple * 70,
      (210 + open * 190) * (1 - crumple * 0.55), (355 - lift) * (1 - crumple * 0.75));
  }

  private drawScraps(now: number, still: boolean): void {
    const g = this.scraps.clear();
    for (const chip of this.chips.slice(-28)) {
      const age = Math.max(0, now - chip.at), t = Math.min(1, age / 0.7);
      const x = Math.max(-312, Math.min(312, chip.x + (still ? 18 : Math.sin(chip.seed) * t * 95)));
      const y = still ? Math.min(225, chip.y + 24) : Math.min(225, chip.y - Math.sin(t * Math.PI) * 28 + t * t * 180);
      const size = 12 + chip.seed % 11;
      const angle = still ? 0.3 : chip.seed + t * 4;
      const vertices = [{ x: -size, y: -size / 2 }, { x: size, y: -size }, { x: size * 0.4, y: size }]
        .map(p => ({ x: x + p.x * Math.cos(angle) - p.y * Math.sin(angle), y: y + p.x * Math.sin(angle) + p.y * Math.cos(angle) }));
      polygon(g, vertices, CRAFT[this.shape], 1.6);
    }
  }

  private drawScissors(now: number, finishAge: number, progress: number, demo: boolean, still: boolean): void {
    const beat = this.plan ? 60 / this.plan.bpm : 0.5;
    const p = paperCutPoint(this.shape, progress);
    const away = finishAge < 0 ? 0 : easeOut(finishAge / 0.45);
    const next = demo ? this.plan?.cues.find(c => c.kind === 'action' && c.time > now)?.time : undefined;
    let opening = scissorOpening(now - this.strikeAt, beat);
    if (next !== undefined && next - now < beat * 0.22) opening = Math.min(opening, clamp01((next - now) / (beat * 0.22)));
    const angle = opening * 0.32;
    this.bladeA.setRotation(-angle); this.bladeB.setRotation(angle);
    const breathe = still ? 0 : Math.sin(now * 1.7) * 2;
    this.scissors.setPosition(PAPER_OFFSET + p.x + 148 * 0.9 * Math.cos(0.18) + away * 58, p.y + 148 * 0.9 * Math.sin(0.18) + breathe + away * 90)
      .setRotation(0.18 + away * 0.5).setScale(0.9).setAlpha(1 - away);
    const g = this.contact.clear(), age = now - this.strikeAt;
    if (age >= 0 && age < 0.13 && finishAge < 0) {
      const radius = 17 + age * 80;
      g.lineStyle(3, 0xfff7df, 1 - age / 0.13);
      for (let i = 0; i < 3; i++) {
        const a = -2.2 + i * 0.9;
        g.lineBetween(PAPER_OFFSET + p.x + Math.cos(a) * radius, p.y + Math.sin(a) * radius,
          PAPER_OFFSET + p.x + Math.cos(a) * (radius + 12), p.y + Math.sin(a) * (radius + 12));
      }
    }
  }

  private drawGlints(age: number, open: number, still: boolean): void {
    const g = this.glints.clear();
    if (age < 0 || this.outcome !== 'success') return;
    const alpha = easeOut((age - 0.36) / 0.22);
    const drift = still ? 0 : Math.sin(age * 5) * Math.exp(-age) * 9;
    const points = this.shape === 'star' ? [[-215, -128], [210, -77], [148, 167]]
      : this.shape === 'heart' ? [[-201, -103], [204, -137], [-146, 124]] : [[-204, -152], [207, -128], [165, 103]];
    for (const [x, y] of points) {
      const size = (this.shape === 'star' ? 16 : 11) * open;
      const cy = y! + drift;
      polygon(g, [{ x: x!, y: cy - size }, { x: x! + size * 0.25, y: cy - size * 0.25 }, { x: x! + size, y: cy },
        { x: x! + size * 0.25, y: cy + size * 0.25 }, { x: x!, y: cy + size }, { x: x! - size * 0.25, y: cy + size * 0.25 },
        { x: x! - size, y: cy }, { x: x! - size * 0.25, y: cy - size * 0.25 }], 0xfff8db, 0, alpha);
    }
  }

  public translate(offset: number): void { this.stage.x += reducedMotion() ? 0 : offset; }
  public destroy(): void { this.stage.destroy(true); this.backdrop.destroy(); }
}
