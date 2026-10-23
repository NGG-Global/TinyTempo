import Phaser from 'phaser';
import { LAYOUT } from '../config/design';
import { STYLE } from '../config/style';
import { PALETTE, SHELL } from '../config/theme';
import {
  buyLabel, pickerSlots, refillRow, SHELF_SLOTS, shelfSlots, STORE_STACK, storeShelf, storeSignature, storeStack, type StoreFacts, type StoreShape,
} from '../game/store';
import { compactMinutes, REPLAY_TIMERS, timerOption, type ShelfItemView, type TimerProductId } from '../game/replayTimer';
import { STORE_COPY } from '../monetization/copy';
import { PRODUCT, type ProductId, type SoldProductId } from '../monetization/types';
import { drawHeartRow } from './chrome';
import { shade } from './colour';
import { drawPriceTag, drawTimer } from './icons';
import { BRASS, drawDisc, drawPanel, Rect } from './panel';
import { dashes } from './path';
import { arrive } from './spring';
import { drawTimerToken, type TimerTokenState } from './timerToken';
import { body, display, label, resize, wrapWidth } from './type';

const ENTER_SEC = 0.35;
/** The token's radius and the Start block, in design units. */
/** A slot's rows from the well's top: the token, its name, its caption, then the Start block, each clear of the next. */
const SLOT = Object.freeze({ tokenR: 40, tokenY: 58, labelY: 114, noteY: 140, startY: 158, startW: 124, startH: 48, textW: 160 });

/** The parts of a viewport frame the card reads. */
interface CardFrame { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly centerX: number; readonly centerY: number }

export type StoreCardTap = 'close' | 'absorbed' | 'restore' | { readonly buy: SoldProductId } | { readonly start: string } | { readonly pick: TimerProductId };

/** One held, running or ghost slot on the shelf as the card lays it out. */
interface Slot { readonly state: TimerTokenState | 'ghost'; readonly item: ShelfItemView | null; readonly running: { readonly label: string; readonly ring: number } | null }

/**
 * The Workshop store: one card, opened from the map's puck and from Settings, with what the
 * player holds and what is for sale. Under a brass header, the **shelf** — the held timers
 * as stopwatch tokens, each with Start, and the running one with what it has left — then
 * the one product, a replay timer, with a length picker and a single brass Buy, then the
 * heart refill with its gauge (or "Hearts are full"), and Restore as a quiet link. Brass is
 * for sale; coral is not used on this card. A card rather than a screen, like the objectives
 * and Endless, because it is glanced at and the player stays where they were.
 *
 * It draws with **a camera of its own**, the screen hint's arrangement (`ui/screenHint.ts`):
 * Settings scrolls its sections under a second camera that renders after the main one, so a
 * card on the main camera would sit under them; a container every other camera ignores and a
 * camera that draws only the container works over any scene.
 *
 * It decides nothing about money. The facts come from the scene on every show and poll, the
 * prices are read from the catalogue on every draw so one that arrives late fills in, and a
 * tap is reported to the scene, which owns the purchase, the start and the feedback.
 */
