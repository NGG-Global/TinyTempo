import { STORE_COPY } from '../monetization/copy';
import { PRODUCT, type SoldProductId } from '../monetization/types';
import { HEALTH } from './health';
import { formatTimerLeft, REPLAY_TIMERS, shortTimerLeft, type TimerProductId } from './replayTimer';

/**
 * The Workshop store as the map offers it: which rows are for sale now, what the card's
 * head says, where its rows stand, and what the puck's badge reads. Pure, so the map's card
 * and Settings' store section cannot drift apart on what is sold, and so the stack is
 * tested without a scene.
 *
 * The store sells the heart refill and the four replay timers, nothing else
 * (`docs/BILLING.md`). A refill is offered only while there is room for the hearts it
 * would restore, and an account holding the legacy Premium has nothing to buy: its hearts
 * and restarts are already unlimited, so it sees its entitlement and Restore. The running
 * timer is the one thing the store has to *show* rather than sell — a player who paid for
 * an hour wants to know how much of it is left without opening a level — so it is on the
 * card's status band and on the puck's badge, read every second.
 */
export interface StoreFacts {
  readonly premium: boolean;
  readonly hearts: number;
  /** The replay timer's expiry, wall clock ms; at or before `now` is no timer. */
  readonly timerExpiresAt: number;
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

/** The rows for sale now, refill first: none for a Premium account, no refill on full hearts. */
export function storeRows(facts: StoreFacts): readonly StoreRow[] {
  if (facts.premium) return [];
  const rows: StoreRow[] = [];
  if (facts.hearts < HEALTH.max) {
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

/** The status band's words while a timer runs: "1 hr 12 min left". Empty with none. */
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

/** The card's vertical metrics in design units, scaled by the scene's `s`. */
export const STORE_STACK = Object.freeze({
  width: 600,
  /** Under the eyebrow, the title and a note that may wrap to two lines. */
  headTop: 196,
  /** The brass band naming the running timer's time left; absent with no timer. */
  status: 64,
  statusGap: 16,
  /** A row is the touch floor tall, since every row is a control. */
  row: 88,
  rowGap: 10,
  /** The feedback line's seat, kept whether or not a line is shown, so a result never re-stacks the card under the thumb. */
  feedback: 34,
  restore: 76,
  closeGap: 24,
  close: 78,
  closePad: 28,
});

export interface StoreStack {
  /** The status band's top, or null with no timer. */
  readonly status: number | null;
  /** Each row's top, in the order of `storeRows`. */
  readonly rows: readonly number[];
  readonly feedback: number;
  readonly restore: number;
  readonly close: number;
  readonly height: number;
}

/** Where everything on the card stands, from its top, for `rowCount` rows and whether a timer runs. */
export function storeStack(rowCount: number, timerRunning: boolean): StoreStack {
  const m = STORE_STACK;
  let y = m.headTop;
  const status = timerRunning ? y : null;
  if (timerRunning) y += m.status + m.statusGap;
  const rows: number[] = [];
  for (let i = 0; i < rowCount; i++) {
    rows.push(y);
    y += m.row + (i < rowCount - 1 ? m.rowGap : 0);
  }
  const feedback = y;
  y += m.feedback;
  const restore = y;
  y += m.restore + m.closeGap;
  const close = y;
  return { status, rows, feedback, restore, close, height: close + m.close + m.closePad };
}
