/**
 * Commerce ports. Scenes talk to these types, never to AdMob or Play Billing.
 * Native SDKs implement the same contracts; the stub keeps the browser and
 * every failed native call on the safe path.
 */
import type { LevelExit } from '../game/interstitialPacing';

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

/**
 * Why an interstitial did not play. `not_ready` is no loaded ad at the moment it was due,
 * which is never waited for: the player goes on to the map.
 */
export type InterstitialReason = 'unavailable' | 'not_ready' | 'failed';

/** `shown` is an ad that opened and has closed again; the caller goes on only then. */
export type InterstitialResult =
  | { readonly shown: true }
  | { readonly shown: false; readonly reason: InterstitialReason };

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

/** AdMob implements this beside the rewarded ad; the stub has none and is never ready. */
export interface InterstitialAds {
  interstitialReady(): boolean;
  /** Loads one in the background if none is loaded. Never shows anything. */
  prepareInterstitial(): Promise<void>;
  /** Shows a loaded one and settles when it closes. Never waits for a load. */
  showInterstitial(): Promise<InterstitialResult>;
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
  /** Starts loading an interstitial if one could be shown. Premium and the stub do nothing. */
  warmInterstitial(): void;
  /** A loaded interstitial, for a player who could be shown one. */
  interstitialReady(): boolean;
  /** `level` is the level being left and `exit` how it was left, for the analytics event. */
  showInterstitial(context: { readonly level: number; readonly exit: LevelExit }): Promise<InterstitialResult>;
  /**
   * Wall-clock ms at which the last full-screen ad this session closed — rewarded or
   * interstitial — or null when none has. What `INTERSTITIAL.minGapMs` is measured from.
   */
  lastAdClosedAt(): number | null;
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