export class StoreCard {
  private readonly scene: Phaser.Scene;
  private readonly layer: Phaser.GameObjects.Container;
  private readonly camera: Phaser.Cameras.Scene2D.Camera;
  private readonly scrim: Phaser.GameObjects.Graphics;
  private readonly plate: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly shelfEyebrow: Phaser.GameObjects.Text;
  private readonly slotMinutes: Phaser.GameObjects.Text[];
  private readonly slotLabels: Phaser.GameObjects.Text[];
  private readonly slotNotes: Phaser.GameObjects.Text[];
  private readonly slotStarts: Phaser.GameObjects.Text[];
  private readonly ghostText: Phaser.GameObjects.Text;
  private readonly pickerEyebrow: Phaser.GameObjects.Text;
  private readonly headline: Phaser.GameObjects.Text;
  private readonly terms: Phaser.GameObjects.Text;
  private readonly optionLabels: Phaser.GameObjects.Text[];
  private readonly optionPrices: Phaser.GameObjects.Text[];
  private readonly buyText: Phaser.GameObjects.Text;
  private readonly refillEyebrow: Phaser.GameObjects.Text;
  private readonly gauge: Phaser.GameObjects.Text;
  private readonly refillPrice: Phaser.GameObjects.Text;
  private readonly refillFull: Phaser.GameObjects.Text;
  private readonly premiumText: Phaser.GameObjects.Text;
  private readonly feedback: Phaser.GameObjects.Text;
  private readonly restoreLabel: Phaser.GameObjects.Text;
  private readonly texts: Phaser.GameObjects.Text[];
  private facts: StoreFacts | null = null;
  private slots: Slot[] = [];
  private picked: TimerProductId = PRODUCT.timer1h;
  private busyCopy: string | null = null;
  private said = '';
  private signature = '';
  private polledAt = 0;
  private openedAt = -Infinity;
  private settled = false;
  private isolated = -1;
  private frame = { centerX: 0, centerY: 0, width: 0, height: 0, fullX: 0, fullY: 0, fullW: 0, fullH: 0, s: 1 };
  /** The scene's scale, or less where the stack would not fit the frame at it. */
  private cs = 1;
  private readonly plateRect = new Rect();
  private readonly closeRect = new Rect();
  private readonly startRects = Array.from({ length: SHELF_SLOTS }, () => new Rect());
  private readonly optionRects = REPLAY_TIMERS.map(() => new Rect());
  private readonly buyRect = new Rect();
  private readonly refillRect = new Rect();
  private readonly restoreRect = new Rect();

