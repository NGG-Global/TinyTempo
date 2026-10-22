import { describe, expect, it, vi } from 'vitest';
import {
  BILLING_RESPONSE, PRODUCT, claimIdFor, classifyPurchaseError, createMonetization, createPlayBilling,
} from '../src/monetization';
import type {
  PlayBillingClient, PurchaseUpdate, StoreProduct, StorePurchase,
} from '../src/monetization';
import { claimFill, type Health } from '../src/game/health';
import { readPremiumCache, writePremiumCache } from '../src/monetization/playBilling';

vi.mock('phaser', () => ({ default: {} }));

const REFILL_PRICE = '€2.49';
const TIMER_PRICE = '€0.99';
const REFILL_PRODUCT: StoreProduct = { productId: PRODUCT.heartRefill, formattedPrice: REFILL_PRICE };
const TIMER_PRODUCT: StoreProduct = { productId: PRODUCT.timer30m, formattedPrice: TIMER_PRICE };
/** Play still lists the legacy product for an account that owns it; the game never prices it. */
const PREMIUM_PRODUCT: StoreProduct = { productId: PRODUCT.premium, formattedPrice: '€7.99' };

function paid(productId: string, token: string, acknowledged = false): StorePurchase {
  return { productIds: [productId], purchaseToken: token, state: 'purchased', acknowledged };
}

function pendingPurchase(productId: string, token: string): StorePurchase {
  return { productIds: [productId], purchaseToken: token, state: 'pending', acknowledged: false };
}

interface FakeOptions {
  readonly products?: readonly StoreProduct[];
  /** Queued answers for successive queryPurchases calls; the last one repeats. */
  readonly owned?: readonly (readonly StorePurchase[])[];
  readonly connect?: 'ok' | 'fail' | 'fail-once';
  readonly queryProducts?: 'ok' | 'fail';
  readonly queryPurchases?: 'ok' | 'fail';
  readonly consume?: 'ok' | 'fail' | 'fail-once';
  readonly acknowledge?: 'ok' | 'fail';
  /** What launchPurchase resolves with, and what the listener then reports. */
  readonly launch?: number;
  readonly update?: (token: string) => PurchaseUpdate | null;
}

interface Fake extends PlayBillingClient {
  readonly connects: number;
  readonly consumed: readonly string[];
  readonly acknowledged: readonly string[];
  readonly purchaseQueries: number;
  emit(update: PurchaseUpdate): void;
}

function fakeClient(options: FakeOptions = {}): Fake {
  const listeners: ((update: PurchaseUpdate) => void)[] = [];
  const consumed: string[] = [];
  const acknowledged: string[] = [];
  const ownedQueue = [...(options.owned ?? [[]])];
  let connects = 0;
  let purchaseQueries = 0;
  let consumeCalls = 0;

  const client: Fake = {
    get connects() { return connects; },
    get consumed() { return consumed; },
    get acknowledged() { return acknowledged; },
    get purchaseQueries() { return purchaseQueries; },
    emit(update) { for (const listener of listeners) listener(update); },

    async connect() {
      connects += 1;
      if (options.connect === 'fail') throw new Error('no service');
      if (options.connect === 'fail-once' && connects === 1) throw new Error('no service');
    },

    async queryProducts() {
      if (options.queryProducts === 'fail') throw new Error('catalogue down');
      return options.products ?? [REFILL_PRODUCT, TIMER_PRODUCT, PREMIUM_PRODUCT];
    },

    async queryPurchases() {
      purchaseQueries += 1;
      if (options.queryPurchases === 'fail') throw new Error('offline');
      return ownedQueue.length > 1 ? (ownedQueue.shift() ?? []) : (ownedQueue[0] ?? []);
    },

    async launchPurchase(productId) {
      const code = options.launch ?? BILLING_RESPONSE.ok;
      if (code === BILLING_RESPONSE.ok && options.update) {
        const update = options.update(`token-${productId}`);
        if (update) queueMicrotask(() => { client.emit(update); });
      }
      return { code };
    },

    async acknowledge(purchaseToken) {
      if (options.acknowledge === 'fail') throw new Error('acknowledge failed');
      acknowledged.push(purchaseToken);
    },

    async consume(purchaseToken) {
      consumeCalls += 1;
      if (options.consume === 'fail') throw new Error('consume failed');
      if (options.consume === 'fail-once' && consumeCalls === 1) throw new Error('consume failed');
      consumed.push(purchaseToken);
    },

    async listen(listener) { listeners.push(listener); },
  };
  return client;
}

