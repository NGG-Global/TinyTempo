/**
 * Commerce ports. Scenes talk to these types, never to AdMob or Play Billing.
 * Native SDKs implement the same contracts; the stub keeps the browser and
 * every failed native call on the safe path.
 */

/**
 * The Play one-time products. `premium` is **legacy**: non-consumable, sold before the
 * replay timers, no longer offered anywhere in the game, and still honoured — owning it in
 * the player's Play account is itself the entitlement, and a purchase cannot be taken back.
 * The refill and the four timers are consumables: granted, then consumed, so each can be
 * bought again. The ids are the Console's; nothing else defines them.
 */
export const PRODUCT = {
  premium: 'tinytempo_premium',
  heartRefill: 'heart_refill_full',
  timer30m: 'replay_timer_30m',
  timer1h: 'replay_timer_1h',
  timer2h: 'replay_timer_2h',
  timer1d: 'replay_timer_1d',
} as const;

export type ProductId = typeof PRODUCT[keyof typeof PRODUCT];
/** What the store sells today. Premium is read, never bought. */
export type SoldProductId = Exclude<ProductId, typeof PRODUCT.premium>;

export type RewardedReason = 'unavailable' | 'cancelled' | 'failed';
export type PurchaseReason = 'unavailable' | 'cancelled' | 'failed' | 'pending';
export type RestoreReason = 'unavailable' | 'failed';

export type RewardedResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: RewardedReason };

export type PurchaseResult =
  | { readonly ok: true; readonly product: ProductId; readonly claimId: string }
  | { readonly ok: false; readonly product: ProductId; readonly reason: PurchaseReason };

export type RestoreResult =
  | { readonly ok: true; readonly premium: boolean }
  | { readonly ok: false; readonly reason: RestoreReason };

/** AdMob implements this on native; the web stub stays unavailable. Scenes never import the plugin. */
export interface RewardedAds {
  available(): boolean;
  show(): Promise<RewardedResult>;
}

/** Play Billing implements this on native. Restore restores a legacy Premium; it never fills consumed hearts or refunds a timer. */
export interface Billing {
  available(): boolean;
  /** The legacy entitlement: unlimited hearts, no ads, free restarts. Never sold now. */
  premium(): boolean;
  /** Localized store price, or null when the catalogue has not loaded. Never a guessed amount. */
  price(product: ProductId): string | null;
  purchase(product: ProductId): Promise<PurchaseResult>;
  restore(): Promise<RestoreResult>;
}

/**
 * The surface scenes may call. Availability is a question, never a throw;
 * show/purchase/restore always settle to a result object.
 */
export interface Monetization {
  rewardedAvailable(): boolean;
  showRewarded(): Promise<RewardedResult>;
  purchasesAvailable(): boolean;
  productPrice(product: ProductId): string | null;
  purchase(product: ProductId): Promise<PurchaseResult>;
  restorePurchases(): Promise<RestoreResult>;
  premium(): boolean;
  /**
   * True only on native AdMob, and only while UMP says a privacy-options button is
   * required. The browser stub and an unconfigured UMP message both stay false, so
   * Settings can hide the row without knowing about the plugin.
   */
  privacyOptionsAvailable(): boolean;
  showPrivacyOptions(): Promise<void>;
}
