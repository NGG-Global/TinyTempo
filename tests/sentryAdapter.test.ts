import { describe, expect, it } from 'vitest';
import { REMOVED_INTEGRATIONS } from '../src/diagnostics/integrations';

describe('the Sentry integrations this project removes', () => {
  it('removes every integration that captures an error on its own', () => {
    // Both were found by reading the envelopes the SDK actually posts. Anything that
    // captures by itself has skipped core/errors.ts: no dedupe, no session cap, no
    // redaction, no breadcrumbs, no game context — and it arrives as a second issue
    // for the same throw. `BrowserApiErrors` wraps setTimeout and addEventListener,
    // which in a Phaser game is very nearly every code path.
    expect(REMOVED_INTEGRATIONS.has('GlobalHandlers')).toBe(true);
    expect(REMOVED_INTEGRATIONS.has('BrowserApiErrors')).toBe(true);
  });

  it('removes the SDK dedupe, which would eat the repeat counts on purpose', () => {
    // The power-of-two repeats exist to show a fault is firing every frame. Sentry's
    // Dedupe drops an event resembling the one before it, which is exactly those.
    expect(REMOVED_INTEGRATIONS.has('Dedupe')).toBe(true);
  });

  it('keeps the list to integrations that exist, so a rename cannot pass silently', () => {
    // Every name here is a real integration name in @sentry/browser v10. A typo would
    // filter nothing and reintroduce double reporting without failing anything.
    const known = new Set([
      'GlobalHandlers', 'BrowserApiErrors', 'Dedupe', 'Breadcrumbs', 'BrowserSession',
      'LinkedErrors', 'FunctionToString', 'EventFilters', 'HttpContext', 'ContextLines',
      'BrowserTracing', 'Replay', 'CultureContext',
    ]);
    for (const name of REMOVED_INTEGRATIONS) expect(known).toContain(name);
  });
});