/** Counts grants the way health.ts and replayTimer.ts do: idempotent per claim id. */
function refillRecorder(): { readonly claims: string[]; readonly timers: string[]; fulfil: (claimId: string) => void; fulfilTimer: (product: string, claimId: string) => void } {
  const claims: string[] = [];
  const timers: string[] = [];
  const granted = new Set<string>();
  return {
    claims,
    timers,
    fulfil(claimId: string) {
      if (granted.has(claimId)) return;
      granted.add(claimId);
      claims.push(claimId);
    },
    fulfilTimer(product: string, claimId: string) {
      if (granted.has(claimId)) return;
      granted.add(claimId);
      timers.push(`${product}:${claimId}`);
    },
  };
}

const NO_GRANTS = { fulfilRefill: () => {}, fulfilTimer: () => {} } as const;

function billingUnder(options: FakeOptions = {}, refill = refillRecorder()): {
  readonly client: Fake;
  readonly refill: ReturnType<typeof refillRecorder>;
  readonly billing: ReturnType<typeof createPlayBilling>;
} {
  const client = fakeClient(options);
  const billing = createPlayBilling(client, { fulfilRefill: refill.fulfil, fulfilTimer: refill.fulfilTimer, cache: null });
  return { client, refill, billing };
}

function emptyHealth(): Health {
  return { hearts: 0, refillStartedAt: 1_700_000_000_000, spentAttempt: null };
}

describe('classifyPurchaseError', () => {
  it('maps Play response codes onto cancel and the unavailable family', () => {
    expect(classifyPurchaseError(BILLING_RESPONSE.userCanceled)).toBe('cancelled');
    expect(classifyPurchaseError(BILLING_RESPONSE.billingUnavailable)).toBe('unavailable');
    expect(classifyPurchaseError(BILLING_RESPONSE.serviceUnavailable)).toBe('unavailable');
    expect(classifyPurchaseError(BILLING_RESPONSE.serviceDisconnected)).toBe('unavailable');
    expect(classifyPurchaseError(BILLING_RESPONSE.featureNotSupported)).toBe('unavailable');
    expect(classifyPurchaseError(BILLING_RESPONSE.itemUnavailable)).toBe('unavailable');
    expect(classifyPurchaseError(BILLING_RESPONSE.error)).toBe('failed');
    expect(classifyPurchaseError(BILLING_RESPONSE.developerError)).toBe('failed');
    expect(classifyPurchaseError(BILLING_RESPONSE.networkError)).toBe('failed');
  });
});

describe('claim ids', () => {
  it('is stable per token, differs between tokens, and never contains the token', () => {
    const token = 'opaque-purchase-token-abc123';
    expect(claimIdFor(token)).toBe(claimIdFor(token));
    expect(claimIdFor(token)).not.toBe(claimIdFor(`${token}x`));
    expect(claimIdFor(token)).not.toContain(token);
    expect(claimIdFor(token).startsWith('play:')).toBe(true);
  });
});

describe('1. billing unavailable', () => {
  it('reports unavailable and neither grants nor prices anything', async () => {
    const { billing } = billingUnder({ connect: 'fail' });
    await billing.boot();
    expect(billing.available()).toBe(false);
    expect(billing.price(PRODUCT.timer30m)).toBeNull();
    await expect(billing.purchase(PRODUCT.timer30m)).resolves.toEqual({
      ok: false, product: PRODUCT.timer30m, reason: 'unavailable',
    });
    await expect(billing.restore()).resolves.toEqual({ ok: false, reason: 'unavailable' });
    expect(billing.premium()).toBe(false);
  });
});

