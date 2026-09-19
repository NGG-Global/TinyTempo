import { PRODUCT } from './types';
import type { Billing, ProductId, PurchaseReason, PurchaseResult, RestoreResult } from './types';

/**
 * Google Play Billing response codes, as `BillingClient.BillingResponseCode` defines them.
 * Repeated here rather than imported so this file — and its tests — never load native code.
 *
 * @see https://developer.android.com/reference/com/android/billingclient/api/BillingClient.BillingResponseCode
 */
export const BILLING_RESPONSE = {
  serviceDisconnected: -1,
  featureNotSupported: -2,
  ok: 0,
  userCanceled: 1,
  serviceUnavailable: 2,
  billingUnavailable: 3,
  itemUnavailable: 4,
  developerError: 5,
  error: 6,
  itemAlreadyOwned: 7,
  itemNotOwned: 8,
  networkError: 12,
} as const;

/** `Purchase.PurchaseState`. Only `purchased` may grant anything. */
export type StorePurchaseState = 'purchased' | 'pending' | 'unspecified';

export interface StorePurchase {
  /** A Play purchase can carry more than one product; the bridge sends them all. */
  readonly productIds: readonly string[];
  /** Opaque to the game. Never logged, never persisted, never sent anywhere. */
  readonly purchaseToken: string;
  readonly state: StorePurchaseState;
  readonly acknowledged: boolean;
}

export interface StoreProduct {
  readonly productId: string;
  /** Play's own localized price string. The game never formats a price itself. */
  readonly formattedPrice: string;
}

/** One `PurchasesUpdatedListener` callback. */
export interface PurchaseUpdate {
  readonly code: number;
  readonly purchases: readonly StorePurchase[];
}

/**
 * The native BillingClient, as the game needs it. `purchases.ts` is the only
 * implementation that touches the plugin; tests supply their own.
 */
export interface PlayBillingClient {
  connect(): Promise<void>;
  queryProducts(productIds: readonly string[]): Promise<readonly StoreProduct[]>;
  queryPurchases(): Promise<readonly StorePurchase[]>;
  /** Resolves once the sheet is launched. The outcome arrives through `listen`. */
  launchPurchase(productId: string): Promise<{ readonly code: number }>;
  acknowledge(purchaseToken: string): Promise<void>;
  consume(purchaseToken: string): Promise<void>;
  listen(listener: (update: PurchaseUpdate) => void): Promise<void>;
}

export interface PlayBilling extends Billing {
  /** Connect, load the catalogue and reconcile owned purchases. Safe to call repeatedly. */
  boot(): Promise<void>;
  /** Re-runs reconciliation. Called on resume, when a purchase may have completed elsewhere. */
  reconcile(): Promise<void>;
}

const PREMIUM_CACHE_KEY = 'tiny-tempo.premium.v1';
/**
 * How long a cached entitlement is honoured without Play confirming it.
 *
 * The cache exists so Premium does not flicker off while Play is asked on boot, and so a
 * player who paid stays Premium on a plane. It is not a licence, and until this bound it
 * behaved like one: Android's Auto Backup carries the WebView store to a new device, so a
 * backup taken while Premium was active granted Premium on restore — until Play answered,
 * which offline is never.
 *
 * A month is long enough that a genuinely offline player is never cut off in practice, and
 * short enough that a restored cache cannot be a standing entitlement. The only real
 * authority is `queryPurchases`, which runs the moment the device has a network.
 */
const PREMIUM_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const CATALOGUE = [PRODUCT.heartRefill, PRODUCT.premium] as const;

/** Maps a Play response code onto the reason the store copy already knows how to say. */
export function classifyPurchaseError(code: number): PurchaseReason {
  switch (code) {
    case BILLING_RESPONSE.userCanceled:
      return 'cancelled';
    case BILLING_RESPONSE.billingUnavailable:
    case BILLING_RESPONSE.serviceUnavailable:
    case BILLING_RESPONSE.serviceDisconnected:
    case BILLING_RESPONSE.featureNotSupported:
    case BILLING_RESPONSE.itemUnavailable:
      return 'unavailable';
    default:
      return 'failed';
  }
}