  /** `price` and `facts` are read on every draw and poll, so a catalogue or a timer that moves fills in. */
  public constructor(scene: Phaser.Scene, depth: number, private readonly source: { readonly price: (product: ProductId) => string | null; readonly facts: () => StoreFacts }) {
    this.scene = scene;
    const ink = PALETTE.ink, muted = PALETTE.muted, cream = SHELL.cream, brassInk = shade(BRASS, -0.62);
    this.scrim = scene.add.graphics();
    this.plate = scene.add.graphics();
    this.title = display(scene, STORE_COPY.storeTitle, { size: 40, colour: cream, outline: brassInk, align: 'left' }).setOrigin(0, 0.5);
    this.shelfEyebrow = label(scene, STORE_COPY.shelfTitle, { size: 19, colour: muted, align: 'left' }).setOrigin(0, 0.5);
    this.slotMinutes = Array.from({ length: SHELF_SLOTS }, () => display(scene, '', { size: 22, colour: ink, align: 'center' }).setOrigin(0.5));
    this.slotLabels = Array.from({ length: SHELF_SLOTS }, () => display(scene, '', { size: 22, colour: ink, align: 'center' }).setOrigin(0.5));
    this.slotNotes = Array.from({ length: SHELF_SLOTS }, () => body(scene, '', { size: 18, colour: muted, align: 'center' }).setOrigin(0.5, 0));
    this.slotStarts = Array.from({ length: SHELF_SLOTS }, () => label(scene, STORE_COPY.start, { size: 20, colour: cream, align: 'center' }).setOrigin(0.5));
    this.ghostText = body(scene, STORE_COPY.shelfEmpty, { size: 18, colour: muted, align: 'center' }).setOrigin(0.5, 0);
    this.pickerEyebrow = label(scene, STORE_COPY.timerShort, { size: 19, colour: muted, align: 'left' }).setOrigin(0, 0.5);
    this.headline = display(scene, STORE_COPY.timersHeadline, { size: 30, colour: ink, align: 'left' }).setOrigin(0, 0.5);
    this.terms = body(scene, STORE_COPY.timersTerms, { size: 19, colour: muted, align: 'left' }).setOrigin(0, 0);
    this.optionLabels = REPLAY_TIMERS.map(option => display(scene, option.short, { size: 22, colour: ink, align: 'center' }).setOrigin(0.5));
    this.optionPrices = REPLAY_TIMERS.map(() => body(scene, '', { size: 17, colour: muted, align: 'center' }).setOrigin(0.5));
    this.buyText = display(scene, '', { size: 30, colour: cream, outline: brassInk, align: 'left' }).setOrigin(0, 0.5);
    this.refillEyebrow = label(scene, `${STORE_COPY.refillTitle} · ${STORE_COPY.refillTerms}`, { size: 18, colour: muted, align: 'left' }).setOrigin(0, 0.5);
    this.gauge = display(scene, '', { size: 24, colour: ink, align: 'left' }).setOrigin(0, 0.5);
    this.refillPrice = display(scene, '', { size: 26, colour: cream, outline: brassInk, align: 'center' }).setOrigin(0.5);
    this.refillFull = body(scene, STORE_COPY.heartsFull, { size: 22, colour: muted, align: 'center' }).setOrigin(0.5);
    this.premiumText = display(scene, `${STORE_COPY.premiumUnlocked} · ${STORE_COPY.premiumShort}`, { size: 28, colour: ink, align: 'center' }).setOrigin(0.5);
    this.feedback = body(scene, '', { size: 21, colour: muted, align: 'center' }).setOrigin(0.5);
    this.restoreLabel = label(scene, STORE_COPY.restore, { size: 22, colour: ink, align: 'center' }).setOrigin(0.5);
    this.texts = [
      this.title, this.shelfEyebrow, ...this.slotMinutes, ...this.slotLabels, ...this.slotNotes, ...this.slotStarts, this.ghostText,
      this.pickerEyebrow, this.headline, this.terms, ...this.optionLabels, ...this.optionPrices, this.buyText,
      this.refillEyebrow, this.gauge, this.refillPrice, this.refillFull, this.premiumText, this.feedback, this.restoreLabel,
    ];
    this.layer = scene.add.container(0, 0, [this.scrim, this.plate, ...this.texts]).setDepth(depth).setVisible(false);
    this.camera = scene.cameras.add(0, 0, 1, 1, false, 'store').setVisible(false);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  public get open(): boolean { return this.facts !== null; }

  /** Open the card on the scene's facts. `at` is the scene's seconds, for the entry. */
  public show(at: number): void {
    this.facts = this.source.facts();
    this.openedAt = at;
    this.settled = false;
    this.busyCopy = null;
    this.said = '';
    this.polledAt = this.facts.now;
    this.isolate();
    this.layer.setVisible(true);
    this.camera.setVisible(true);
    this.relayout();
  }

  /** The facts read again while the card is open — after a purchase, a start or a restore — redrawn in place. */
  public refresh(): void {
    if (!this.facts) return;
    this.facts = this.source.facts();
    this.polledAt = this.facts.now;
    this.relayout();
  }

  public hide(): void {
    this.facts = null;
    this.busyCopy = null;
    this.layer.setVisible(false);
    this.camera.setVisible(false);
    this.scrim.clear();
    this.plate.clear();
  }

  /** While a purchase or a restore is out, the controls are dimmed and the line says what is awaited. */
  public setBusy(copy: string | null): void {
    if (copy === this.busyCopy) return;
    this.busyCopy = copy;
    if (this.facts) this.draw();
  }

  /** One line under the sections: why a purchase or a restore gave nothing, or what it gave. */
  public say(text: string): void {
    this.said = text;
    if (this.facts) this.draw();
  }

  /** From the scene's `layout()`: the safe frame for the card, the full frame for the scrim and the camera. */
  public layout(safe: CardFrame, full: CardFrame, s: number): void {
    this.frame = { centerX: safe.centerX, centerY: safe.centerY, width: safe.width, height: safe.height, fullX: full.x, fullY: full.y, fullW: full.width, fullH: full.height, s };
    this.camera.setViewport(full.x, full.y, full.width, full.height);
    this.settled = false;
    if (this.facts) this.relayout();
  }

  /**
   * What a tap did, or null when the card is closed. While it is open every tap is the
   * card's: a Start, a length, Buy, the refill, Restore, or the close puck and anywhere off
   * the card, which close it — except while the store is out, when nothing moves, so a
   * purchase is never left half-done behind a closed card.
   */
  public tap(x: number, y: number): StoreCardTap | null {
    if (!this.facts) return null;
    if (this.busyCopy !== null) return 'absorbed';
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (slot?.item && this.startRects[i]?.contains(x, y)) return { start: slot.item.id };
    }
    for (let i = 0; i < REPLAY_TIMERS.length; i++) {
      const option = REPLAY_TIMERS[i];
      if (option && this.optionRects[i]?.contains(x, y)) {
        if (option.product !== this.picked) { this.picked = option.product; this.draw(); }
        return { pick: option.product };
      }
    }
    if (this.buyRect.contains(x, y)) return { buy: this.picked };
    if (this.refillRect.contains(x, y)) return { buy: PRODUCT.heartRefill };
    if (this.restoreRect.contains(x, y)) return 'restore';
    if (this.closeRect.contains(x, y) || !this.plateRect.contains(x, y)) { this.hide(); return 'close'; }
    return 'absorbed';
  }

