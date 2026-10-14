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
  granted: [] as boolean[],
}));

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => state.native } }));
vi.mock('@/config/analytics', () => ({ ANALYTICS: state.config }));
vi.mock('@/analytics/firebase', () => ({
  createFirebaseSink: async (granted: boolean) => {
    state.granted.push(granted);
    if (state.failToCreate) throw new Error('no google-services.json');
    return (event: string) => { state.logged.push(event); };
  },
  setFirebaseConsent: async () => { /* the switch is covered in settings.test.ts */ },
}));

const { logged } = state;

import { installAnalyticsProvider as install } from '../src/analytics/boot';
import { loadSettings, saveSettings } from '../src/game/settings';
import { installAnalytics, track } from '../src/monetization/analytics';
import { createConsentRegionSignal, type ConsentRegion } from '../src/monetization/consentRegion';

/** A region that has already answered, so the boot does not sit out its wait. */
function answered(region: ConsentRegion) {
  const signal = createConsentRegionSignal();
  signal.report(region);
  return signal;
}
const installAnalyticsProvider = (region: ConsentRegion = 'open') => install(answered(region));

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
    state.config.consentGranted = false;
    logged.length = 0;
    state.granted.length = 0;
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, String(value)); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    });
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

  it('starts with collection off where consent is required, whatever the build defaulted to', async () => {
    saveSettings({ ...loadSettings(), analytics: true, analyticsChosen: false });
    await installAnalyticsProvider('regulated');
    expect(state.granted).toEqual([false]);
    // The switch says so too, rather than showing an on that is not running.
    expect(loadSettings().analytics).toBe(false);
  });

  it('keeps the player’s own yes in any region', async () => {
    saveSettings({ ...loadSettings(), analytics: true, analyticsChosen: true });
    await installAnalyticsProvider('regulated');
    expect(state.granted).toEqual([true]);
  });

  it('holds collection for a session whose region is unknown, without writing anything', async () => {
    saveSettings({ ...loadSettings(), analytics: true, analyticsChosen: false });
    await installAnalyticsProvider('unknown');
    expect(state.granted).toEqual([false]);
    expect(loadSettings().analytics).toBe(true);
  });
});
