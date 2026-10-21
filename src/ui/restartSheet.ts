import Phaser from 'phaser';
import { STYLE } from '../config/style';
import { PALETTE, SHELL } from '../config/theme';
import { RESTARTS } from '../game/dailyRestarts';
import type { RestartSheetKind } from '../game/restart';
import { shade } from './colour';
import { drawPlay, drawRestart } from './icons';
import { drawPanel } from './panel';
import { body, display, resize } from './type';

/**
 * The words, in one place. What a restart costs is said before anything is spent, and only
 * where something will be: the free sheet says nothing is used, the daily sheet how many of
 * today's restarts it takes, and the empty one what the ad is for.
 */
export const RESTART_COPY = {
  free: { title: 'Restart from the beginning?', note: 'No restart will be used.', confirm: 'Restart' },
  daily: { title: 'Restart level?', confirm: 'Restart' },
  empty: { title: 'No restarts left', note: `Watch an ad to restart now. ${RESTARTS.daily} more tomorrow.`, confirm: 'Watch ad & Restart' },
  keep: 'Keep playing',
  watching: 'Waiting for the ad…',
} as const;

/** The daily sheet's note: what this restart takes from today's, said in plain numbers. */
export function dailyNote(left: number): string {
  if (left <= 1) return 'Uses your last restart for today.';
  return left >= RESTARTS.daily ? `Uses 1 of today's ${RESTARTS.daily} restarts.` : `Uses 1 of the ${left} restarts left today.`;
}

/** The note a sheet carries, with today's count where it matters. */
export function sheetNote(kind: RestartSheetKind, left: number): string {
  return kind === 'daily' ? dailyNote(left) : RESTART_COPY[kind].note;
}

/** What a tap on the sheet asked for. `swallow` is the sheet itself, or a tap too soon after it changed. */
export type RestartSheetTap = 'confirm' | 'keep' | 'swallow';

/**
 * Seconds a changed sheet ignores taps for. The sheet can change under a thumb — the
 * response begins and the free sheet becomes the daily one — and a tap already on its way
 * must not land on the new button.
 */
export const RESTART_SHEET_ARM_SEC = 0.45;

const SHEET = Object.freeze({
  width: 620,
  pad: 28,
  titleSize: 40,
  noteSize: 24,
  confirmH: 104,
  keepH: 84,
  gap: 16,
  chipW: 112,
  chipH: 62,
});

export interface SheetRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

export interface RestartSheetLayout {
  readonly card: SheetRect;
  readonly titleY: number;
  readonly noteY: number;
  readonly feedbackY: number;
  readonly confirm: SheetRect;
  readonly keep: SheetRect;
}

/**
 * Where everything on the sheet sits: a card centred on `centerX` whose bottom stands
 * `bottom`, so the scene can keep it above the player's row and the run stays readable
 * behind it. Every control is at least `control` tall, the touch-target floor. Pure.
 */
export function restartSheetLayout(
  frame: { readonly centerX: number; readonly bottom: number; readonly maxWidth: number; readonly s: number; readonly control: number },
): RestartSheetLayout {
  const { s, control } = frame;
  const width = Math.min(SHEET.width * s, frame.maxWidth);
  const pad = SHEET.pad * s, gap = SHEET.gap * s;
  const confirmH = Math.max(SHEET.confirmH * s, control);
  const keepH = Math.max(SHEET.keepH * s, control);
  const words = (SHEET.titleSize + 14 + SHEET.noteSize + 12 + 26) * s;
  const height = pad + words + gap + confirmH + gap + keepH + pad;
  const x = frame.centerX - width / 2;
  const y = frame.bottom - height;
  const inner = width - pad * 2;
  const titleY = y + pad + SHEET.titleSize * s / 2;
  const noteY = titleY + (SHEET.titleSize / 2 + 14 + SHEET.noteSize / 2) * s;
  const feedbackY = noteY + (SHEET.noteSize / 2 + 12 + 10) * s;
  const confirmY = y + pad + words + gap;
  const confirm = { x: x + pad, y: confirmY, width: inner, height: confirmH };
  const keep = { x: x + pad, y: confirmY + confirmH + gap, width: inner, height: keepH };
  return { card: { x, y, width, height }, titleY, noteY, feedbackY, confirm, keep };
}

const within = (r: SheetRect, x: number, y: number): boolean =>
  x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;