  /** `at` is the scene's seconds; `now` the wall clock, for the tokens' rings and the running timer. */
  public update(at: number, still: boolean, now: number): void {
    if (!this.facts) return;
    if (this.scene.children.list.length !== this.isolated) this.isolate();
    // Once a second: the rings and the words move by the minute, a won timer leaves when its
    // hour is up, and a running one takes its token with it when it ends.
    if (now - this.polledAt >= 1000) {
      this.polledAt = now;
      const facts = this.source.facts();
      if (storeSignature(facts) !== this.signature) { this.facts = facts; this.relayout(); return; }
      this.facts = facts;
    }
    if (this.settled) return;
    const age = at - this.openedAt;
    const pose = still ? { rise: 0, alpha: 1 } : arrive(age, ENTER_SEC);
    this.layer.setY(pose.rise * 40 * this.cs).setAlpha(pose.alpha);
    this.settled = still || age > ENTER_SEC + 0.1;
    if (this.settled) this.layer.setY(0).setAlpha(1);
  }

  /** The store's camera draws the card and nothing else; every other camera draws everything but. */
  private isolate(): void {
    const list = this.scene.children.list;
    this.camera.ignore(list.filter(child => child !== this.layer));
    for (const camera of this.scene.cameras.cameras) if (camera !== this.camera) camera.ignore(this.layer);
    this.isolated = list.length;
  }

  private shape(facts: StoreFacts): StoreShape {
    const refill = refillRow(facts);
    return { premium: facts.premium, tokens: this.slots.length, refill: refill === null ? null : refill.kind === 'offer' ? 'offered' : 'full', termsLines: 2 };
  }

  /** The shelf's slots: the running timer first, then the held items by their deadline, as many as fit. */
  private layoutSlots(facts: StoreFacts): void {
    const shelf = storeShelf(facts);
    const slots: Slot[] = [];
    if (shelf.running) {
      const total = facts.timerExpiresAt - (facts.now - shelf.running.leftMs);
      slots.push({ state: 'running', item: null, running: { label: shelf.running.label, ring: Math.max(0.02, Math.min(1, shelf.running.leftMs / Math.max(1, total))) } });
    }
    for (const item of shelf.items) {
      if (slots.length >= SHELF_SLOTS) break;
      slots.push({ state: item.state === 'expired' ? 'expired' : item.source, item, running: null });
    }
    this.slots = slots;
  }

  private relayout(): void {
    const facts = this.facts;
    if (!facts) return;
    this.signature = storeSignature(facts);
    this.layoutSlots(facts);
    const f = this.frame;
    const stack = storeStack(this.shape(facts));
    // A short frame takes a smaller card rather than a cropped one; nothing scrolls on a card.
    this.cs = Math.min(f.s, Math.max(0.5 * f.s, (f.height - 32 * f.s) / stack.height));
    const cs = this.cs, ink = PALETTE.ink, muted = PALETTE.muted, cream = SHELL.cream;
    resize(this.title, 40 * cs, cream);
    resize(this.shelfEyebrow, 19 * cs, muted, STYLE.current, false);
    for (const text of this.slotMinutes) resize(text, 22 * cs, ink);
    for (const text of this.slotLabels) resize(text, 22 * cs, ink);
    for (const text of this.slotNotes) { resize(text, 18 * cs, muted, STYLE.current, false); wrapWidth(text, SLOT.textW * cs); }
    for (const text of this.slotStarts) resize(text, 20 * cs, cream, STYLE.current, false);
    resize(this.ghostText, 18 * cs, muted, STYLE.current, false);
    wrapWidth(this.ghostText, SLOT.textW * cs);
    resize(this.pickerEyebrow, 19 * cs, muted, STYLE.current, false);
    resize(this.headline, 30 * cs, ink);
    resize(this.terms, 19 * cs, muted, STYLE.current, false);
    for (const text of this.optionLabels) resize(text, 22 * cs, ink);
    for (const text of this.optionPrices) resize(text, 17 * cs, muted, STYLE.current, false);
    resize(this.buyText, 30 * cs, cream);
    resize(this.refillEyebrow, 18 * cs, muted, STYLE.current, false);
    resize(this.gauge, 24 * cs, ink);
    resize(this.refillPrice, 26 * cs, cream);
    resize(this.refillFull, 22 * cs, muted, STYLE.current, false);
    resize(this.premiumText, 28 * cs, ink);
    resize(this.feedback, 21 * cs, muted, STYLE.current, false);
    resize(this.restoreLabel, 22 * cs, ink, STYLE.current, false);
    this.draw();
  }