/**
 * A stable, non-reversible id for one Play purchase, used as the fulfilment claim id.
 *
 * The purchase token is the only thing that identifies a purchase across a restart, and
 * `health.ts` persists claim ids to survive exactly that — so the token itself would end
 * up in WebView storage, and from there in an Auto Backup. A 64-bit FNV-1a digest
 * identifies the purchase just as well for "have I already granted this?" without keeping
 * the token anywhere outside this module.
 */
export function claimIdFor(purchaseToken: string): string {
  let lowHash = 0x811c9dc5;
  let highHash = 0x01000193;
  for (let index = 0; index < purchaseToken.length; index += 1) {
    const code = purchaseToken.charCodeAt(index);
    lowHash = Math.imul(lowHash ^ code, 0x01000193) >>> 0;
    highHash = Math.imul(highHash ^ (code + index), 0x85ebca6b) >>> 0;
  }
  return `play:${lowHash.toString(16).padStart(8, '0')}${highHash.toString(16).padStart(8, '0')}`;
}

export function readPremiumCache(storage: Storage | null, now: number = Date.now()): boolean {
  try {
    const raw = storage?.getItem(PREMIUM_CACHE_KEY);
    if (!raw) return false;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return false;
    const { entitled, checkedAt } = parsed as { entitled?: unknown; checkedAt?: unknown };
    if (entitled !== true) return false;
    // A cache written before this field existed has no age to judge, so it is not
    // trusted: Play re-grants it within a second of the first network call.
    if (typeof checkedAt !== 'number' || !Number.isFinite(checkedAt)) return false;
    // A clock that moved backwards, or a cache from the future, is not evidence.
    const age = now - checkedAt;
    return age >= 0 && age <= PREMIUM_CACHE_MAX_AGE_MS;
  } catch {
    return false;
  }
}

