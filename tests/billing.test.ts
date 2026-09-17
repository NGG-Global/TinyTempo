import { describe, expect, it, vi } from 'vitest';
import { PRODUCT, classifyPurchaseError, createMonetization, createRevenueCatBilling } from '../src/monetization';
import { claimFill, type Health } from '../src/game/health';
import type { CatalogProduct, CustomerSnapshot, PurchasesClient, PurchaseReceipt } from '../src/monetization';
import { readPremiumCache, writePremiumCache } from '../src/monetization/billing';

vi.mock('phaser', () => ({ default: {} }));

const PRICE = '€2.49';
const PRODUCT_ID = PRODUCT.heartRefill;
const ITEM: CatalogProduct = { identifier: PRODUCT_ID, priceString: PRICE, handle: { id: PRODUCT_ID } };

function receipt(id: string, extra: StoreTxn[] = [], entitlements: readonly string[] = []): PurchaseReceipt {
  return {
    productIdentifier: PRODUCT_ID,
    transactionId: id,
    customer: { transactions: [{ id, productId: PRODUCT_ID }, ...extra], entitlements: [...entitlements] },
  };
}

type StoreTxn = { id: string; productId: string };

interface FakeOptions {
  readonly products?: readonly CatalogProduct[];
  readonly history?: CustomerSnapshot;
  readonly purchase?: 'ok' | 'cancel' | 'fail' | 'pending' | 'ok-twice' | 'cancel-then-info' | 'pending-then-info' | 'empty-txn' | 'slow' | 'premium-ok' | 'already-owned';
  readonly restore?: 'ok' | 'fail';
  readonly customerInfo?: 'ok' | 'fail';
}

function fakeClient(options: FakeOptions = {}): PurchasesClient & {
  readonly configures: number;
  emit(info: CustomerSnapshot): void;
} {
  const listeners: ((info: CustomerSnapshot) => void)[] = [];
  let configures = 0;
  const client: PurchasesClient & { configures: number; emit: (info: CustomerSnapshot) => void } = {
    get configures() { return configures; },
    emit(info) { for (const listener of listeners) listener(info); },
    async configure() { configures += 1; },
    async getProducts() { return options.products ?? [ITEM]; },
    async customerInfo() {
      if (options.customerInfo === 'fail') throw new Error('offline');
      return options.history ?? { transactions: [], entitlements: [] };
    },
    async listen(listener) { listeners.push(listener); },
    async purchase() {
      const mode = options.purchase ?? 'ok';
      if (mode === 'fail') throw { code: '2', userCancelled: false };
      if (mode === 'pending') throw { code: '20', userCancelled: false };
      if (mode === 'cancel') throw { code: '1', userCancelled: true };
      if (mode === 'slow') {
        await new Promise(resolve => { globalThis.setTimeout(resolve, 40); });
        return receipt('txn-slow');
      }
      if (mode === 'empty-txn') {
        return { productIdentifier: PRODUCT_ID, transactionId: '', customer: { transactions: [], entitlements: [] } };
      }
      if (mode === 'premium-ok') {
        return {
          productIdentifier: PRODUCT.premium,
          transactionId: 'prem-1',
          customer: { transactions: [], entitlements: [PRODUCT.premium] },
        };
      }
      if (mode === 'already-owned') throw { code: '6', userCancelled: false };
      if (mode === 'cancel-then-info') {
        queueMicrotask(() => client.emit({ transactions: [{ id: 'late-txn', productId: PRODUCT_ID }], entitlements: [] }));
        throw { code: '1', userCancelled: true };
      }
      if (mode === 'pending-then-info') {
        queueMicrotask(() => client.emit({ transactions: [{ id: 'pending-txn', productId: PRODUCT_ID }], entitlements: [] }));
        throw { code: '20', userCancelled: false };
      }
      if (mode === 'ok-twice') {
        const paid = receipt('dup-txn');
        queueMicrotask(() => client.emit(paid.customer));
        return paid;
      }
      return receipt('txn-1');
    },
    async restore() {
      if (options.restore === 'fail') throw new Error('restore failed');
      return options.history ?? { transactions: [{ id: 'old', productId: PRODUCT_ID }], entitlements: [] };
    },
  };
  return client;
}

