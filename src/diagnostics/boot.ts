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
  if (DIAGNOSTICS.dsn === '') return;
  void attachSentry();
}

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