export function writePremiumCache(storage: Storage | null, entitled: boolean, now: number = Date.now()): void {
  try {
    storage?.setItem(PREMIUM_CACHE_KEY, JSON.stringify({ version: 1, entitled, checkedAt: now }));
  } catch { /* private windows, blocked storage */ }
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export interface PlayBillingOptions {
  /**
   * Grants the heart refill. Injected so this file stays a store adapter with no game
   * imports, and so a test can count grants. Must be idempotent per claim id —
   * `health.ts` persists them, which is what makes a crash before consume harmless.
   */
  readonly fulfilRefill: (claimId: string) => void;
  readonly cache?: Storage | null;
  /**
   * How long to hold the purchase lock waiting for `PurchasesUpdatedListener`.
   *
   * Play settles a sheet through that listener, including a cancel — but a listener that
   * never fires would otherwise leave `purchasing` true for the rest of the session, and
   * every later tap on Buy would report a failure that has nothing to do with the store.
   * Longer than the facade's own purchase timeout on purpose: the facade is what tells the
   * player, and this only releases the lock behind it.
   */
  readonly sheetTimeoutMs?: number;
}

/**
 * Direct Google Play Billing: the permanent Premium unlock and the consumable heart refill.
 *
 * Play is the authority for Premium. The cache above only covers the gap before the first
 * answer, and is revoked solely by a *successful* query that does not list the product —
 * a failed query is not evidence that a player who paid did not.
 *
 * Fulfilment always runs grant-then-consume, never the reverse. A crash in between leaves
 * the purchase unconsumed, so the next `reconcile` sees it again: the grant is refused by
 * the persisted claim id and the consume is retried. Consuming first would lose the refill
 * on the same crash, and there would be nothing left to replay.
 */
export function createPlayBilling(client: PlayBillingClient, options: PlayBillingOptions): PlayBilling {
  const refillId: ProductId = PRODUCT.heartRefill;
  const premiumId: ProductId = PRODUCT.premium;
  const cache = options.cache === undefined ? safeStorage() : options.cache;
  const sheetTimeoutMs = options.sheetTimeoutMs ?? 190_000;
  const catalog = new Map<string, string>();
  /** Tokens consumed or acknowledged this session, so a replayed update does no extra work. */
  const settledTokens = new Set<string>();

  let ready = false;
  let denied = false;
  let bootPromise: Promise<void> | null = null;
  let listening = false;
  let premiumActive = readPremiumCache(cache);
  let purchasing = false;
  let session: {
    readonly product: ProductId;
    settle: (result: PurchaseResult) => void;
  } | null = null;

  async function boot(): Promise<void> {
    if (ready) return;
    // Cleared when it settles, so a failed connection is retried rather than latched —
    // that is the whole of the reconnect story on this side of the bridge.
    bootPromise ??= runBoot().finally(() => { bootPromise = null; });
    await bootPromise;
  }

  async function runBoot(): Promise<void> {
    try {
      await client.connect();
      if (!listening) {
        await client.listen(onPurchaseUpdate);
        listening = true;
      }
      ready = true;
      denied = false;
    } catch {
      ready = false;
      denied = true;
      return;
    }
    // Neither of these may fail the boot: an empty catalogue costs a price label, and a
    // failed ownership query must leave the cached entitlement exactly as it was.
    try {
      const products = await client.queryProducts([...CATALOGUE]);
      catalog.clear();
      for (const item of products) {
        if (item.formattedPrice.length > 0) catalog.set(item.productId, item.formattedPrice);
      }
    } catch { /* prices can wait; a cached Premium still applies */ }
    await reconcile();
  }

  /** True when the purchase is one Play says is paid for and complete. */
  function isPaid(purchase: StorePurchase): boolean {
    return purchase.state === 'purchased';
  }

  async function grantPremium(purchase: StorePurchase): Promise<void> {
    premiumActive = true;
    writePremiumCache(cache, true);
    if (purchase.acknowledged || settledTokens.has(purchase.purchaseToken)) return;
    try {
      await client.acknowledge(purchase.purchaseToken);
      settledTokens.add(purchase.purchaseToken);
    } catch {
      // Play replays an unacknowledged purchase until it is acknowledged or refunded,
      // so the next reconcile tries again. Premium stays granted meanwhile.
    }
  }

  async function grantRefill(purchase: StorePurchase): Promise<void> {
    const claimId = claimIdFor(purchase.purchaseToken);
    try {
      options.fulfilRefill(claimId);
    } catch {
      // The grant is the part that must not be lost; leaving the purchase unconsumed
      // means Play offers it again on the next reconcile.
      return;
    }
    if (settledTokens.has(purchase.purchaseToken)) return;
    try {
      await client.consume(purchase.purchaseToken);
      settledTokens.add(purchase.purchaseToken);
    } catch {
      // Retried on the next reconcile. The claim id already persisted by the grant is
      // what stops that replay from filling the bar a second time.
    }
  }

  /**
   * Fulfils everything Play reports as paid for. Returns the products handled, so a
   * purchase in flight can be settled from the same pass.
   */
  async function fulfil(purchases: readonly StorePurchase[]): Promise<Set<string>> {
    const handled = new Set<string>();
    for (const purchase of purchases) {
      if (!isPaid(purchase)) continue;
      if (purchase.productIds.includes(premiumId)) {
        await grantPremium(purchase);
        handled.add(premiumId);
      }
      if (purchase.productIds.includes(refillId)) {
        await grantRefill(purchase);
        handled.add(refillId);
      }
    }
    return handled;
  }

  /**
   * Asks Play what is owned and reconciles. Premium is revoked here and nowhere else,
   * and only when the query itself succeeded.
   */
  async function reconcile(): Promise<void> {
    let owned: readonly StorePurchase[];
    try {
      owned = await client.queryPurchases();
    } catch {
      // Offline, or the query dropped. Not an answer, so nothing is revoked and the
      // store stays available — the next reconcile simply asks again.
      return;
    }
    await fulfil(owned);
    const ownsPremium = owned.some(purchase => isPaid(purchase) && purchase.productIds.includes(premiumId));
    if (!ownsPremium && premiumActive) {
      premiumActive = false;
      writePremiumCache(cache, false);
    }
  }

  function settle(result: PurchaseResult): void {
    const current = session;
    if (!current) return;
    session = null;
    current.settle(result);
  }

  /** The `PurchasesUpdatedListener`. Authoritative: a sheet outcome only arrives here. */
  function onPurchaseUpdate(update: PurchaseUpdate): void {
    void (async () => {
      if (update.code === BILLING_RESPONSE.ok) {
        const handled = await fulfil(update.purchases);
        const current = session;
        if (!current) return;
        if (handled.has(current.product)) {
          settle({ ok: true, product: current.product, claimId: claimIdOf(current.product, update.purchases) });
          return;
        }
        // Paid for nothing we asked about: the only other state Play reports here is a
        // payment still being checked, which grants nothing until it clears.
        const pending = update.purchases.some(
          purchase => purchase.state === 'pending' && purchase.productIds.includes(current.product),
        );
        if (pending) settle({ ok: false, product: current.product, reason: 'pending' });
        return;
      }
      if (update.code === BILLING_RESPONSE.itemAlreadyOwned) {
        await settleAlreadyOwned();
        return;
      }
      const current = session;
      if (!current) return;
      settle({ ok: false, product: current.product, reason: classifyPurchaseError(update.code) });
    })();
  }

  function claimIdOf(product: ProductId, purchases: readonly StorePurchase[]): string {
    const match = purchases.find(purchase => isPaid(purchase) && purchase.productIds.includes(product));
    return match ? claimIdFor(match.purchaseToken) : product;
  }

  /** Play refuses a product the account already holds; ask it what it holds and settle from that. */
  async function settleAlreadyOwned(): Promise<void> {
    const current = session;
    if (!current) return;
    await reconcile();
    if (current.product === premiumId && premiumActive) {
      settle({ ok: true, product: premiumId, claimId: premiumId });
      return;
    }
    settle({ ok: false, product: current.product, reason: 'failed' });
  }

  return {
    boot,
    reconcile: async (): Promise<void> => {
      await boot();
      if (!ready) return;
      await reconcile();
    },

    available: () => !denied,

    premium: () => premiumActive,

    price(product: ProductId): string | null {
      return catalog.get(product) ?? null;
    },

    async purchase(product: ProductId): Promise<PurchaseResult> {
      if (product !== refillId && product !== premiumId) return { ok: false, product, reason: 'unavailable' };
      // One sheet at a time: a second launch while one is open is a developer error to
      // Play, and there is only one listener slot to settle.
      if (purchasing) return { ok: false, product, reason: 'failed' };
      purchasing = true;
      try {
        await boot();
        if (!ready) return { ok: false, product, reason: 'unavailable' };
        if (product === premiumId && premiumActive) return { ok: true, product, claimId: premiumId };
        if (!catalog.has(product)) return { ok: false, product, reason: 'unavailable' };

        return await new Promise<PurchaseResult>(resolve => {
          let settled = false;
          const lockTimer = globalThis.setTimeout(
            () => { settle({ ok: false, product, reason: 'failed' }); },
            sheetTimeoutMs,
          );
          session = {
            product,
            settle: result => {
              if (settled) return;
              settled = true;
              globalThis.clearTimeout(lockTimer);
              resolve(result);
            },
          };
          void client.launchPurchase(product).then(
            ({ code }) => {
              if (code === BILLING_RESPONSE.ok) return; // the listener settles it
              if (code === BILLING_RESPONSE.itemAlreadyOwned) {
                void settleAlreadyOwned();
                return;
              }
              settle({ ok: false, product, reason: classifyPurchaseError(code) });
            },
            () => { settle({ ok: false, product, reason: 'failed' }); },
          );
        });
      } catch {
        return { ok: false, product, reason: 'failed' };
      } finally {
        session = null;
        purchasing = false;
      }
    },

    /**
     * Restore Purchases. Play has no separate restore call — what the account owns is
     * what `queryPurchases` returns, which is also why a consumed refill can never come
     * back through here.
     */
    async restore(): Promise<RestoreResult> {
      try {
        await boot();
        if (!ready) return { ok: false, reason: 'unavailable' };
        const owned = await client.queryPurchases();
        await fulfil(owned);
        const ownsPremium = owned.some(
          purchase => isPaid(purchase) && purchase.productIds.includes(premiumId),
        );
        if (ownsPremium) {
          premiumActive = true;
          writePremiumCache(cache, true);
        } else if (premiumActive) {
          premiumActive = false;
          writePremiumCache(cache, false);
        }
        return { ok: true, premium: premiumActive };
      } catch {
        // The connection held; this question did not get an answer. Premium is left
        // exactly as it was, because a failed query is not a denial of ownership.
        return { ok: false, reason: 'failed' };
      }
    },
  };
}