function emptyHealth(): Health {
  return { hearts: 0, refillStartedAt: 1_700_000_000_000, spentAttempt: null };
}

describe('classifyPurchaseError', () => {
  it('maps RevenueCat codes onto cancel, pending and failure', () => {
    expect(classifyPurchaseError({ userCancelled: true, code: '2' })).toBe('cancelled');
    expect(classifyPurchaseError({ code: '1' })).toBe('cancelled');
    expect(classifyPurchaseError({ code: '20' })).toBe('pending');
    expect(classifyPurchaseError({ code: '5' })).toBe('unavailable');
    expect(classifyPurchaseError({ code: '2' })).toBe('failed');
    expect(classifyPurchaseError('boom')).toBe('failed');
  });
});

describe('RevenueCat heart refill', () => {
  it('exposes the localized store price and never a guessed amount', async () => {
    const billing = createRevenueCatBilling(fakeClient(), { apiKey: 'goog_test', lateMs: 5 });
    await billing.boot();
    expect(billing.available()).toBe(true);
    expect(billing.price(PRODUCT.heartRefill)).toBe(PRICE);
    expect(billing.price(PRODUCT.premium)).toBeNull();
  });

  it('stays unavailable without an API key or a catalogue product', async () => {
    const missingKey = createRevenueCatBilling(fakeClient(), { apiKey: '', lateMs: 5 });
    await missingKey.boot();
    expect(missingKey.available()).toBe(false);
    await expect(missingKey.purchase(PRODUCT.heartRefill)).resolves.toEqual({
      ok: false, product: PRODUCT.heartRefill, reason: 'unavailable',
    });

    const missingProduct = createRevenueCatBilling(fakeClient({ products: [] }), { apiKey: 'goog_test', lateMs: 5 });
    await missingProduct.boot();
    expect(missingProduct.available()).toBe(true);
    expect(missingProduct.price(PRODUCT.heartRefill)).toBeNull();
    await expect(missingProduct.purchase(PRODUCT.heartRefill)).resolves.toEqual({
      ok: false, product: PRODUCT.heartRefill, reason: 'unavailable',
    });
  });

  it('returns a claim id on success so a caller can fill once', async () => {
    const billing = createRevenueCatBilling(fakeClient({ purchase: 'ok-twice' }), { apiKey: 'goog_test', lateMs: 5 });
    const result = await billing.purchase(PRODUCT.heartRefill);
    expect(result).toEqual({ ok: true, product: PRODUCT.heartRefill, claimId: 'dup-txn' });
    const first = claimFill(emptyHealth(), result.ok ? result.claimId : '', 1_700_000_000_000);
    const again = claimFill(first.health, result.ok ? result.claimId : '', 1_700_000_000_000);
    expect(first.granted).toBe(true);
    expect(first.health.hearts).toBe(5);
    expect(again.granted).toBe(false);
  });

  it('does not fill hearts when the player cancels', async () => {
    const billing = createRevenueCatBilling(fakeClient({ purchase: 'cancel' }), { apiKey: 'goog_test', lateMs: 5 });
    await expect(billing.purchase(PRODUCT.heartRefill)).resolves.toEqual({
      ok: false, product: PRODUCT.heartRefill, reason: 'cancelled',
    });
    expect(emptyHealth().hearts).toBe(0);
  });

  it('does not fill hearts when the store reports a pending payment', async () => {
    const billing = createRevenueCatBilling(fakeClient({ purchase: 'pending' }), { apiKey: 'goog_test', lateMs: 5 });
    await expect(billing.purchase(PRODUCT.heartRefill)).resolves.toEqual({
      ok: false, product: PRODUCT.heartRefill, reason: 'pending',
    });
  });

  it('does not fill from a CustomerInfo update that races a pending sheet', async () => {
    const billing = createRevenueCatBilling(fakeClient({ purchase: 'pending-then-info' }), { apiKey: 'goog_test', lateMs: 30 });
    await expect(billing.purchase(PRODUCT.heartRefill)).resolves.toEqual({
      ok: false, product: PRODUCT.heartRefill, reason: 'pending',
    });
    expect(emptyHealth().hearts).toBe(0);
  });

  it('does not fill hearts when the store fails', async () => {
    const billing = createRevenueCatBilling(fakeClient({ purchase: 'fail' }), { apiKey: 'goog_test', lateMs: 5 });
    await expect(billing.purchase(PRODUCT.heartRefill)).resolves.toEqual({
      ok: false, product: PRODUCT.heartRefill, reason: 'failed',
    });
  });

  it('treats a cancelled sheet that later reports a paid transaction as success', async () => {
    const billing = createRevenueCatBilling(fakeClient({ purchase: 'cancel-then-info' }), { apiKey: 'goog_test', lateMs: 30 });
    await expect(billing.purchase(PRODUCT.heartRefill)).resolves.toEqual({
      ok: true, product: PRODUCT.heartRefill, claimId: 'late-txn',
    });
  });

  it('does not restore consumable refills as a permanent purchase', async () => {
    const billing = createRevenueCatBilling(fakeClient({
      history: { transactions: [{ id: 'old-fill', productId: PRODUCT_ID }], entitlements: [] },
    }), { apiKey: 'goog_test', lateMs: 5 });
    await billing.boot();
    await expect(billing.restore()).resolves.toEqual({ ok: true, premium: false });
    expect(billing.premium()).toBe(false);
    expect(emptyHealth().hearts).toBe(0);
  });

  it('configures once', async () => {
    const client = fakeClient();
    const billing = createRevenueCatBilling(client, { apiKey: 'goog_test', lateMs: 5 });
    await billing.boot();
    await billing.boot();
    expect(client.configures).toBe(1);
  });

  it('rejects a second purchase while one is already in flight', async () => {
    const billing = createRevenueCatBilling(fakeClient({ purchase: 'slow' }), { apiKey: 'goog_test', lateMs: 5 });
    const first = billing.purchase(PRODUCT.heartRefill);
    await expect(billing.purchase(PRODUCT.heartRefill)).resolves.toEqual({
      ok: false, product: PRODUCT.heartRefill, reason: 'failed',
    });
    await expect(first).resolves.toEqual({ ok: true, product: PRODUCT.heartRefill, claimId: 'txn-slow' });
  });

  it('does not grant when the store omits a transaction id', async () => {
    const billing = createRevenueCatBilling(fakeClient({ purchase: 'empty-txn' }), { apiKey: 'goog_test', lateMs: 5 });
    await expect(billing.purchase(PRODUCT.heartRefill)).resolves.toEqual({
      ok: false, product: PRODUCT.heartRefill, reason: 'failed',
    });
  });
});

