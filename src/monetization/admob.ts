import { ADMOB } from '@/config/ads';
import { consentRegion, regionFromStatus, type ConsentRegionSignal } from './consentRegion';
import type { RewardedAds, RewardedResult } from './types';
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
  addListener(event: string, listener: (payload?: unknown) => void): Promise<{ remove: () => Promise<void> }>;
}

export interface AdMobAds extends RewardedAds {
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
 * Native rewarded-video adapter. Never draws a banner or interstitial. Hearts
 * are granted by the caller from a single `{ ok: true }` — this class only
 * settles show() once per presentation.
 */
export function createAdMobAds(client: AdMobClient, options: {
  readonly adUnitId?: string;
  readonly showLimitMs?: number;
  /** Wait this long after a dismiss/empty resolve for a late Rewarded event. */
  readonly dismissGraceMs?: number;
  /** Where UMP's first answer about the player's region goes; analytics reads it. */
  readonly region?: ConsentRegionSignal;
  /** Passes a US-state opt-out to mediation partners that do not read UMP's record (`usOptOut.ts`). */
  readonly partnerPrivacy?: PartnerPrivacy;
} = {}): AdMobAds {
  const adUnitId = options.adUnitId ?? ADMOB.rewardedUnitId;
  const showLimitMs = options.showLimitMs ?? 170_000;
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

    async show(): Promise<RewardedResult> {
      if (showing) return { ok: false, reason: 'failed' };
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
