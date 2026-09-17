import { DIAGNOSTICS } from '@/config/diagnostics';
import { breadcrumb, captureGlobalErrors, installErrorSink, setErrorContext } from '@/core/errors';
import { installAnalytics } from '@/monetization/analytics';

/**
 * Installs error capture, and attaches Sentry to it when a DSN was built in.
 *
 * Capture goes on first and synchronously, before Phaser is constructed, so a
 * renderer that fails to start is already being watched. The vendor is attached
 * afterwards and asynchronously: its chunk is worth roughly 90 kB, and a build
 * without a DSN — every development build, and any fork — must not download it.
 * Errors thrown in the window between the two are not lost, because the capture
 * layer keeps counting and the sink only decides where a report goes.
 */
export function installDiagnostics(): void {
  captureGlobalErrors(window);
  setErrorContext('release', DIAGNOSTICS.release);
  bridgeCommerceBreadcrumbs();
  breadcrumb('boot');
  installTestTrigger();
  if (DIAGNOSTICS.dsn === '') {
    // Said once, in development only. An empty Sentry project looks exactly like an app
    // that has not crashed yet, and the difference is a `.env` that a fresh clone does not
    // have — which is worth one line in the console rather than an afternoon.
    if (import.meta.env.DEV) {
      console.info('[diagnostics] No VITE_SENTRY_DSN: errors are captured but sent nowhere.');
    }
    return;
  }
  void attachSentry();
}

/**
 * `__TINY_TEMPO_TEST_ERROR__()` from a console, to prove the whole path end to end
 * against a real project: capture, the sink, the trail, and an event arriving in Sentry.
 *
 * Development builds only, the same rule `window.__PHASER_GAME__` follows — a verification
 * hook that shipped would be a way to crash the game from a page console. It throws on a
 * timer rather than inline so it travels the unhandled path a real fault takes, instead
 * of the caller's own try/catch.
 */
function installTestTrigger(): void {
  if (!import.meta.env.DEV) return;
  window.__TINY_TEMPO_TEST_ERROR__ = (): string => {
    breadcrumb('test error requested');
    setTimeout(() => {
      // Sentry's own verification snippet, as a bare undeclared identifier. Reaching it
      // through `window` instead would be a property access on `undefined` and throw a
      // TypeError, which is a different class of fault from the one being demonstrated.
      myUndefinedFunction();
    }, 0);
    return DIAGNOSTICS.dsn === ''
      ? 'No VITE_SENTRY_DSN — the error is captured but goes nowhere.'
      : 'Thrown. It should appear in Sentry as ReferenceError within a few seconds.';
  };
}

/**
 * Declared and never defined, so the call above compiles and then throws a genuine
 * ReferenceError at runtime. An ambient declaration emits nothing into the bundle.
 */
declare function myUndefinedFunction(): void;

/**
 * The ten commerce events are already fired at every offer, purchase and watch. A
 * crash during a purchase is exactly the crash worth reading, so they ride along as
 * breadcrumbs. The existing sink is kept rather than replaced: this wraps whatever
 * is installed, so a real analytics provider later loses nothing.
 */
function bridgeCommerceBreadcrumbs(): void {
  const previous = installAnalytics((event, payload) => {
    breadcrumb(event, payload);
    previous(event, payload);
  });
}

async function attachSentry(): Promise<void> {
  try {
    const { createSentrySink } = await import('./sentry');
    installErrorSink(createSentrySink());
    breadcrumb('diagnostics attached');
  } catch {
    // A reporter that cannot start is not a reason for the game not to. The default
    // sink stays, which in production is silence.
  }
}