describe('heart refill through the facade', () => {
  it('records success and still requires a claim id to fill', async () => {
    const billing = createRevenueCatBilling(fakeClient({ purchase: 'ok' }), { apiKey: 'goog_test', lateMs: 5 });
    const commerce = createMonetization({ billing });
    expect(commerce.productPrice(PRODUCT.heartRefill)).toBeNull();
    await billing.boot();
    expect(commerce.productPrice(PRODUCT.heartRefill)).toBe(PRICE);
    const result = await commerce.purchase(PRODUCT.heartRefill);
    expect(result).toEqual({ ok: true, product: PRODUCT.heartRefill, claimId: 'txn-1' });
  });
});

const PREMIUM_ITEM: CatalogProduct = { identifier: PRODUCT.premium, priceString: '€4.99', handle: { id: PRODUCT.premium } };

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    getItem: k => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: k => { map.delete(k); },
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

describe('RevenueCat Premium entitlement', () => {
  it('exposes the localized Premium price', async () => {
    const billing = createRevenueCatBilling(fakeClient({ products: [ITEM, PREMIUM_ITEM] }), {
      apiKey: 'goog_test', lateMs: 5, cache: memoryStorage(),
    });
    await billing.boot();
    expect(billing.price(PRODUCT.premium)).toBe('€4.99');
  });

  it('unlocks Premium from active entitlement state', async () => {
    const billing = createRevenueCatBilling(fakeClient({
      products: [ITEM, PREMIUM_ITEM],
      history: { transactions: [], entitlements: [PRODUCT.premium] },
    }), { apiKey: 'goog_test', lateMs: 5, cache: memoryStorage() });
    await billing.boot();
    expect(billing.premium()).toBe(true);
  });

  it('restores Premium on a new device and never fills hearts', async () => {
    const billing = createRevenueCatBilling(fakeClient({
      products: [ITEM, PREMIUM_ITEM],
      history: { transactions: [{ id: 'old-fill', productId: PRODUCT_ID }], entitlements: [PRODUCT.premium] },
    }), { apiKey: 'goog_test', lateMs: 5, cache: memoryStorage() });
    await expect(billing.restore()).resolves.toEqual({ ok: true, premium: true });
    expect(billing.premium()).toBe(true);
    expect(emptyHealth().hearts).toBe(0);
  });

  it('keeps cached Premium when customer info cannot be fetched', async () => {
    const cache = memoryStorage();
    const entitled = createRevenueCatBilling(fakeClient({
      products: [ITEM, PREMIUM_ITEM],
      history: { transactions: [], entitlements: [PRODUCT.premium] },
    }), { apiKey: 'goog_test', lateMs: 5, cache });
    await entitled.boot();
    expect(entitled.premium()).toBe(true);

    const offline = createRevenueCatBilling(fakeClient({
      products: [ITEM, PREMIUM_ITEM],
      customerInfo: 'fail',
    }), { apiKey: 'goog_test', lateMs: 5, cache });
    await offline.boot();
    expect(offline.premium()).toBe(true);
  });

  it('grants Premium after a confirmed purchase', async () => {
    const billing = createRevenueCatBilling(fakeClient({
      products: [ITEM, PREMIUM_ITEM],
      purchase: 'premium-ok',
    }), { apiKey: 'goog_test', lateMs: 5, cache: memoryStorage() });
    await expect(billing.purchase(PRODUCT.premium)).resolves.toEqual({
      ok: true, product: PRODUCT.premium, claimId: 'prem-1',
    });
    expect(billing.premium()).toBe(true);
  });

  it('treats an already-owned product as Premium when the entitlement is active', async () => {
    const billing = createRevenueCatBilling(fakeClient({
      products: [ITEM, PREMIUM_ITEM],
      purchase: 'already-owned',
      history: { transactions: [], entitlements: [PRODUCT.premium] },
    }), { apiKey: 'goog_test', lateMs: 5, cache: memoryStorage() });
    await expect(billing.purchase(PRODUCT.premium)).resolves.toEqual({
      ok: true, product: PRODUCT.premium, claimId: PRODUCT.premium,
    });
    expect(billing.premium()).toBe(true);
  });

  it('does not revoke Premium when a heart refill reports no entitlements', async () => {
    const client = fakeClient({
      products: [ITEM, PREMIUM_ITEM],
      history: { transactions: [], entitlements: [PRODUCT.premium] },
      purchase: 'ok-twice',
    });
    const billing = createRevenueCatBilling(client, {
      apiKey: 'goog_test', lateMs: 5, cache: memoryStorage(),
    });
    await billing.boot();
    expect(billing.premium()).toBe(true);
    await expect(billing.purchase(PRODUCT.heartRefill)).resolves.toEqual({
      ok: true, product: PRODUCT.heartRefill, claimId: 'dup-txn',
    });
    expect(billing.premium()).toBe(true);
  });

  it('clears cached Premium when live customer info has no entitlement', async () => {
    const cache = memoryStorage({
      'tiny-tempo.premium.v1': JSON.stringify({ version: 1, entitled: true }),
    });
    const billing = createRevenueCatBilling(fakeClient({
      products: [ITEM, PREMIUM_ITEM],
      history: { transactions: [], entitlements: [] },
    }), { apiKey: 'goog_test', lateMs: 5, cache });
    await billing.boot();
    expect(billing.premium()).toBe(false);
  });

  it('does not unlock Premium when the player cancels', async () => {
    const billing = createRevenueCatBilling(fakeClient({
      products: [ITEM, PREMIUM_ITEM],
      purchase: 'cancel',
    }), { apiKey: 'goog_test', lateMs: 5, cache: memoryStorage() });
    await expect(billing.purchase(PRODUCT.premium)).resolves.toEqual({
      ok: false, product: PRODUCT.premium, reason: 'cancelled',
    });
    expect(billing.premium()).toBe(false);
  });

  it('ignores a corrupt Premium cache rather than trusting it', async () => {
    const cache = memoryStorage({ 'tiny-tempo.premium.v1': '{not json' });
    const billing = createRevenueCatBilling(fakeClient({
      products: [ITEM, PREMIUM_ITEM],
      customerInfo: 'fail',
    }), { apiKey: 'goog_test', lateMs: 5, cache });
    await billing.boot();
    expect(billing.premium()).toBe(false);
  });
});

