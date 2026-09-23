import { ConsentStatus, ConsentType, FirebaseAnalytics } from '@capacitor-firebase/analytics';

import type { AnalyticsSink } from '@/monetization/analytics';
import { shapeParams, validEventName } from './eventShape';

/**
 * The Firebase adapter.
 *
 * The only file that knows the vendor, the same split `diagnostics/sentry.ts` follows.
 * `monetization/analytics.ts` stays a typed bus with no provider in it, so a call site
 * never changes when this does, and the whole SDK stays out of the browser bundle
 * because this module is only ever reached by a dynamic import on a native platform.
 *
 * Every call is fire-and-forget and swallows its own rejection. A logged event is not
 * worth a frame, let alone a crash: the plugin talks to native code over a bridge that
 * can be slow, busy, or — on a build with no `google-services.json` — absent.
 */

/**
 * Whether an event may be handed to the SDK at all.
 *
 * Denied consent already turns the SDK's collection off, but that is the SDK's promise and
 * this is ours: an event that is never passed across the bridge cannot be collected by any
 * later change in how the plugin treats a disabled state. It closes *before* the SDK is
 * told and opens only *after* the SDK has accepted a grant, so there is no window either
 * way in which the two disagree toward collecting.
 */
let collecting = false;
/** Which consent call is the latest, so a slow grant cannot land after a newer denial. */
let consentCall = 0;

/**
 * Sets the analytics-storage consent and the collection switch, then returns the sink.
 * `granted` is the player's stored answer, not a build constant — the build only decides
 * where that answer starts.
 */
export async function createFirebaseSink(granted: boolean): Promise<AnalyticsSink> {
  await setFirebaseConsent(granted);
  return (event, payload): void => {
    if (!collecting) return;
    // A name Firebase would discard is a mistake in this repository, not at runtime:
    // the names are a closed set and `tests/analytics.test.ts` checks every one of them.
    // Checking again here costs nothing and keeps the next one from going quiet.
    if (!validEventName(event)) return;
    void FirebaseAnalytics.logEvent({ name: event, params: shapeParams(payload) })
      .catch(() => { /* a dropped event is not worth a frame */ });
  };
}

/** Consent at boot, and every time the player changes it in Settings. */
export async function setFirebaseConsent(granted: boolean): Promise<void> {
  const call = ++consentCall;
  if (!granted) collecting = false;
  // Consent first, then collection. The other order opens a window, however short, in
  // which the SDK is collecting under a consent state nobody has set yet.
  await FirebaseAnalytics.setConsent({
    type: ConsentType.AnalyticsStorage,
    status: granted ? ConsentStatus.Granted : ConsentStatus.Denied,
  });
  await FirebaseAnalytics.setEnabled({ enabled: granted });
  if (call === consentCall) collecting = granted;
}
