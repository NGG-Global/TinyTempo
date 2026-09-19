import { registerPlugin } from '@capacitor/core';

import type {
  PlayBillingClient, PurchaseUpdate, StoreProduct, StorePurchase, StorePurchaseState,
} from './playBilling';

interface PlayBillingPlugin {
  connect(): Promise<void>;
  queryProducts(options: { productIds: string[] }): Promise<{ products?: unknown }>;
  queryPurchases(): Promise<{ purchases?: unknown }>;
  launchPurchase(options: { productId: string }): Promise<{ code?: unknown }>;
  acknowledge(options: { purchaseToken: string }): Promise<void>;
  consume(options: { purchaseToken: string }): Promise<void>;
  addListener(
    event: 'purchasesUpdated',
    listener: (payload: { code?: unknown; purchases?: unknown }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

/**
 * The native BillingClient in `android/app/src/main/java/com/tinytempo/app/PlayBillingPlugin.java`.
 * No web implementation is registered: in a browser this object exists but every call
 * rejects, which is why `boot.ts` never reaches this file off a native platform.
 */
const PlayBilling = registerPlugin<PlayBillingPlugin>('PlayBilling');

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Anything crossing the bridge is JSON from another process, so it is validated rather
 * than cast. A malformed purchase is dropped: it can only ever cost a reconcile, whereas
 * a trusted one could grant on a field that is not there.
 */
function toPurchase(value: unknown): StorePurchase | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as { productIds?: unknown; purchaseToken?: unknown; state?: unknown; acknowledged?: unknown };
  const token = asString(record.purchaseToken);
  if (token.length === 0) return null;
  const productIds = Array.isArray(record.productIds)
    ? record.productIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  if (productIds.length === 0) return null;
  const rawState = asString(record.state);
  const state: StorePurchaseState = rawState === 'purchased' || rawState === 'pending' ? rawState : 'unspecified';
  return { productIds, purchaseToken: token, state, acknowledged: record.acknowledged === true };
}

function toPurchases(value: unknown): readonly StorePurchase[] {
  if (!Array.isArray(value)) return [];
  const purchases: StorePurchase[] = [];
  for (const item of value) {
    const purchase = toPurchase(item);
    if (purchase) purchases.push(purchase);
  }
  return purchases;
}

function toProducts(value: unknown): readonly StoreProduct[] {
  if (!Array.isArray(value)) return [];
  const products: StoreProduct[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const record = item as { productId?: unknown; formattedPrice?: unknown };
    const productId = asString(record.productId);
    const formattedPrice = asString(record.formattedPrice);
    if (productId.length > 0 && formattedPrice.length > 0) products.push({ productId, formattedPrice });
  }
  return products;
}

/**
 * Thin wrapper around the native plugin. Isolated so the adapter and its tests never
 * import native code, and so Vite leaves this chunk unloaded in the browser.
 */
export function nativePlayBillingClient(): PlayBillingClient {
  return {
    connect: () => PlayBilling.connect(),

    async queryProducts(productIds) {
      const { products } = await PlayBilling.queryProducts({ productIds: [...productIds] });
      return toProducts(products);
    },

    async queryPurchases() {
      const { purchases } = await PlayBilling.queryPurchases();
      return toPurchases(purchases);
    },

    async launchPurchase(productId) {
      const { code } = await PlayBilling.launchPurchase({ productId });
      return { code: typeof code === 'number' ? code : 6 /* ERROR */ };
    },

    acknowledge: purchaseToken => PlayBilling.acknowledge({ purchaseToken }),

    consume: purchaseToken => PlayBilling.consume({ purchaseToken }),

    async listen(listener) {
      await PlayBilling.addListener('purchasesUpdated', payload => {
        const update: PurchaseUpdate = {
          code: typeof payload.code === 'number' ? payload.code : 6 /* ERROR */,
          purchases: toPurchases(payload.purchases),
        };
        listener(update);
      });
    },
  };
}
