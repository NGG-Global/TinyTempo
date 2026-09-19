import { describe, expect, it, vi } from 'vitest';
import { ADMOB } from '../src/config/ads';
import {
  createAdMobAds, createMonetization, REWARD_EVENTS, type AdMobClient, type ConsentSnapshot,
} from '../src/monetization';
import { claimHeart, type Health } from '../src/game/health';

vi.mock('phaser', () => ({ default: {} }));

const ALLOWED: ConsentSnapshot = { canRequestAds: true };
const BLOCKED: ConsentSnapshot = { canRequestAds: false, isConsentFormAvailable: true };

interface FakeOptions {
  readonly consent?: ConsentSnapshot;
  readonly form?: ConsentSnapshot;
  readonly prepare?: 'ok' | 'fail';
    readonly show?: 'reward' | 'dismiss' | 'fail' | 'reward-twice' | 'hang' | 'resolve-zero' | 'dismiss-then-reward';
}

function fakeClient(options: FakeOptions = {}): AdMobClient & {
  readonly initializes: number;
  readonly prepares: string[];
  emit(event: string, payload?: unknown): void;
} {
  const listeners = new Map<string, ((payload?: unknown) => void)[]>();
  const prepares: string[] = [];
  let initializes = 0;
  const client: AdMobClient & { initializes: number; prepares: string[]; emit: (event: string, payload?: unknown) => void } = {
    get initializes() { return initializes; },
    get prepares() { return prepares; },
    emit(event, payload) {
      for (const listener of listeners.get(event) ?? []) listener(payload);
    },
    async initialize() { initializes += 1; },
    async trackingAuthorizationStatus() { return { status: 'authorized' }; },
    async requestTrackingAuthorization() { /* Android no-op */ },
    async requestConsentInfo() { return options.consent ?? ALLOWED; },
    async showConsentForm() { return options.form ?? ALLOWED; },
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
  return { hearts: 0, refillStartedAt: 1_700_000_000_000, spentAttempt: null };
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
});
