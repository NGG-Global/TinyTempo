import Phaser from 'phaser';
import { LAYOUT } from '../config/design';
import { STYLE } from '../config/style';
import { PALETTE, SHELL } from '../config/theme';
import { STORE_STACK, storeHead, storeRows, storeStack, storeTimerLeft, timerStatus, type StoreFacts, type StoreRow } from '../game/store';
import { STORE_COPY } from '../monetization/copy';
import type { ProductId, SoldProductId } from '../monetization/types';
import { shade } from './colour';
import { drawHeart, drawPriceTag, drawTimer } from './icons';
import { BRASS, drawPanel, Rect } from './panel';
import { arrive } from './spring';
import { balanceWrap, body, display, label, resize } from './type';

/** The refill and the four timers: the most rows the card ever holds. */
const ROWS_MOST = 5;
const ENTER_SEC = 0.35;

/** The parts of a viewport frame the card reads. */
interface CardFrame { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly centerX: number; readonly centerY: number }

export type StoreCardTap = 'close' | 'absorbed' | 'restore' | { readonly buy: SoldProductId };

/**
 * The Workshop store on the map: one card over the dimmed road with what is for sale — the
 * heart refill while there is room for it, and the four replay timers — each on a row with
 * its store price, a brass band with the running timer's time left, Restore for the
 * accounts that hold the legacy Premium, and Close. A card rather than a screen, like the
 * objectives and Endless, because it is glanced at and the road is where the player is;
 * all of it is in screen space, so the map's scrolling camera carries none of it.
 *
 * It decides nothing about money. The rows come from `game/store.ts`, the prices are read
 * from the catalogue on every draw so one that arrives late fills in, and a tap is
 * reported to the scene, which owns the purchase and the feedback.
 */
export class StoreCard {
  private readonly scrim: Phaser.GameObjects.Graphics;
  private readonly plate: Phaser.GameObjects.Graphics;
  private readonly eyebrow: Phaser.GameObjects.Text;
  private readonly title: Phaser.GameObjects.Text;
  private readonly note: Phaser.GameObjects.Text;
  private readonly status: Phaser.GameObjects.Text;
  private readonly rowLabels: Phaser.GameObjects.Text[];
  private readonly rowNotes: Phaser.GameObjects.Text[];
  private readonly rowPrices: Phaser.GameObjects.Text[];
  private readonly feedback: Phaser.GameObjects.Text;
  private readonly restoreLabel: Phaser.GameObjects.Text;
  private readonly closeLabel: Phaser.GameObjects.Text;
  private readonly all: Phaser.GameObjects.GameObject[];
  private facts: StoreFacts | null = null;
  private rows: readonly StoreRow[] = [];
  private busyCopy: string | null = null;
  private said = '';
  private statusShown = '';
  private polledAt = 0;
  private openedAt = -Infinity;
  private settled = false;
  private frame = { centerX: 0, centerY: 0, width: 0, height: 0, fullX: 0, fullY: 0, fullW: 0, fullH: 0, s: 1 };
  /** The scene's scale, or less where the stack would not fit the frame at it. */
  private cs = 1;
  private readonly plateRect = new Rect();
  private readonly rowRects = Array.from({ length: ROWS_MOST }, () => new Rect());
  private readonly restoreRect = new Rect();
  private readonly closeRect = new Rect();

