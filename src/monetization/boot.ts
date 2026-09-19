import { Capacitor } from '@capacitor/core';

import { reportError } from '@/core/errors';
import { redeemFill } from '@/game/health';
import { createAdMobAds } from './admob';
import { createPlayBilling } from './playBilling';
import type { PlayBilling } from './playBilling';
import { createMonetization, installMonetization } from './service';
import { stubAds, stubBilling } from './stub';
import type { Billing, RewardedAds } from './types';

/**
 * Native-only: AdMob consent/preload and the Play Billing catalogue.
 *
 * This function is the whole of the line between a development build and a paying one.
 * The browser keeps the stub installed at module load, and the stub cannot grant anything
 * — it reports the store as unavailable and restores nothing — so a mock can never stand
 * in for Play in a release. What decides is `Capacitor.isNativePlatform()`, and a native
 * build that fails to reach Play falls back to that same inert stub rather than to
 * anything permissive.
 */
export async function bootMonetization(): Promise<void> {
  try {
    if (!Capacitor.isNativePlatform()) return;
    let ads: RewardedAds = stubAds;
    let billing: Billing = stubBilling;
    try {
      const { nativeAdMobClient } = await import('./native');
      const adapter = createAdMobAds(nativeAdMobClient());
      ads = adapter;
      await adapter.boot();
    } catch { /* ads stay stub */ }
    try {
      const { nativePlayBillingClient } = await import('./purchases');
      const adapter = createPlayBilling(nativePlayBillingClient(), {
        // Idempotent per claim id and persisted by health.ts, which is what makes a crash
        // between granting and consuming safe to replay.
        fulfilRefill: claimId => { redeemFill(claimId); },
      });
      billing = adapter;
      await adapter.boot();
      watchForResume(adapter);
    } catch (error) {
      // A native build with no billing sells nothing and says nothing, which is the one
      // failure here that looks exactly like a quiet day. Worth a report.
      reportError(error, { kind: 'handled', context: { stage: 'billing-boot' } });
    }
    installMonetization(createMonetization({ ads, billing }));
  } catch {
    // Stub stays. A missing plugin must not take the game down.
  }
}

/**
 * Re-asks Play what is owned whenever the game comes back to the foreground.
 *
 * A purchase can complete while the game is not running — a pending payment clearing, or
 * a refund — and Play only replays it to a client that asks. This is the same kind of
 * document event the scenes already use for `blur` and `pointercancel`, not a new
 * capability.
 */
function watchForResume(billing: PlayBilling): void {
  try {
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      void billing.reconcile();
    });
  } catch { /* no document, or listeners refused: startup reconciliation still ran */ }
}
