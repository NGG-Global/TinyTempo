import { Capacitor } from '@capacitor/core';

import { ANALYTICS } from '@/config/analytics';
import { breadcrumb } from '@/core/errors';
import { loadSettings, saveSettings } from '@/game/settings';
import { installAnalytics } from '@/monetization/analytics';

/**
 * Attaches the analytics provider to the existing event bus.
 *
 * Native-only and lazily imported, the same two conditions `bootMonetization` and the
 * Sentry attachment are under: a browser build must not download an SDK it cannot use,
 * and a build that was not configured for analytics must not reach for one at all.
 *
 * **It wraps the installed sink rather than replacing it.** `diagnostics/boot.ts` has
 * already put a wrapper there that turns every commerce event into a crash breadcrumb,
 * and replacing the sink would take that away silently — the events would still flow to
 * Firebase, and the next crash report would simply arrive with no purchase trail in it.
 * Composing is also what lets a second provider be added later without either knowing
 * about the other.
 */
export async function installAnalyticsProvider(): Promise<void> {
  if (!ANALYTICS.enabled) return;
  try {
    if (!Capacitor.isNativePlatform()) return;
    const { createFirebaseSink } = await import('./firebase');
    const sink = await createFirebaseSink(loadSettings().analytics);
    const previous = installAnalytics((event, payload) => {
      previous(event, payload);
      sink(event, payload);
    });
    breadcrumb('analytics attached');
  } catch {
    // A provider that cannot start is not a reason for the game not to. Whatever was
    // installed stays, which in production is the crash-breadcrumb bridge and silence.
  }
}

/**
 * The player changing their answer in Settings.
 *
 * Persisting is this function's job and the caller's guarantee: the switch must survive a
 * restart even on a build with no provider attached, or a player who opts out in a browser
 * and comes back in the APK would find themselves opted in again. Telling the SDK is
 * best-effort on top of that — native-only, lazily imported, and silent when it fails,
 * because a consent call that cannot be delivered must not leave the switch lying.
 */
export async function setAnalyticsConsent(granted: boolean): Promise<void> {
  saveSettings({ ...loadSettings(), analytics: granted });
  if (!ANALYTICS.enabled) return;
  try {
    if (!Capacitor.isNativePlatform()) return;
    const { setFirebaseConsent } = await import('./firebase');
    await setFirebaseConsent(granted);
  } catch { /* the stored answer is what boot reads next time */ }
}