describe('2. product query succeeds', () => {
  it('takes the localized prices from Play rather than hardcoding them, and never prices Premium', async () => {
    const { billing } = billingUnder();
    await billing.boot();
    expect(billing.available()).toBe(true);
    expect(billing.price(PRODUCT.heartRefill)).toBe(REFILL_PRICE);
    expect(billing.price(PRODUCT.timer30m)).toBe(TIMER_PRICE);
    // Play would still answer for the legacy product; the game does not ask, so no offer can show it.
    expect(billing.price(PRODUCT.premium)).toBeNull();
  });
});

describe('3. product query fails', () => {
  it('keeps the store available but offers no price, and refuses to launch a sheet', async () => {
    const { billing } = billingUnder({ queryProducts: 'fail' });
    await billing.boot();
    expect(billing.available()).toBe(true);
    expect(billing.price(PRODUCT.timer30m)).toBeNull();
    await expect(billing.purchase(PRODUCT.timer30m)).resolves.toEqual({
      ok: false, product: PRODUCT.timer30m, reason: 'unavailable',
    });
  });
});

describe('4. a replay timer purchase succeeds', () => {
  it('grants the timer once, then consumes, and never acknowledges separately', async () => {
    const { billing, client, refill } = billingUnder({
      update: token => ({ code: BILLING_RESPONSE.ok, purchases: [paid(PRODUCT.timer30m, token)] }),
    });
    await expect(billing.purchase(PRODUCT.timer30m)).resolves.toMatchObject({
      ok: true, product: PRODUCT.timer30m,
    });
    expect(refill.timers).toEqual([`${PRODUCT.timer30m}:${claimIdFor(`token-${PRODUCT.timer30m}`)}`]);
    expect(refill.claims).toEqual([]);
    expect(client.consumed).toEqual([`token-${PRODUCT.timer30m}`]);
    expect(client.acknowledged).toEqual([]);
    expect(billing.premium()).toBe(false);
  });

  it('tells the four timers apart by product, and sells each', async () => {
    for (const product of [PRODUCT.timer30m, PRODUCT.timer1h, PRODUCT.timer2h, PRODUCT.timer1d]) {
      const { billing, refill } = billingUnder({
        products: [{ productId: product, formattedPrice: TIMER_PRICE }],
        update: token => ({ code: BILLING_RESPONSE.ok, purchases: [paid(product, token)] }),
      });
      await expect(billing.purchase(product)).resolves.toMatchObject({ ok: true, product });
      expect(refill.timers).toEqual([`${product}:${claimIdFor(`token-${product}`)}`]);
    }
  });
});

describe('5. a timer purchase is pending', () => {
  it('grants nothing while Play is still checking the payment', async () => {
    const { billing, client, refill } = billingUnder({
      update: token => ({ code: BILLING_RESPONSE.ok, purchases: [pendingPurchase(PRODUCT.timer30m, token)] }),
    });
    await expect(billing.purchase(PRODUCT.timer30m)).resolves.toEqual({
      ok: false, product: PRODUCT.timer30m, reason: 'pending',
    });
    expect(refill.timers).toEqual([]);
    expect(client.consumed).toEqual([]);
  });
});

describe('6. a timer purchase is cancelled', () => {
  it('reports cancellation from the listener and grants nothing', async () => {
    const { billing, refill } = billingUnder({
      update: () => ({ code: BILLING_RESPONSE.userCanceled, purchases: [] }),
    });
    await expect(billing.purchase(PRODUCT.timer30m)).resolves.toEqual({
      ok: false, product: PRODUCT.timer30m, reason: 'cancelled',
    });
    expect(refill.timers).toEqual([]);
  });

  it('reports cancellation when the sheet itself refuses to open', async () => {
    const { billing } = billingUnder({ launch: BILLING_RESPONSE.userCanceled });
    await expect(billing.purchase(PRODUCT.timer30m)).resolves.toEqual({
      ok: false, product: PRODUCT.timer30m, reason: 'cancelled',
    });
  });
});

