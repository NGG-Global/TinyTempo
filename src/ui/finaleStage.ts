import Phaser from 'phaser';
import { STYLE } from '../config/style';
import { SHELL } from '../config/theme';
import { FINALE_COPY, type AreaFinale, type FinaleTreatment } from '../game/finale';
import { drawRopes } from './chrome';
import { shade } from './colour';
import type { Feedback } from './feedback';
import { faces } from './light';
import { drawPanel, Rect } from './panel';
import { buntingPoints, pennantSwing, ribbonPose, titleCardPose } from './finalePose';
import { body, display, label, resize } from './type';

/** Design-unit sizes, scaled by the scene's `s`. */
const STAGE = Object.freeze({
  sag: 46,
  pennantEvery: 60,
  pennantWidth: 40,
  pennantLength: 54,
  lanternRadius: 17,
  lanternDrop: 22,
  cardWidth: 560,
  cardHeight: 250,
  ribbonWidth: 600,
  ribbonHeight: 96,
  ribbonTail: 36,
});

/** Where the stage hangs its three pieces, from the scene's own layout. */
export interface FinaleFrame {
  readonly s: number;
  readonly left: number;
  readonly right: number;
  readonly centerX: number;
  /** The top of the safe frame: the card's ropes run up to it. */
  readonly ceiling: number;
  /** Where the pennant line is tied at both edges. */
  readonly lineY: number;
  /** The title card's centre at rest. */
  readonly cardY: number;
  /** The payoff ribbon's centre. */
  readonly ribbonY: number;
}

/**
 * Everything a finale adds to the stage, drawn from one `FinaleTreatment`: the pennants
 * strung over the act for the whole level, the title card that hangs in the opening
 * lead-in, and the "Area complete" ribbon over the result plaque. PlayScene tells it what
 * happened and when; it decides nothing about the level. A new area's finale is a new
 * treatment in `game/finale.ts`, and a new motif is one more case in `drawLine`.
 *
 * Like the plaque, each piece is a Graphics *and* its Texts, so each is hidden by one
 * method that knows all of them.
 */
export class FinaleStage {
  private readonly treatment: FinaleTreatment;
  private readonly line: Phaser.GameObjects.Graphics;
  private readonly card: Phaser.GameObjects.Graphics;
  private readonly cardEyebrow: Phaser.GameObjects.Text;
  private readonly cardTitle: Phaser.GameObjects.Text;
  private readonly cardStrap: Phaser.GameObjects.Text;
  private readonly ribbon: Phaser.GameObjects.Graphics;
  private readonly ribbonTitle: Phaser.GameObjects.Text;
  private readonly ribbonNext: Phaser.GameObjects.Text;
  private frame: FinaleFrame | null = null;
  private cardFrom = -Infinity;
  private cardUntil = -Infinity;
  private completeAt = -Infinity;
  private cheerAt = -Infinity;
  private burst = false;

  public constructor(scene: Phaser.Scene, finale: AreaFinale, private readonly fx: Feedback) {
    this.treatment = finale.treatment;
    const ink = this.treatment.ribbonInk;
    // Under the room dim (depth 6), so the pennants step back for the player's turn with
    // the rest of the workshop; over the act, whose objects sit at negative depths.
    this.line = scene.add.graphics().setDepth(1);
    this.card = scene.add.graphics().setDepth(13).setVisible(false);
    this.cardEyebrow = label(scene, FINALE_COPY.eyebrow, { size: 24, colour: ink, align: 'center' }).setOrigin(0.5).setDepth(13).setVisible(false);
    this.cardTitle = display(scene, finale.areaName, { size: 84, colour: ink, align: 'center' }).setOrigin(0.5).setDepth(13).setVisible(false);
    this.cardStrap = body(scene, FINALE_COPY.strapline(finale.areaName), { size: 24, colour: ink, align: 'center' }).setOrigin(0.5).setDepth(13).setVisible(false);
    this.ribbon = scene.add.graphics().setDepth(10).setVisible(false);
    this.ribbonTitle = label(scene, FINALE_COPY.complete, { size: 32, colour: ink, align: 'center' }).setOrigin(0.5).setDepth(11).setVisible(false);
    this.ribbonNext = body(scene, FINALE_COPY.next(finale.nextAreaName), { size: 20, colour: ink, align: 'center' }).setOrigin(0.5).setDepth(11).setVisible(false);
  }

