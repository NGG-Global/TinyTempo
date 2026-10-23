import { describe, expect, it, vi } from 'vitest';
import { ADMOB } from '../src/config/ads';
import {
  createAdMobAds, createMonetization, REWARD_EVENTS, type AdMobClient, type ConsentSnapshot,
} from '../src/monetization';
import { claimHeart, type Health } from '../src/game/health';
import { createConsentRegionSignal, type ConsentRegion } from '../src/monetization/consentRegion';

vi.mock('phaser', () => ({ default: {} }));

const ALLOWED: ConsentSnapshot = { canRequestAds: true };
const BLOCKED: ConsentSnapshot = { canRequestAds: false, isConsentFormAvailable: true };

interface FakeOptions {
  readonly consent?: ConsentSnapshot;
  readonly form?: ConsentSnapshot;
  readonly privacyForm?: ConsentSnapshot;
  readonly privacyFormThrows?: boolean;
  readonly prepare?: 'ok' | 'fail';
  readonly show?: 'reward' | 'dismiss' | 'fail' | 'reward-twice' | 'hang' | 'resolve-zero' | 'dismiss-then-reward';
}

function fakeClient(options: FakeOptions = {}): AdMobClient & {
  readonly initializes: number;
  readonly consentRequests: number;
  readonly privacyForms: number;
  readonly prepares: string[];
  emit(event: string, payload?: unknown): void;
} {
  const listeners = new Map<string, ((payload?: unknown) => void)[]>();
  const prepares: string[] = [];
  let initializes = 0;
  let consentRequests = 0;
  let privacyForms = 0;
  let privacyShown = false;
  const client: AdMobClient & {
    initializes: number; consentRequests: number; privacyForms: number; prepares: string[];
    emit: (event: string, payload?: unknown) => void;
  } = {
    get initializes() { return initializes; },
    get consentRequests() { return consentRequests; },
    get privacyForms() { return privacyForms; },
    get prepares() { return prepares; },
    emit(event, payload) {
      for (const listener of listeners.get(event) ?? []) listener(payload);
    },
    async initialize() { initializes += 1; },
    async trackingAuthorizationStatus() { return { status: 'authorized' }; },
    async requestTrackingAuthorization() { /* Android no-op */ },
    async requestConsentInfo() {
      consentRequests += 1;
      if (privacyShown && options.privacyForm) return options.privacyForm;
      return options.consent ?? ALLOWED;
    },
    async showConsentForm() { return options.form ?? ALLOWED; },
    async showPrivacyOptionsForm() {
      privacyForms += 1;
      if (options.privacyFormThrows) throw new Error('no privacy form');
      privacyShown = true;
    },
    async prepareRewardVideoAd(adId) {
      prepares.push(adId);
      if (options.prepare === 'fail') throw new Error('no fill');
      return { adUnitId: adId };
    },
    async showRewardVideoAd() {
      const mode = options.show ?? 'reward';
      if (mode === 'hang') return new Promise(() => { /* dismissed ads never resolve the call */ });
      if (mode === 'resolve-zero') return { type: 'heart', amount: 0 };
      if (mode === 'dismiss-then-reward') {
        client.emit(REWARD_EVENTS.dismissed);
        queueMicrotask(() => client.emit(REWARD_EVENTS.rewarded, { type: 'heart', amount: 1 }));
        return new Promise(() => { /* plugin leaves the call hanging when the user skips */ });
      }
      if (mode === 'dismiss') {
        client.emit(REWARD_EVENTS.dismissed);
        return new Promise(() => { /* plugin leaves the call hanging when the user skips */ });
      }
      if (mode === 'reward-twice') {
        client.emit(REWARD_EVENTS.rewarded, { type: 'heart', amount: 1 });
        client.emit(REWARD_EVENTS.rewarded, { type: 'heart', amount: 1 });
        return { type: 'heart', amount: 1 };
      }
      client.emit(REWARD_EVENTS.rewarded, { type: 'heart', amount: 1 });
      return { type: 'heart', amount: 1 };
    },
    async addListener(event, listener) {
      const list = listeners.get(event) ?? [];
      list.push(listener);
      listeners.set(event, list);
      return { remove: async () => { /* tests do not unsubscribe */ } };
    },
  };
  return client;
}

function emptyHealth(): Health {
  return { hearts: 0, refillStartedAt: 1_700_000_000_000, spentAttempt: null, spare: 0 };
}