describe('7. a consumable Play says is already owned', () => {
  it('turns ITEM_ALREADY_OWNED into the grant by asking Play what is owned, and consumes it', async () => {
    // A crash between a grant and its consume leaves the purchase held: Play refuses to sell
    // it again until it is consumed, and the reconcile here is what consumes it.
    const { billing, client, refill } = billingUnder({
      products: [{ productId: PRODUCT.timer1h, formattedPrice: TIMER_PRICE }],
      launch: BILLING_RESPONSE.itemAlreadyOwned,
      owned: [[], [paid(PRODUCT.timer1h, 'held-token')]],
    });
    await expect(billing.purchase(PRODUCT.timer1h)).resolves.toEqual({
      ok: true, product: PRODUCT.timer1h, claimId: claimIdFor('held-token'),
    });
    expect(refill.timers).toEqual([`${PRODUCT.timer1h}:${claimIdFor('held-token')}`]);
    expect(client.consumed).toEqual(['held-token']);
  });
});

describe('the legacy Premium: honoured, never sold', () => {
  it('refuses to sell it, even to an account that does not own it', async () => {
    const { billing, client } = billingUnder();
    await billing.boot();
    await expect(billing.purchase(PRODUCT.premium)).resolves.toEqual({
      ok: false, product: PRODUCT.premium, reason: 'unavailable',
    });
    expect(client.purchaseQueries).toBe(1);
  });

  it('grants it from ownership, acknowledges once and never consumes', async () => {
    const { billing, client } = billingUnder({ owned: [[paid(PRODUCT.premium, 'owned-token')]] });
    await billing.boot();
    expect(billing.premium()).toBe(true);
    expect(client.acknowledged).toEqual(['owned-token']);
    expect(client.consumed).toEqual([]);
    await billing.reconcile();
    expect(client.acknowledged).toEqual(['owned-token']);
  });

  it('does not acknowledge a purchase Play already acknowledged', async () => {
    const { billing, client } = billingUnder({ owned: [[paid(PRODUCT.premium, 'owned-token', true)]] });
    await billing.boot();
    expect(billing.premium()).toBe(true);
    expect(client.acknowledged).toEqual([]);
  });

  it('enables premium on startup even when local state said otherwise', async () => {
    const { billing } = billingUnder({ owned: [[paid(PRODUCT.premium, 'owned-token')]] });
    expect(billing.premium()).toBe(false);
    await billing.boot();
    expect(billing.premium()).toBe(true);
  });
});

describe('8. restore detects existing premium ownership', () => {
  it('restores premium and acknowledges it if Play never saw an acknowledgement', async () => {
    const { billing, client } = billingUnder({ owned: [[paid(PRODUCT.premium, 'owned-token')]] });
    await expect(billing.restore()).resolves.toEqual({ ok: true, premium: true });
    expect(billing.premium()).toBe(true);
    expect(client.acknowledged).toEqual(['owned-token']);
  });
});

describe('9. restore finds no premium purchase', () => {
  it('reports no purchases and never restores a consumed refill', async () => {
    const { billing, refill } = billingUnder({ owned: [[]] });
    await expect(billing.restore()).resolves.toEqual({ ok: true, premium: false });
    expect(billing.premium()).toBe(false);
    expect(refill.claims).toEqual([]);
  });

  it('reports failure rather than "not owned" when the query itself fails', async () => {
    const { billing } = billingUnder({ queryPurchases: 'fail' });
    await expect(billing.restore()).resolves.toEqual({ ok: false, reason: 'failed' });
  });
});

describe('10. heart refill purchase succeeds and is consumed', () => {
  it('grants once, then consumes, and never acknowledges separately', async () => {
    const { billing, client, refill } = billingUnder({
      update: token => ({ code: BILLING_RESPONSE.ok, purchases: [paid(PRODUCT.heartRefill, token)] }),
    });
    const result = await billing.purchase(PRODUCT.heartRefill);
    expect(result).toMatchObject({ ok: true, product: PRODUCT.heartRefill });
    expect(refill.claims).toHaveLength(1);
    expect(client.consumed).toHaveLength(1);
    expect(client.acknowledged).toEqual([]);
    // The claim id the scene receives is the one already fulfilled, so redeemFill is a no-op.
    if (result.ok) expect(result.claimId).toBe(refill.claims[0]);
  });

  it('fills the bar through health.ts and refuses the same claim twice', () => {
    const claimId = claimIdFor('token-heart_refill_full');
    const first = claimFill(emptyHealth(), claimId, 1_700_000_000_000, null);
    const again = claimFill(first.health, claimId, 1_700_000_000_000, null);
    expect(first.granted).toBe(true);
    expect(first.health.hearts).toBe(5);
    expect(again.granted).toBe(false);
    expect(again.health.hearts).toBe(5);
  });
});