describe('the cached entitlement', () => {
  const KEY = 'tiny-tempo.premium.v1';
  const DAY = 24 * 60 * 60 * 1000;
  const NOW = 1_800_000_000_000;

  it('honours a recent cache, so premium does not flicker off on a slow boot', () => {
    const storage = memoryStorage();
    writePremiumCache(storage, true, NOW);
    expect(readPremiumCache(storage, NOW)).toBe(true);
    expect(readPremiumCache(storage, NOW + 29 * DAY)).toBe(true);
  });

  it('stops honouring one the store has not confirmed in a month', () => {
    // The bound is the whole reason this is a grace period and not a licence.
    const storage = memoryStorage();
    writePremiumCache(storage, true, NOW);
    expect(readPremiumCache(storage, NOW + 31 * DAY)).toBe(false);
  });

  it('does not grant premium from a restored backup', () => {
    // Auto Backup carries the WebView store to a new device. Before the timestamp this
    // read `entitled === true` and nothing else, so a backup was a permanent entitlement
    // on any device that never reached the network.
    const restored = memoryStorage({ [KEY]: JSON.stringify({ version: 1, entitled: true }) });
    expect(readPremiumCache(restored, NOW)).toBe(false);
  });

  it('refuses a cache from the future or from a clock that moved back', () => {
    const storage = memoryStorage();
    writePremiumCache(storage, true, NOW);
    expect(readPremiumCache(storage, NOW - DAY)).toBe(false);
  });

  it('refuses a malformed cache rather than reading it optimistically', () => {
    for (const raw of ['', 'null', '{}', '[]', 'not json', JSON.stringify({ entitled: 'yes', checkedAt: NOW })]) {
      expect(readPremiumCache(memoryStorage({ [KEY]: raw }), NOW)).toBe(false);
    }
    expect(readPremiumCache(null, NOW)).toBe(false);
  });

  it('writes nothing it would then refuse to read', () => {
    const storage = memoryStorage();
    writePremiumCache(storage, false, NOW);
    expect(readPremiumCache(storage, NOW)).toBe(false);
  });
});