/** The control a point lands on, or `swallow` on the card's face, or null off the card. */
export function restartSheetHit(layout: RestartSheetLayout, x: number, y: number): RestartSheetTap | null {
  if (within(layout.confirm, x, y)) return 'confirm';
  if (within(layout.keep, x, y)) return 'keep';
  return within(layout.card, x, y) ? 'swallow' : null;
}

/**
 * A tap that reached the sheet, after its guards: while it is arming (just shown or just
 * changed) or waiting on an ad, every control is held and the tap is swallowed, so a thumb
 * already on its way cannot spend anything.
 */
export function guardedSheetTap(hit: RestartSheetTap | null, now: number, armedAt: number, busy: boolean): RestartSheetTap | null {
  if (hit === null) return null;
  return now < armedAt || busy ? 'swallow' : hit;
}

/**
 * The restart puck's sheet, over a run that keeps going: a cream card in the workshop's
 * own panels — the coral block for the one action, bench wood for the way back — with what
 * the action takes drawn on a chip: the restart it uses, or the video that buys one. A tap
 * off the card is the player's beat and is left to the level.
 */
export class RestartSheet {
  private readonly plate: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly note: Phaser.GameObjects.Text;
  private readonly feedback: Phaser.GameObjects.Text;
  private readonly confirmLabel: Phaser.GameObjects.Text;
  private readonly chipLabel: Phaser.GameObjects.Text;
  private readonly keepLabel: Phaser.GameObjects.Text;
  private shown: RestartSheetKind | null = null;
  private left: number = RESTARTS.daily;
  private layoutNow: RestartSheetLayout | null = null;
  private frame = { centerX: 0, bottom: 0, maxWidth: 0, s: 1, control: 88 };
  private busyCopy: string | null = null;
  private armedAt = -Infinity;

