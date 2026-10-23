import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { LAYOUT } from '../src/config/design';
import { HEALTH } from '../src/game/health';
import { REPLAY_TIMERS } from '../src/game/replayTimer';
import {
  isSoldProduct, STORE_STACK, storeHead, storePuckBadge, storeRows, storeStack, storeTimerLeft, timerStatus, type StoreFacts,
} from '../src/game/store';
import { STORE_COPY } from '../src/monetization/copy';
import { PRODUCT } from '../src/monetization/types';
import { RELEASE_MARKERS } from '../scripts/release-check.mjs';

vi.mock('phaser', () => ({ default: {} }));

const NOW = 1_700_000_000_000;
const MIN = 60_000;

function facts(over: Partial<StoreFacts> = {}): StoreFacts {
  return { premium: false, hearts: 3, timerExpiresAt: 0, available: true, now: NOW, ...over };
}

const src = (path: string): string => readFileSync(path, 'utf8');

describe('the Workshop store', () => {
  it('sells the refill while there is room for it, then the four timers in order, and nothing to Premium', () => {
    const rows = storeRows(facts());
    expect(rows.map(row => row.product)).toEqual([PRODUCT.heartRefill, ...REPLAY_TIMERS.map(option => option.product)]);
    expect(rows[0]).toMatchObject({ kind: 'refill', label: STORE_COPY.refillTitle, note: STORE_COPY.refillTerms });
    // Full hearts: the refill would restore nothing, so it is not offered.
    expect(storeRows(facts({ hearts: HEALTH.max })).map(row => row.kind)).toEqual(['timer', 'timer', 'timer', 'timer']);
    expect(storeRows(facts({ premium: true }))).toEqual([]);
    // Everything a row can name is a product the store sells; Premium never is.
    for (const row of rows) expect(isSoldProduct(row.product)).toBe(true);
    expect(isSoldProduct(PRODUCT.premium)).toBe(false);
  });

  it('says what is left of a running timer, by the minute, and only while one runs', () => {
    expect(storeTimerLeft(facts())).toBe(0);
    expect(storeTimerLeft(facts({ timerExpiresAt: NOW - 1 }))).toBe(0);
    expect(storeTimerLeft(facts({ timerExpiresAt: NaN }))).toBe(0);
    const running = facts({ timerExpiresAt: NOW + 72 * MIN + 1 });
    expect(storeTimerLeft(running)).toBe(72 * MIN + 1);
    expect(timerStatus(storeTimerLeft(running))).toBe('1 hr 13 min left');
    expect(timerStatus(0)).toBe('');
    // The head names the timer while it runs, the offer otherwise, the entitlement for Premium.
    expect(storeHead(running)).toEqual({ title: STORE_COPY.timerRunning, note: STORE_COPY.timerRunningTerms });
    expect(storeHead(facts())).toEqual({ title: STORE_COPY.timersHeadline, note: STORE_COPY.timersTerms });
    expect(storeHead(facts({ premium: true, timerExpiresAt: NOW + MIN }))).toEqual({ title: STORE_COPY.premiumUnlocked, note: STORE_COPY.premiumShort });
  });

  it('badges the puck with the short time left, and with nothing else', () => {
    expect(storePuckBadge(facts())).toBe('');
    expect(storePuckBadge(facts({ hearts: 0 }))).toBe('');
    expect(storePuckBadge(facts({ timerExpiresAt: NOW + 29 * MIN }))).toBe('29m');
    expect(storePuckBadge(facts({ timerExpiresAt: NOW + 25 * 60 * MIN }))).toBe('1d');
    // A Premium account's restarts are free regardless, so its puck says nothing.
    expect(storePuckBadge(facts({ premium: true, timerExpiresAt: NOW + MIN }))).toBe('');
  });

  it('stacks the card from its rows, with the status band only while a timer runs, inside a phone frame', () => {
    const m = STORE_STACK;
    // Every row is a control, so it is the touch floor tall.
    expect(m.row).toBeGreaterThanOrEqual(LAYOUT.minTouchTarget);
    const five = storeStack(5, true);
    expect(five.status).toBe(m.headTop);
    expect(five.rows).toHaveLength(5);
    expect(five.rows[0]).toBe(m.headTop + m.status + m.statusGap);
    for (let i = 1; i < 5; i++) expect(five.rows[i]! - five.rows[i - 1]!).toBe(m.row + m.rowGap);
    expect(five.feedback).toBe(five.rows[4]! + m.row);
    expect(five.restore).toBe(five.feedback + m.feedback);
    expect(five.close).toBe(five.restore + m.restore + m.closeGap);
    expect(five.height).toBe(five.close + m.close + m.closePad);
    // The tallest card the store can show fits the shortest frame a phone lays out from.
    expect(five.height).toBeLessThanOrEqual(1000);
    // No timer: the rows move up by the band; no rows: the feedback line sits where the first row would.
    const quiet = storeStack(4, false);
    expect(quiet.status).toBeNull();
    expect(quiet.rows[0]).toBe(m.headTop);
    expect(storeStack(0, false).feedback).toBe(m.headTop);
  });

  it('is wired into the map: a labelled puck, the card on every frame, and the purchase re-read before the redraw', () => {
    const map = src('src/scenes/MapScene.ts');
    expect(map).toContain("new StoreCard(this, 30, product => monetization().productPrice(product))");
    expect(map).toContain('this.storeCard.layout(safe, full, s)');
    expect(map).toContain('this.storeCard.update(performance.now() / 1000, this.reducedMotion, Date.now())');
    expect(map).toContain("track('store_opened', { source: 'map'");
    expect(map).toContain("for (const row of storeRows(facts)) track('purchase_offer_shown', { product: row.product })");
    expect(map).toContain('if (product === PRODUCT.heartRefill) this.health = redeemFill(result.claimId).health;');
    expect(map).toContain('else redeemHeldTimer(product, result.claimId);');
    // Back puts the card away, unless a purchase is still out; a drag under it never scrolls the road.
    expect(map).toMatch(/handleBack\(\): boolean \{[\s\S]*?if \(this\.storeCard\.open\) \{ if \(!this\.storeBusy\)/);
    expect(map).toContain('!this.storeCard.open && pointer.y > this.hudHeight');
    expect(map).toContain('|| this.storeCard.open) return;');
    // The puck's badge is polled once a second and the puck redrawn only when it moves.
    expect(map).toContain('if (storePuckBadge(this.storeFacts()) !== this.storeBadgeShown) this.puckDirty = true;');
  });

  it('is a shipped feature the release build checks for', () => {
    const marker = RELEASE_MARKERS.find(entry => entry.text === STORE_COPY.restore);
    expect(marker).toBeDefined();
    expect(src(marker!.source)).toContain(marker!.text);
  });
});
