import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { LAYOUT } from '../src/config/design';
import { HEALTH } from '../src/game/health';
import { REPLAY_TIMERS, WON_START_WINDOW_MS, type HeldTimer } from '../src/game/replayTimer';
import {
  buyLabel, heldCount, isSoldProduct, pickerSlots, refillRow, SHELF_SLOTS, shelfSlots, startRefusalCopy, STORE_STACK, storeHead,
  storePuckBadge, storeRows, storeShelf, storeSignature, storeStack, storeStatusChip, storeTimerLeft, timerStatus, type StoreFacts,
} from '../src/game/store';
import { STORE_COPY } from '../src/monetization/copy';
import { PRODUCT } from '../src/monetization/types';
import { RELEASE_MARKERS } from '../scripts/release-check.mjs';

vi.mock('phaser', () => ({ default: {} }));

const NOW = 1_700_000_000_000;
const MIN = 60_000;

function facts(over: Partial<StoreFacts> = {}): StoreFacts {
  return { premium: false, hearts: 3, heartsMax: HEALTH.max, timerExpiresAt: 0, held: [], available: true, now: NOW, ...over };
}

const won = (minutes: number, startBy = NOW + 40 * MIN): HeldTimer => ({ id: `won:2026-10-23:${minutes}`, minutes, source: 'won', startBy });
const bought = (minutes: number, id = `play:${minutes}`): HeldTimer => ({ id, minutes, source: 'bought' });

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
    // The terms say what a timer does and that the player starts it; nothing about a pick.
    expect(STORE_COPY.timersTerms).toBe('Restart as often as you like while it runs. Start it whenever you choose.');
    expect(STORE_COPY).not.toHaveProperty('timerPick');
  });

  it('badges the puck with the short time left, and with nothing else', () => {
    expect(storePuckBadge(facts())).toBe('');
    expect(storePuckBadge(facts({ hearts: 0 }))).toBe('');
    expect(storePuckBadge(facts({ held: [won(30), bought(60)] }))).toBe('');
    expect(storePuckBadge(facts({ timerExpiresAt: NOW + 29 * MIN }))).toBe('29m');
    expect(storePuckBadge(facts({ timerExpiresAt: NOW + 25 * 60 * MIN }))).toBe('1d');
    // A Premium account's restarts are free regardless, so its puck says nothing.
    expect(storePuckBadge(facts({ premium: true, timerExpiresAt: NOW + MIN }))).toBe('');
  });

  it('shows the shelf from the facts: won first by deadline, bought after, expired ones not counted', () => {
    const shelf = storeShelf(facts({ held: [bought(60), won(30, NOW + 50 * MIN), won(45, NOW + 10 * MIN), won(15, NOW - MIN)] }));
    expect(shelf.running).toBeNull();
    expect(shelf.items.map(item => [item.minutes, item.source, item.state])).toEqual([
      [15, 'won', 'expired'], [45, 'won', 'expiring'], [30, 'won', 'held'], [60, 'bought', 'held'],
    ]);
    expect(heldCount(facts({ held: [bought(60), won(30), won(15, NOW - MIN)] }))).toBe(2);
    expect(heldCount(facts())).toBe(0);
    // Settings' chip, from the same facts, in the chips' uppercase.
    expect(storeStatusChip(facts())).toBe('NOTHING HELD');
    expect(storeStatusChip(facts({ held: [bought(60)] }))).toBe('1 ON YOUR SHELF');
    expect(storeStatusChip(facts({ timerExpiresAt: NOW + MIN, held: [bought(60), won(30)] }))).toBe('1 RUNNING · 2 ON YOUR SHELF');
    expect(storeStatusChip(facts({ premium: true, held: [bought(60)] }))).toBe('');
    // A Start that did nothing says why.
    expect(startRefusalCopy('full')).toBe(STORE_COPY.startFull);
    expect(startRefusalCopy('expired')).toBe(STORE_COPY.startGone);
    expect(startRefusalCopy('started')).toBe(STORE_COPY.startRunning);
    expect(startRefusalCopy(undefined)).toBe(STORE_COPY.startRunning);
  });

  it('places up to three tokens with a ghost slot while there is room, and four equal picker chips', () => {
    expect(SHELF_SLOTS).toBe(3);
    expect(shelfSlots(0)).toEqual([{ x: 0, ghost: true }]);
    const one = shelfSlots(1);
    expect(one.map(slot => slot.ghost)).toEqual([false, true]);
    expect(one[0]!.x).toBeLessThan(one[1]!.x);
    expect(one[0]!.x + one[1]!.x).toBeCloseTo(0);
    expect(shelfSlots(3).map(slot => slot.ghost)).toEqual([false, false, false]);
    // A fourth held token waits its turn rather than widening the well.
    expect(shelfSlots(5)).toHaveLength(3);
    const chips = pickerSlots(560, 14);
    expect(chips).toHaveLength(REPLAY_TIMERS.length);
    for (const chip of chips) expect(chip.width).toBeCloseTo((560 - 14 * 3) / 4);
    expect(chips[0]!.x).toBeCloseTo(chips[0]!.width / 2);
    expect(chips[3]!.x + chips[3]!.width / 2).toBeCloseTo(560);
  });

  it('prices the one Buy from the catalogue and never guesses, and shows the refill or says the hearts are full', () => {
    const hour = REPLAY_TIMERS[1]!;
    expect(buyLabel(hour, '$1.49')).toBe(`Buy ${hour.label} · $1.49`);
    expect(buyLabel(hour, null)).toBe(`Buy ${hour.label}`);
    expect(refillRow(facts({ hearts: 2 }))).toEqual({ kind: 'offer', gauge: `2/${HEALTH.max}` });
    expect(refillRow(facts({ hearts: HEALTH.max }))).toEqual({ kind: 'full' });
    expect(refillRow(facts({ premium: true, hearts: 0 }))).toBeNull();
  });

  it('stacks the card by what it has to show, inside a phone frame, and the Premium card from its one line', () => {
    const m = STORE_STACK;
    // The chips, Buy and the refill row are controls, so each is the touch floor tall; Restore is a
    // text link whose seat is shorter, and the card grows its hit area to the floor at layout.
    for (const control of [m.picker, m.buy, m.refill]) expect(control).toBeGreaterThanOrEqual(LAYOUT.minTouchTarget);
    expect(src('src/ui/storeCard.ts')).toContain('rh = Math.max(m.restore * cs, LAYOUT.minTouchTarget * cs)');
    const full = storeStack({ premium: false, tokens: 3, refill: 'offered', termsLines: 2 });
    expect(full.shelfEyebrow).toBe(m.header + m.sectionGap);
    expect(full.shelf).toBe(full.shelfEyebrow! + m.eyebrow);
    expect(full.pickerHead).toBe(full.shelf! + m.shelf + m.sectionGap);
    expect(full.picker).toBe(full.pickerHead! + m.pickerHead + m.termsLine);
    expect(full.buy).toBe(full.picker! + m.picker + m.pickerGap);
    expect(full.refill).toBe(full.buy! + m.buy + m.sectionGap);
    expect(full.feedback).toBe(full.refill! + m.refill);
    expect(full.restore).toBe(full.feedback + m.feedback);
    expect(full.height).toBe(full.restore + m.restore + m.foot);
    expect(full.premiumLine).toBeNull();
    // The tallest card the store can show fits the shortest frame a phone lays out from.
    expect(full.height).toBeLessThanOrEqual(1000);
    // "Hearts are full" keeps the row's seat; one line of terms gives the picker a line back.
    expect(storeStack({ premium: false, tokens: 0, refill: 'full', termsLines: 1 }).refill).toBe(full.refill! - m.termsLine);
    expect(storeStack({ premium: false, tokens: 0, refill: null, termsLines: 2 }).feedback).toBe(full.buy! + m.buy + m.sectionGap);
    const premium = storeStack({ premium: true, tokens: 0, refill: null, termsLines: 1 });
    expect(premium.shelf).toBeNull();
    expect(premium.picker).toBeNull();
    expect(premium.premiumLine).toBe(m.header + m.sectionGap);
    expect(premium.restore).toBe(premium.premiumLine! + m.premiumLine + m.feedback);
    expect(premium.height).toBeLessThan(full.height);
  });

  it('changes its signature only when something shown moves', () => {
    const base = facts({ held: [won(30)] });
    expect(storeSignature(base)).toBe(storeSignature({ ...base, now: NOW + 1000 }));
    expect(storeSignature(base)).not.toBe(storeSignature({ ...base, hearts: 4 }));
    expect(storeSignature(base)).not.toBe(storeSignature({ ...base, timerExpiresAt: NOW + MIN }));
    // A won token's window text moves by the minute, and so does the signature.
    expect(storeSignature(base)).not.toBe(storeSignature({ ...base, now: NOW + 2 * MIN }));
    // An expired won item is still on the shelf (greyed) until the record prunes it.
    expect(storeSignature(base)).not.toBe(storeSignature({ ...base, now: NOW + WON_START_WINDOW_MS }));
  });

  it('is wired into the map: a labelled puck, the card on every frame, Start and the purchase re-read before the redraw', () => {
    const map = src('src/scenes/MapScene.ts');
    expect(map).toContain("new StoreCard(this, 30, { price: product => monetization().productPrice(product), facts: () => this.storeFacts() })");
    expect(map).toContain('this.storeCard.layout(safe, full, s)');
    expect(map).toContain('this.storeCard.update(performance.now() / 1000, this.reducedMotion, Date.now())');
    expect(map).toContain("track('store_opened', { source: 'map'");
    expect(map).toContain("for (const row of storeRows(facts)) track('purchase_offer_shown', { product: row.product })");
    expect(map).toContain('if (product === PRODUCT.heartRefill) this.health = redeemFill(result.claimId).health;');
    expect(map).toContain('else redeemHeldTimer(product, result.claimId);');
    // A held timer is started through the synced start, so the other device's shelf drops it.
    expect(map).toContain("else if (typeof storeTap === 'object' && 'start' in storeTap) this.startFromStore(storeTap.start);");
    expect(map).toContain('const outcome = startHeldTimerSynced(id);');
    expect(map).toContain('if (!outcome.started) this.storeCard.say(startRefusalCopy(outcome.reason));');
    // Back puts the card away, unless a purchase is still out; a drag under it never scrolls the road.
    expect(map).toMatch(/handleBack\(\): boolean \{[\s\S]*?if \(this\.storeCard\.open\) \{ if \(!this\.storeBusy\)/);
    expect(map).toContain('!this.storeCard.open && pointer.y > this.hudHeight');
    expect(map).toContain('|| this.storeCard.open) return;');
    // The puck's badge is polled once a second and the puck redrawn only when it moves.
    expect(map).toContain('if (storePuckBadge(this.storeFacts()) !== this.storeBadgeShown) this.puckDirty = true;');
  });

  it('is one row in Settings that opens the same card, over the sections and under the hint', () => {
    const settings = src('src/scenes/SettingsScene.ts');
    expect(settings).toContain("new StoreCard(this, 30, { price: product => monetization().productPrice(product), facts: () => readStoreFacts(loadHealth()) })");
    // Built before the hint, so the hint's camera is still the last and draws over it.
    expect(settings.indexOf('this.storeCard = new StoreCard(')).toBeLessThan(settings.indexOf("this.hint = new ScreenHint(this, 'settings')"));
    expect(settings).toContain('this.storeCard.layout(safe, this.viewport.full, s)');
    expect(settings).toContain('this.storeCard.update(now, this.reducedMotion, Date.now())');
    expect(settings).toContain("track('store_opened', { source: 'settings'");
    expect(settings).toContain("for (const row of storeRows(facts)) track('purchase_offer_shown', { product: row.product })");
    // Settings no longer sells anything itself: no timer rows, no refill chip, one Open.
    expect(settings).not.toMatch(/REPLAY_TIMERS|isTimerProduct|'refill'|refillOffered/);
    expect(settings).toContain("case 'store': this.openStore(); return;");
    expect(settings).toContain('STORE_COPY.settingsStore');
    expect(settings).toContain('storeStatusChip(readStoreFacts(loadHealth(), now))');
    // Every release and the wheel are the card's while it is open, and back closes it after the hint.
    expect(settings).toContain('if (this.storeCard.open) { this.drag = null; this.storeTap(pointer.x, pointer.y); return; }');
    expect(settings).toContain('if (this.scrollMax <= 0 || this.hint.open || this.storeCard.open) return;');
    expect(settings).toMatch(/handleBack\(\): boolean \{\s*if \(this\.hint\.back\(\)\) return true;\s*if \(this\.storeCard\.open\)/);
    expect(STORE_COPY.settingsStore).toBe('Timers and heart refill');
  });

  it('is a shipped feature the release build checks for, the shelf included', () => {
    for (const text of [STORE_COPY.restore, STORE_COPY.shelfTitle]) {
      const marker = RELEASE_MARKERS.find(entry => entry.text === text);
      expect(marker).toBeDefined();
      expect(src(marker!.source)).toContain(marker!.text);
    }
    expect(STORE_COPY.shelfTitle).toBe('Your timers');
  });
});