  public constructor(scene: Phaser.Scene, depth: number) {
    const words = (make: () => Phaser.GameObjects.Text) => make().setDepth(depth + 1).setVisible(false);
    this.plate = scene.add.graphics().setDepth(depth).setVisible(false);
    this.title = words(() => display(scene, '', { size: SHEET.titleSize, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5));
    this.note = words(() => body(scene, '', { size: SHEET.noteSize, colour: PALETTE.muted, align: 'center' }).setOrigin(0.5));
    this.feedback = words(() => body(scene, '', { size: 21, colour: PALETTE.coral, align: 'center' }).setOrigin(0.5));
    this.confirmLabel = words(() => display(scene, '', { size: 38, colour: SHELL.cream, align: 'left' }).setOrigin(0, 0.5));
    this.chipLabel = words(() => display(scene, '', { size: 34, colour: SHELL.cream, align: 'center' }).setOrigin(0.5));
    this.keepLabel = words(() => display(scene, RESTART_COPY.keep, { size: 32, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5));
  }

  public get kind(): RestartSheetKind | null { return this.shown; }
  public get open(): boolean { return this.shown !== null; }
  public get busy(): boolean { return this.busyCopy !== null; }

  /** Where the card stands. Call from the scene's `layout()`; it redraws an open sheet. */
  public layout(centerX: number, bottom: number, maxWidth: number, s: number, control: number): void {
    this.frame = { centerX, bottom, maxWidth, s, control };
    this.draw();
  }

  /**
   * Open the sheet, or change it in place. A change of kind re-arms it, so a tap that was on
   * its way to the old button is swallowed rather than landing on the new one. `left` is
   * today's restarts still unused, which the daily sheet says.
   */
  public show(kind: RestartSheetKind, now: number, left: number): void {
    const changed = kind !== this.shown;
    if (!changed && left === this.left) return;
    if (changed) {
      this.armedAt = now + RESTART_SHEET_ARM_SEC;
      this.feedback.setText('');
    }
    this.shown = kind;
    this.left = left;
    this.draw();
  }

  public hide(): void {
    if (this.shown === null) return;
    this.shown = null;
    this.busyCopy = null;
    this.feedback.setText('');
    this.draw();
  }

  /** While an ad is out, the controls are dimmed and say what is awaited. */
  public setBusy(copy: string | null): void {
    if (copy === this.busyCopy) return;
    this.busyCopy = copy;
    this.draw();
  }

  /** One line of feedback under the note: why an ad did not give a restart. */
  public say(text: string): void {
    this.feedback.setText(text);
    this.draw();
  }

  /** What a tap meant. Null is off the card, which the level keeps as a beat. */
  public tap(x: number, y: number, now: number): RestartSheetTap | null {
    if (this.shown === null || this.layoutNow === null) return null;
    return guardedSheetTap(restartSheetHit(this.layoutNow, x, y), now, this.armedAt, this.busyCopy !== null);
  }

  public destroy(): void {
    for (const part of this.parts()) part.destroy();
  }

  private parts(): (Phaser.GameObjects.Text | Phaser.GameObjects.Graphics)[] {
    return [this.plate, this.title, this.note, this.feedback, this.confirmLabel, this.chipLabel, this.keepLabel];
  }

  private draw(): void {
    const kind = this.shown;
    const g = this.plate.clear();
    for (const part of this.parts()) part.setVisible(false);
    this.layoutNow = null;
    if (kind === null) return;
    const { s } = this.frame;
    const layout = restartSheetLayout(this.frame);
    this.layoutNow = layout;
    const rect = (r: SheetRect) => new Phaser.Geom.Rectangle(r.x, r.y, r.width, r.height);
    const dim = this.busyCopy === null ? 1 : 0.55;
    g.setVisible(true);
    drawPanel(g, rect(layout.card), s, { fill: SHELL.cream, depth: 10, radius: 26 });
    const copy = RESTART_COPY[kind];
    const room = layout.card.width - SHEET.pad * 2 * s;
    const fit = (text: Phaser.GameObjects.Text, size: number, colour: number, dress = false) => {
      resize(text, size * s, colour, STYLE.current, dress);
      text.setScale(text.width > room ? room / text.width : 1);
    };
    this.title.setText(copy.title).setPosition(layout.card.x + layout.card.width / 2, layout.titleY).setVisible(true);
    fit(this.title, SHEET.titleSize, PALETTE.ink);
    this.note.setText(this.busyCopy ?? sheetNote(kind, this.left)).setPosition(layout.card.x + layout.card.width / 2, layout.noteY).setVisible(true);
    fit(this.note, SHEET.noteSize, PALETTE.muted);
    this.feedback.setPosition(layout.card.x + layout.card.width / 2, layout.feedbackY).setVisible(this.feedback.text !== '');
    fit(this.feedback, 21, shade(PALETTE.coral, -0.25));

    // The one action: coral, with what it takes on a struck chip at its right end.
    const c = layout.confirm;
    drawPanel(g, rect(c), s, { fill: PALETTE.coral, depth: 12, hero: true });
    const chip = kind !== 'free';
    const chipW = SHEET.chipW * s, chipH = SHEET.chipH * s;
    const chipX = c.x + c.width - 22 * s - chipW, cy = c.y + c.height / 2;
    this.confirmLabel.setText(copy.confirm).setOrigin(chip ? 0 : 0.5, 0.5).setAlpha(dim).setVisible(true);
    resize(this.confirmLabel, 38 * s, SHELL.cream);
    const labelRoom = (chip ? chipX - 18 * s : c.x + c.width - 26 * s) - (c.x + 26 * s);
    this.confirmLabel.setScale(this.confirmLabel.width > labelRoom ? labelRoom / this.confirmLabel.width : 1);
    if (chip) {
      this.confirmLabel.setPosition(c.x + 26 * s, cy);
      g.fillStyle(shade(PALETTE.coral, -0.5), 0.55).fillRoundedRect(chipX, cy - chipH / 2, chipW, chipH, 18 * s);
      // Daily: the restart this uses, and a 1. Empty: the video that buys one.
      const markX = chipX + 32 * s;
      if (kind === 'daily') drawRestart(g, markX, cy, 20 * s, SHELL.cream, dim);
      else drawPlay(g, markX + 2 * s, cy, 18 * s, SHELL.cream, dim);
      this.chipLabel.setText(kind === 'daily' ? '1' : '+1').setPosition(markX + 26 * s + (kind === 'daily' ? 8 : 18) * s, cy).setAlpha(dim).setVisible(true);
      resize(this.chipLabel, 34 * s, SHELL.cream);
    } else {
      this.confirmLabel.setPosition(c.x + c.width / 2, cy);
    }

    const k = layout.keep;
    drawPanel(g, rect(k), s, { fill: SHELL.bench, depth: 8 });
    this.keepLabel.setPosition(k.x + k.width / 2, k.y + k.height / 2).setVisible(true);
    resize(this.keepLabel, 32 * s, PALETTE.ink, STYLE.current, false);
  }
}
