import { ADMOB } from '@/config/ads';
import { consentRegion, regionFromStatus, type ConsentRegionSignal } from './consentRegion';
import type { InterstitialAds, InterstitialResult, RewardedAds, RewardedResult } from './types';
import type { PartnerPrivacy } from './usOptOut';

/** Plugin event names, inlined so tests never import the native package. */
export const REWARD_EVENTS = {
  loaded: 'onRewardedVideoAdLoaded',
  failedToLoad: 'onRewardedVideoAdFailedToLoad',
  showed: 'onRewardedVideoAdShowed',
  failedToShow: 'onRewardedVideoAdFailedToShow',
  dismissed: 'onRewardedVideoAdDismissed',
  rewarded: 'onRewardedVideoAdReward',
} as const;

/**
 * The plugin's interstitial events, inlined for the same reason. `showInterstitial` resolves
 * as soon as the ad has been asked to show, not when it closes, so the close is read from
 * `dismissed` (or `failedToShow`); the player goes on to the map only then.
 */
export const INTERSTITIAL_EVENTS = {
  loaded: 'interstitialAdLoaded',
  failedToLoad: 'interstitialAdFailedToLoad',
  failedToShow: 'interstitialAdFailedToShow',
  dismissed: 'interstitialAdDismissed',
} as const;

/**
 * UMP privacy-options requirement. Inlined so tests never import the native package.
 * `REQUIRED` is the only status that should surface a publisher-rendered entry point.
 */
export type PrivacyOptionsRequirementStatus = 'NOT_REQUIRED' | 'REQUIRED' | 'UNKNOWN';

export interface ConsentSnapshot {
  /** UMP's consent status (`REQUIRED`, `OBTAINED`, `NOT_REQUIRED`, `UNKNOWN`): where the player is, in effect. */
  readonly status?: string;
  readonly canRequestAds: boolean;
  readonly isConsentFormAvailable?: boolean;
  readonly privacyOptionsRequirementStatus?: PrivacyOptionsRequirementStatus;
}

export interface AdMobClient {
  initialize(): Promise<void>;
  trackingAuthorizationStatus(): Promise<{ readonly status: string }>;
  requestTrackingAuthorization(): Promise<void>;
  requestConsentInfo(): Promise<ConsentSnapshot>;
  showConsentForm(): Promise<ConsentSnapshot>;
  showPrivacyOptionsForm(): Promise<void>;
  prepareRewardVideoAd(adId: string): Promise<{ readonly adUnitId: string }>;
  showRewardVideoAd(): Promise<{ readonly type: string; readonly amount: number }>;
  prepareInterstitial(adId: string): Promise<{ readonly adUnitId: string }>;
  /** Shows the last prepared interstitial; settles when it is on screen, not when it closes. */
  showInterstitial(): Promise<void>;
  addListener(event: string, listener: (payload?: unknown) => void): Promise<{ remove: () => Promise<void> }>;
}

export interface AdMobAds extends RewardedAds, InterstitialAds {
  /** Consent, SDK init and the first preload. Safe to call more than once. */
  boot(): Promise<void>;
  /** True only while UMP reports that a privacy-options entry point is required. */
  privacyOptionsAvailable(): boolean;
  /**
   * Shows the publisher-rendered privacy options form, then re-reads consent so
   * `canRequestAds` and the Settings row stay in step with what the player just chose.
   */
  showPrivacyOptions(): Promise<void>;
}

interface ShowSession {
  readonly id: number;
  earned: boolean;
  finish: (result: RewardedResult) => void;
}

/**
 * Native adapter for the two full-screen formats: the rewarded video the player opts into,
 * and the interstitial shown on the way out of a level (`game/interstitialPacing.ts`
 * decides when). Never a banner. Hearts are granted by the caller from a single
 * `{ ok: true }` — this class only settles each show once per presentation. One full-screen
 * ad at a time: neither format opens while the other is up.
 */