  public layout(frame: FinaleFrame): void {
    this.frame = frame;
    const s = frame.s, ink = this.treatment.ribbonInk;
    resize(this.cardEyebrow, 24 * s, ink, STYLE.current, false);
    resize(this.cardTitle, 84 * s, ink);
    resize(this.cardStrap, 24 * s, ink, STYLE.current, false);
    resize(this.ribbonTitle, 32 * s, ink, STYLE.current, false);
    resize(this.ribbonNext, 20 * s, ink, STYLE.current, false);
    // A long area name ("Pavement VIII") is shrunk to the card rather than run off it.
    const room = this.cardWidth() - 56 * s;
    if (this.cardTitle.width > room) resize(this.cardTitle, 84 * s * room / this.cardTitle.width, ink);
  }

  /** The title card, from the opening's first beat until it must be out of the way. */
  public showTitle(from: number, until: number): void {
    this.cardFrom = from;
    this.cardUntil = until;
  }

  /** The level cleared: the pennants cheer and the ribbon unrolls over the plaque. */
  public showComplete(at: number): void {
    this.completeAt = at;
    this.cheerAt = at;
    this.burst = false;
  }

  /** A fresh attempt: no card, no ribbon, pennants at rest. */
  public reset(): void {
    this.cardFrom = this.cardUntil = this.completeAt = this.cheerAt = -Infinity;
    this.burst = false;
    this.hideCard();
    this.hideRibbon();
  }

  public update(now: number, still: boolean): void {
    const frame = this.frame;
    if (!frame) return;
    this.drawLine(frame, now, still);
    this.drawCard(frame, now, still);
    this.drawRibbon(frame, now, still);
  }

  private cardWidth(): number {
    const f = this.frame!;
    return Math.min(STAGE.cardWidth * f.s, f.right - f.left - 48 * f.s);
  }

  private drawLine(f: FinaleFrame, now: number, still: boolean): void {
    const s = f.s, t = this.treatment;
    const g = this.line.clear();
    const left = f.left - 12 * s, right = f.right + 12 * s;
    const sag = STAGE.sag * s;
    const count = Math.max(5, Math.round((right - left) / (STAGE.pennantEvery * s)));
    // The string itself, as a smooth sag between the two ties.
    const string = buntingPoints(left, right, f.lineY, sag, 24);
    g.lineStyle(Math.max(1.5, 3 * s), shade(SHELL.rope, -0.2), 1).beginPath().moveTo(left, f.lineY);
    for (const p of string) g.lineTo(p.x, p.y);
    g.lineTo(right, f.lineY).strokePath();
    const cheer = now - this.cheerAt;
    buntingPoints(left, right, f.lineY, sag, count).forEach((p, i) => {
      const colour = t.pennants[i % t.pennants.length]!;
      const angle = p.slope + pennantSwing(now, i, cheer, still);
      if (t.motif === 'lanterns') this.drawLantern(g, p.x, p.y, angle, colour, s);
      else this.drawPennant(g, p.x, p.y, angle, colour, s);
    });
  }

  private drawPennant(g: Phaser.GameObjects.Graphics, x: number, y: number, angle: number, colour: number, s: number): void {
    const half = STAGE.pennantWidth * s / 2, length = STAGE.pennantLength * s;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    // In the pennant's own frame, x along the string and y hanging down from it.
    const at = (lx: number, ly: number) => ({ x: x + lx * cos - ly * sin, y: y + lx * sin + ly * cos });
    const a = at(-half, 0), b = at(half, 0), c = at(0, length);
    const f = faces(colour);
    g.fillStyle(f.edge, 1).fillTriangle(a.x, a.y + 2 * s, b.x, b.y + 2 * s, c.x, c.y + 2 * s);
    g.fillStyle(f.face, 1).fillTriangle(a.x, a.y, b.x, b.y, c.x, c.y);
    // The light catches the fold along the top.
    const m = at(0, length * 0.18);
    g.fillStyle(f.rim, 0.5).fillTriangle(a.x, a.y, b.x, b.y, m.x, m.y);
    if (STYLE.current.outline > 0) {
      g.lineStyle(STYLE.current.outline * s * 0.35, shade(colour, -0.55), 1).strokeTriangle(a.x, a.y, b.x, b.y, c.x, c.y);
    }
  }

  private drawLantern(g: Phaser.GameObjects.Graphics, x: number, y: number, angle: number, colour: number, s: number): void {
    const drop = STAGE.lanternDrop * s, r = STAGE.lanternRadius * s;
    const cx = x - Math.sin(angle) * drop, cy = y + Math.cos(angle) * drop;
    g.lineStyle(Math.max(1, 2 * s), shade(SHELL.rope, -0.3), 1).lineBetween(x, y, cx, cy - r);
    g.fillStyle(colour, 0.22).fillCircle(cx, cy, r * 2.1);
    const f = faces(colour);
    g.fillStyle(f.edge, 1).fillEllipse(cx, cy + 2 * s, r * 2, r * 2.3, 16);
    g.fillStyle(f.face, 1).fillEllipse(cx, cy, r * 2, r * 2.3, 16);
    g.fillStyle(0xfff1c8, 0.55).fillEllipse(cx - r * 0.2, cy - r * 0.15, r * 0.9, r * 1.2, 12);
    g.fillStyle(shade(colour, -0.5), 1).fillRect(cx - r * 0.5, cy - r * 1.2, r, r * 0.25).fillRect(cx - r * 0.5, cy + r * 0.98, r, r * 0.22);
  }

