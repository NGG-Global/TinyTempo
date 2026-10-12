import Phaser from 'phaser';
import { ENDLESS } from '../config/endless';
import { STYLE } from '../config/style';
import { PALETTE, SHELL } from '../config/theme';
import { formatSurvival, MILESTONES } from '../game/endless';
import type { EndlessRecord } from '../game/endlessProgress';
import { shade } from './colour';
import { drawActionDisc } from './chrome';
import { drawInfinity, drawPadlock } from './icons';
import { BRASS, drawPanel, Rect } from './panel';
import { arrive } from './spring';
import { body, display, label, resize, wrapWidth } from './type';

/** Design-unit metrics, scaled by the scene's `s`. */
const CARD = Object.freeze({
  width: 600,
  height: 740,
  lockedHeight: 520,
  bestTop: 180,
  badgeTop: 330,
  badge: 30,
  badgeGap: 150,
  startTop: 440,
  blockHeight: 104,
  boardTop: 572,
  chipHeight: 76,
  closeWidth: 220,
  closeHeight: 78,
  enterSec: 0.35,
});

/** The parts of a viewport frame the card reads. */
interface CardFrame { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly centerX: number; readonly centerY: number }

/** What the card is told when it opens. */
export interface EndlessCardFacts {
  readonly unlocked: boolean;
  /** Levels cleared on the road, for the locked card's count. */
  readonly cleared: number;
  readonly record: EndlessRecord;
  /** Whether a leaderboard button can do anything on this build. */
  readonly leaderboard: boolean;
  /** The unlock has not been seen on this card before: the title says so, once. */
  readonly justUnlocked: boolean;
}

export type EndlessCardTap = 'start' | 'leaderboard' | 'close' | 'absorbed';

/**
 * Endless Mode's door on the map: one card over a dimmed screen with the mode's name,
 * what it asks for while it is locked, and the device's best once it is open — with the
 * one coral block that starts a run and, where Play Games can show one, the leaderboard.
 * A card rather than a screen, like the daily objectives, because it is glanced at and
 * the road is where the player is; all of it is in screen space, so the map's scrolling
 * camera carries none of it.
 */
export class EndlessCard {
  private readonly scrim: Phaser.GameObjects.Graphics;
  private readonly plate: Phaser.GameObjects.Graphics;
  private readonly eyebrow: Phaser.GameObjects.Text;
  private readonly title: Phaser.GameObjects.Text;
  private readonly note: Phaser.GameObjects.Text;
  private readonly bestLabel: Phaser.GameObjects.Text;
  private readonly best: Phaser.GameObjects.Text;
  private readonly bestNote: Phaser.GameObjects.Text;
  private readonly badgeLabels: Phaser.GameObjects.Text[];
  private readonly startLabel: Phaser.GameObjects.Text;
  private readonly boardLabel: Phaser.GameObjects.Text;
  private readonly closeLabel: Phaser.GameObjects.Text;
  private readonly all: Phaser.GameObjects.GameObject[];
  private facts: EndlessCardFacts | null = null;
  private openedAt = -Infinity;
  private settled = false;
  private frame = { centerX: 0, centerY: 0, width: 0, fullX: 0, fullY: 0, fullW: 0, fullH: 0, s: 1 };
  private readonly plateRect = new Rect();
  private readonly startRect = new Rect();
  private readonly boardRect = new Rect();
  private readonly closeRect = new Rect();

