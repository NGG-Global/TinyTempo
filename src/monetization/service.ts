import { track } from './analytics';
import { stubAds, stubBilling } from './stub';
import type {
  Billing, Monetization, ProductId, PurchaseResult, RestoreResult, RewardedAds, RewardedResult,
} from './types';

/** Native SDKs can hang a WebView; better to fail the offer than freeze the map. */
const DEFAULT_TIMEOUT_MS = 45_000;
/** A rewarded video plus the close card can run well past the commerce timeout. */
const DEFAULT_SHOW_TIMEOUT_MS = 180_000;
/** Play Billing can send the player to a bank app; the purchase sheet is not a 45s action. */
const DEFAULT_PURCHASE_TIMEOUT_MS = 180_000;

export interface MonetizationOptions {
  readonly ads?: RewardedAds;
  readonly billing?: Billing;
  readonly timeoutMs?: number;
  readonly showTimeoutMs?: number;
  readonly purchaseTimeoutMs?: number;
}

function asBoolean(read: () => boolean): boolean {
  try { return read() === true; } catch { return false; }
}

/** AdMob ads expose these; the stub and any RewardedAds test double do not. */
function hasPrivacyOptions(ads: RewardedAds): ads is RewardedAds & {
  privacyOptionsAvailable(): boolean;
  showPrivacyOptions(): Promise<void>;
} {
  const candidate = ads as RewardedAds & {
    privacyOptionsAvailable?: unknown;
    showPrivacyOptions?: unknown;
  };
  return typeof candidate.privacyOptionsAvailable === 'function'
    && typeof candidate.showPrivacyOptions === 'function';
}

function withTimeout<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise(resolve => {
    let settled = false;
    const finish = (value: T): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = setTimeout(() => finish(fallback), ms);
    work.then(value => { clearTimeout(timer); finish(value); }, () => { clearTimeout(timer); finish(fallback); });
  });
}

/**
 * Wraps ads and billing so a thrown SDK, a hang, or a missing plugin becomes a
 * result object. Provider modules stay out of scenes; this is the only file
 * they should grow into later.
 */
export function createMonetization(options: MonetizationOptions = {}): Monetization {
  const ads = options.ads ?? stubAds;
  const billing = options.billing ?? stubBilling;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const showTimeoutMs = options.showTimeoutMs ?? options.timeoutMs ?? DEFAULT_SHOW_TIMEOUT_MS;
  const purchaseTimeoutMs = options.purchaseTimeoutMs ?? options.timeoutMs ?? DEFAULT_PURCHASE_TIMEOUT_MS;

  return {
    rewardedAvailable: () => {
      if (asBoolean(() => billing.premium())) return false;
      return asBoolean(() => ads.available());
    },

    async showRewarded(): Promise<RewardedResult> {
      if (asBoolean(() => billing.premium()) || !asBoolean(() => ads.available())) {
        track('rewarded_failed', { reason: 'unavailable' });
        return { ok: false, reason: 'unavailable' };
      }
      track('rewarded_started', {});
      try {
        const result = await withTimeout(
          Promise.resolve().then(() => ads.show()),
          showTimeoutMs,
          { ok: false, reason: 'failed' } satisfies RewardedResult,
        );
        if (result.ok) track('rewarded_completed', {});
        else track('rewarded_failed', { reason: result.reason });
        return result;
      } catch {
        track('rewarded_failed', { reason: 'failed' });
        return { ok: false, reason: 'failed' };
      }
    },

    purchasesAvailable: () => asBoolean(() => billing.available()),

    premium: () => asBoolean(() => billing.premium()),

    productPrice: (product: ProductId): string | null => {
      try {
        const value = billing.price(product);
        return typeof value === 'string' && value.length > 0 ? value : null;
      } catch {
        return null;
      }
    },

    async purchase(product: ProductId): Promise<PurchaseResult> {
      if (!asBoolean(() => billing.available())) {
        track('purchase_failed', { product, reason: 'unavailable' });
        return { ok: false, product, reason: 'unavailable' };
      }
      track('purchase_started', { product });
      try {
        const fallback: PurchaseResult = { ok: false, product, reason: 'failed' };
        const result = await withTimeout(
          Promise.resolve().then(() => billing.purchase(product)),
          purchaseTimeoutMs,
          fallback,
        );
        if (result.ok) track('purchase_completed', { product: result.product });
        else if (result.reason === 'cancelled') track('purchase_cancelled', { product });
        else track('purchase_failed', { product, reason: result.reason });
        return result;
      } catch {
        track('purchase_failed', { product, reason: 'failed' });
        return { ok: false, product, reason: 'failed' };
      }
    },

    async restorePurchases(): Promise<RestoreResult> {
      try {
        return await withTimeout(
          Promise.resolve().then(() => billing.restore()),
          timeoutMs,
          { ok: false, reason: 'failed' } satisfies RestoreResult,
        );
      } catch {
        return { ok: false, reason: 'failed' };
      }
    },

    privacyOptionsAvailable: () => {
      if (!hasPrivacyOptions(ads)) return false;
      return asBoolean(() => ads.privacyOptionsAvailable());
    },

    async showPrivacyOptions(): Promise<void> {
      if (!hasPrivacyOptions(ads)) return;
      try {
        // The native form is a player-driven sheet, so this uses the longer show
        // timeout rather than the 45s commerce one. A hang still unsticks Settings.
        await withTimeout(Promise.resolve().then(() => ads.showPrivacyOptions()), showTimeoutMs, undefined);
      } catch { /* form missing, plugin threw, or the timeout fired */ }
    },
  };
}

let current: Monetization = createMonetization();

/** Game-wide commerce. Always the stub until a native adapter is installed at boot. */
export function monetization(): Monetization {
  return current;
}

/** Tests and the eventual native boot path. Pass `createMonetization()` to restore the stub. */
export function installMonetization(next: Monetization): Monetization {
  const previous = current;
  current = next;
  return previous;
}
