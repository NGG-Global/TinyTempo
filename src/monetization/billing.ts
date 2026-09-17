import { ENTITLEMENT, PRODUCT } from './types';
import type { Billing, ProductId, PurchaseReason, PurchaseResult, RestoreResult } from './types';

export interface CatalogProduct {
  readonly identifier: string;
  readonly priceString: string;
  /** Opaque store product; passed back to `purchase` so the native SDK can charge it. */
  readonly handle: unknown;
}

export interface StoreTransaction {
  readonly id: string;
  readonly productId: string;
}

export interface CustomerSnapshot {
  readonly transactions: readonly StoreTransaction[];
  /** Active RevenueCat entitlement identifiers. Source of Premium access. */
  readonly entitlements: readonly string[];
}

export interface PurchaseReceipt {
  readonly productIdentifier: string;
  readonly transactionId: string;
  readonly customer: CustomerSnapshot;
}

export interface PurchasesClient {
  configure(apiKey: string): Promise<void>;
  getProducts(ids: readonly string[]): Promise<readonly CatalogProduct[]>;
  purchase(product: CatalogProduct): Promise<PurchaseReceipt>;
  restore(): Promise<CustomerSnapshot>;
  customerInfo(): Promise<CustomerSnapshot>;
  listen(listener: (info: CustomerSnapshot) => void): Promise<void>;
}

export interface RevenueCatBilling extends Billing {
  boot(): Promise<void>;
}

const LATE_TXN_MS = 2_000;
const PREMIUM_CACHE_KEY = 'tiny-tempo.premium.v1';
/**
 * How long a cached entitlement is honoured without the store confirming it.
 *
 * The cache exists so premium does not flicker off while RevenueCat is asked on boot,
 * and so a player who paid stays premium on a plane. It is not a licence, and until this
 * bound it behaved like one: Android's Auto Backup carries the WebView store to a new
 * device, so a backup taken while premium was active granted premium on restore — until
 * RevenueCat answered, which offline is never.
 *
 * A month is long enough that a genuinely offline player is never cut off in practice,
 * and short enough that a restored cache cannot be a standing entitlement. It is a
 * mitigation, not a cure: the only real fix is the store's own answer, which is exactly
 * what happens the moment the device has a network.
 */
const PREMIUM_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const CATALOGUE = [PRODUCT.heartRefill, PRODUCT.premium] as const;

export function classifyPurchaseError(error: unknown): PurchaseReason {
  if (typeof error !== 'object' || error === null) return 'failed';
  const rec = error as { code?: unknown; userCancelled?: unknown };
  if (rec.userCancelled === true) return 'cancelled';
  const code = String(rec.code ?? '');
  if (code === '1' || code === 'PURCHASE_CANCELLED_ERROR') return 'cancelled';
  if (code === '20' || code === 'PAYMENT_PENDING_ERROR') return 'pending';
  if (code === '5' || code === 'PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR') return 'unavailable';
  return 'failed';
}

function alreadyOwned(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = String((error as { code?: unknown }).code ?? '');
  return code === '6' || code === 'PRODUCT_ALREADY_PURCHASED_ERROR';
}

function transactionsOf(info: CustomerSnapshot, productId: string): readonly StoreTransaction[] {
  return info.transactions.filter(txn => txn.productId === productId && txn.id.length > 0);
}

