import Phaser from 'phaser';
import { STYLE } from '../config/style';
import { PALETTE, SHELL } from '../config/theme';
import { isDone, objectiveDefinition, stampWeek, type ObjectivesState } from '../game/objectives';
import { shade } from './colour';
import { drawPanel, Rect } from './panel';
import { arrive } from './spring';
import { drawStar, STAR_PRIZE } from './star';
import { body, display, label, resize } from './type';

/** Design-unit metrics, scaled by the scene's `s`. */
const CARD = Object.freeze({
  width: 600,
  height: 770,
  rowTop: 150,
  rowGap: 116,
  tick: 26,
  weekTop: 520,
  stamp: 22,
  closeWidth: 220,
  closeHeight: 78,
  enterSec: 0.35,
});

/** The parts of a viewport frame the card reads. */
interface CardFrame { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly centerX: number; readonly centerY: number }

/**
 * The daily objectives, on one card over a dimmed screen: the three for today with how
 * far each has come, the week's stamps, and when the next set arrives. It is a card
 * rather than a scene because it is glanced at, and the Menu and the Map share it —
 * one class, laid out from whichever frame the scene gives it, all in screen space so
 * the map's scrolling camera carries none of it.
 *
 * It is the only place the objectives' progress is drawn at length. Everywhere else they
 * are a puck with three tick boxes, so the road never carries three permanent bars.
 */
export class ObjectivesCard {
  private readonly scrim: Phaser.GameObjects.Graphics;
  private readonly plate: Phaser.GameObjects.Graphics;
  private readonly eyebrow: Phaser.GameObjects.Text;
  private readonly title: Phaser.GameObjects.Text;
  private readonly rows: { readonly name: Phaser.GameObjects.Text; readonly count: Phaser.GameObjects.Text }[];
  private readonly weekLabel: Phaser.GameObjects.Text;
  private readonly stampsNote: Phaser.GameObjects.Text;
  private readonly footer: Phaser.GameObjects.Text;
  private readonly closeLabel: Phaser.GameObjects.Text;
  private readonly all: Phaser.GameObjects.GameObject[];
  private state: ObjectivesState | null = null;
  private now = 0;
  private openedAt = -Infinity;
  private settled = false;
  private frame = { centerX: 0, centerY: 0, width: 0, fullX: 0, fullY: 0, fullW: 0, fullH: 0, s: 1 };
  private readonly plateRect = new Rect();
  private readonly closeRect = new Rect();