  private hideCard(): void {
    for (const part of [this.card, this.cardEyebrow, this.cardTitle, this.cardStrap]) part.setVisible(false);
    this.card.clear();
  }

  private drawCard(f: FinaleFrame, now: number, still: boolean): void {
    const pose = titleCardPose(now - this.cardFrom, this.cardUntil - this.cardFrom, still);
    if (pose.alpha <= 0.001) { if (this.card.visible) this.hideCard(); return; }
    const s = f.s, t = this.treatment;
    const w = this.cardWidth(), h = STAGE.cardHeight * s;
    const rest = f.cardY - h / 2 - f.ceiling;
    const top = Math.max(-h * 2, rest + pose.offset * h);
    const g = this.card.clear().setVisible(true).setAlpha(pose.alpha).setPosition(f.centerX, f.ceiling).setRotation(pose.tilt);
    if (top > 0) drawRopes(g, s, top, [-w / 2 + 64 * s, w / 2 - 64 * s], 7);
    drawPanel(g, new Rect(-w / 2, top, w, h), s, { fill: t.ribbon, depth: 12, radius: 36, hero: true, frame: t.ribbonInk });
    const hang = (text: Phaser.GameObjects.Text, ly: number) => {
      const cos = Math.cos(pose.tilt), sin = Math.sin(pose.tilt);
      text.setPosition(f.centerX - ly * sin, f.ceiling + ly * cos).setRotation(pose.tilt).setAlpha(pose.alpha).setVisible(true);
    };
    hang(this.cardEyebrow, top + 52 * s);
    hang(this.cardTitle, top + 124 * s);
    hang(this.cardStrap, top + 196 * s);
  }

  private hideRibbon(): void {
    for (const part of [this.ribbon, this.ribbonTitle, this.ribbonNext]) part.setVisible(false);
    this.ribbon.clear();
  }

  private drawRibbon(f: FinaleFrame, now: number, still: boolean): void {
    const pose = ribbonPose(now - this.completeAt, still);
    if (pose.alpha <= 0.001) { if (this.ribbon.visible) this.hideRibbon(); return; }
    const s = f.s, t = this.treatment;
    const full = Math.min(STAGE.ribbonWidth * s, f.right - f.left - 2 * (STAGE.ribbonTail + 20) * s);
    const w = full * pose.unroll * (1 + pose.stamp), h = STAGE.ribbonHeight * s * (1 + pose.stamp);
    const x = f.centerX, y = f.ribbonY;
    const g = this.ribbon.clear().setVisible(true).setAlpha(pose.alpha);
    // The tails first, folded behind the band and a shade darker, each with its notch.
    const tail = STAGE.ribbonTail * s * Math.min(1, pose.unroll), drop = 14 * s;
    const back = shade(t.ribbon, -0.28);
    for (const side of [-1, 1] as const) {
      const inner = x + side * (w / 2 - 10 * s), outer = x + side * (w / 2 + tail);
      const top = y - h / 2 + drop, bottom = y + h / 2 + drop;
      g.fillStyle(back, 1).fillPoints([
        new Phaser.Math.Vector2(inner, top), new Phaser.Math.Vector2(outer, top),
        new Phaser.Math.Vector2(outer - side * tail * 0.45, (top + bottom) / 2),
        new Phaser.Math.Vector2(outer, bottom), new Phaser.Math.Vector2(inner, bottom),
      ], true);
    }
    drawPanel(g, new Rect(x - w / 2, y - h / 2, w, h), s, { fill: t.ribbon, depth: 8, radius: 10, hero: true, frame: t.ribbonInk });
    const words = Math.max(0, (pose.unroll - 0.75) / 0.25) * pose.alpha;
    this.ribbonTitle.setPosition(x, y - 14 * s).setScale(1 + pose.stamp).setAlpha(words).setVisible(true);
    this.ribbonNext.setPosition(x, y + 24 * s).setAlpha(words).setVisible(true);
    if (!this.burst && pose.unroll >= 0.98) {
      this.burst = true;
      if (!still) {
        this.fx.burst('confetti', x - w / 2, y, [...t.confetti], 18);
        this.fx.burst('confetti', x + w / 2, y, [...t.confetti], 18);
      }
    }
  }
}