  private draw(): void {
    const facts = this.facts;
    if (!facts) return;
    const f = this.frame, cs = this.cs, m = STORE_STACK;
    const stack = storeStack(this.shape(facts));
    const w = Math.min(m.width * cs, f.width - 40 * cs), h = stack.height * cs;
    const x = f.centerX - w / 2, y = f.centerY - h / 2;
    const pad = m.pad * cs, inner = w - pad * 2, left = x + pad;
    this.plateRect.setTo(x, y, w, h);
    for (const text of this.texts) text.setVisible(false);
    this.scrim.clear().fillStyle(0x1a201c, 0.5).fillRect(f.fullX, f.fullY, f.fullW, f.fullH);
    const g = this.plate.clear();
    drawPanel(g, new Rect(x, y, w, h), cs, { fill: SHELL.cream, depth: 12, radius: 32, hero: false });
    const place = (text: Phaser.GameObjects.Text, tx: number, ty: number, dim = 1) => text.setPosition(tx, ty).setAlpha(dim).setVisible(true);
    const dim = this.busyCopy === null && facts.available ? 1 : 0.55;

    // The header: brass, the tag on a cream puck, the title, and the close puck.
    const header = new Rect(x, y, w, m.header * cs);
    drawPanel(g, header, cs, { fill: BRASS, depth: 6, radius: 32, hero: true, frame: SHELL.cream });
    g.fillStyle(BRASS, 1).fillRect(x + 6 * cs, header.bottom - 20 * cs, w - 12 * cs, 26 * cs);
    const puckR = 30 * cs;
    drawDisc(g, left + puckR, header.centerY, puckR, cs, { fill: SHELL.puck, depth: 6 });
    drawPriceTag(g, left + puckR, header.centerY, puckR * 0.5, PALETTE.ink, SHELL.puck);
    place(this.title, left + puckR * 2 + 18 * cs, header.centerY);
    const closeX = x + w - pad - puckR;
    drawDisc(g, closeX, header.centerY, puckR, cs, { fill: SHELL.puck, depth: 6 });
    g.lineStyle(STYLE.current.outline * cs * 0.6, PALETTE.ink, 1);
    g.lineBetween(closeX - puckR * 0.3, header.centerY - puckR * 0.3, closeX + puckR * 0.3, header.centerY + puckR * 0.3);
    g.lineBetween(closeX - puckR * 0.3, header.centerY + puckR * 0.3, closeX + puckR * 0.3, header.centerY - puckR * 0.3);
    const closeFloor = Math.max(puckR * 2, LAYOUT.minTouchTarget * cs);
    this.closeRect.setTo(closeX - closeFloor / 2, header.centerY - closeFloor / 2, closeFloor, closeFloor);
    const titleRoom = closeX - puckR - 12 * cs - this.title.x;
    this.title.setScale(this.title.width > titleRoom ? titleRoom / this.title.width : 1);

    for (const rect of [...this.startRects, ...this.optionRects, this.buyRect, this.refillRect]) rect.setTo(0, 0, 0, 0);

    if (stack.premiumLine !== null) {
      // Premium: the entitlement, and nothing for sale.
      place(this.premiumText, f.centerX, y + (stack.premiumLine + m.premiumLine / 2) * cs);
      this.premiumText.setScale(this.premiumText.width > inner ? inner / this.premiumText.width : 1);
    } else {
      this.drawShelf(g, facts, left, y + stack.shelfEyebrow! * cs, y + stack.shelf! * cs, inner, dim);
      this.drawPicker(g, left, y + stack.pickerHead! * cs, y + stack.picker! * cs, y + stack.buy! * cs, inner, dim);
      if (stack.refill !== null) this.drawRefill(g, facts, left, y + stack.refill * cs, inner, dim);
    }

    // The one line of feedback: the store being out, what the last tap gave, or that there is no store here.
    const line = this.busyCopy ?? (this.said !== '' ? this.said : facts.available ? '' : STORE_COPY.storeUnavailable);
    this.feedback.setText(line);
    place(this.feedback, f.centerX, y + (stack.feedback + m.feedback / 2) * cs);
    this.feedback.setScale(this.feedback.width > inner ? inner / this.feedback.width : 1);
    this.feedback.setVisible(line !== '');

    // Restore, a quiet link: for the accounts that hold the legacy Premium; a consumable never comes back through it.
    const restoreY = y + (stack.restore + m.restore / 2) * cs;
    place(this.restoreLabel, f.centerX, restoreY, dim);
    g.lineStyle(2 * cs, PALETTE.ink, 0.7 * dim).lineBetween(f.centerX - this.restoreLabel.width / 2, restoreY + 14 * cs, f.centerX + this.restoreLabel.width / 2, restoreY + 14 * cs);
    const rw = Math.max(this.restoreLabel.width + 40 * cs, LAYOUT.minTouchTarget * cs * 2), rh = Math.max(m.restore * cs, LAYOUT.minTouchTarget * cs);
    this.restoreRect.setTo(f.centerX - rw / 2, restoreY - rh / 2, rw, rh);
  }