  public constructor(scene: Phaser.Scene, depth = 30) {
    const fixed = <T extends Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth & Phaser.GameObjects.Components.Visible>(o: T, d = depth + 1): T => {
      o.setScrollFactor(0).setDepth(d).setVisible(false);
      return o;
    };
    this.scrim = fixed(scene.add.graphics(), depth);
    this.plate = fixed(scene.add.graphics());
    this.eyebrow = fixed(label(scene, 'Daily objectives', { size: 20, colour: PALETTE.muted, align: 'center' }).setOrigin(0.5), depth + 2);
    this.title = fixed(display(scene, 'Three for today', { size: 44, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5), depth + 2);
    this.rows = Array.from({ length: 3 }, () => ({
      name: fixed(body(scene, '', { size: 26, colour: PALETTE.ink }).setOrigin(0, 0.5), depth + 2),
      count: fixed(label(scene, '', { size: 20, colour: PALETTE.muted, align: 'right' }).setOrigin(1, 0.5), depth + 2),
    }));
    this.weekLabel = fixed(label(scene, 'This week', { size: 20, colour: PALETTE.muted }).setOrigin(0, 0.5), depth + 2);
    this.stampsNote = fixed(body(scene, '', { size: 20, colour: PALETTE.muted, align: 'right' }).setOrigin(1, 0.5), depth + 2);
    this.footer = fixed(body(scene, 'A new three at midnight', { size: 20, colour: PALETTE.muted, align: 'center' }).setOrigin(0.5), depth + 2);
    this.closeLabel = fixed(display(scene, 'Close', { size: 30, colour: SHELL.cream, align: 'center' }).setOrigin(0.5), depth + 3);
    this.all = [this.scrim, this.plate, this.eyebrow, this.title, ...this.rows.flatMap(r => [r.name, r.count]),
      this.weekLabel, this.stampsNote, this.footer, this.closeLabel];
  }

  public get open(): boolean { return this.state !== null; }

  /** `now` is wall-clock milliseconds, for the week's dates; `at` the scene's seconds, for the entry. */
  public show(state: ObjectivesState, now: number, at: number): void {
    this.state = state;
    this.now = now;
    this.openedAt = at;
    this.settled = false;
    for (const row of this.rows) row.name.setText('');
    this.state.objectives.forEach((objective, i) => {
      const row = this.rows[i];
      if (!row) return;
      row.name.setText(objectiveDefinition(objective.id)?.title(objective.target) ?? '');
      row.count.setText(isDone(objective) ? 'Done' : `${objective.progress} / ${objective.target}`);
    });
    // Finishing all three is said in the title, and stamped into today's seat below.
    this.title.setText(state.objectives.length > 0 && state.objectives.every(isDone) ? 'All three done' : 'Three for today');
    const week = stampWeek(state, now).filter(d => d.stamped).length;
    this.stampsNote.setText(`${state.stamps} ${state.stamps === 1 ? 'stamp' : 'stamps'} · ${week} this week`);
    this.relayout();
  }

  public hide(): void {
    this.state = null;
    for (const part of this.all) (part as unknown as Phaser.GameObjects.Components.Visible).setVisible(false);
    this.scrim.clear();
    this.plate.clear();
  }

  /** From the scene's `layout()`: the safe frame for the card, the full frame for the scrim. */
  public layout(safe: CardFrame, full: CardFrame, s: number): void {
    this.frame = { centerX: safe.centerX, centerY: safe.centerY, width: safe.width, fullX: full.x, fullY: full.y, fullW: full.width, fullH: full.height, s };
    this.settled = false;
    if (this.state) this.relayout();
  }

  /** True when the tap was the card's: while it is open, every tap is. */
  public tap(x: number, y: number): boolean {
    if (!this.state) return false;
    if (this.closeRect.contains(x, y) || !this.plateRect.contains(x, y)) this.hide();
    return true;
  }

  public update(at: number, still: boolean): void {
    if (!this.state || this.settled) return;
    const age = at - this.openedAt;
    const pose = still ? { rise: 0, alpha: 1 } : arrive(age, CARD.enterSec);
    this.draw(pose.rise * 40 * this.frame.s, pose.alpha);
    this.settled = still || age > CARD.enterSec + 0.1;
  }

  private relayout(): void {
    const s = this.frame.s;
    resize(this.eyebrow, 20 * s, PALETTE.muted, STYLE.current, false);
    resize(this.title, 44 * s, PALETTE.ink);
    for (const row of this.rows) {
      resize(row.name, 26 * s, PALETTE.ink, STYLE.current, false);
      resize(row.count, 20 * s, PALETTE.muted, STYLE.current, false);
    }
    resize(this.weekLabel, 20 * s, PALETTE.muted, STYLE.current, false);
    resize(this.stampsNote, 20 * s, PALETTE.muted, STYLE.current, false);
    resize(this.footer, 20 * s, PALETTE.muted, STYLE.current, false);
    resize(this.closeLabel, 30 * s, SHELL.cream);
    this.draw(0, 1);
  }

  private draw(rise: number, alpha: number): void {
    const state = this.state;
    if (!state) return;
    const f = this.frame, s = f.s;
    const w = Math.min(CARD.width * s, f.width - 40 * s), h = CARD.height * s;
    const x = f.centerX - w / 2, y = f.centerY - h / 2 + rise;
    this.plateRect.setTo(x, y - rise, w, h);
    this.scrim.clear().setVisible(true).setAlpha(alpha).fillStyle(0x1a201c, 0.5).fillRect(f.fullX, f.fullY, f.fullW, f.fullH);
    const g = this.plate.clear().setVisible(true).setAlpha(alpha);
    drawPanel(g, new Rect(x, y, w, h), s, { fill: SHELL.cream, depth: 12, radius: 32, hero: true });
    const place = (text: Phaser.GameObjects.Text, tx: number, ty: number) => text.setPosition(tx, ty).setAlpha(alpha).setVisible(true);
    place(this.eyebrow, f.centerX, y + 48 * s);
    place(this.title, f.centerX, y + 96 * s);

    const left = x + 36 * s, right = x + w - 36 * s;
    state.objectives.forEach((objective, i) => {
      const row = this.rows[i];
      if (!row) return;
      const rowY = y + (CARD.rowTop + i * CARD.rowGap) * s;
      const done = isDone(objective);
      const tickX = left + CARD.tick * s, r = CARD.tick * s;
      g.fillStyle(done ? STAR_PRIZE : shade(SHELL.bench, -0.1), 1).fillCircle(tickX, rowY + 16 * s, r);
      g.lineStyle(Math.max(1.5, STYLE.current.outline * s * 0.5), shade(done ? STAR_PRIZE : SHELL.bench, -0.5), 1).strokeCircle(tickX, rowY + 16 * s, r);
      if (done) {
        g.lineStyle(5 * s, SHELL.cream, 1).beginPath()
          .moveTo(tickX - r * 0.42, rowY + 16 * s).lineTo(tickX - r * 0.08, rowY + 16 * s + r * 0.36).lineTo(tickX + r * 0.45, rowY + 16 * s - r * 0.36).strokePath();
      }
      const textX = tickX + r + 18 * s;
      row.name.setWordWrapWidth(Math.max(80 * s, right - textX - 90 * s), false);
      place(row.name, textX, rowY);
      place(row.count, right, rowY);
      // The one place a bar belongs: inside the card, under the objective it measures.
      const barY = rowY + 40 * s, barH = 8 * s, barW = right - textX;
      g.fillStyle(shade(SHELL.bench, -0.12), 1).fillRoundedRect(textX, barY, barW, barH, barH / 2);
      const share = Math.min(1, objective.progress / objective.target);
      if (share > 0) g.fillStyle(done ? STAR_PRIZE : PALETTE.coral, 1).fillRoundedRect(textX, barY, Math.max(barH, barW * share), barH, barH / 2);
    });

    // The week's stamps: one seat per day, today's ringed. A missed day is an empty seat.
    const weekY = y + CARD.weekTop * s;
    g.lineStyle(2 * s, shade(SHELL.bench, -0.15), 1).lineBetween(left, weekY - 44 * s, right, weekY - 44 * s);
    place(this.weekLabel, left, weekY - 12 * s);
    place(this.stampsNote, right, weekY - 12 * s);
    const days = stampWeek(state, this.now);
    const gap = (right - left) / days.length;
    days.forEach((day, i) => {
      const cx = left + gap * (i + 0.5), cy = weekY + 40 * s, r = CARD.stamp * s;
      if (day.stamped) {
        g.fillStyle(STAR_PRIZE, 1).fillCircle(cx, cy, r);
        drawStar(g, cx, cy, r * 0.6, SHELL.cream);
      } else {
        g.lineStyle(Math.max(1.5, 3 * s), shade(SHELL.bench, -0.3), 1).strokeCircle(cx, cy, r);
      }
      if (i === days.length - 1) g.lineStyle(Math.max(1.5, 3 * s), PALETTE.coral, 1).strokeCircle(cx, cy, r + 6 * s);
    });

    place(this.footer, f.centerX, y + h - 146 * s);
    const cw = CARD.closeWidth * s, ch = CARD.closeHeight * s;
    this.closeRect.setTo(f.centerX - cw / 2, y - rise + h - ch - 28 * s, cw, ch);
    drawPanel(g, new Rect(f.centerX - cw / 2, y + h - ch - 28 * s, cw, ch), s, { fill: SHELL.wood, depth: 8 });
    place(this.closeLabel, f.centerX, y + h - ch / 2 - 28 * s);

  }
}