function entitlementsOf(info: CustomerSnapshot): readonly string[] {
  return info.entitlements;
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
    // trusted: the store re-grants it within a second of the first network call.
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

/**
 * RevenueCat adapter: consumable heart refill plus the permanent Premium entitlement.
 * Restore never fills hearts; Premium is the entitlement, cached so an offline launch
 * still sees the last confirmed state.
 */
export function createRevenueCatBilling(
  client: PurchasesClient,
  options: {
    readonly apiKey: string;
    readonly lateMs?: number;
    readonly entitlement?: string;
    readonly cache?: Storage | null;
  } = { apiKey: '' },
): RevenueCatBilling {
  const refillId: ProductId = PRODUCT.heartRefill;
  const premiumId: ProductId = PRODUCT.premium;
  const entitlementId = options.entitlement ?? ENTITLEMENT.premium;
  const lateMs = options.lateMs ?? LATE_TXN_MS;
  const cache = options.cache === undefined ? safeStorage() : options.cache;
  let bootPromise: Promise<void> | null = null;
  let denied = false;
  let premiumActive = readPremiumCache(cache);
  const catalog = new Map<string, CatalogProduct>();
  let purchasing = false;
  let session: {
    settle: (result: PurchaseResult) => void;
    product: ProductId;
    late: boolean;
    buffered: string | null;
  } | null = null;
  const seen = new Set<string>();

  async function boot(): Promise<void> {
    bootPromise ??= runBoot();
    await bootPromise;
  }

  async function runBoot(): Promise<void> {
    if (options.apiKey.length === 0) {
      denied = true;
      return;
    }
    try {
      await client.configure(options.apiKey);
      await client.listen(onCustomer);
    } catch {
      denied = true;
      return;
    }
    try { applyCustomer(await client.customerInfo(), 'authoritative'); } catch { /* offline: keep the cached entitlement */ }
    try {
      const products = await client.getProducts([...CATALOGUE]);
      catalog.clear();
      for (const item of products) catalog.set(item.identifier, item);
    } catch { /* catalogue can wait; cached Premium still applies */ }
  }

  function remember(info: CustomerSnapshot): string[] {
    const fresh: string[] = [];
    for (const txn of transactionsOf(info, refillId)) {
      if (seen.has(txn.id)) continue;
      seen.add(txn.id);
      fresh.push(txn.id);
    }
    return fresh;
  }

  function applyEntitlements(info: CustomerSnapshot, mode: 'authoritative' | 'additive'): void {
    const entitled = entitlementsOf(info).includes(entitlementId);
    if (entitled) {
      premiumActive = true;
      writePremiumCache(cache, true);
      return;
    }
    // Restore and boot may revoke; a purchase in flight must not. A refill
    // receipt often omits entitlements, and wiping Premium there would punish
    // a player who already paid for the permanent unlock.
    if (mode === 'authoritative' && session === null) {
      premiumActive = false;
      writePremiumCache(cache, false);
    }
  }

  function applyCustomer(info: CustomerSnapshot, mode: 'authoritative' | 'additive'): string[] {
    const fresh = remember(info);
    applyEntitlements(info, mode);
    return fresh;
  }

  function onCustomer(info: CustomerSnapshot): void {
    const fresh = applyCustomer(info, 'authoritative');
    const current = session;
    if (!current) return;
    if (current.product === premiumId) {
      if (!premiumActive) return;
      const claimId = entitlementId;
      if (current.late) current.settle({ ok: true, product: premiumId, claimId });
      else current.buffered = claimId;
      return;
    }
    const claimId = fresh[0];
    if (claimId === undefined) return;
    if (current.late) current.settle({ ok: true, product: current.product, claimId });
    else current.buffered = claimId;
  }

  function claimFrom(receipt: PurchaseReceipt): string | null {
    if (receipt.transactionId.length > 0) {
      seen.add(receipt.transactionId);
      remember(receipt.customer);
      return receipt.transactionId;
    }
    const fresh = remember(receipt.customer);
    return fresh[0] ?? null;
  }

  function present(product: CatalogProduct, productId: ProductId): Promise<PurchaseResult> {
    return new Promise(resolve => {
      let settled = false;
      const finish = (result: PurchaseResult): void => {
        if (settled) return;
        settled = true;
        session = null;
        resolve(result);
      };
      session = { settle: finish, product: productId, late: false, buffered: null };
      void client.purchase(product).then(
        receipt => {
          if (productId === premiumId) {
            applyCustomer(receipt.customer, 'additive');
            if (!premiumActive) {
              finish({ ok: false, product: productId, reason: 'failed' });
              return;
            }
            finish({
              ok: true,
              product: productId,
              claimId: receipt.transactionId || entitlementId,
            });
            return;
          }
          const claimId = claimFrom(receipt);
          applyCustomer(receipt.customer, 'additive');
          if (claimId === null) {
            finish({ ok: false, product: productId, reason: 'failed' });
            return;
          }
          finish({ ok: true, product: productId, claimId });
        },
        error => {
          if (productId === premiumId && alreadyOwned(error)) {
            void client.customerInfo().then(
              info => {
                applyCustomer(info, 'authoritative');
                if (premiumActive) finish({ ok: true, product: productId, claimId: entitlementId });
                else finish({ ok: false, product: productId, reason: 'failed' });
              },
              () => finish({ ok: false, product: productId, reason: 'failed' }),
            );
            return;
          }
          const reason = classifyPurchaseError(error);
          const current = session;
          if (reason !== 'cancelled' || current === null) {
            finish({ ok: false, product: productId, reason });
            return;
          }
          current.late = true;
          if (current.buffered !== null) {
            finish({ ok: true, product: current.product, claimId: current.buffered });
            return;
          }
          globalThis.setTimeout(() => {
            finish({ ok: false, product: productId, reason: 'cancelled' });
          }, lateMs);
        },
      );
    });
  }

  return {
    boot,

    available(): boolean {
      return !denied;
    },

    premium: () => premiumActive,

    price(product: ProductId): string | null {
      const item = catalog.get(product);
      if (!item || item.priceString.length === 0) return null;
      return item.priceString;
    },

    async purchase(product: ProductId): Promise<PurchaseResult> {
      if (product !== refillId && product !== premiumId) return { ok: false, product, reason: 'unavailable' };
      if (purchasing) return { ok: false, product, reason: 'failed' };
      purchasing = true;
      try {
        await boot();
        if (denied) return { ok: false, product, reason: 'unavailable' };
        if (product === premiumId && premiumActive) {
          return { ok: true, product, claimId: entitlementId };
        }
        const item = catalog.get(product);
        if (!item) return { ok: false, product, reason: 'unavailable' };
        return await present(item, product);
      } catch {
        return { ok: false, product, reason: 'failed' };
      } finally {
        purchasing = false;
      }
    },

    async restore(): Promise<RestoreResult> {
      try {
        await boot();
        if (denied) return { ok: false, reason: 'unavailable' };
        const info = await client.restore();
        applyCustomer(info, 'authoritative');
        return { ok: true, premium: premiumActive };
      } catch {
        return { ok: false, reason: 'failed' };
      }
    },
  };
}
