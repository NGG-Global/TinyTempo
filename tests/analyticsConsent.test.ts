import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: {} }));

/*
 * The plugin, recorded rather than run. Each SDK call can be held open, which is how the
 * out-of-order case below is staged: a grant still crossing the bridge while the player
 * has already turned the switch back off.
 */
const sdk = vi.hoisted(() => ({
  calls: [] as string[],
  logged: [] as { name: string; params: Record<string, unknown> }[],
  hold: null as null | Promise<void>,
}));

vi.mock('@capacitor-firebase/analytics', () => ({
  ConsentType: { AnalyticsStorage: 'ANALYTICS_STORAGE' },
  ConsentStatus: { Granted: 'GRANTED', Denied: 'DENIED' },
  FirebaseAnalytics: {
    setConsent: async ({ status }: { status: string }) => { sdk.calls.push(`consent:${status}`); },
    setEnabled: async ({ enabled }: { enabled: boolean }) => {
      sdk.calls.push(`enabled:${enabled}`);
      if (enabled && sdk.hold) await sdk.hold;
    },
    logEvent: async (event: { name: string; params: Record<string, unknown> }) => { sdk.logged.push(event); },
  },
}));

async function adapter() {
  // A fresh module per test: the collection gate is module state, as it is in the app.
  vi.resetModules();
  return import('../src/analytics/firebase');
}

const levelStarted = {
  level: 12, area: 2, role: 'pattern', task_count: 5, bpm: 126, pattern_tier: 2, grid: 'eighth', clear_accuracy: 53,
  mode: 'frontier', previous_stars: 0, retry_count: 0, heart_cost: 1,
} as const;

beforeEach(() => {
  sdk.calls.length = 0;
  sdk.logged.length = 0;
  sdk.hold = null;
});

describe('analytics consent', () => {
  it('sends nothing across the bridge while consent is denied', async () => {
    const { createFirebaseSink } = await adapter();
    const sink = await createFirebaseSink(false);
    sink('level_started', levelStarted);
    sink('purchase_started', { product: 'premium' });
    expect(sdk.logged).toEqual([]);
    expect(sdk.calls).toEqual(['consent:DENIED', 'enabled:false']);
  });

  it('sends shaped events once consent is granted', async () => {
    const { createFirebaseSink } = await adapter();
    const sink = await createFirebaseSink(true);
    sink('level_started', levelStarted);
    expect(sdk.logged).toEqual([{ name: 'level_started', params: levelStarted }]);
  });

  it('stops the moment the player opts out, before the SDK has even answered', async () => {
    const { createFirebaseSink, setFirebaseConsent } = await adapter();
    const sink = await createFirebaseSink(true);
    const denying = setFirebaseConsent(false);
    sink('task_completed', { ...levelStarted, task_index: 1, accuracy: 90, perfect: 4, good: 0, miss: 0, extra: 0, flawless: 1 });
    await denying;
    expect(sdk.logged).toEqual([]);
  });

  it('starts again only after the SDK has accepted a new grant', async () => {
    const { createFirebaseSink, setFirebaseConsent } = await adapter();
    const sink = await createFirebaseSink(false);
    let release!: () => void;
    sdk.hold = new Promise(resolve => { release = resolve; });
    const granting = setFirebaseConsent(true);
    sink('level_started', levelStarted);
    release();
    await granting;
    sink('level_started', levelStarted);
    expect(sdk.logged).toHaveLength(1);
  });

  it('lets a later denial win over a slower grant that lands after it', async () => {
    const { createFirebaseSink, setFirebaseConsent } = await adapter();
    const sink = await createFirebaseSink(false);
    let release!: () => void;
    sdk.hold = new Promise(resolve => { release = resolve; });
    const granting = setFirebaseConsent(true);
    sdk.hold = null;
    await setFirebaseConsent(false);
    release();
    await granting;
    sink('level_started', levelStarted);
    expect(sdk.logged).toEqual([]);
  });

  it('drops an event whose name Firebase would discard, whatever the consent', async () => {
    const { createFirebaseSink } = await adapter();
    const sink = await createFirebaseSink(true);
    (sink as (event: string, payload: object) => void)('session_start', {});
    expect(sdk.logged).toEqual([]);
  });
});

describe('where consent starts', () => {
  it('is still denied unless the build says otherwise', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_ANALYTICS_CONSENT', '');
    const { ANALYTICS } = await import('../src/config/analytics');
    expect(ANALYTICS.consentGranted).toBe(false);
    vi.unstubAllEnvs();
  });
});