  /** `price` is read on every draw, so a catalogue that arrives late fills the chips in. */
  public constructor(scene: Phaser.Scene, depth: number, private readonly price: (product: ProductId) => string | null) {
    const fixed = <T extends Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth & Phaser.GameObjects.Components.Visible>(o: T, d = depth + 1): T => {
      o.setScrollFactor(0).setDepth(d).setVisible(false);
      return o;
    };
    this.scrim = fixed(scene.add.graphics(), depth);
    this.plate = fixed(scene.add.graphics());
    this.eyebrow = fixed(label(scene, STORE_COPY.storeTitle, { size: 20, colour: PALETTE.muted, align: 'center' }).setOrigin(0.5), depth + 2);
    this.title = fixed(display(scene, '', { size: 44, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5), depth + 2);
    this.note = fixed(body(scene, '', { size: 23, colour: PALETTE.muted, align: 'center' }).setOrigin(0.5, 0), depth + 2);
    this.status = fixed(display(scene, '', { size: 30, colour: SHELL.cream, outline: shade(BRASS, -0.62), align: 'left' }).setOrigin(0, 0.5), depth + 2);
    this.rowLabels = Array.from({ length: ROWS_MOST }, () => fixed(display(scene, '', { size: 28, colour: PALETTE.ink, align: 'left' }).setOrigin(0, 0.5), depth + 2));
    this.rowNotes = Array.from({ length: ROWS_MOST }, () => fixed(body(scene, '', { size: 18, colour: PALETTE.muted, align: 'left' }).setOrigin(0, 0.5), depth + 2));
    this.rowPrices = Array.from({ length: ROWS_MOST }, () => fixed(label(scene, '', { size: 22, colour: SHELL.cream, align: 'center' }).setOrigin(0.5), depth + 2));
    this.feedback = fixed(body(scene, '', { size: 21, colour: shade(PALETTE.coral, -0.25), align: 'center' }).setOrigin(0.5), depth + 2);
    this.restoreLabel = fixed(label(scene, STORE_COPY.restore, { size: 24, colour: PALETTE.ink, align: 'center' }).setOrigin(0.5), depth + 3);
    this.closeLabel = fixed(display(scene, 'Close', { size: 30, colour: SHELL.cream, align: 'center' }).setOrigin(0.5), depth + 3);
    this.all = [this.scrim, this.plate, this.eyebrow, this.title, this.note, this.status,
      ...this.rowLabels, ...this.rowNotes, ...this.rowPrices, this.feedback, this.restoreLabel, this.closeLabel];
  }

  public get open(): boolean { return this.facts !== null; }

  /** `at` is the scene's seconds, for the entry; the wall clock is in the facts. */
  public show(facts: StoreFacts, at: number): void {
    this.facts = facts;
    this.rows = storeRows(facts);
    this.openedAt = at;
    this.settled = false;
    this.busyCopy = null;
    this.said = '';
    this.polledAt = facts.now;
    this.relayout();
  }

  /** New facts while the card is open — after a purchase or a restore — redrawn in place. */
  public refresh(facts: StoreFacts): void {
    if (!this.facts) return;
    this.facts = facts;
    this.rows = storeRows(facts);
    this.polledAt = facts.now;
    this.relayout();
  }

  public hide(): void {
    this.facts = null;
    this.busyCopy = null;
    for (const part of this.all) (part as unknown as Phaser.GameObjects.Components.Visible).setVisible(false);
    this.scrim.clear();
    this.plate.clear();
  }

  /** While a purchase or a restore is out, the rows are dimmed and the line says what is awaited. */
  public setBusy(copy: string | null): void {
    if (copy === this.busyCopy) return;
    this.busyCopy = copy;
    if (this.facts) this.draw(0, 1);
  }

  /** One line under the rows: why a purchase or a restore gave nothing, or what it gave. */
  public say(text: string): void {
    this.said = text;
    if (this.facts) this.draw(0, 1);
  }

  /** From the scene's `layout()`: the safe frame for the card, the full frame for the scrim. */
  public layout(safe: CardFrame, full: CardFrame, s: number): void {
    this.frame = { centerX: safe.centerX, centerY: safe.centerY, width: safe.width, height: safe.height, fullX: full.x, fullY: full.y, fullW: full.width, fullH: full.height, s };
    this.settled = false;
    if (this.facts) this.relayout();
  }

  /**
   * What a tap did, or null when the card is closed. While it is open every tap is the
   * card's: a row, Restore, or anywhere else, which closes it — except while the store is
   * out, when nothing moves, so a purchase is never left half-done behind a closed card.
   */
  public tap(x: number, y: number): StoreCardTap | null {
    if (!this.facts) return null;
    if (this.busyCopy !== null) return 'absorbed';
    const row = this.rows.findIndex((_, i) => this.rowRects[i]?.contains(x, y) === true);
    const hit = row >= 0 ? this.rows[row] : undefined;
    if (hit !== undefined) return { buy: hit.product };
    if (this.restoreRect.contains(x, y)) return 'restore';
    if (this.closeRect.contains(x, y) || !this.plateRect.contains(x, y)) { this.hide(); return 'close'; }
    return 'absorbed';
  }

  /** `at` is the scene's seconds; `now` the wall clock, for the timer's count. */
  public update(at: number, still: boolean, now: number): void {
    const facts = this.facts;
    if (!facts) return;
    // Once a second: the band's words move by the minute, and a timer that ends while the
    // card is open takes its band with it.
    if (now - this.polledAt >= 1000) {
      this.polledAt = now;
      this.facts = { ...facts, now };
      if (timerStatus(storeTimerLeft(this.facts)) !== this.statusShown) {
        this.rows = storeRows(this.facts);
        this.relayout();
        return;
      }
    }
    if (this.settled) return;
    const age = at - this.openedAt;
    const pose = still ? { rise: 0, alpha: 1 } : arrive(age, ENTER_SEC);
    this.draw(pose.rise * 40 * this.cs, pose.alpha);
    this.settled = still || age > ENTER_SEC + 0.1;
  }

  private relayout(): void {
    const facts = this.facts;
    if (!facts) return;
    const f = this.frame;
    const stack = storeStack(this.rows.length, storeTimerLeft(facts) > 0);
    // A short frame takes a smaller card rather than a cropped one; nothing scrolls on a card.
    this.cs = Math.min(f.s, Math.max(0.5 * f.s, (f.height - 32 * f.s) / stack.height));
    const cs = this.cs;
    resize(this.eyebrow, 20 * cs, PALETTE.muted, STYLE.current, false);
    resize(this.title, 44 * cs, PALETTE.ink);
    resize(this.note, 23 * cs, PALETTE.muted, STYLE.current, false);
    balanceWrap(this.note, Math.min(STORE_STACK.width * cs, f.width - 40 * cs) - 72 * cs);
    resize(this.status, 30 * cs, SHELL.cream);
    for (const text of this.rowLabels) resize(text, 28 * cs, PALETTE.ink, STYLE.current, false);
    for (const text of this.rowNotes) resize(text, 18 * cs, PALETTE.muted, STYLE.current, false);
    for (const text of this.rowPrices) resize(text, 22 * cs, SHELL.cream, STYLE.current, false);
    resize(this.feedback, 21 * cs, shade(PALETTE.coral, -0.25), STYLE.current, false);
    resize(this.restoreLabel, 24 * cs, PALETTE.ink, STYLE.current, false);
    resize(this.closeLabel, 30 * cs, SHELL.cream);
    this.draw(0, 1);
  }

  private draw(rise: number, alpha: number): void {
    const facts = this.facts;
    if (!facts) return;
    const f = this.frame, cs = this.cs, m = STORE_STACK;
    const left = storeTimerLeft(facts);
    const stack = storeStack(this.rows.length, left > 0);
    const w = Math.min(m.width * cs, f.width - 40 * cs), h = stack.height * cs;
    const x = f.centerX - w / 2, y = f.centerY - h / 2 + rise;
    this.plateRect.setTo(x, y - rise, w, h);
    this.scrim.clear().setVisible(true).setAlpha(alpha).fillStyle(0x1a201c, 0.5).fillRect(f.fullX, f.fullY, f.fullW, f.fullH);
    const g = this.plate.clear().setVisible(true).setAlpha(alpha);
    drawPanel(g, new Rect(x, y, w, h), cs, { fill: SHELL.cream, depth: 12, radius: 32, hero: true });
    const place = (text: Phaser.GameObjects.Text, tx: number, ty: number, dim = 1) => text.setPosition(tx, ty).setAlpha(alpha * dim).setVisible(true);
    const dim = this.busyCopy === null && facts.available ? 1 : 0.55;

    const head = storeHead(facts);
    place(this.eyebrow, f.centerX, y + 48 * cs);
    drawPriceTag(g, f.centerX - this.eyebrow.displayWidth / 2 - 30 * cs, y + 48 * cs, 13 * cs, PALETTE.coral, SHELL.cream);
    this.title.setText(head.title);
    place(this.title, f.centerX, y + 100 * cs);
    this.note.setText(head.note);
    place(this.note, f.centerX, y + 138 * cs);

    // The running timer: brass, the stopwatch, and what is left, read again every second.
    const status = timerStatus(left);
    this.statusShown = status;
    if (stack.status !== null) {
      const band = new Rect(x + 28 * cs, y + stack.status * cs, w - 56 * cs, m.status * cs);
      drawPanel(g, band, cs, { fill: BRASS, depth: 10, radius: 20, hero: true, frame: SHELL.cream });
      const markR = 18 * cs, markX = band.x + 24 * cs + markR;
      drawTimer(g, markX, band.centerY, markR, SHELL.cream);
      this.status.setText(status);
      place(this.status, markX + markR + 16 * cs, band.centerY);
    } else {
      this.status.setVisible(false);
    }

    // A row per product: its glyph, its name, a word on what it does, and the store's price
    // on a coral chip — "Buy" until the catalogue has answered, never a guessed amount.
    const inner = w - 56 * cs;
    for (let i = 0; i < ROWS_MOST; i++) {
      const row = this.rows[i], rect = this.rowRects[i];
      const labelText = this.rowLabels[i], noteText = this.rowNotes[i], priceText = this.rowPrices[i];
      if (rect === undefined || labelText === undefined || noteText === undefined || priceText === undefined) continue;
      const top = stack.rows[i];
      if (row === undefined || top === undefined) {
        rect.setTo(0, 0, 0, 0);
        labelText.setVisible(false);
        noteText.setVisible(false);
        priceText.setVisible(false);
        continue;
      }
      // Drawn where the entry has carried it; hit where it will rest.
      const drawn = new Rect(x + 28 * cs, y + top * cs, inner, m.row * cs);
      rect.setTo(drawn.x, drawn.y - rise, drawn.width, drawn.height);
      drawPanel(g, drawn, cs, { fill: SHELL.puck, depth: 8, radius: 20 });
      const cy = drawn.centerY, markX = drawn.x + 24 * cs + 18 * cs;
      if (row.kind === 'refill') drawHeart(g, markX, cy, 15 * cs, PALETTE.coral);
      else drawTimer(g, markX, cy, 16 * cs, PALETTE.ink, dim);
      const copyX = markX + 36 * cs;
      labelText.setText(row.label);
      place(labelText, copyX, cy - 13 * cs, dim);
      noteText.setText(row.note);
      place(noteText, copyX, cy + 17 * cs, dim);
      const price = this.price(row.product);
      priceText.setText((price ?? 'Buy').toUpperCase());
      place(priceText, 0, cy, dim);
      const pw = Math.max(96 * cs, priceText.width + 28 * cs), ph = Math.min(drawn.height - 16 * cs, 48 * cs);
      const px = drawn.right - 18 * cs - pw;
      g.fillStyle(shade(PALETTE.coral, -0.45), 1).fillRoundedRect(px, cy - ph / 2 + 3 * cs, pw, ph, 14 * cs);
      g.fillStyle(PALETTE.coral, 1).fillRoundedRect(px, cy - ph / 2, pw, ph, 14 * cs);
      priceText.setPosition(px + pw / 2, cy);
      const room = px - 12 * cs - copyX;
      for (const text of [labelText, noteText]) text.setScale(text.width > room ? room / text.width : 1);
    }

    // The one line of feedback: the store being out, what the last tap gave, or that there is no store here.
    const line = this.busyCopy ?? (this.said !== '' ? this.said : facts.available ? '' : STORE_COPY.storeUnavailable);
    this.feedback.setText(line);
    place(this.feedback, f.centerX, y + (stack.feedback + m.feedback / 2) * cs);
    this.feedback.setScale(this.feedback.width > inner ? inner / this.feedback.width : 1);
    this.feedback.setVisible(line !== '');

    // Restore, for the accounts that hold the legacy Premium; a consumable never comes back through it.
    const rw = Math.min(360 * cs, inner), rh = m.restore * cs;
    const restoreTop = y + stack.restore * cs;
    const floor = Math.max(rh, LAYOUT.minTouchTarget * cs);
    this.restoreRect.setTo(f.centerX - rw / 2, restoreTop - rise - (floor - rh) / 2, rw, floor);
    drawPanel(g, new Rect(f.centerX - rw / 2, restoreTop, rw, rh), cs, { fill: SHELL.puck, depth: 8 });
    place(this.restoreLabel, f.centerX, restoreTop + rh / 2, dim);

    const cw = 220 * cs, ch = m.close * cs;
    const closeTop = y + stack.close * cs;
    const closeFloor = Math.max(ch, LAYOUT.minTouchTarget * cs);
    this.closeRect.setTo(f.centerX - cw / 2, closeTop - rise - (closeFloor - ch) / 2, cw, closeFloor);
    drawPanel(g, new Rect(f.centerX - cw / 2, closeTop, cw, ch), cs, { fill: SHELL.wood, depth: 8 });
    place(this.closeLabel, f.centerX, closeTop + ch / 2);
  }
}
