import Phaser from 'phaser';
import { STYLE } from '../config/style';
import { PALETTE, SHELL } from '../config/theme';
import { RESTARTS } from '../game/dailyRestarts';
import { REPLAY_TIMERS, timerOption, type ShelfItemView, type TimerProductId } from '../game/replayTimer';
import type { RestartSheetKind } from '../game/restart';
import { STORE_COPY } from '../monetization/copy';
import { shade } from './colour';
import { drawChevron, drawPlay, drawRestart, drawTimer } from './icons';
import { drawTimerToken } from './timerToken';
import { BRASS, drawPanel } from './panel';
import { body, display, label, resize } from './type';

/**
 * The words, in one place. What a restart costs is said before anything is spent, and only
 * where something will be: the free sheet says nothing is used, the daily sheet how many of
 * today's restarts it takes, and the empty one offers, in order, the timers already on the
 * player's shelf (each with Start & restart), the ad, and a replay timer to buy. The picker
 * names the four lengths and their prices; its one action buys the length picked and
 * restarts at once — the one place a purchase starts without a second tap.
 */
export const RESTART_COPY = {
  free: { title: 'Restart from the beginning?', note: 'No restart will be used.', confirm: 'Restart' },
  daily: { title: 'Restart level?', confirm: 'Restart' },
  empty: { title: 'No restarts left', note: `Watch an ad to restart now. ${RESTARTS.daily} more tomorrow.`, confirm: 'Watch ad & Restart' },
  timers: { title: STORE_COPY.timersHeadline, note: STORE_COPY.timersTerms, confirm: 'Buy & restart' },
  /** The empty sheet's brass block, which opens the picker. */
  timer: { title: STORE_COPY.timerShort, note: 'Unlimited restarts for a while' },
  /** The shelf rows over the choices on the empty sheet. */
  fromShelf: 'From your shelf',
  startRestart: 'Start & restart',
  or: 'Or',
  adSeconds: STORE_COPY.watchTerms,
  wonToday: 'Won today',
  boughtKeeps: 'Bought · keeps until you start it',
  keep: 'Keep playing',
  back: 'Back',
  watching: 'Waiting for the ad…',
  buying: 'Waiting for the store…',
} as const;

/** A shelf row's two lines: "40 min timer", then where it came from and its window. */
export function shelfRowCopy(item: ShelfItemView): { readonly title: string; readonly note: string } {
  const title = `${item.label} timer`;
  if (item.source === 'won') return { title, note: `${RESTART_COPY.wonToday} · ${(item.startWithin ?? '').replace(/^Start/, 'start')}` };
  return { title, note: RESTART_COPY.boughtKeeps };
}

/** The daily sheet's note: what this restart takes from today's, said in plain numbers. */
export function dailyNote(left: number): string {
  if (left <= 1) return 'Uses your last restart for today.';
  return left >= RESTARTS.daily ? `Uses 1 of today's ${RESTARTS.daily} restarts.` : `Uses 1 of the ${left} restarts left today.`;
}

/** The note a sheet carries, with today's count where it matters. */
export function sheetNote(kind: RestartSheetKind, left: number): string {
  return kind === 'daily' ? dailyNote(left) : RESTART_COPY[kind].note;
}

/** "from €0.99" for the timer block, from the cheapest timer's price; "Buy" until the catalogue has loaded. */
export function fromPrice(price: (product: TimerProductId) => string | null): string {
  const cheapest = REPLAY_TIMERS[0];
  const value = cheapest === undefined ? null : price(cheapest.product);
  return value === null ? 'Buy' : `from ${value}`;
}

/**
 * What a tap on the sheet asked for. `swallow` is the sheet itself, or a tap too soon after
 * it changed; `timers` opens the picker; `pick` chooses a length on it, and its `confirm`
 * buys that length and restarts; `start` is a held timer from the shelf.
 */
