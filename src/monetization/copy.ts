import type { PurchaseReason, RestoreResult, RewardedReason } from './types';

/** Workshop-voice copy when a watch does not grant a heart. Game state is unchanged. */
export function rewardedFeedback(reason: RewardedReason): string {
  switch (reason) {
    case 'unavailable': return 'No ad just now.';
    case 'cancelled': return 'The ad closed before a heart.';
    case 'failed': return "The ad didn't finish.";
  }
}

/** Workshop-voice copy when a refill purchase does not restore hearts. */
export function purchaseFeedback(reason: PurchaseReason): string {
  switch (reason) {
    case 'unavailable': return "The store isn't available.";
    case 'cancelled': return 'Purchase cancelled.';
    case 'failed': return "The purchase didn't finish.";
    case 'pending': return 'The store is still checking.';
  }
}

/** Workshop-voice copy after Restore Purchases. Consumable refills are never restored. */
export function restoreFeedback(result: RestoreResult): string {
  if (!result.ok) {
    return result.reason === 'unavailable' ? "The store isn't available." : "Couldn't restore just now.";
  }
  return result.premium ? 'Premium restored.' : 'No purchases to restore.';
}

/**
 * The store's own words, in one place because the same offer is now made on three screens
 * — settings, the map's rest sheet and the mid-run plaque — and an offer worded three ways
 * reads as three different products.
 */
export const STORE_COPY = {
  premiumTitle: 'Premium',
  /** On the map, where the offer answers a wait rather than sitting in a list. */
  premiumHeadline: 'Never wait again',
  premiumTerms: 'Unlimited hearts · no ads · one payment',
  premiumShort: 'Unlimited hearts, no ads',
  premiumOwned: 'Premium · unlimited hearts',
  refillTitle: 'Heart refill',
  refillTerms: 'Fills all five',
  refillShort: 'Refill all five',
  dailyTitle: 'Daily heart',
  dailyTerms: 'Free, once a day',
  watchTitle: 'Watch',
  /** Rewarded video length, as the networks sell it. Stated so the tap is not a surprise. */
  watchTerms: '30 seconds',
  watchNow: 'Keep playing now',
} as const;