  /** The shelf: a recessed well with a token per slot, its words and a Start, and a ghost slot while there is room. */
  private drawShelf(g: Phaser.GameObjects.Graphics, facts: StoreFacts, left: number, eyebrowY: number, top: number, inner: number, dim: number): void {
    const cs = this.cs, m = STORE_STACK;
    const place = (text: Phaser.GameObjects.Text, tx: number, ty: number, a = 1) => text.setPosition(tx, ty).setAlpha(a).setVisible(true);
    place(this.shelfEyebrow, left + 10 * cs, eyebrowY + m.eyebrow * cs / 2);
    const well = new Rect(left, top, inner, m.shelf * cs);
    // A recess rather than a slab: the shelf is what the card stands on, not a thing for sale.
    g.fillStyle(shade(SHELL.cream, -0.08), 1).fillRoundedRect(well.x, well.y, well.width, well.height, 24 * cs);
    g.lineStyle(1.5 * cs, shade(SHELL.cream, -0.3), 0.6).strokeRoundedRect(well.x, well.y, well.width, well.height, 24 * cs);
    const slots = shelfSlots(this.slots.length);
    const pitchScale = Math.min(1, inner / (slots.length * 184 * cs + 20 * cs));
    slots.forEach((slot, i) => {
      const cx = well.centerX + slot.x * cs * pitchScale;
      const tokenY = well.y + SLOT.tokenY * cs, r = SLOT.tokenR * cs;
      if (slot.ghost) {
        // The empty slot: a dashed ring with a plus, and where a purchase lands.
        drawTimerToken(g, cx, tokenY, r, 'expired', 0, cs);
        g.lineStyle(3 * cs, PALETTE.muted, 0.8).lineBetween(cx - r * 0.3, tokenY, cx + r * 0.3, tokenY).lineBetween(cx, tokenY - r * 0.3, cx, tokenY + r * 0.3);
        place(this.ghostText, cx, well.y + SLOT.labelY * cs - 10 * cs);
        return;
      }
      const shown = this.slots[i];
      const minutes = this.slotMinutes[i], labelText = this.slotLabels[i], note = this.slotNotes[i], start = this.slotStarts[i], rect = this.startRects[i];
      if (!shown || !minutes || !labelText || !note || !start || !rect) return;
      if (shown.state === 'running' && shown.running) {
        drawTimerToken(g, cx, tokenY, r, 'running', shown.running.ring, cs);
        minutes.setText(compactMinutes(Math.ceil((facts.timerExpiresAt - facts.now) / 60_000)));
        labelText.setText(STORE_COPY.tokenRunning);
        note.setText(shown.running.label);
      } else if (shown.item) {
        const item = shown.item;
        drawTimerToken(g, cx, tokenY, r, shown.state === 'ghost' ? 'expired' : shown.state, item.window, cs);
        minutes.setText(item.compact);
        labelText.setText(item.source === 'won' ? STORE_COPY.tokenWon : STORE_COPY.tokenBought);
        note.setText(item.startWithin ?? STORE_COPY.tokenKeeps);
        if (item.state !== 'expired') {
          const sw = SLOT.startW * cs, sh = Math.max(SLOT.startH * cs, LAYOUT.minTouchTarget * cs * 0.75);
          const startRect = new Rect(cx - sw / 2, well.y + SLOT.startY * cs, sw, sh);
          drawPanel(g, startRect, cs, { fill: PALETTE.ink, depth: 6, radius: 14 });
          place(start, startRect.centerX, startRect.centerY, dim);
          rect.setTo(startRect.x, startRect.y - (LAYOUT.minTouchTarget * cs - sh) / 2, sw, Math.max(sh, LAYOUT.minTouchTarget * cs));
        }
      }
      place(minutes, cx, tokenY);
      minutes.setScale(minutes.width > r * 1.5 ? r * 1.5 / minutes.width : 1);
      place(labelText, cx, well.y + SLOT.labelY * cs);
      place(note, cx, well.y + SLOT.noteY * cs);
    });
  }