describe('AdMob rewarded adapter', () => {
  it('initializes once, asks consent, then preloads the rewarded unit', async () => {
    const client = fakeClient();
    const ads = createAdMobAds(client);
    await ads.boot();
    await ads.boot();
    expect(client.initializes).toBe(1);
    expect(client.prepares).toEqual([ADMOB.rewardedUnitId]);
    expect(ads.available()).toBe(true);
  });

  it('does not request ads until consent allows it', async () => {
    const client = fakeClient({ consent: BLOCKED, form: BLOCKED });
    const ads = createAdMobAds(client);
    await ads.boot();
    expect(client.prepares).toEqual([]);
    expect(ads.available()).toBe(false);
    await expect(ads.show()).resolves.toEqual({ ok: false, reason: 'unavailable' });
  });

  it('shows the consent form when ads cannot yet be requested, then preloads', async () => {
    const client = fakeClient({ consent: BLOCKED, form: ALLOWED });
    const ads = createAdMobAds(client);
    await ads.boot();
    expect(client.prepares).toEqual([ADMOB.rewardedUnitId]);
    expect(ads.available()).toBe(true);
  });

  it('settles a completed video once even if Rewarded fires twice and show resolves', async () => {
    const client = fakeClient({ show: 'reward-twice' });
    const ads = createAdMobAds(client);
    await expect(ads.show()).resolves.toEqual({ ok: true });
    const health = emptyHealth();
    const first = claimHeart(health, 'show-1', health.refillStartedAt ?? 0);
    const again = claimHeart(first.health, 'show-1', health.refillStartedAt ?? 0);
    expect(first.health.hearts).toBe(1);
    expect(again.granted).toBe(false);
    expect(again.health.hearts).toBe(1);
  });

  it('gives no reward when the player closes the ad early', async () => {
    const client = fakeClient({ show: 'dismiss' });
    const ads = createAdMobAds(client, { dismissGraceMs: 0 });
    await expect(ads.show()).resolves.toEqual({ ok: false, reason: 'cancelled' });
    const health = emptyHealth();
    expect(health.hearts).toBe(0);
  });

  it('does not treat an empty show() resolve as a completed watch', async () => {
    const client = fakeClient({ show: 'resolve-zero' });
    const ads = createAdMobAds(client, { dismissGraceMs: 0 });
    await expect(ads.show()).resolves.toEqual({ ok: false, reason: 'cancelled' });
  });

  it('still grants when Rewarded arrives just after dismiss', async () => {
    const client = fakeClient({ show: 'dismiss-then-reward' });
    const ads = createAdMobAds(client, { dismissGraceMs: 30 });
    await expect(ads.show()).resolves.toEqual({ ok: true });
  });

  it('refuses a second show while one presentation is in flight', async () => {
    const client = fakeClient({ show: 'hang' });
    const ads = createAdMobAds(client, { showLimitMs: 50, dismissGraceMs: 0 });
    const first = ads.show();
    await expect(ads.show()).resolves.toEqual({ ok: false, reason: 'failed' });
    await expect(first).resolves.toEqual({ ok: false, reason: 'failed' });
  });

  it('leaves health alone when prepare fails, then reports unavailable', async () => {
    const client = fakeClient({ prepare: 'fail' });
    const ads = createAdMobAds(client);
    await expect(ads.show()).resolves.toEqual({ ok: false, reason: 'unavailable' });
  });

  it('preloads the next rewarded ad after a successful watch', async () => {
    const client = fakeClient({ show: 'reward' });
    const ads = createAdMobAds(client);
    await ads.show();
    await Promise.resolve();
    await Promise.resolve();
    expect(client.prepares.length).toBeGreaterThanOrEqual(2);
    expect(client.prepares.every(id => id === ADMOB.rewardedUnitId)).toBe(true);
  });

  it('requests the live rewarded unit, from the same account as the app', () => {
    expect(ADMOB.appId).toBe('ca-app-pub-6818267616933452~3245294136');
    expect(ADMOB.rewardedUnitId).toBe('ca-app-pub-6818267616933452/9892619657');
    // A unit from another publisher parses and installs fine, and then never fills.
    const publisher = ADMOB.appId.slice(0, ADMOB.appId.indexOf('~'));
    expect(ADMOB.rewardedUnitId.startsWith(`${publisher}/`)).toBe(true);
  });
});

