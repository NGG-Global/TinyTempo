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

/**
 * Workshop-voice copy after Restore Purchases. Consumables — refills and replay timers —
 * are never restored; what comes back is the legacy Premium, for an account that holds it.
 */
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
  /** The legacy entitlement, named only where an account holds it. Nothing offers it. */
  premiumTitle: 'Premium',
  premiumShort: 'Unlimited hearts, no ads',
  premiumOwned: 'Premium · unlimited hearts',
  premiumUnlocked: 'Unlocked',
  /** The map's store card: its eyebrow, what it says while the store is out, and when there is none. */
  storeTitle: 'Workshop store',
  storeWaiting: 'Waiting for the store…',
  /** A purchase on the restart sheet that could not start at once: it is on the shelf, and the level goes on. */
  timerHeldInstead: 'Your timer is on the shelf. Start it when a level needs it.',
  storeUnavailable: "The store isn't available on this device.",
  restore: 'Restore purchases',
  restoreNote: 'For Premium bought before',
  /** The shelf: held timers, won or bought, each started when the player chooses. */
  shelfTitle: 'Your timers',
  shelfEmpty: 'Bought timers land here',
  tokenWon: 'Won today',
  tokenBought: 'Bought',
  tokenKeeps: 'Keeps',
  tokenRunning: 'Running',
  start: 'Start',
  heartsFull: 'Hearts are full',
  /** A Start the record could not take: a week already stacked, a won timer gone, or one already running. */
  startFull: 'A week of restarts is already running. Start it later.',
  startGone: 'That timer has gone from the shelf.',
  startRunning: 'That timer is already running.',
  /** Settings' one-row store card, and the chip under its title. */
  settingsStore: 'Timers and heart refill',
  settingsOpen: 'Open',
  /** Replay timers: the one thing for sale beside the refill, on the sheet and in Settings. */
  timersTitle: 'Replay timers',
  timersHeadline: 'Unlimited restarts',
  timersTerms: 'Restart as often as you like while it runs. Start it whenever you choose.',
  timerRunning: 'Timer running',
  timerRunningTerms: 'Restarts are free while it runs.',
  timerShort: 'Replay timer',
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
