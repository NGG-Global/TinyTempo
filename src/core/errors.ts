/**
 * Error capture, with no provider attached.
 *
 * The game is a WebView with a megabyte and a half of JavaScript in it, so the
 * failure that matters is a JavaScript exception, not a native crash: it shows the
 * player a black screen and reaches nobody. This is the part that notices — window
 * errors, unhandled rejections and explicit reports — shaped the same way
 * `monetization/analytics.ts` is shaped, so a sink can be swapped in tests and a
 * real SDK installed in `diagnostics/` without touching a call site.
 *
 * Three rules it exists to enforce, which a bare `Sentry.init()` does not:
 *
 * - **A throw inside a Phaser `update()` fires sixty times a second.** Reports are
 *   collapsed by signature and re-sent only on a power-of-two repeat, so a stuck
 *   frame costs one report and then a handful, not a quota.
 * - **Nothing here may take the game down.** Every sink call is guarded; a reporter
 *   that throws is worse than no reporter.
 * - **Nothing personal may leave.** The game holds no personal data to begin with,
 *   and the redaction below keeps a query string or a file URL from becoming the
 *   exception to that by accident.
 */

export type ErrorKind = 'boot' | 'error' | 'rejection' | 'handled';

export interface Breadcrumb {
  /** Milliseconds since the page opened, so a report carries a timeline without a clock. */
  readonly at: number;
  readonly message: string;
  readonly data?: Readonly<Record<string, string | number | boolean>>;
}

export interface ErrorReport {
  readonly kind: ErrorKind;
  /**
   * The thrown error's own type — `ReferenceError`, `TypeError`, and so on. Kept because
   * a reporter groups issues by it: flattening every fault to one name makes a missing
   * function and a null dereference at the same line look like the same bug.
   */
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
  /** True when the game cannot continue: the boot failure, or a frame that died. */
  readonly fatal: boolean;
  /** How many times this signature has been seen this session, including this one. */
  readonly seen: number;
  readonly breadcrumbs: readonly Breadcrumb[];
  readonly context: Readonly<Record<string, string | number | boolean>>;
}

export type ErrorSink = (report: ErrorReport) => void;

export const ERRORS = {
  /** Breadcrumbs kept. Enough for a level's worth of scene changes and phases. */
  trail: 24,
  /** Hard ceiling on reports sent in one session, whatever their signatures. */
  perSession: 25,
  /** Longest message or stack forwarded, so one enormous throw cannot become the payload. */
  maxChars: 4000,
} as const;

/** Separates the two halves of a signature; never appears in a message or a frame. */
const SIGNATURE_GAP = '\u0000';

const trail: Breadcrumb[] = [];
const counts = new Map<string, number>();
const context = new Map<string, string | number | boolean>();
let sent = 0;
let sink: ErrorSink = defaultSink;
let origin = now();
/** Wall-clock at the same instant as `origin`, so a relative crumb can be dated. */
let epochOrigin = Date.now();

function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function defaultSink(report: ErrorReport): void {
  // Visible in development, silent in production until `diagnostics/` installs a real one.
  if (import.meta.env.DEV) console.error('[error]', report.message, report);
}

/** Swap the sink. Returns the previous one, so a test can restore it. */
export function installErrorSink(next: ErrorSink): ErrorSink {
  const previous = sink;
  sink = next;
  return previous;
}

/**
 * A fact worth having beside the next error: the level, the act, the scene. Kept
 * small and non-personal on purpose — this rides along on every report.
 */
export function setErrorContext(key: string, value: string | number | boolean): void {
  context.set(key, value);
}

/** A step the player took, kept in a ring so the trail never grows. */
export function breadcrumb(message: string, data?: Readonly<Record<string, string | number | boolean>>): void {
  trail.push({ at: Math.round(now() - origin), message, ...(data === undefined ? {} : { data }) });
  if (trail.length > ERRORS.trail) trail.shift();
}

/**
 * Query strings and file URLs, out. The game puts nothing personal in either, but
 * `?debug&level=9` and an Android `file:///data/user/0/...` path both name things
 * about the device that a crash report has no reason to carry.
 */
export function redact(text: string): string {
  return text
    .replace(/\?[^\s)]*/g, '')
    .replace(/(file|content):\/\/\S*?([^/\s]+)(?=[\s):]|$)/g, '$1://…/$2')
    .slice(0, ERRORS.maxChars);
}

/** A stable key for "the same failure again": the message and its top frame. */
function signature(message: string, stack: string | undefined): string {
  const frame = stack?.split('\n')[1]?.trim() ?? '';
  return `${message}${SIGNATURE_GAP}${frame}`;
}

/** First sighting, then 2, 4, 8, 16… — a stuck frame reports its shape, not its rate. */
function shouldSend(seen: number): boolean {
  return (seen & (seen - 1)) === 0;
}

export interface ReportOptions {
  readonly kind?: ErrorKind;
  readonly fatal?: boolean;
  readonly context?: Readonly<Record<string, string | number | boolean>>;
}

/** Report a caught error. Safe to call from anywhere, including a catch block in a sink. */
export function reportError(error: unknown, options: ReportOptions = {}): void {
  try {
    const wrapped = error instanceof Error ? error : new Error(String(error));
    const name = typeof wrapped.name === 'string' && wrapped.name !== '' ? wrapped.name : 'Error';
    const message = redact(wrapped.message === '' ? String(error) : wrapped.message);
    const stack = wrapped.stack === undefined ? undefined : redact(wrapped.stack);
    const key = signature(message, stack);
    const seen = (counts.get(key) ?? 0) + 1;
    counts.set(key, seen);
    if (!shouldSend(seen) || sent >= ERRORS.perSession) return;
    sent += 1;
    sink({
      kind: options.kind ?? 'handled',
      name,
      message,
      ...(stack === undefined ? {} : { stack }),
      fatal: options.fatal ?? false,
      seen,
      breadcrumbs: [...trail],
      context: { ...Object.fromEntries(context), ...options.context },
    });
  } catch {
    // A reporter that throws is worse than no reporter.
  }
}

/**
 * Hooks the two events that carry everything the game does not catch itself.
 * Returns a disposer; `main.ts` installs it once and never removes it.
 */
export function captureGlobalErrors(
  target: Pick<Window, 'addEventListener' | 'removeEventListener'>,
): () => void {
  const onError = (event: Event): void => {
    const e = event as ErrorEvent;
    reportError(e.error ?? e.message ?? 'Unknown error', { kind: 'error', fatal: true });
  };
  const onRejection = (event: Event): void => {
    const e = event as PromiseRejectionEvent;
    // Not fatal: a rejected promise usually loses one action, not the session.
    reportError(e.reason ?? 'Unhandled rejection', { kind: 'rejection' });
  };
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}

/** Test seam. Clears the trail, the counters and the context; leaves the sink alone. */
export function resetErrorState(): void {
  trail.length = 0;
  counts.clear();
  context.clear();
  sent = 0;
  origin = now();
  epochOrigin = Date.now();
}

/**
 * A breadcrumb's `at` as wall-clock milliseconds. Breadcrumbs are timed against the page
 * opening, which is what makes a trail readable; a reporter needs an absolute time, and
 * handing one a relative value dates every crumb to 1970 and silently drops the lot.
 */
export function breadcrumbEpochMs(at: number): number {
  return epochOrigin + at;
}

/** What the session has recorded so far, for a debug view and for tests. */
export function errorTrail(): readonly Breadcrumb[] {
  return [...trail];
}
