import { STORE_COPY } from '../monetization/copy';
import { PRODUCT, type SoldProductId } from '../monetization/types';
import { formatTimerLeft, REPLAY_TIMERS, shelfView, shortTimerLeft, type HeldTimer, type ReplayTimerOption, type ShelfView, type StartRefusal, type TimerProductId } from './replayTimer';

/**
 * The Workshop store as every entrance offers it: which rows are for sale now, what the
 * card's sections hold, where they stand, and what the puck's badge and Settings' chip read.
 * Pure, so the map's card, Settings' row and the restart sheet cannot drift apart on what is
 * sold, and so the stack is tested without a scene.
 *
 * The store sells the heart refill and the four replay timers, nothing else
 * (`docs/BILLING.md`). A bought timer lands on the **shelf** and starts when the player
 * taps Start (`game/replayTimer.ts`), so the card shows the shelf first — won timers with
 * the hour they have to be started in, bought ones that keep — then the one product with a
 * length picker and one brass Buy, then the refill, which reads "Hearts are full" rather
 * than hiding when there is nothing to fill. An account holding the legacy Premium has
 * nothing to buy: its hearts and restarts are already unlimited, so it sees its entitlement
 * and Restore. The running timer is the one thing the store has to *show* rather than sell,
 * so it is on the shelf as a running token, on the puck's badge and in Settings' chip, read
 * every second. Brass is for sale; coral is not used here.
 */
export interface StoreFacts {
  readonly premium: boolean;
  readonly hearts: number;
  readonly heartsMax: number;
  /** The replay timer's expiry, wall clock ms; at or before `now` is no timer. */
  readonly timerExpiresAt: number;
  /** The shelf: held timers and the tombstones of started ones. */
  readonly held: readonly HeldTimer[];
  /** Whether Play Billing answered at all: the browser and a failed boot keep the stub. */
  readonly available: boolean;
  readonly now: number;
}

export type StoreRow =
  | { readonly kind: 'refill'; readonly product: typeof PRODUCT.heartRefill; readonly label: string; readonly note: string }
  | { readonly kind: 'timer'; readonly product: TimerProductId; readonly label: string; readonly note: string };

/** Milliseconds the timer still has at `facts.now`, never negative. */
export function storeTimerLeft(facts: StoreFacts): number {
  if (!Number.isFinite(facts.timerExpiresAt)) return 0;
  return Math.max(0, facts.timerExpiresAt - facts.now);
}

/** The shelf as the card shows it, from the facts alone. */
export function storeShelf(facts: StoreFacts): ShelfView {
  return shelfView({ expiresAt: facts.timerExpiresAt, claims: [], shelf: facts.held }, facts.now);
}

/** The offers the card makes, for analytics: the refill while there is room for it, then the four timers. None for Premium. */
export function storeRows(facts: StoreFacts): readonly StoreRow[] {
  if (facts.premium) return [];
  const rows: StoreRow[] = [];
  if (facts.hearts < facts.heartsMax) {
    rows.push({ kind: 'refill', product: PRODUCT.heartRefill, label: STORE_COPY.refillTitle, note: STORE_COPY.refillTerms });
  }
  for (const option of REPLAY_TIMERS) {
    rows.push({ kind: 'timer', product: option.product, label: option.label, note: STORE_COPY.timerShort });
  }
  return rows;
}

export function isSoldProduct(product: string): product is SoldProductId {
  return product === PRODUCT.heartRefill || REPLAY_TIMERS.some(option => option.product === product);
}

/** The card's title and the line under it: the entitlement, a running timer, or the offer. */
export function storeHead(facts: StoreFacts): { readonly title: string; readonly note: string } {
  if (facts.premium) return { title: STORE_COPY.premiumUnlocked, note: STORE_COPY.premiumShort };
  if (storeTimerLeft(facts) > 0) return { title: STORE_COPY.timerRunning, note: STORE_COPY.timerRunningTerms };
  return { title: STORE_COPY.timersHeadline, note: STORE_COPY.timersTerms };
}

/** The running token's words while a timer runs: "1 hr 12 min left". Empty with none. */
export function timerStatus(leftMs: number): string {
  return leftMs > 0 ? `${formatTimerLeft(leftMs)} left` : '';
}

/**
 * The puck's badge: the short time left while a timer runs, and nothing otherwise — never a
 * sale, never a count. A Premium account's restarts are free regardless, so it carries none.
 */
export function storePuckBadge(facts: StoreFacts): string {
  if (facts.premium) return '';
  const left = storeTimerLeft(facts);
  return left > 0 ? shortTimerLeft(left) : '';
}

/** The held items the shelf shows: unstarted, not yet past their window. */
export function heldCount(facts: StoreFacts): number {
  return storeShelf(facts).items.filter(item => item.state !== 'expired').length;
}

/** Settings' chip under the store row: "1 RUNNING · 1 ON YOUR SHELF", "NOTHING HELD"; nothing for Premium. */
export function storeStatusChip(facts: StoreFacts): string {
  if (facts.premium) return '';
  const parts: string[] = [];
  if (storeTimerLeft(facts) > 0) parts.push('1 running');
  const held = heldCount(facts);
  if (held > 0) parts.push(`${held} on your shelf`);
  return (parts.length > 0 ? parts.join(' · ') : 'Nothing held').toUpperCase();
}