export type RestartSheetTap = 'confirm' | 'keep' | 'timers' | 'swallow' | { readonly pick: TimerProductId } | { readonly start: string };

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
  timerH: 96,
  /** The picker's four length chips, in one row. */
  optionH: 86,
  optionGap: 12,
  /** A shelf row: a token, two lines and Start & restart. */
  shelfRowH: 92,
  shelfGap: 10,
  eyebrowH: 30,
  dividerH: 34,
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
  /** The empty sheet's shelf rows, one per held timer, and the eyebrow over them; empty elsewhere. */
  readonly shelfRows: readonly { readonly id: string; readonly rect: SheetRect }[];
  readonly eyebrowY: number | null;
  /** The "Or" between the shelf and the other ways; null without shelf rows. */
  readonly dividerY: number | null;
  /** The one action: Restart, Watch ad & Restart, or the picker's Buy & restart. */
  readonly confirm: SheetRect;
  /** The empty sheet's timer block; zero-sized elsewhere. */
  readonly timer: SheetRect;
  /** The picker's length chips, one per `REPLAY_TIMERS` entry, in one row; empty elsewhere. */
  readonly options: readonly SheetRect[];
  readonly keep: SheetRect;
}

const NONE: SheetRect = { x: 0, y: 0, width: 0, height: 0 };

/**
 * Where everything on the sheet sits: a card centred on `centerX` whose bottom stands
 * `bottom`, so the scene can keep it above the player's row and the run stays readable
 * behind it. Every control is at least `control` tall, the touch-target floor. The empty
 * sheet adds the timer block under the action; the picker trades the action for four rows.
 * Pure.
 */
export function restartSheetLayout(
  frame: { readonly centerX: number; readonly bottom: number; readonly maxWidth: number; readonly s: number; readonly control: number },
  kind: RestartSheetKind = 'free',
  shelf: readonly { readonly id: string }[] = [],
): RestartSheetLayout {
  const { s, control } = frame;
  const width = Math.min(SHEET.width * s, frame.maxWidth);
  const pad = SHEET.pad * s, gap = SHEET.gap * s;
  const picker = kind === 'timers';
  const held = kind === 'empty' ? shelf : [];
  const confirmH = Math.max(SHEET.confirmH * s, control);
  const timerH = kind === 'empty' ? Math.max(SHEET.timerH * s, control) : 0;
  const optionH = picker ? Math.max(SHEET.optionH * s, control) : 0;
  const optionGap = SHEET.optionGap * s;
  const shelfRowH = Math.max(SHEET.shelfRowH * s, control), shelfGap = SHEET.shelfGap * s;
  const shelfH = held.length > 0 ? SHEET.eyebrowH * s + held.length * shelfRowH + (held.length - 1) * shelfGap + SHEET.dividerH * s : 0;
  const keepH = Math.max(SHEET.keepH * s, control);
  const words = (SHEET.titleSize + 14 + SHEET.noteSize + 12 + 26) * s;
  const stack = shelfH + (picker ? optionH + gap : 0) + confirmH + (timerH > 0 ? gap + timerH : 0);
  const height = pad + words + gap + stack + gap + keepH + pad;
  const x = frame.centerX - width / 2;
  const y = frame.bottom - height;
  const inner = width - pad * 2;
  const titleY = y + pad + SHEET.titleSize * s / 2;
  const noteY = titleY + (SHEET.titleSize / 2 + 14 + SHEET.noteSize / 2) * s;
  const feedbackY = noteY + (SHEET.noteSize / 2 + 12 + 10) * s;
  let cursor = y + pad + words + gap;
  const shelfRows: { id: string; rect: SheetRect }[] = [];
  let eyebrowY: number | null = null, dividerY: number | null = null;
  if (held.length > 0) {
    eyebrowY = cursor + SHEET.eyebrowH * s / 2;
    cursor += SHEET.eyebrowH * s;
    held.forEach((item, i) => {
      shelfRows.push({ id: item.id, rect: { x: x + pad, y: cursor + i * (shelfRowH + shelfGap), width: inner, height: shelfRowH } });
    });
    cursor += held.length * shelfRowH + (held.length - 1) * shelfGap;
    dividerY = cursor + SHEET.dividerH * s / 2;
    cursor += SHEET.dividerH * s;
  }
  const options: SheetRect[] = [];
  if (picker) {
    const chipW = (inner - optionGap * (REPLAY_TIMERS.length - 1)) / REPLAY_TIMERS.length;
    REPLAY_TIMERS.forEach((_, i) => {
      options.push({ x: x + pad + i * (chipW + optionGap), y: cursor, width: chipW, height: optionH });
    });
    cursor += optionH + gap;
  }
  const confirm = { x: x + pad, y: cursor, width: inner, height: confirmH };
  cursor += confirmH;
  const timer = timerH > 0 ? { x: x + pad, y: cursor + gap, width: inner, height: timerH } : NONE;
  cursor += timerH > 0 ? gap + timerH : 0;
  const keep = { x: x + pad, y: cursor + gap, width: inner, height: keepH };
  return { card: { x, y, width, height }, titleY, noteY, feedbackY, shelfRows, eyebrowY, dividerY, confirm, timer, options, keep };
}