describe('11. heart refill remains pending and is not granted', () => {
  it('grants nothing and consumes nothing while the payment is pending', async () => {
    const { billing, client, refill } = billingUnder({
      update: token => ({ code: BILLING_RESPONSE.ok, purchases: [pendingPurchase(PRODUCT.heartRefill, token)] }),
    });
    await expect(billing.purchase(PRODUCT.heartRefill)).resolves.toEqual({
      ok: false, product: PRODUCT.heartRefill, reason: 'pending',
    });
    expect(refill.claims).toEqual([]);
    expect(client.consumed).toEqual([]);
  });

  it('grants it later, once the same purchase clears to purchased', async () => {
    const token = 'slow-payment';
    const { billing, refill, client } = billingUnder({
      owned: [[pendingPurchase(PRODUCT.heartRefill, token)], [paid(PRODUCT.heartRefill, token)]],
    });
    await billing.boot();
    expect(refill.claims).toEqual([]);
    await billing.reconcile();
    expect(refill.claims).toEqual([claimIdFor(token)]);
    expect(client.consumed).toEqual([token]);
  });
});

describe('12. duplicate heart purchase callback does not grant twice', () => {
  it('ignores a replayed listener update for a purchase already fulfilled', async () => {
    const token = 'token-heart_refill_full';
    const update: PurchaseUpdate = { code: BILLING_RESPONSE.ok, purchases: [paid(PRODUCT.heartRefill, token)] };
    const { billing, client, refill } = billingUnder({ update: () => update });
    await billing.purchase(PRODUCT.heartRefill);
    client.emit(update);
    client.emit(update);
    await Promise.resolve();
    await Promise.resolve();
    expect(refill.claims).toHaveLength(1);
    expect(client.consumed).toHaveLength(1);
  });

  it('ignores the same purchase arriving again from a later reconcile', async () => {
    const token = 'replayed';
    const { billing, refill } = billingUnder({ owned: [[paid(PRODUCT.heartRefill, token)]] });
    await billing.boot();
    await billing.reconcile();
    await billing.reconcile();
    expect(refill.claims).toEqual([claimIdFor(token)]);
  });
});

describe('13. consume failure can be safely retried', () => {
  it('keeps the grant, leaves the purchase unconsumed, and consumes on the next reconcile', async () => {
    const token = 'stubborn';
    const { billing, client, refill } = billingUnder({
      consume: 'fail-once',
      owned: [[paid(PRODUCT.heartRefill, token)]],
    });
    await billing.boot();
    expect(refill.claims).toEqual([claimIdFor(token)]);
    expect(client.consumed).toEqual([]);

    await billing.reconcile();
    // Granted once in total, consumed on the retry.
    expect(refill.claims).toEqual([claimIdFor(token)]);
    expect(client.consumed).toEqual([token]);
  });
});

describe('14. billing reconnects after service interruption', () => {
  it('retries a failed connection rather than latching the store off', async () => {
    const { billing, client } = billingUnder({ connect: 'fail-once' });
    await billing.boot();
    expect(billing.available()).toBe(false);
    expect(client.connects).toBe(1);

    await billing.boot();
    expect(billing.available()).toBe(true);
    expect(client.connects).toBe(2);
    expect(billing.price(PRODUCT.heartRefill)).toBe(REFILL_PRICE);
  });

  it('keeps the store available when an ownership query fails, and recovers later', async () => {
    // The native client reconnects itself, so a failed query must not take the store
    // offline — it only means this question went unanswered.
    const client = fakeClient({ queryPurchases: 'fail' });
    const billing = createPlayBilling(client, { ...NO_GRANTS, cache: null });
    await billing.boot();
    expect(billing.available()).toBe(true);
    expect(billing.price(PRODUCT.heartRefill)).toBe(REFILL_PRICE);
    await expect(billing.restore()).resolves.toEqual({ ok: false, reason: 'failed' });

    const recovered = fakeClient({ owned: [[paid(PRODUCT.premium, 'owned-token')]] });
    const after = createPlayBilling(recovered, { ...NO_GRANTS, cache: null });
    await after.reconcile();
    expect(after.premium()).toBe(true);
  });
});

