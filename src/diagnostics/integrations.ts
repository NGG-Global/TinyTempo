/**
 * Integrations removed from the Sentry defaults, and why each one had to go.
 *
 * Measured by reading the envelopes the SDK actually posts, not by reasoning about the
 * defaults — `BrowserApiErrors` was found this way, having quietly double-reported every
 * error thrown from a timer or an event handler, which in a Phaser game is very nearly
 * all of them.
 *
 * - `GlobalHandlers` and `BrowserApiErrors` both capture errors on their own. Anything
 *   they send has skipped `core/errors.ts` entirely: no dedupe, no session cap, no
 *   redaction, no breadcrumbs, no game context. One throw arrived as two issues.
 * - `Dedupe` drops an event that resembles the one before it. That is the same job this
 *   project does deliberately and differently: the power-of-two repeats exist to show
 *   that a fault is firing every frame, and Sentry's rule would throw exactly those away.
 * - `Breadcrumbs` records console, DOM and fetch activity, which would bury the game's
 *   own trail. The trail is added by hand in `sentry.ts`.
 * - `BrowserSession` counts sessions this project does not use.
 *
 * Kept in its own module so `tests/sentryAdapter.test.ts` can assert on it without
 * importing the SDK, which needs a browser.
 */
export const REMOVED_INTEGRATIONS: ReadonlySet<string> = new Set([
  'GlobalHandlers', 'BrowserApiErrors', 'Dedupe', 'Breadcrumbs', 'BrowserSession',
]);