const within = (r: SheetRect, x: number, y: number): boolean =>
  r.width > 0 && x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;

/** The control a point lands on, or `swallow` on the card's face, or null off the card. */
export function restartSheetHit(layout: RestartSheetLayout, x: number, y: number): RestartSheetTap | null {
  for (const row of layout.shelfRows) if (within(row.rect, x, y)) return { start: row.id };
  if (within(layout.confirm, x, y)) return 'confirm';
  if (within(layout.keep, x, y)) return 'keep';
  if (within(layout.timer, x, y)) return 'timers';
  for (let i = 0; i < layout.options.length; i++) {
    const option = REPLAY_TIMERS[i];
    if (option !== undefined && within(layout.options[i]!, x, y)) return { pick: option.product };
  }
  return within(layout.card, x, y) ? 'swallow' : null;
}

/**
 * A tap that reached the sheet, after its guards: while it is arming (just shown or just
 * changed) or waiting on an ad or the store, every control is held and the tap is
 * swallowed, so a thumb already on its way cannot spend anything.
 */
export function guardedSheetTap(hit: RestartSheetTap | null, now: number, armedAt: number, busy: boolean): RestartSheetTap | null {
  if (hit === null) return null;
  return now < armedAt || busy ? 'swallow' : hit;
}

/**
 * The restart puck's sheet, over a run that keeps going: a cream card in the workshop's
 * own panels — the coral block for the one action, bench wood for the way back, brass for
 * the timer, since it is the one thing on the sheet for sale — with what the action takes
 * drawn on a chip: the restart it uses, or the video that buys one. A tap off the card is
 * the player's beat and is left to the level.
 */
export class RestartSheet {
  private readonly plate: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly note: Phaser.GameObjects.Text;
  private readonly feedback: Phaser.GameObjects.Text;
  private readonly confirmLabel: Phaser.GameObjects.Text;
  private readonly chipLabel: Phaser.GameObjects.Text;
  private readonly keepLabel: Phaser.GameObjects.Text;
  private readonly timerLabel: Phaser.GameObjects.Text;
  private readonly timerNote: Phaser.GameObjects.Text;
  private readonly timerFrom: Phaser.GameObjects.Text;
  private readonly optionLabels: readonly Phaser.GameObjects.Text[];
  private readonly optionPrices: readonly Phaser.GameObjects.Text[];
  private readonly eyebrow: Phaser.GameObjects.Text;
  private readonly divider: Phaser.GameObjects.Text;
  private readonly shelfTitles: Phaser.GameObjects.Text[] = [];
  private readonly shelfNotes: Phaser.GameObjects.Text[] = [];
  private readonly shelfStarts: Phaser.GameObjects.Text[] = [];
  private readonly shelfMinutes: Phaser.GameObjects.Text[] = [];
  private readonly adSeconds: Phaser.GameObjects.Text;
  private readonly makeText: (make: () => Phaser.GameObjects.Text) => Phaser.GameObjects.Text;
  private shown: RestartSheetKind | null = null;
  private left: number = RESTARTS.daily;
  private shelf: readonly ShelfItemView[] = [];
  /** The length the picker has chosen; the default is the hour, the store's own. */
  private pickedProduct: TimerProductId = REPLAY_TIMERS[1]?.product ?? REPLAY_TIMERS[0]!.product;
  private layoutNow: RestartSheetLayout | null = null;
  private frame = { centerX: 0, bottom: 0, maxWidth: 0, s: 1, control: 88 };
  private busyCopy: string | null = null;
  private armedAt = -Infinity;

