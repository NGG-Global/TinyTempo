import { AdMob, MaxAdContentRating } from '@capacitor-community/admob';

import { ADMOB } from '@/config/ads';
import type { AdMobClient } from './admob';

/**
 * Thin wrapper around the community plugin. Isolated so the adapter and its
 * tests never import native code, and so Vite can leave this chunk unloaded
 * in the browser.
 */
export function nativeAdMobClient(): AdMobClient {
  return {
    // Child-directed and under-age tags stay unspecified: the game is not directed at
    // children and does not know anyone's age; the content cap is what it does decide.
    initialize: () => AdMob.initialize({
      maxAdContentRating: MaxAdContentRating[ADMOB.maxAdContentRating],
      testingDevices: [...ADMOB.testDevices],
      initializeForTesting: ADMOB.testDevices.length > 0,
    }),
    trackingAuthorizationStatus: () => AdMob.trackingAuthorizationStatus(),
    requestTrackingAuthorization: () => AdMob.requestTrackingAuthorization(),
    requestConsentInfo: () => AdMob.requestConsentInfo(),
    showConsentForm: () => AdMob.showConsentForm(),
    // Publisher-rendered privacy options. resetConsentInfo is deliberately not wrapped:
    // Google forbids resetting UMP state in production, and a Settings row that called it
    // would look like a privacy control while wiping the answer the player already gave.
    showPrivacyOptionsForm: () => AdMob.showPrivacyOptionsForm(),
    prepareRewardVideoAd: adId => AdMob.prepareRewardVideoAd({ adId, isTesting: ADMOB.testAds }),
    showRewardVideoAd: () => AdMob.showRewardVideoAd(),
    addListener: (event, listener) => (
      AdMob.addListener as (name: string, fn: (payload?: unknown) => void) => Promise<{ remove: () => Promise<void> }>
    )(event, listener),
  };
}
