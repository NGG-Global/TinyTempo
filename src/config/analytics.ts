/**
 * Analytics configuration.
 *
 * Same shape and the same discipline as `config/diagnostics.ts`: the destination is a
 * build-time decision, and a build that was not configured for it sends nothing and
 * downloads nothing. A development build, a fork and a debug APK all fall into that
 * case by default, so nobody's dashboard fills with events from a machine under a desk.
 *
 * Unlike Sentry there is no key to carry here. The native SDK is configured by
 * `android/app/google-services.json`, which Capacitor's Gradle template applies only
 * when the file is present — so this flag says *whether the game should ask*, and the
 * file says *which project it reaches*. Both are needed; neither alone does anything.
 */
export const ANALYTICS = {
  /**
   * Whether a provider is attached at all. Off unless a build sets `VITE_ANALYTICS=on`,
   * because the interesting failure is an unnoticed stream of events from the wrong
   * build, not a missing one — a missing one is obvious the first time anybody looks.
   */
  enabled: import.meta.env.VITE_ANALYTICS === 'on',
  /**
   * Whether collection starts granted.
   *
   * The game is not directed at children and already runs Google's UMP consent flow for
   * ads, but `canRequestAds` answers a question about *advertising*, not about analytics
   * storage — treating one as the other is exactly the conflation the GDPR purpose rules
   * exist to prevent. So consent is a separate signal, it defaults to denied, and a build
   * that wants collection on from the first frame has to say so. See `docs/ANALYTICS.md`.
   */
  consentGranted: import.meta.env.VITE_ANALYTICS_CONSENT === 'granted',
} as const;
