import {
  addBreadcrumb, captureException, getCurrentScope, init, type BrowserOptions,
} from '@sentry/browser';

import { DIAGNOSTICS } from '@/config/diagnostics';
import type { ErrorReport, ErrorSink } from '@/core/errors';

/**
 * The Sentry adapter.
 *
 * `@sentry/browser`, not `@sentry/capacitor`. Almost nothing in this game runs
 * natively — the Capacitor shell starts a WebView and hands it a megabyte and a half
 * of JavaScript — so the browser SDK catches what actually breaks, with the stack
 * traces that matter, and needs no Gradle change, no plugin sync and no second
 * initialisation order to get wrong beside AdMob's and RevenueCat's. Play Vitals
 * already reports native crashes and ANRs in the shell. If native capture is ever
 * wanted for its own sake, `@sentry/capacitor` wraps this same SDK and only this
 * file changes.
 *
 * `core/errors.ts` has already deduplicated, rate-limited and redacted by the time a
 * report arrives here, so the SDK's own integrations for that are turned off: two
 * sets of rules fighting over what to drop is how a quota disappears quietly.
 */

/** Sentry's own global handlers would double-report what `captureGlobalErrors` sends. */
const OPTIONS: BrowserOptions = {
  dsn: DIAGNOSTICS.dsn,
  release: DIAGNOSTICS.release,
  environment: DIAGNOSTICS.environment,
  sampleRate: DIAGNOSTICS.sampleRate,
  // No performance tracing and no session replay: both are for a product with a
  // budget for them, and both send far more than a crash report does.
  tracesSampleRate: 0,
  // The game has no accounts and no personal data. Saying so to the SDK stops it
  // attaching a source IP or a cookie to an issue on its own initiative.
  sendDefaultPii: false,
  integrations: integrations => integrations.filter(
    integration => integration.name !== 'GlobalHandlers'
      && integration.name !== 'BrowserSession'
      && integration.name !== 'Breadcrumbs',
  ),
};

/**
 * Starts the SDK and returns the sink. Throws if Sentry cannot initialise, which
 * `diagnostics/boot.ts` catches — the game must start without a reporter.
 */
export function createSentrySink(): ErrorSink {
  init(OPTIONS);
  return (report: ErrorReport): void => {
    const scope = getCurrentScope();
    scope.setLevel(report.fatal ? 'fatal' : 'error');
    scope.setTag('kind', report.kind);
    // `seen` is why a one-off and a stuck frame look different in the issue list.
    scope.setTag('seen', String(report.seen));
    scope.setContext('game', { ...report.context });
    for (const crumb of report.breadcrumbs) {
      addBreadcrumb({
        message: crumb.message,
        level: 'info',
        timestamp: crumb.at / 1000,
        ...(crumb.data === undefined ? {} : { data: { ...crumb.data } }),
      });
    }
    // The stack is rebuilt rather than passed through: the capture layer redacted the
    // strings, and an Error carrying them is what the SDK knows how to symbolicate.
    const error = new Error(report.message);
    error.name = `TinyTempo:${report.kind}`;
    if (report.stack !== undefined) error.stack = report.stack;
    captureException(error);
  };
}
