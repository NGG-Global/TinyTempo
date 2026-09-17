import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: {} }));

/*
 * `vi.hoisted`, not plain consts: `vi.mock` is hoisted above the file's own declarations,
 * and `game/settings.ts` reads `ANALYTICS.consentGranted` while its module body runs — so
 * a factory closing over an ordinary `const` reaches it before it is initialised.
 */
const state = vi.hoisted(() => ({
  native: true,
  config: { enabled: true, consentGranted: false },
  logged: [] as string[],
  failToCreate: false,
}));

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => state.native } }));
vi.mock('@/config/analytics', () => ({ ANALYTICS: state.config }));
vi.mock('@/analytics/firebase', () => ({
  createFirebaseSink: async () => {
    if (state.failToCreate) throw new Error('no google-services.json');
    return (event: string) => { state.logged.push(event); };
  },
  setFirebaseConsent: async () => { /* the switch is covered in settings.test.ts */ },
}));

const { logged } = state;

import { installAnalyticsProvider } from '../src/analytics/boot';
import { installAnalytics, track } from '../src/monetization/analytics';

/** Stands in for the crash-breadcrumb wrapper `diagnostics/boot.ts` installs first. */
function installBridge(seen: string[]): void {
  const previous = installAnalytics((event, payload) => {
    seen.push(`bridge:${event}`);
    previous(event, payload);
  });
}

describe('attaching the analytics provider', () => {
  beforeEach(() => {
    state.native = true;
    state.config.enabled = true;
    state.failToCreate = false;
    logged.length = 0;
    installAnalytics(() => { /* a quiet default, as in production */ });
  });

  it('keeps the crash-breadcrumb bridge that was already installed', async () => {
    // The failure this guards against is silent: events would still reach Firebase, and
    // the next crash report would simply arrive with no purchase trail in it.
    const seen: string[] = [];
    installBridge(seen);
    await installAnalyticsProvider();
    track('purchase_started', { product: 'premium' });
    expect(seen).toEqual(['bridge:purchase_started']);
    expect(logged).toEqual(['purchase_started']);
  });

  it('runs the bridge first, so a crash mid-purchase carries the event that caused it', async () => {
    // Both write to `logged`, so the array is the running order rather than two tallies.
    const previous = installAnalytics((event, payload) => {
      logged.push(`bridge:${event}`);
      previous(event, payload);
    });
    await installAnalyticsProvider();
    track('health_empty', { level: 4 });
    expect(logged).toEqual(['bridge:health_empty', 'health_empty']);
  });

  it('does nothing at all in a browser, whatever the build asked for', async () => {
    state.native = false;
    const seen: string[] = [];
    installBridge(seen);
    await installAnalyticsProvider();
    track('rewarded_started', {});
    expect(logged).toEqual([]);
    expect(seen).toEqual(['bridge:rewarded_started']);
  });

  it('does nothing when the build did not ask for analytics', async () => {
    state.config.enabled = false;
    await installAnalyticsProvider();
    track('rewarded_completed', {});
    expect(logged).toEqual([]);
  });

  it('leaves the bus alone when the provider cannot start', async () => {
    // A build with no google-services.json reaches this. The game must not care.
    state.failToCreate = true;
    const seen: string[] = [];
    installBridge(seen);
    await expect(installAnalyticsProvider()).resolves.toBeUndefined();
    track('purchase_failed', { product: 'premium', reason: 'unavailable' });
    expect(seen).toEqual(['bridge:purchase_failed']);
    expect(logged).toEqual([]);
  });
});