export function createAdMobAds(client: AdMobClient, options: {
  readonly adUnitId?: string;
  /** The interstitial unit; empty turns the format off. */
  readonly interstitialUnitId?: string;
  readonly showLimitMs?: number;
  /** An interstitial still open after this long settles as failed, so leaving is never held. */
  readonly interstitialLimitMs?: number;
  /** Wait this long after a dismiss/empty resolve for a late Rewarded event. */
  readonly dismissGraceMs?: number;
  /** Where UMP's first answer about the player's region goes; analytics reads it. */
  readonly region?: ConsentRegionSignal;
  /** Passes a US-state opt-out to mediation partners that do not read UMP's record (`usOptOut.ts`). */
  readonly partnerPrivacy?: PartnerPrivacy;
} = {}): AdMobAds {
  const adUnitId = options.adUnitId ?? ADMOB.rewardedUnitId;
  const interstitialUnitId = options.interstitialUnitId ?? ADMOB.interstitialUnitId;
  const showLimitMs = options.showLimitMs ?? 170_000;
  const interstitialLimitMs = options.interstitialLimitMs ?? 120_000;
  const dismissGraceMs = options.dismissGraceMs ?? 400;
  const region = options.region ?? consentRegion;
  const partnerPrivacy = options.partnerPrivacy;
  let bootPromise: Promise<void> | null = null;
  let initialized = false;
  let denied = false;
  let privacyOptionsRequired = false;
  let loaded = false;
  let preparing: Promise<void> | null = null;
  let showing = false;
  let session: ShowSession | null = null;
  let nextShowId = 1;
  let listening = false;
  /** Survives `session = null` so a Rewarded event after settle still informs dismiss. */
  let earnedThisShow = false;
  let interstitialLoaded = false;
  let interstitialPreparing: Promise<void> | null = null;
  let interstitialShowing = false;
  /** The open interstitial's settle, while one is on screen. */
  let interstitialSettle: ((result: InterstitialResult) => void) | null = null;

  async function boot(): Promise<void> {
    bootPromise ??= runBoot();
    await bootPromise;
  }

  /**
   * Consent first, then the SDK. Google's UMP sample initialises the Mobile Ads SDK only
   * once `canRequestAds` is true, and this used to initialise it before asking, which is
   * an SDK started — and free to make its own requests — for a player who may yet refuse.
   * A refusal now leaves it never started; a later grant through the privacy options
   * starts it then (`allowAdsIfConsented`).
   */
  async function runBoot(): Promise<void> {
    try {
      let consent: ConsentSnapshot;
      try {
        consent = await client.requestConsentInfo();
      } catch (error) {
        // A request that failed is an unknown region, never an open one.
        region.report('unknown');
        throw error;
      }
      // Reported before any form is shown, so analytics is not held behind a player reading one.
      region.report(regionFromStatus(consent.status));
      if (!consent.canRequestAds) {
        try { consent = await client.showConsentForm(); } catch { /* form missing or already answered */ }
      }
      rememberConsent(consent);
      const tracking = await client.trackingAuthorizationStatus();
      if (tracking.status === 'notDetermined') {
        await client.requestTrackingAuthorization();
      }
      await passOnPartnerPrivacy();
      await allowAdsIfConsented();
    } catch {
      denied = true;
    }
  }

  function rememberConsent(consent: ConsentSnapshot): void {
    privacyOptionsRequired = consent.privacyOptionsRequirementStatus === 'REQUIRED';
    denied = !consent.canRequestAds;
  }

  /**
   * Before the SDK starts, because starting it starts the mediation adapters, and again after
   * the privacy options, where a US-state message records its opt-out. An opt-out that could
   * not be passed on holds ads back rather than let a partner bid on a player who said no.
   */
  async function passOnPartnerPrivacy(): Promise<void> {
    if (denied || !partnerPrivacy) return;
    if (!(await partnerPrivacy.sync())) denied = true;
  }

  async function allowAdsIfConsented(): Promise<void> {
    if (denied) return;
    if (!initialized) {
      await client.initialize();
      initialized = true;
    }
    await ensureListeners();
    await prepare();
  }

  async function showPrivacyOptions(): Promise<void> {
    try {
      try { await client.showPrivacyOptionsForm(); } catch { /* form missing or already closed */ }
      rememberConsent(await client.requestConsentInfo());
      await passOnPartnerPrivacy();
      await allowAdsIfConsented();
    } catch {
      /* leave the last known consent standing */
    }
  }

  async function ensureListeners(): Promise<void> {
    if (listening) return;
    listening = true;
    // Kept for the process: boot runs once, and a second addListener would double-settle.
    await client.addListener(REWARD_EVENTS.rewarded, () => {
      earnedThisShow = true;
      settleShow({ ok: true });
    });
    await client.addListener(REWARD_EVENTS.dismissed, () => {
      if (earnedThisShow) {
        settleShow({ ok: true });
        return;
      }
      const id = session?.id;
      const finishDismiss = (): void => {
        if (session?.id !== id) return;
        settleShow(earnedThisShow ? { ok: true } : { ok: false, reason: 'cancelled' });
      };
      if (dismissGraceMs <= 0) finishDismiss();
      else globalThis.setTimeout(finishDismiss, dismissGraceMs);
    });
    await client.addListener(REWARD_EVENTS.failedToShow, () => {
      if (earnedThisShow) return;
      settleShow({ ok: false, reason: 'failed' });
    });
    await client.addListener(REWARD_EVENTS.loaded, () => { loaded = true; });
    await client.addListener(REWARD_EVENTS.failedToLoad, () => { loaded = false; });
    await client.addListener(INTERSTITIAL_EVENTS.dismissed, () => { interstitialSettle?.({ shown: true }); });
    await client.addListener(INTERSTITIAL_EVENTS.failedToShow, () => {
      interstitialSettle?.({ shown: false, reason: 'failed' });
    });
    await client.addListener(INTERSTITIAL_EVENTS.failedToLoad, () => { interstitialLoaded = false; });
  }

  /**
   * Loaded on request (`Monetization.warmInterstitial`), never at boot: the adapter does not
   * know who is Premium or which levels can show one, and an ad loaded for nobody is a request
   * that never shows.
   */
  async function prepareInterstitial(): Promise<void> {
    if (interstitialUnitId === '') return;
    await boot();
    if (denied || !initialized || interstitialLoaded || interstitialShowing) return;
    interstitialPreparing ??= (async () => {
      try {
        await client.prepareInterstitial(interstitialUnitId);
        interstitialLoaded = true;
      } catch {
        interstitialLoaded = false;
      } finally {
        interstitialPreparing = null;
      }
    })();
    await interstitialPreparing;
  }

  function presentInterstitial(): Promise<InterstitialResult> {
    return new Promise(resolve => {
      let settled = false;
      const finish = (result: InterstitialResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(limit);
        interstitialSettle = null;
        resolve(result);
      };
      const limit = setTimeout(() => finish({ shown: false, reason: 'failed' }), interstitialLimitMs);
      interstitialSettle = finish;
      client.showInterstitial().catch(() => finish({ shown: false, reason: 'failed' }));
    });
  }

  async function showInterstitial(): Promise<InterstitialResult> {
    if (interstitialUnitId === '' || denied || !initialized) return { shown: false, reason: 'unavailable' };
    if (showing || interstitialShowing) return { shown: false, reason: 'failed' };
    if (!interstitialLoaded) {
      // Never waited for: the player is on their way to the map. The next one is warmed.
      void prepareInterstitial();
      return { shown: false, reason: 'not_ready' };
    }
    interstitialShowing = true;
    // The plugin drops a shown ad whatever becomes of it, so this one is spent either way.
    interstitialLoaded = false;
    try {
      return await presentInterstitial();
    } catch {
      return { shown: false, reason: 'failed' };
    } finally {
      interstitialShowing = false;
    }
  }

  function settleShow(result: RewardedResult): void {
    const current = session;
    if (!current) return;
    if (result.ok) current.earned = true;
    session = null;
    current.finish(result);
  }

  async function prepare(): Promise<void> {
    if (denied || loaded) return;
    preparing ??= (async () => {
      try {
        await client.prepareRewardVideoAd(adUnitId);
        loaded = true;
      } catch {
        loaded = false;
      } finally {
        preparing = null;
      }
    })();
    await preparing;
  }

  function present(): Promise<RewardedResult> {
    return new Promise(resolve => {
      const id = nextShowId++;
      let settled = false;
      const finish = (result: RewardedResult): void => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      const limit = setTimeout(() => settleShow({ ok: false, reason: 'failed' }), showLimitMs);
      const guarded = (result: RewardedResult): void => {
        clearTimeout(limit);
        finish(result);
      };
      earnedThisShow = false;
      session = { id, earned: false, finish: guarded };
      void client.showRewardVideoAd().then(
        reward => {
          if (session?.id !== id) return;
          if (reward.amount > 0) {
            earnedThisShow = true;
            settleShow({ ok: true });
            return;
          }
          if (earnedThisShow) {
            settleShow({ ok: true });
            return;
          }
          const finishEmpty = (): void => {
            if (session?.id !== id) return;
            settleShow(earnedThisShow ? { ok: true } : { ok: false, reason: 'cancelled' });
          };
          if (dismissGraceMs <= 0) finishEmpty();
          else globalThis.setTimeout(finishEmpty, dismissGraceMs);
        },
        () => {
          if (session?.id !== id) return;
          if (earnedThisShow) {
            settleShow({ ok: true });
            return;
          }
          settleShow({ ok: false, reason: 'failed' });
        },
      );
    });
  }

  return {
    boot,

    available(): boolean {
      return !denied;
    },

    privacyOptionsAvailable(): boolean {
      return privacyOptionsRequired;
    },

    showPrivacyOptions,

    interstitialReady(): boolean {
      return interstitialUnitId !== '' && !denied && initialized && interstitialLoaded && !interstitialShowing;
    },

    prepareInterstitial,

    showInterstitial,

    async show(): Promise<RewardedResult> {
      if (showing || interstitialShowing) return { ok: false, reason: 'failed' };
      showing = true;
      try {
        await boot();
        if (denied) return { ok: false, reason: 'unavailable' };
        if (!loaded) await prepare();
        if (!loaded) return { ok: false, reason: 'unavailable' };
        return await present();
      } catch {
        return { ok: false, reason: 'failed' };
      } finally {
        showing = false;
        loaded = false;
        if (!denied) void prepare();
      }
    },
  };
}