describe('UMP privacy options', () => {
  it('hides the privacy-options entry point unless UMP reports REQUIRED', async () => {
    const absent = createAdMobAds(fakeClient({ consent: ALLOWED }));
    await absent.boot();
    expect(absent.privacyOptionsAvailable()).toBe(false);

    const notRequired = createAdMobAds(fakeClient({
      consent: { canRequestAds: true, privacyOptionsRequirementStatus: 'NOT_REQUIRED' },
    }));
    await notRequired.boot();
    expect(notRequired.privacyOptionsAvailable()).toBe(false);

    const unknown = createAdMobAds(fakeClient({
      consent: { canRequestAds: true, privacyOptionsRequirementStatus: 'UNKNOWN' },
    }));
    await unknown.boot();
    expect(unknown.privacyOptionsAvailable()).toBe(false);

    const requiredClient = fakeClient({
      consent: { canRequestAds: true, privacyOptionsRequirementStatus: 'REQUIRED' },
    });
    const required = createAdMobAds(requiredClient);
    await required.boot();
    expect(required.privacyOptionsAvailable()).toBe(true);
    expect(required.available()).toBe(true);
    expect(requiredClient.privacyForms).toBe(0);
  });

  it('still offers privacy options when ads cannot yet be requested', async () => {
    const ads = createAdMobAds(fakeClient({
      consent: { canRequestAds: false, isConsentFormAvailable: true, privacyOptionsRequirementStatus: 'REQUIRED' },
      form: { canRequestAds: false, privacyOptionsRequirementStatus: 'REQUIRED' },
    }));
    await ads.boot();
    expect(ads.available()).toBe(false);
    expect(ads.privacyOptionsAvailable()).toBe(true);
  });

  it('re-requests consent after the privacy options form and can then request ads', async () => {
    const client = fakeClient({
      consent: { canRequestAds: false, isConsentFormAvailable: true, privacyOptionsRequirementStatus: 'REQUIRED' },
      form: { canRequestAds: false, privacyOptionsRequirementStatus: 'REQUIRED' },
      privacyForm: { canRequestAds: true, privacyOptionsRequirementStatus: 'REQUIRED' },
    });
    const ads = createAdMobAds(client);
    await ads.boot();
    expect(client.prepares).toEqual([]);
    expect(ads.available()).toBe(false);
    const askedBefore = client.consentRequests;
    await ads.showPrivacyOptions();
    expect(client.privacyForms).toBe(1);
    expect(client.consentRequests).toBe(askedBefore + 1);
    expect(ads.available()).toBe(true);
    expect(ads.privacyOptionsAvailable()).toBe(true);
    expect(client.prepares).toEqual([ADMOB.rewardedUnitId]);
  });

  it('stops requesting ads if the player withdraws consent on the privacy form', async () => {
    const client = fakeClient({
      consent: { canRequestAds: true, privacyOptionsRequirementStatus: 'REQUIRED' },
      privacyForm: { canRequestAds: false, privacyOptionsRequirementStatus: 'REQUIRED' },
    });
    const ads = createAdMobAds(client);
    await ads.boot();
    expect(ads.available()).toBe(true);
    expect(client.prepares).toEqual([ADMOB.rewardedUnitId]);
    await ads.showPrivacyOptions();
    expect(ads.available()).toBe(false);
    expect(client.prepares).toEqual([ADMOB.rewardedUnitId]);
  });

  it('still re-requests consent if the privacy form is missing', async () => {
    const client = fakeClient({
      consent: { canRequestAds: true, privacyOptionsRequirementStatus: 'REQUIRED' },
      privacyFormThrows: true,
    });
    const ads = createAdMobAds(client);
    await ads.boot();
    const askedBefore = client.consentRequests;
    await expect(ads.showPrivacyOptions()).resolves.toBeUndefined();
    expect(client.privacyForms).toBe(1);
    expect(client.consentRequests).toBe(askedBefore + 1);
    expect(ads.available()).toBe(true);
  });
});

describe('rewarded show through the facade still grants once', () => {
  it('only the completion result is an ok, so a caller can claim once', async () => {
    const client = fakeClient({ show: 'reward-twice' });
    const ads = createAdMobAds(client);
    const commerce = createMonetization({ ads });
    const result = await commerce.showRewarded();
    expect(result).toEqual({ ok: true });
    const first = claimHeart(emptyHealth(), 'facade-1', 1_700_000_000_000);
    const again = claimHeart(first.health, 'facade-1', 1_700_000_000_000);
    expect(first.granted).toBe(true);
    expect(again.granted).toBe(false);
    expect(again.health.hearts).toBe(1);
  });

  it('forwards privacy options only when the ads adapter implements them', async () => {
    const client = fakeClient({
      consent: { canRequestAds: true, privacyOptionsRequirementStatus: 'REQUIRED' },
    });
    const ads = createAdMobAds(client);
    await ads.boot();
    const commerce = createMonetization({ ads });
    expect(commerce.privacyOptionsAvailable()).toBe(true);
    await commerce.showPrivacyOptions();
    expect(client.privacyForms).toBe(1);
  });
});