describe('premium is Play ownership, not a local flag', () => {
  it('revokes a cached entitlement only when Play successfully says it is not owned', async () => {
    const cache: Storage = memoryStorage();
    writePremiumCache(cache, true);
    const client = fakeClient({ owned: [[]] });
    const billing = createPlayBilling(client, { ...NO_GRANTS, cache });
    expect(billing.premium()).toBe(true);
    await billing.boot();
    expect(billing.premium()).toBe(false);
    expect(readPremiumCache(cache)).toBe(false);
  });

  it('keeps a cached entitlement when the ownership query fails', async () => {
    const cache: Storage = memoryStorage();
    writePremiumCache(cache, true);
    const client = fakeClient({ queryPurchases: 'fail' });
    const billing = createPlayBilling(client, { ...NO_GRANTS, cache });
    await billing.boot();
    expect(billing.premium()).toBe(true);
    expect(readPremiumCache(cache)).toBe(true);
  });

  it('expires a cache older than a month, so a restored backup is not an entitlement', () => {
    const cache: Storage = memoryStorage();
    const now = 1_700_000_000_000;
    writePremiumCache(cache, true, now - 31 * 24 * 60 * 60 * 1000);
    expect(readPremiumCache(cache, now)).toBe(false);
  });
});

describe('15. browser and development mode', () => {
  it('starts with no Play Billing at all and sells nothing', async () => {
    const commerce = createMonetization();
    expect(commerce.purchasesAvailable()).toBe(false);
    expect(commerce.premium()).toBe(false);
    expect(commerce.productPrice(PRODUCT.timer30m)).toBeNull();
    await expect(commerce.purchase(PRODUCT.timer30m)).resolves.toEqual({
      ok: false, product: PRODUCT.timer30m, reason: 'unavailable',
    });
    await expect(commerce.restorePurchases()).resolves.toEqual({ ok: true, premium: false });
  });
});

describe('a sheet that is never settled by Play', () => {
  it('releases the purchase lock instead of failing every later purchase', async () => {
    const client = fakeClient(); // launch resolves OK, no listener update ever arrives
    const billing = createPlayBilling(client, {
      ...NO_GRANTS, cache: null, sheetTimeoutMs: 20,
    });
    await expect(billing.purchase(PRODUCT.timer30m)).resolves.toEqual({
      ok: false, product: PRODUCT.timer30m, reason: 'failed',
    });
    // The store is usable again: the lock released with the timer.
    await expect(billing.purchase(PRODUCT.timer30m)).resolves.toEqual({
      ok: false, product: PRODUCT.timer30m, reason: 'failed',
    });
  });
});

describe('the facade over Play Billing', () => {
  it('refuses a second sheet while one purchase is in flight', async () => {
    const { billing } = billingUnder({
      update: token => ({ code: BILLING_RESPONSE.ok, purchases: [paid(PRODUCT.timer30m, token)] }),
    });
    await billing.boot();
    const first = billing.purchase(PRODUCT.timer30m);
    const second = billing.purchase(PRODUCT.timer30m);
    await expect(second).resolves.toEqual({ ok: false, product: PRODUCT.timer30m, reason: 'failed' });
    await expect(first).resolves.toMatchObject({ ok: true });
  });

  it('reports an unknown product as unavailable without touching Play', async () => {
    const { billing, client } = billingUnder();
    const result = await billing.purchase('not_a_product' as never);
    expect(result).toEqual({ ok: false, product: 'not_a_product', reason: 'unavailable' });
    expect(client.connects).toBe(0);
  });

  it('carries a successful purchase through createMonetization unchanged', async () => {
    const { billing } = billingUnder({
      update: token => ({ code: BILLING_RESPONSE.ok, purchases: [paid(PRODUCT.timer30m, token)] }),
    });
    const commerce = createMonetization({ billing });
    await expect(commerce.purchase(PRODUCT.timer30m)).resolves.toMatchObject({ ok: true, product: PRODUCT.timer30m });
    expect(commerce.premium()).toBe(false);
  });
});

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => { map.delete(key); },
    setItem: (key: string, value: string) => { map.set(key, value); },
  };
}