  public constructor(scene: Phaser.Scene, depth = 30) {
    const fixed = <T extends Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth & Phaser.GameObjects.Components.Visible>(o: T, d = depth + 1): T => {
      o.setScrollFactor(0).setDepth(d).setVisible(false);
      return o;
    };
    this.scrim = fixed(scene.add.graphics(), depth);
    this.plate = fixed(scene.add.graphics());
    this.eyebrow = fixed(label(scene, 'Endless Mode', { size: 20, colour: PALETTE.muted, align: 'center' }).setOrigin(0.5), depth + 2);
    this.title = fixed(display(scene, '', { size: 44, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5), depth + 2);
    this.note = fixed(body(scene, '', { size: 23, colour: PALETTE.muted, align: 'center' }).setOrigin(0.5, 0), depth + 2);
    this.bestLabel = fixed(label(scene, 'Best', { size: 20, colour: PALETTE.muted, align: 'center' }).setOrigin(0.5), depth + 2);
    this.best = fixed(display(scene, '', { size: 72, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5), depth + 2);
    this.bestNote = fixed(body(scene, '', { size: 22, colour: PALETTE.muted, align: 'center' }).setOrigin(0.5), depth + 2);
    this.badgeLabels = MILESTONES.map(() => fixed(label(scene, '', { size: 18, colour: PALETTE.muted, align: 'center' }).setOrigin(0.5, 0), depth + 2));
    this.startLabel = fixed(display(scene, 'Start', { size: 40, colour: SHELL.cream, align: 'center' }).setOrigin(0.5), depth + 3);
    this.boardLabel = fixed(label(scene, 'Leaderboard', { size: 24, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5), depth + 3);
    this.closeLabel = fixed(display(scene, 'Close', { size: 30, colour: SHELL.cream, align: 'center' }).setOrigin(0.5), depth + 3);
    this.all = [this.scrim, this.plate, this.eyebrow, this.title, this.note, this.bestLabel, this.best, this.bestNote,
      ...this.badgeLabels, this.startLabel, this.boardLabel, this.closeLabel];
  }

  public get open(): boolean { return this.facts !== null; }

  /** `at` is the scene's seconds, for the entry. */
  public show(facts: EndlessCardFacts, at: number): void {
    this.facts = facts;
    this.openedAt = at;
    this.settled = false;
    const record = facts.record;
    this.title.setText(facts.unlocked ? (facts.justUnlocked ? 'Unlocked!' : 'How long can you last?') : `Clear level ${ENDLESS.unlockLevel}`);
    this.note.setText(facts.unlocked
      ? `One rhythm per act, two bars between. ${ENDLESS.lives.start} Groove Lives; a round under the bar costs one.`
      : `Finish level ${ENDLESS.unlockLevel} on the road to open it. ${Math.min(facts.cleared, ENDLESS.unlockLevel)} of ${ENDLESS.unlockLevel} cleared.`);
    this.best.setText(record.validRuns > 0 ? formatSurvival(record.bestMs, true) : '—');
    this.bestNote.setText(record.validRuns > 0 ? `${record.bestVignettes} acts · ${record.bestBpm} BPM · ${record.validRuns} ${record.validRuns === 1 ? 'run' : 'runs'}` : 'No run yet');
    MILESTONES.forEach((m, i) => this.badgeLabels[i]!.setText(`${m.sec / 60} min`));
    this.relayout();
  }

  public hide(): void {
    this.facts = null;
    for (const part of this.all) (part as unknown as Phaser.GameObjects.Components.Visible).setVisible(false);
    this.scrim.clear();
    this.plate.clear();
  }

  /** From the scene's `layout()`: the safe frame for the card, the full frame for the scrim. */
  public layout(safe: CardFrame, full: CardFrame, s: number): void {
    this.frame = { centerX: safe.centerX, centerY: safe.centerY, width: safe.width, fullX: full.x, fullY: full.y, fullW: full.width, fullH: full.height, s };
    this.settled = false;
    if (this.facts) this.relayout();
  }

  /**
   * What a tap did, or null when the card is closed. While it is open every tap is the
   * card's: a control, or anywhere else, which closes it.
   */
  public tap(x: number, y: number): EndlessCardTap | null {
    const facts = this.facts;
    if (!facts) return null;
    if (facts.unlocked && this.startRect.contains(x, y)) { this.hide(); return 'start'; }
    if (facts.unlocked && facts.leaderboard && this.boardRect.contains(x, y)) return 'leaderboard';
    if (this.closeRect.contains(x, y) || !this.plateRect.contains(x, y)) { this.hide(); return 'close'; }
    return 'absorbed';
  }

  public update(at: number, still: boolean): void {
    if (!this.facts || this.settled) return;
    const age = at - this.openedAt;
    const pose = still ? { rise: 0, alpha: 1 } : arrive(age, CARD.enterSec);
    this.draw(pose.rise * 40 * this.frame.s, pose.alpha);
    this.settled = still || age > CARD.enterSec + 0.1;
  }

  private relayout(): void {
    const s = this.frame.s;
    resize(this.eyebrow, 20 * s, PALETTE.muted, STYLE.current, false);
    resize(this.title, 44 * s, PALETTE.ink);
    resize(this.note, 23 * s, PALETTE.muted, STYLE.current, false);
    wrapWidth(this.note, Math.min(CARD.width * s, this.frame.width - 40 * s) - 72 * s);
    resize(this.bestLabel, 20 * s, PALETTE.muted, STYLE.current, false);
    resize(this.best, 72 * s, PALETTE.ink);
    resize(this.bestNote, 22 * s, PALETTE.muted, STYLE.current, false);
    for (const text of this.badgeLabels) resize(text, 18 * s, PALETTE.muted, STYLE.current, false);
    resize(this.startLabel, 40 * s, SHELL.cream);
    resize(this.boardLabel, 24 * s, PALETTE.ink, STYLE.current, false);
    resize(this.closeLabel, 30 * s, SHELL.cream);
    this.draw(0, 1);
  }

  private draw(rise: number, alpha: number): void {
    const facts = this.facts;
    if (!facts) return;
    const f = this.frame, s = f.s;
    const unlocked = facts.unlocked;
    const w = Math.min(CARD.width * s, f.width - 40 * s);
    const h = (unlocked ? CARD.height : CARD.lockedHeight) * s;
    const x = f.centerX - w / 2, y = f.centerY - h / 2 + rise;
    this.plateRect.setTo(x, y - rise, w, h);
    this.scrim.clear().setVisible(true).setAlpha(alpha).fillStyle(0x1a201c, 0.5).fillRect(f.fullX, f.fullY, f.fullW, f.fullH);
    const g = this.plate.clear().setVisible(true).setAlpha(alpha);
    drawPanel(g, new Rect(x, y, w, h), s, { fill: SHELL.cream, depth: 12, radius: 32, hero: true });
    const place = (text: Phaser.GameObjects.Text, tx: number, ty: number) => text.setPosition(tx, ty).setAlpha(alpha).setVisible(true);
    const hide = (text: Phaser.GameObjects.Text) => text.setVisible(false);
    place(this.eyebrow, f.centerX, y + 48 * s);
    place(this.title, f.centerX, y + 100 * s);
    // The mode's glyph beside the eyebrow: the infinity, and a padlock over it while locked.
    drawInfinity(g, x + 48 * s, y + 48 * s, 16 * s, unlocked ? PALETTE.coral : PALETTE.muted);
    if (!unlocked) drawPadlock(g, x + 48 * s, y + 36 * s, 18 * s, PALETTE.ink, SHELL.cream);
    place(this.note, f.centerX, y + 138 * s);

    if (unlocked) {
      const bestY = y + CARD.bestTop * s + 36 * s;
      place(this.bestLabel, f.centerX, bestY);
      place(this.best, f.centerX, bestY + 52 * s);
      place(this.bestNote, f.centerX, bestY + 108 * s);
      // The three badges: a brass disc for one earned, a hollow seat for one not yet.
      const badgeY = y + CARD.badgeTop * s + 40 * s;
      MILESTONES.forEach((m, i) => {
        const bx = f.centerX + (i - (MILESTONES.length - 1) / 2) * CARD.badgeGap * s;
        const r = CARD.badge * s;
        const earned = facts.record.milestones.includes(m.id);
        if (earned) {
          g.fillStyle(shade(BRASS, -0.45), 1).fillCircle(bx, badgeY + 3 * s, r);
          g.fillStyle(BRASS, 1).fillCircle(bx, badgeY, r);
          g.fillStyle(shade(BRASS, 0.35), 0.8).fillCircle(bx - r * 0.3, badgeY - r * 0.35, r * 0.26);
        } else {
          g.lineStyle(Math.max(1.5, STYLE.current.outline * s * 0.45), shade(SHELL.bench, -0.4), 0.9).strokeCircle(bx, badgeY, r);
          g.fillStyle(shade(SHELL.bench, -0.08), 1).fillCircle(bx, badgeY, r * 0.92);
        }
        drawInfinity(g, bx, badgeY, r * 0.5, earned ? SHELL.cream : shade(SHELL.bench, -0.42));
        place(this.badgeLabels[i]!, bx, badgeY + r + 10 * s);
      });
      const blockW = Math.min(520 * s, w - 56 * s);
      this.startRect.setTo(f.centerX - blockW / 2, y + CARD.startTop * s, blockW, CARD.blockHeight * s);
      drawPanel(g, this.startRect, s, { fill: PALETTE.coral, depth: 14, hero: true });
      const span = this.startLabel.width + 76 * s;
      this.startLabel.setOrigin(0.5).setPosition(this.startRect.centerX - span / 2 + this.startLabel.width / 2, this.startRect.centerY).setAlpha(alpha).setVisible(true);
      drawActionDisc(g, this.startRect.centerX + span / 2 - 28 * s, this.startRect.centerY, 28 * s, s);
      if (facts.leaderboard) {
        const chipW = Math.min(360 * s, w - 56 * s);
        this.boardRect.setTo(f.centerX - chipW / 2, y + CARD.boardTop * s, chipW, CARD.chipHeight * s);
        drawPanel(g, this.boardRect, s, { fill: SHELL.puck, depth: 8 });
        place(this.boardLabel, this.boardRect.centerX, this.boardRect.centerY);
      } else {
        this.boardRect.setTo(0, 0, 0, 0);
        hide(this.boardLabel);
      }
    } else {
      this.startRect.setTo(0, 0, 0, 0);
      this.boardRect.setTo(0, 0, 0, 0);
      for (const text of [this.bestLabel, this.best, this.bestNote, this.startLabel, this.boardLabel, ...this.badgeLabels]) hide(text);
    }
    const cw = CARD.closeWidth * s, ch = CARD.closeHeight * s;
    this.closeRect.setTo(f.centerX - cw / 2, y + h - ch - 32 * s, cw, ch);
    drawPanel(g, this.closeRect, s, { fill: SHELL.wood, depth: 8 });
    place(this.closeLabel, this.closeRect.centerX, this.closeRect.centerY);
  }
}
