import { AdMob, MaxAdContentRating } from '@capacitor-community/admob';
import { registerPlugin } from '@capacitor/core';

import { ADMOB } from '@/config/ads';
import type { AdMobClient } from './admob';
import type { PartnerPrivacyClient } from './usOptOut';

interface UnityAdsPrivacyPlugin {
  readGppString(): Promise<{ gpp?: unknown }>;
  forwardOptOut(): Promise<void>;
}

/**
 * `android/app/src/main/java/com/tinytempo/app/UnityAdsPrivacyPlugin.java`. No web
 * implementation is registered, and `boot.ts` never reaches this file off a native platform.
 */
const UnityAdsPrivacy = registerPlugin<UnityAdsPrivacyPlugin>('UnityAdsPrivacy');

/** The opt-out bridge `usOptOut.ts` decides for; the string is validated, not cast. */
export function nativePartnerPrivacyClient(): PartnerPrivacyClient {
  return {
    async readGppString() {
      const { gpp } = await UnityAdsPrivacy.readGppString();
      return typeof gpp === 'string' ? gpp : null;
    },
    async forwardOptOut() { await UnityAdsPrivacy.forwardOptOut(); },
  };
}

/**
 * Thin wrapper around the community plugin. Isolated so the adapter and its
 * tests never import native code, and so Vite can leave this chunk unloaded
 * in the browser.
 */
export function nativeAdMobClient(): AdMobClient {
  return {
    // Child-directed and under-age tags stay unspecified: the game is not directed at
    // children and does not know anyone's age; the content cap is what it does decide.
    // Google's Unity adapter reads them too: with neither set to false it marks every Unity
    // request `user.nonbehavioral`, which Unity honours only for a mixed-audience app.
    // Setting one is an audience declaration, not a tuning knob (docs/UNITY_MEDIATION.md).
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