  /** `price` is read on every draw, so a catalogue that arrives late fills the chips in. */
  public constructor(scene: Phaser.Scene, depth: number, private readonly price: (product: TimerProductId) => string | null) {
    const words = (make: () => Phaser.GameObjects.Text) => make().setDepth(depth + 1).setVisible(false);
    this.plate = scene.add.graphics().setDepth(depth).setVisible(false);
    this.title = words(() => display(scene, '', { size: SHEET.titleSize, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5));
    this.note = words(() => body(scene, '', { size: SHEET.noteSize, colour: PALETTE.muted, align: 'center' }).setOrigin(0.5));
    this.feedback = words(() => body(scene, '', { size: 21, colour: PALETTE.coral, align: 'center' }).setOrigin(0.5));
    this.confirmLabel = words(() => display(scene, '', { size: 38, colour: SHELL.cream, align: 'left' }).setOrigin(0, 0.5));
    this.chipLabel = words(() => display(scene, '', { size: 34, colour: SHELL.cream, align: 'center' }).setOrigin(0.5));
    this.keepLabel = words(() => display(scene, RESTART_COPY.keep, { size: 32, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5));
    this.timerLabel = words(() => display(scene, RESTART_COPY.timer.title, { size: 34, colour: SHELL.cream, outline: shade(BRASS, -0.62), align: 'left' }).setOrigin(0, 0.5));
    this.timerNote = words(() => body(scene, RESTART_COPY.timer.note, { size: 21, colour: shade(BRASS, -0.62), align: 'left' }).setOrigin(0, 0.5));
    this.timerFrom = words(() => label(scene, '', { size: 22, colour: SHELL.cream, align: 'center' }).setOrigin(0.5));
    this.optionLabels = REPLAY_TIMERS.map(option => words(() => display(scene, option.short, { size: 24, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5)));
    this.optionPrices = REPLAY_TIMERS.map(() => words(() => body(scene, '', { size: 18, colour: PALETTE.muted, align: 'center' }).setOrigin(0.5)));
    this.eyebrow = words(() => label(scene, RESTART_COPY.fromShelf, { size: 20, colour: PALETTE.muted, align: 'left' }).setOrigin(0, 0.5));
    this.divider = words(() => label(scene, RESTART_COPY.or, { size: 20, colour: PALETTE.muted, align: 'center' }).setOrigin(0.5));
    this.adSeconds = words(() => label(scene, RESTART_COPY.adSeconds, { size: 20, colour: PALETTE.muted, align: 'right' }).setOrigin(1, 0.5));
    this.makeText = words;
  }

  public get kind(): RestartSheetKind | null { return this.shown; }
  /** The length the picker's Buy & restart buys. */
  public get picked(): TimerProductId { return this.pickedProduct; }
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
  public show(kind: RestartSheetKind, now: number, left: number, shelf: readonly ShelfItemView[] = []): void {
    const shelfChanged = shelf.length !== this.shelf.length || shelf.some((item, i) => item.id !== this.shelf[i]?.id || item.startWithin !== this.shelf[i]?.startWithin);
    const changed = kind !== this.shown || (kind === 'empty' && shelf.length !== this.shelf.length);
    if (!changed && left === this.left && !shelfChanged) return;
    if (changed) {
      this.armedAt = now + RESTART_SHEET_ARM_SEC;
      this.feedback.setText('');
    }
    this.shown = kind;
    this.left = left;
    this.shelf = shelf;
    this.draw();
  }

  public hide(): void {
    if (this.shown === null) return;
    this.shown = null;
    this.busyCopy = null;
    this.feedback.setText('');
    this.draw();
  }

  /** While an ad or the store is out, the controls are dimmed and say what is awaited. */
  public setBusy(copy: string | null): void {
    if (copy === this.busyCopy) return;
    this.busyCopy = copy;
    this.draw();
  }

  /** One line of feedback under the note: why an ad or a purchase did not give a restart. */
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
    return [
      this.plate, this.title, this.note, this.feedback, this.confirmLabel, this.chipLabel, this.keepLabel,
      this.timerLabel, this.timerNote, this.timerFrom, ...this.optionLabels, ...this.optionPrices,
      this.eyebrow, this.divider, this.adSeconds, ...this.shelfTitles, ...this.shelfNotes, ...this.shelfStarts, ...this.shelfMinutes,
    ];
  }

  /** A shelf row's four texts, made the first time a row needs them and kept. */
  private shelfTexts(i: number): { title: Phaser.GameObjects.Text; note: Phaser.GameObjects.Text; start: Phaser.GameObjects.Text; minutes: Phaser.GameObjects.Text } {
    while (this.shelfTitles.length <= i) {
      this.shelfTitles.push(this.makeText(() => display(this.plate.scene, '', { size: 28, colour: PALETTE.ink, align: 'left' }).setOrigin(0, 0.5)));
      this.shelfNotes.push(this.makeText(() => body(this.plate.scene, '', { size: 19, colour: PALETTE.muted, align: 'left' }).setOrigin(0, 0.5)));
      this.shelfStarts.push(this.makeText(() => label(this.plate.scene, RESTART_COPY.startRestart, { size: 19, colour: SHELL.cream, align: 'center' }).setOrigin(0.5)));
      this.shelfMinutes.push(this.makeText(() => display(this.plate.scene, '', { size: 16, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5)));
    }
    return { title: this.shelfTitles[i]!, note: this.shelfNotes[i]!, start: this.shelfStarts[i]!, minutes: this.shelfMinutes[i]! };
  }

  private draw(): void {
    const kind = this.shown;
    const g = this.plate.clear();
    for (const part of this.parts()) part.setVisible(false);
    this.layoutNow = null;
    if (kind === null) return;
    const { s } = this.frame;
    const layout = restartSheetLayout(this.frame, kind, kind === 'empty' ? this.shelf : []);
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

    if (kind === 'timers') {
      this.drawOptions(g, layout, s, dim);
      this.drawBuy(g, layout, s, dim);
    } else {
      this.drawConfirm(g, layout, kind, s, dim);
    }
    if (kind === 'empty') {
      this.drawShelf(g, layout, s, dim);
      this.drawTimerBlock(g, layout, s, dim);
    }

    const k = layout.keep;
    drawPanel(g, rect(k), s, { fill: SHELL.bench, depth: 8 });
    this.keepLabel.setText(kind === 'timers' ? RESTART_COPY.back : RESTART_COPY.keep)
      .setPosition(k.x + k.width / 2, k.y + k.height / 2).setVisible(true);
    resize(this.keepLabel, 32 * s, PALETTE.ink, STYLE.current, false);
  }

  /** The shelf rows: a token, the timer's name and where it came from, and Start & restart; then "Or". */
  private drawShelf(g: Phaser.GameObjects.Graphics, layout: RestartSheetLayout, s: number, dim: number): void {
    if (layout.eyebrowY !== null) this.eyebrow.setPosition(layout.card.x + SHEET.pad * s + 8 * s, layout.eyebrowY).setVisible(true);
    resize(this.eyebrow, 20 * s, PALETTE.muted, STYLE.current, false);
    layout.shelfRows.forEach((row, i) => {
      const item = this.shelf[i];
      if (!item) return;
      const r = row.rect, cy = r.y + r.height / 2;
      drawPanel(g, new Phaser.Geom.Rectangle(r.x, r.y, r.width, r.height), s, { fill: SHELL.puck, depth: 8, radius: 20 });
      const tokenR = 24 * s, tokenX = r.x + 22 * s + tokenR;
      drawTimerToken(g, tokenX, cy + 2 * s, tokenR, item.source, item.window, s);
      const texts = this.shelfTexts(i);
      texts.minutes.setText(item.compact).setPosition(tokenX, cy + 2 * s).setAlpha(dim).setVisible(true);
      resize(texts.minutes, 15 * s, PALETTE.ink);
      const copy = shelfRowCopy(item);
      const copyX = tokenX + tokenR + 20 * s;
      texts.title.setText(copy.title).setPosition(copyX, cy - 15 * s).setAlpha(dim).setVisible(true);
      resize(texts.title, 27 * s, PALETTE.ink);
      texts.note.setText(copy.note).setPosition(copyX, cy + 17 * s).setAlpha(dim).setVisible(true);
      resize(texts.note, 19 * s, PALETTE.muted, STYLE.current, false);
      // Start & restart: an ink block, since brass is for sale and coral is the level's one action.
      const bw = Math.min(236 * s, r.width * 0.42), bh = Math.min(r.height - 20 * s, 64 * s);
      const bx = r.x + r.width - 16 * s - bw;
      drawPanel(g, new Phaser.Geom.Rectangle(bx, cy - bh / 2, bw, bh), s, { fill: PALETTE.ink, depth: 8, radius: 16 });
      texts.start.setPosition(bx + bw / 2, cy).setAlpha(dim).setVisible(true);
      resize(texts.start, 19 * s, SHELL.cream, STYLE.current, false);
      texts.start.setScale(texts.start.width > bw - 16 * s ? (bw - 16 * s) / texts.start.width : 1);
      const room = bx - 12 * s - copyX;
      for (const text of [texts.title, texts.note]) text.setScale(text.width > room ? room / text.width : 1);
    });
    if (layout.dividerY !== null) {
      const cx = layout.card.x + layout.card.width / 2;
      this.divider.setPosition(cx, layout.dividerY).setVisible(true);
      resize(this.divider, 20 * s, PALETTE.muted, STYLE.current, false);
      const half = this.divider.width / 2 + 16 * s, span = layout.card.width / 2 - SHEET.pad * s;
      g.lineStyle(2 * s, shade(SHELL.cream, -0.25), 1).lineBetween(cx - span, layout.dividerY, cx - half, layout.dividerY).lineBetween(cx + half, layout.dividerY, cx + span, layout.dividerY);
    }
  }

  /** The picker's one action: brass, the length picked and its price, and it restarts at once. */
  private drawBuy(g: Phaser.GameObjects.Graphics, layout: RestartSheetLayout, s: number, dim: number): void {
    const c = layout.confirm;
    drawPanel(g, new Phaser.Geom.Rectangle(c.x, c.y, c.width, c.height), s, { fill: BRASS, depth: 12, hero: true, frame: SHELL.cream });
    const cy = c.y + c.height / 2;
    const picked = timerOption(this.pickedProduct) ?? REPLAY_TIMERS[0]!;
    const price = this.price(picked.product);
    this.confirmLabel.setText(price === null ? `${RESTART_COPY.timers.confirm} · ${picked.label}` : `${RESTART_COPY.timers.confirm} · ${picked.label} · ${price}`)
      .setOrigin(0.5, 0.5).setPosition(c.x + c.width / 2, cy).setAlpha(dim).setVisible(true);
    resize(this.confirmLabel, 32 * s, SHELL.cream);
    const room = c.width - 40 * s;
    this.confirmLabel.setScale(this.confirmLabel.width > room ? room / this.confirmLabel.width : 1);
  }

  /** The one action: coral for a restart the player already has; the ad's row in the puck's colour, with its length beside it. */
  private drawConfirm(g: Phaser.GameObjects.Graphics, layout: RestartSheetLayout, kind: Exclude<RestartSheetKind, 'timers'>, s: number, dim: number): void {
    const c = layout.confirm;
    if (kind === 'empty') {
      // The ad is a way, not the way: cream, with the thirty seconds it costs at the right.
      drawPanel(g, new Phaser.Geom.Rectangle(c.x, c.y, c.width, c.height), s, { fill: SHELL.puck, depth: 10, radius: 20 });
      const cy = c.y + c.height / 2;
      this.confirmLabel.setText(RESTART_COPY.empty.confirm).setOrigin(0, 0.5).setPosition(c.x + 26 * s, cy).setAlpha(dim).setVisible(true);
      resize(this.confirmLabel, 32 * s, PALETTE.ink);
      this.adSeconds.setPosition(c.x + c.width - 26 * s, cy).setAlpha(dim).setVisible(true);
      resize(this.adSeconds, 20 * s, PALETTE.muted, STYLE.current, false);
      const room = c.width - 52 * s - this.adSeconds.width - 16 * s;
      this.confirmLabel.setScale(this.confirmLabel.width > room ? room / this.confirmLabel.width : 1);
      return;
    }
    drawPanel(g, new Phaser.Geom.Rectangle(c.x, c.y, c.width, c.height), s, { fill: PALETTE.coral, depth: 12, hero: true });
    const chip = kind !== 'free';
    const chipW = SHEET.chipW * s, chipH = SHEET.chipH * s;
    const chipX = c.x + c.width - 22 * s - chipW, cy = c.y + c.height / 2;
    this.confirmLabel.setText(RESTART_COPY[kind].confirm).setOrigin(chip ? 0 : 0.5, 0.5).setAlpha(dim).setVisible(true);
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
  }

  /** The brass block under Watch ad: the stopwatch, two lines, the lowest price, a chevron into the picker. */
  private drawTimerBlock(g: Phaser.GameObjects.Graphics, layout: RestartSheetLayout, s: number, dim: number): void {
    const t = layout.timer;
    drawPanel(g, new Phaser.Geom.Rectangle(t.x, t.y, t.width, t.height), s, { fill: BRASS, depth: 12, hero: true, frame: SHELL.cream });
    const cy = t.y + t.height / 2;
    const markR = 22 * s, markX = t.x + 24 * s + markR;
    drawTimer(g, markX, cy, markR, SHELL.cream, dim);
    const copyX = markX + markR + 18 * s;
    this.timerLabel.setPosition(copyX, cy - 16 * s).setAlpha(dim).setVisible(true);
    resize(this.timerLabel, 32 * s, SHELL.cream);
    this.timerNote.setPosition(copyX, cy + 17 * s).setAlpha(dim).setVisible(true);
    resize(this.timerNote, 20 * s, shade(BRASS, -0.62), STYLE.current, false);
    // The price chip and the chevron, on the right; the copy stops short of them.
    this.timerFrom.setText(fromPrice(this.price).toUpperCase()).setAlpha(dim).setVisible(true);
    resize(this.timerFrom, 21 * s, SHELL.cream, STYLE.current, false);
    const chevronX = t.x + t.width - 26 * s;
    const pw = this.timerFrom.width + 26 * s, ph = 44 * s;
    const px = chevronX - 20 * s - pw;
    g.fillStyle(shade(PALETTE.coral, -0.45), 1).fillRoundedRect(px, cy - ph / 2 + 3 * s, pw, ph, 12 * s);
    g.fillStyle(PALETTE.coral, 1).fillRoundedRect(px, cy - ph / 2, pw, ph, 12 * s);
    this.timerFrom.setPosition(px + pw / 2, cy);
    drawChevron(g, chevronX, cy, 13 * s, shade(BRASS, -0.62), dim);
    const copyRoom = px - 14 * s - copyX;
    for (const text of [this.timerLabel, this.timerNote]) text.setScale(text.width > copyRoom ? copyRoom / text.width : 1);
  }

  /** The picker: four length chips in a row, the picked one in ink, each with its price under its name. */
  private drawOptions(g: Phaser.GameObjects.Graphics, layout: RestartSheetLayout, s: number, dim: number): void {
    layout.options.forEach((chip, i) => {
      const option = REPLAY_TIMERS[i];
      const labelText = this.optionLabels[i], priceText = this.optionPrices[i];
      if (option === undefined || labelText === undefined || priceText === undefined) return;
      const chosen = option.product === this.pickedProduct;
      drawPanel(g, new Phaser.Geom.Rectangle(chip.x, chip.y, chip.width, chip.height), s, { fill: chosen ? PALETTE.ink : SHELL.puck, depth: 8, radius: 18 });
      const cx = chip.x + chip.width / 2, cy = chip.y + chip.height / 2;
      labelText.setPosition(cx, cy - 13 * s).setAlpha(dim).setVisible(true);
      resize(labelText, 24 * s, chosen ? SHELL.cream : PALETTE.ink);
      const price = this.price(option.product);
      priceText.setText(price ?? '').setPosition(cx, cy + 16 * s).setAlpha(dim).setVisible(price !== null);
      resize(priceText, 18 * s, chosen ? SHELL.sun : PALETTE.muted, STYLE.current, false);
      labelText.setScale(labelText.width > chip.width - 12 * s ? (chip.width - 12 * s) / labelText.width : 1);
    });
  }

  /** A length chosen on the picker: redrawn in place; nothing is bought until Buy & restart. */
  public pick(product: TimerProductId): void {
    if (product === this.pickedProduct) return;
    this.pickedProduct = product;
    this.draw();
  }
}
