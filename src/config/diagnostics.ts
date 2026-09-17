/**
 * Crash reporting configuration.
 *
 * Same shape as `config/billing.ts`, and for the same reason: the key is injected at
 * build time and an empty one keeps the reporter off. A debug APK therefore cannot
 * post to the production project, and a fork of this repository cannot post to it
 * at all — a DSN is a write credential for an issue stream, and a flooded stream is
 * how a free tier is spent.
 */
export const DIAGNOSTICS = {
  /** Sentry DSN. Empty disables reporting entirely; nothing is loaded and nothing is sent. */
  dsn: (typeof import.meta.env.VITE_SENTRY_DSN === 'string' ? import.meta.env.VITE_SENTRY_DSN : ''),
  /**
   * The release the uploaded sourcemaps are filed under. Must match the `release.name`
   * that `@sentry/vite-plugin` is given in `vite.config.ts`, or a stack trace arrives
   * unsymbolicated and the whole exercise buys nothing.
   */
  release: `tiny-tempo@${__APP_VERSION__}`,
  // `MODE`, not `DEV`: Vite's mode is the exact build profile, so a staging or
  // preview build files its issues separately instead of landing in production.
  environment: import.meta.env.MODE,
  /**
   * Fraction of errors sent. One at launch: this is a small audience and the whole
   * point is to see the first crash, not to sample a steady state.
   */
  sampleRate: 1,
} as const;