describe('consent before the Mobile Ads SDK', () => {
  /** The fake client, with every call it receives written down in order. */
  function logged(options: FakeOptions = {}) {
    const client = fakeClient(options);
    const calls: string[] = [];
    const wrap = <K extends 'initialize' | 'requestConsentInfo' | 'showConsentForm' | 'prepareRewardVideoAd'>(key: K) => {
      const original = client[key].bind(client) as (...args: never[]) => unknown;
      (client as unknown as Record<string, unknown>)[key] = (...args: never[]) => { calls.push(key); return original(...args); };
    };
    wrap('initialize'); wrap('requestConsentInfo'); wrap('showConsentForm'); wrap('prepareRewardVideoAd');
    return { client, calls };
  }
  const signal = () => {
    const reported: ConsentRegion[] = [];
    const region = createConsentRegionSignal();
    return { reported, region: { report: (r: ConsentRegion) => { reported.push(r); region.report(r); }, wait: region.wait } };
  };

  it('asks for consent first and starts the SDK only once ads may be requested', async () => {
    const { client, calls } = logged({ consent: BLOCKED, form: ALLOWED });
    await createAdMobAds(client, { region: signal().region }).boot();
    expect(calls).toEqual(['requestConsentInfo', 'showConsentForm', 'initialize', 'prepareRewardVideoAd']);
  });

  it('never starts the SDK for a player who refuses', async () => {
    const { client, calls } = logged({ consent: BLOCKED, form: BLOCKED });
    const ads = createAdMobAds(client, { region: signal().region });
    await ads.boot();
    expect(calls).not.toContain('initialize');
    expect(ads.available()).toBe(false);
  });

  it('starts it later, once, when the privacy options grant consent', async () => {
    const { client, calls } = logged({
      consent: { canRequestAds: false, privacyOptionsRequirementStatus: 'REQUIRED' },
      form: { canRequestAds: false, privacyOptionsRequirementStatus: 'REQUIRED' },
      privacyForm: { canRequestAds: true, privacyOptionsRequirementStatus: 'REQUIRED' },
    });
    const ads = createAdMobAds(client, { region: signal().region });
    await ads.boot();
    expect(calls).not.toContain('initialize');
    await ads.showPrivacyOptions();
    await ads.showPrivacyOptions();
    expect(calls.filter(c => c === 'initialize')).toHaveLength(1);
    expect(ads.available()).toBe(true);
  });

  it('reports the region from the first answer, before any form, and unknown when asking fails', async () => {
    const regulated = signal();
    await createAdMobAds(fakeClient({ consent: { ...BLOCKED, status: 'REQUIRED' }, form: ALLOWED }), { region: regulated.region }).boot();
    expect(regulated.reported).toEqual(['regulated']);
    const open = signal();
    await createAdMobAds(fakeClient({ consent: { ...ALLOWED, status: 'NOT_REQUIRED' } }), { region: open.region }).boot();
    expect(open.reported).toEqual(['open']);
    const failed = signal();
    const broken = fakeClient();
    broken.requestConsentInfo = async () => { throw new Error('offline'); };
    const ads = createAdMobAds(broken, { region: failed.region });
    await ads.boot();
    expect(failed.reported).toEqual(['unknown']);
    expect(ads.available()).toBe(false);
  });

  /** A partner-privacy sync that writes itself into the same call log, answering `result`. */
  const partner = (calls: string[], result = true) => ({ sync: async () => { calls.push('partnerPrivacy'); return result; } });

  it('passes a US opt-out to mediation partners before the SDK, and with it the adapters, starts', async () => {
    const { client, calls } = logged({ consent: BLOCKED, form: ALLOWED });
    await createAdMobAds(client, { region: signal().region, partnerPrivacy: partner(calls) }).boot();
    expect(calls).toEqual(['requestConsentInfo', 'showConsentForm', 'partnerPrivacy', 'initialize', 'prepareRewardVideoAd']);
  });

  it('leaves partners alone for a player who refuses, since nothing will be requested', async () => {
    const { client, calls } = logged({ consent: BLOCKED, form: BLOCKED });
    await createAdMobAds(client, { region: signal().region, partnerPrivacy: partner(calls) }).boot();
    expect(calls).not.toContain('partnerPrivacy');
  });

  it('requests nothing when an opt-out on record could not be passed on', async () => {
    const { client, calls } = logged();
    const ads = createAdMobAds(client, { region: signal().region, partnerPrivacy: partner(calls, false) });
    await ads.boot();
    expect(calls).not.toContain('initialize');
    expect(ads.available()).toBe(false);
    expect(await ads.show()).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('passes it on again after the privacy options, where a US-state message records it', async () => {
    const { client, calls } = logged({ consent: { ...ALLOWED, privacyOptionsRequirementStatus: 'REQUIRED' } });
    const ads = createAdMobAds(client, { region: signal().region, partnerPrivacy: partner(calls) });
    await ads.boot();
    calls.length = 0;
    await ads.showPrivacyOptions();
    expect(calls).toEqual(['requestConsentInfo', 'partnerPrivacy']);
  });

  it('caps ad content at parental guidance, and serves test ads outside a release build', () => {
    expect(ADMOB.maxAdContentRating).toBe('ParentalGuidance');
    // Tests are not `build:release`, so they see what a debug APK sees.
    expect(ADMOB.testAds).toBe(true);
    expect(ADMOB.testDevices).toEqual([]);
  });
});