/** Why a Start did nothing, for the card's line. */
export function startRefusalCopy(reason: StartRefusal | undefined): string {
  switch (reason) {
    case 'full': return STORE_COPY.startFull;
    case 'expired': return STORE_COPY.startGone;
    default: return STORE_COPY.startRunning;
  }
}

/** The brass button's words: "Buy 1 hour · $1.49", "Buy 1 hour" until the catalogue answers — never a guessed price. */
export function buyLabel(option: ReplayTimerOption, price: string | null): string {
  return price === null ? `Buy ${option.label}` : `Buy ${option.label} · ${price}`;
}

export type RefillRow = { readonly kind: 'offer'; readonly gauge: string } | { readonly kind: 'full' } | null;

/** The refill row: the gauge and a price while there is room, "Hearts are full" otherwise, nothing for Premium. */
export function refillRow(facts: StoreFacts): RefillRow {
  if (facts.premium) return null;
  return facts.hearts < facts.heartsMax ? { kind: 'offer', gauge: `${facts.hearts}/${facts.heartsMax}` } : { kind: 'full' };
}

/** Everything the card's words and tokens move with, so a once-a-second poll redraws only when something did. */
export function storeSignature(facts: StoreFacts): string {
  const shelf = storeShelf(facts);
  return JSON.stringify([
    facts.premium, facts.hearts, facts.available, shelf.running?.label ?? '',
    shelf.items.map(item => [item.id, item.state, item.startWithin]),
  ]);
}

/** How many held tokens the shelf shows at once; the rest wait their turn. */
export const SHELF_SLOTS = 3;
/** The pitch between token centres, in design units. */
const SLOT_PITCH = 184;

/** Where the shelf's tokens stand, as x offsets from the well's centre, with a ghost slot while there is room for more. */
export function shelfSlots(count: number): readonly { readonly x: number; readonly ghost: boolean }[] {
  const shown = Math.max(0, Math.min(SHELF_SLOTS, count));
  const ghost = shown < SHELF_SLOTS;
  const n = shown + (ghost ? 1 : 0);
  const slots: { x: number; ghost: boolean }[] = [];
  for (let i = 0; i < n; i++) slots.push({ x: (i - (n - 1) / 2) * SLOT_PITCH, ghost: i >= shown });
  return slots;
}

/** Four equal picker chips across `width`, as x centres from its left edge. */
export function pickerSlots(width: number, gap: number): readonly { readonly x: number; readonly width: number }[] {
  const n = REPLAY_TIMERS.length;
  const w = (width - gap * (n - 1)) / n;
  return REPLAY_TIMERS.map((_, i) => ({ x: i * (w + gap) + w / 2, width: w }));
}

/** The card's metrics in design units, scaled by the card's own scale. */
export const STORE_STACK = Object.freeze({
  width: 600,
  /** The brass header: the tag, the title, the close puck. */
  header: 92,
  pad: 24,
  sectionGap: 18,
  eyebrow: 40,
  /** The shelf's well: a token, its two lines and a Start block. */
  shelf: 236,
  /** The stopwatch, "Unlimited restarts" and the first line of the terms. */
  pickerHead: 96,
  termsLine: 26,
  /** The four length chips, touch-floor tall. */
  picker: 88,
  pickerGap: 14,
  buy: 88,
  /** The refill's gauge and tag, or "Hearts are full". */
  refill: 96,
  /** The feedback line's seat, kept whether or not a line is shown. */
  feedback: 34,
  /** Restore as a text link, with the touch floor under it. */
  restore: 56,
  /** Premium: one line naming the entitlement where the sections would be. */
  premiumLine: 72,
  foot: 20,
});

export interface StoreShape {
  readonly premium: boolean;
  /** Held tokens shown (0 to `SHELF_SLOTS`). */
  readonly tokens: number;
  readonly refill: 'offered' | 'full' | null;
  readonly termsLines: 1 | 2;
}

export interface StoreStack {
  readonly shelfEyebrow: number | null;
  readonly shelf: number | null;
  readonly pickerHead: number | null;
  readonly picker: number | null;
  readonly buy: number | null;
  readonly refill: number | null;
  readonly premiumLine: number | null;
  readonly feedback: number;
  readonly restore: number;
  readonly height: number;
}

/** Where everything on the card stands, from its top, for what the card has to show. */
export function storeStack(shape: StoreShape): StoreStack {
  const m = STORE_STACK;
  let y = m.header + m.sectionGap;
  if (shape.premium) {
    const premiumLine = y;
    y += m.premiumLine;
    const feedback = y;
    y += m.feedback;
    const restore = y;
    y += m.restore + m.foot;
    return { shelfEyebrow: null, shelf: null, pickerHead: null, picker: null, buy: null, refill: null, premiumLine, feedback, restore, height: y };
  }
  const shelfEyebrow = y;
  y += m.eyebrow;
  const shelf = y;
  y += m.shelf + m.sectionGap;
  const pickerHead = y;
  y += m.pickerHead + m.termsLine * (shape.termsLines - 1);
  const picker = y;
  y += m.picker + m.pickerGap;
  const buy = y;
  y += m.buy + m.sectionGap;
  const refill = shape.refill === null ? null : y;
  if (shape.refill !== null) y += m.refill;
  const feedback = y;
  y += m.feedback;
  const restore = y;
  y += m.restore + m.foot;
  return { shelfEyebrow, shelf, pickerHead, picker, buy, refill, premiumLine: null, feedback, restore, height: y };
}