  /** The product: the stopwatch, the headline and the terms, four length chips, and the one brass Buy. */
  private drawPicker(g: Phaser.GameObjects.Graphics, left: number, headTop: number, pickerTop: number, buyTop: number, inner: number, dim: number): void {
    const cs = this.cs, m = STORE_STACK;
    const place = (text: Phaser.GameObjects.Text, tx: number, ty: number, a = 1) => text.setPosition(tx, ty).setAlpha(a).setVisible(true);
    const glyph = new Rect(left, headTop, 84 * cs, 84 * cs);
    g.fillStyle(shade(SHELL.cream, -0.08), 1).fillRoundedRect(glyph.x, glyph.y, glyph.width, glyph.height, 18 * cs);
    drawTimer(g, glyph.centerX, glyph.centerY + 4 * cs, 28 * cs, PALETTE.ink);
    const copyX = glyph.right + 18 * cs;
    place(this.pickerEyebrow, copyX, headTop + 14 * cs);
    place(this.headline, copyX, headTop + 44 * cs);
    place(this.terms, copyX, headTop + 66 * cs);
    wrapWidth(this.terms, left + inner - copyX);
    const gap = m.pickerGap * cs;
    pickerSlots(inner, gap).forEach((slot, i) => {
      const option = REPLAY_TIMERS[i], rect = this.optionRects[i], labelText = this.optionLabels[i], priceText = this.optionPrices[i];
      if (!option || !rect || !labelText || !priceText) return;
      const chip = new Rect(left + slot.x - slot.width / 2, pickerTop, slot.width, m.picker * cs);
      const chosen = option.product === this.picked;
      drawPanel(g, chip, cs, { fill: chosen ? PALETTE.ink : SHELL.puck, depth: 6, radius: 18 });
      rect.setTo(chip.x, chip.y, chip.width, chip.height);
      labelText.setText(option.short);
      resize(labelText, 22 * cs, chosen ? SHELL.cream : PALETTE.ink);
      place(labelText, chip.centerX, chip.centerY - 13 * cs, dim);
      const price = this.source.price(option.product);
      priceText.setText(price ?? '');
      resize(priceText, 17 * cs, chosen ? SHELL.sun : PALETTE.muted, STYLE.current, false);
      place(priceText, chip.centerX, chip.centerY + 16 * cs, dim);
      priceText.setVisible(price !== null);
      labelText.setScale(labelText.width > chip.width - 12 * cs ? (chip.width - 12 * cs) / labelText.width : 1);
    });
    // One brass button for the length picked: the thing for sale, in the colour for sale.
    const buy = new Rect(left, buyTop, inner, m.buy * cs);
    drawPanel(g, buy, cs, { fill: BRASS, depth: 10, radius: 22, hero: true, frame: SHELL.cream });
    this.buyRect.setTo(buy.x, buy.y, buy.width, buy.height);
    g.lineStyle(3 * cs, SHELL.cream, dim).strokeCircle(buy.x + 36 * cs, buy.centerY, 9 * cs);
    const picked = timerOption(this.picked) ?? REPLAY_TIMERS[1]!;
    this.buyText.setText(buyLabel(picked, this.source.price(picked.product)));
    place(this.buyText, buy.x + 60 * cs, buy.centerY, dim);
    const room = buy.right - 24 * cs - this.buyText.x;
    this.buyText.setScale(this.buyText.width > room ? room / this.buyText.width : 1);
  }

  /** The refill: the gauge and a brass tag while there is room, "Hearts are full" otherwise. */
  private drawRefill(g: Phaser.GameObjects.Graphics, facts: StoreFacts, left: number, top: number, inner: number, dim: number): void {
    const cs = this.cs, m = STORE_STACK;
    const place = (text: Phaser.GameObjects.Text, tx: number, ty: number, a = 1) => text.setPosition(tx, ty).setAlpha(a).setVisible(true);
    const row = new Rect(left, top, inner, m.refill * cs);
    const refill = refillRow(facts);
    if (refill === null) return;
    if (refill.kind === 'full') {
      // Nothing to fill: the row says so rather than leaving, so the store never seems to have lost a product.
      const points = [[row.x, row.y], [row.right, row.y], [row.right, row.bottom], [row.x, row.bottom], [row.x, row.y]].map(([px, py]) => ({ x: px!, y: py! }));
      g.lineStyle(2 * cs, shade(SHELL.cream, -0.35), 0.9);
      // `dashes` walks a polyline at an even pitch; a rectangle is one with a closing point.
      for (const [a, b] of dashes(points, 12 * cs, 8 * cs)) g.lineBetween(a.x, a.y, b.x, b.y);
      place(this.refillFull, row.centerX, row.centerY);
      return;
    }
    drawPanel(g, row, cs, { fill: SHELL.puck, depth: 6, radius: 20 });
    place(this.refillEyebrow, row.x + 24 * cs, row.y + 24 * cs);
    const heartR = 13 * cs, heartGap = 32 * cs;
    drawHeartRow(g, {
      centreX: row.x + 24 * cs + heartR + heartGap * 2, y: row.bottom - 30 * cs, count: facts.heartsMax, radius: heartR, gap: heartGap,
      filled: facts.hearts, full: PALETTE.coral, empty: shade(SHELL.puck, -0.12), emptyOutline: shade(SHELL.puck, -0.45),
    });
    this.gauge.setText(refill.gauge);
    place(this.gauge, row.x + 24 * cs + heartGap * (facts.heartsMax + 0.6), row.bottom - 30 * cs);
    const price = this.source.price(PRODUCT.heartRefill);
    this.refillPrice.setText(price ?? 'Buy');
    const tw = Math.max(130 * cs, this.refillPrice.width + 56 * cs), th = Math.min(row.height - 20 * cs, 64 * cs);
    const tag = new Rect(row.right - 18 * cs - tw, row.centerY - th / 2, tw, th);
    drawPanel(g, tag, cs, { fill: BRASS, depth: 8, radius: 16, hero: true, frame: SHELL.cream });
    g.lineStyle(2.5 * cs, SHELL.cream, dim).strokeCircle(tag.x + 20 * cs, tag.centerY, 7 * cs);
    place(this.refillPrice, tag.centerX + 10 * cs, tag.centerY, dim);
    this.refillRect.setTo(tag.x, row.y, tw, row.height);
  }

  private destroy(): void {
    this.scene.cameras.remove(this.camera);
  }
}
