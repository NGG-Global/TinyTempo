import { afterEach, describe, expect, it } from 'vitest';
import {
  ANALYTICS_EVENTS, PRODUCT, createMonetization, installAnalytics, installMonetization,
  monetization, purchaseFeedback, restoreFeedback, rewardedFeedback, stubAds, stubBilling, track,
  type AnalyticsEvent, type Billing, type RewardedAds,
} from '../src/monetization';

const events: { event: AnalyticsEvent; payload: unknown }[] = [];

afterEach(() => {
  events.length = 0;
  installAnalytics(() => { /* default restored below */ });
  installAnalytics((event, payload) => { events.push({ event, payload }); });
  installMonetization(createMonetization());
});

installAnalytics((event, payload) => { events.push({ event, payload }); });

describe('monetization stubs', () => {
  it('keeps ads and purchases unavailable on the web so the browser session is unchanged', () => {
    const commerce = createMonetization();
    expect(commerce.rewardedAvailable()).toBe(false);
    expect(commerce.purchasesAvailable()).toBe(false);
    expect(commerce.premium()).toBe(false);
    expect(commerce.productPrice(PRODUCT.heartRefill)).toBeNull();
    expect(commerce.productPrice(PRODUCT.premium)).toBeNull();
  });

  it('resolves show/purchase/restore to result objects rather than throwing', async () => {
    const commerce = createMonetization();
    await expect(commerce.showRewarded()).resolves.toEqual({ ok: false, reason: 'unavailable' });
    await expect(commerce.purchase(PRODUCT.premium)).resolves.toEqual({
      ok: false, product: PRODUCT.premium, reason: 'unavailable',
    });
    await expect(commerce.restorePurchases()).resolves.toEqual({ ok: true, premium: false });
  });

  it('exposes the same stub through the game-wide accessor', async () => {
    expect(monetization().rewardedAvailable()).toBe(false);
    expect(await monetization().showRewarded()).toEqual({ ok: false, reason: 'unavailable' });
  });
});

describe('native failure isolation', () => {
  it('treats a throwing SDK as unavailable rather than crashing', async () => {
    const ads: RewardedAds = {
      available: () => { throw new Error('plugin missing'); },
      show: async () => { throw new Error('ad exploded'); },
    };
    const billing: Billing = {
      available: () => { throw new Error('billing missing'); },
      premium: () => { throw new Error('entitlement'); },
      price: () => { throw new Error('price'); },
      purchase: async () => { throw new Error('purchase exploded'); },
      restore: async () => { throw new Error('restore exploded'); },
    };
    const commerce = createMonetization({ ads, billing });
    expect(commerce.rewardedAvailable()).toBe(false);
    expect(commerce.purchasesAvailable()).toBe(false);
    expect(commerce.premium()).toBe(false);
    expect(commerce.productPrice(PRODUCT.heartRefill)).toBeNull();
    await expect(commerce.showRewarded()).resolves.toEqual({ ok: false, reason: 'unavailable' });
    await expect(commerce.purchase(PRODUCT.premium)).resolves.toEqual({
      ok: false, product: PRODUCT.premium, reason: 'unavailable',
    });
    await expect(commerce.restorePurchases()).resolves.toEqual({ ok: false, reason: 'failed' });
    expect(events.filter(e => e.event === 'purchase_started')).toEqual([]);
    expect(events).toContainEqual({ event: 'purchase_failed', payload: { product: PRODUCT.premium, reason: 'unavailable' } });
  });

  it('turns a throwing show() into a failed result after availability passed', async () => {
    const ads: RewardedAds = {
      available: () => true,
      show: async () => { throw new Error('ad failed'); },
    };
    const commerce = createMonetization({ ads });
    await expect(commerce.showRewarded()).resolves.toEqual({ ok: false, reason: 'failed' });
    expect(events.map(e => e.event)).toEqual(['rewarded_started', 'rewarded_failed']);
  });

  it('fails a hung native call instead of blocking the game', async () => {
    const ads: RewardedAds = {
      available: () => true,
      show: () => new Promise(() => { /* never settles */ }),
    };
    const commerce = createMonetization({ ads, timeoutMs: 20 });
    await expect(commerce.showRewarded()).resolves.toEqual({ ok: false, reason: 'failed' });
  });

  it('fails a hung purchase instead of blocking the game', async () => {
    const billing: Billing = {
      ...stubBilling,
      available: () => true,
      purchase: () => new Promise(() => { /* never settles */ }),
    };
    const commerce = createMonetization({ billing, timeoutMs: 20 });
    await expect(commerce.purchase(PRODUCT.heartRefill)).resolves.toEqual({
      ok: false, product: PRODUCT.heartRefill, reason: 'failed',
    });
  });
});

describe('successful adapters still report through the facade', () => {
  it('records a completed rewarded ad', async () => {
    const ads: RewardedAds = {
      available: () => true,
      show: async () => ({ ok: true }),
    };
    const commerce = createMonetization({ ads });
    expect(commerce.rewardedAvailable()).toBe(true);
    await expect(commerce.showRewarded()).resolves.toEqual({ ok: true });
    expect(events.map(e => e.event)).toEqual(['rewarded_started', 'rewarded_completed']);
  });

  it('distinguishes cancelled purchases from failures', async () => {
    const billing: Billing = {
      ...stubBilling,
      available: () => true,
      purchase: async product => ({ ok: false, product, reason: 'cancelled' }),
    };
    const commerce = createMonetization({ billing });
    await expect(commerce.purchase(PRODUCT.premium)).resolves.toEqual({
      ok: false, product: PRODUCT.premium, reason: 'cancelled',
    });
    expect(events.map(e => e.event)).toEqual(['purchase_started', 'purchase_cancelled']);
  });

  it('records a completed purchase and restore that grants premium', async () => {
    const billing: Billing = {
      available: () => true,
      premium: () => true,
      price: () => '€1.99',
      purchase: async product => ({ ok: true, product, claimId: 'paid' }),
      restore: async () => ({ ok: true, premium: true }),
    };
    const commerce = createMonetization({ billing });
    expect(commerce.premium()).toBe(true);
    await expect(commerce.purchase(PRODUCT.premium)).resolves.toEqual({
      ok: true, product: PRODUCT.premium, claimId: 'paid',
    });
    await expect(commerce.restorePurchases()).resolves.toEqual({ ok: true, premium: true });
    expect(events.map(e => e.event)).toEqual(['purchase_started', 'purchase_completed']);
  });

  it('records a pending purchase as a failure without a completion', async () => {
    const billing: Billing = {
      ...stubBilling,
      available: () => true,
      purchase: async product => ({ ok: false, product, reason: 'pending' }),
    };
    const commerce = createMonetization({ billing });
    await expect(commerce.purchase(PRODUCT.heartRefill)).resolves.toEqual({
      ok: false, product: PRODUCT.heartRefill, reason: 'pending',
    });
    expect(events.map(e => e.event)).toEqual(['purchase_started', 'purchase_failed']);
    expect(events[1]?.payload).toEqual({ product: PRODUCT.heartRefill, reason: 'pending' });
  });
});

describe('analytics boundary', () => {
  it('names every prepared commerce event', () => {
    expect([...ANALYTICS_EVENTS]).toEqual([
      'health_empty',
      'rewarded_offer_shown',
      'rewarded_started',
      'rewarded_completed',
      'rewarded_failed',
      'purchase_offer_shown',
      'purchase_started',
      'purchase_completed',
      'purchase_cancelled',
      'purchase_failed',
    ]);
  });

  it('delivers health_empty and offer events to the installed sink', () => {
    track('health_empty', { level: 10 });
    track('rewarded_offer_shown', { placement: 'map' });
    track('purchase_offer_shown', { product: PRODUCT.premium });
    expect(events).toEqual([
      { event: 'health_empty', payload: { level: 10 } },
      { event: 'rewarded_offer_shown', payload: { placement: 'map' } },
      { event: 'purchase_offer_shown', payload: { product: PRODUCT.premium } },
    ]);
  });

  it('swallows a throwing sink so analytics cannot take the game down', () => {
    installAnalytics(() => { throw new Error('sink'); });
    expect(() => track('health_empty', { level: 1 })).not.toThrow();
  });

  it('lets tests replace the game-wide commerce instance', () => {
    const previous = installMonetization(createMonetization({
      ads: { ...stubAds, available: () => true, show: async () => ({ ok: true }) },
    }));
    expect(monetization().rewardedAvailable()).toBe(true);
    installMonetization(previous);
    expect(monetization().rewardedAvailable()).toBe(false);
  });
});

describe('rewarded watch copy', () => {
  it('explains an unavailable or skipped ad without promising a heart', () => {
    expect(rewardedFeedback('unavailable')).toBe('No ad just now.');
    expect(rewardedFeedback('cancelled')).toBe('The ad closed before a heart.');
    expect(rewardedFeedback('failed')).toBe("The ad didn't finish.");
  });
});

describe('heart refill copy', () => {
  it('explains a cancelled, pending or failed purchase without restoring hearts', () => {
    expect(purchaseFeedback('unavailable')).toBe("The store isn't available.");
    expect(purchaseFeedback('cancelled')).toBe('Purchase cancelled.');
    expect(purchaseFeedback('failed')).toBe("The purchase didn't finish.");
    expect(purchaseFeedback('pending')).toBe('The store is still checking.');
  });
});

describe('premium', () => {
  it('names the store product tinytempo_premium', () => {
    // Owning this Play product is itself the entitlement; there is no second identifier.
    expect(PRODUCT.premium).toBe('tinytempo_premium');
    expect(PRODUCT.heartRefill).toBe('heart_refill_full');
  });

  it('hides rewarded ads once the entitlement is active', async () => {
    let shown = 0;
    const ads: RewardedAds = {
      available: () => true,
      show: async () => { shown += 1; return { ok: true }; },
    };
    const billing: Billing = {
      ...stubBilling,
      available: () => true,
      premium: () => true,
    };
    const commerce = createMonetization({ ads, billing });
    expect(commerce.rewardedAvailable()).toBe(false);
    expect(commerce.premium()).toBe(true);
    await expect(commerce.showRewarded()).resolves.toEqual({ ok: false, reason: 'unavailable' });
    expect(shown).toBe(0);
  });
});

describe('restore copy', () => {
  it('explains a restore without promising hearts', () => {
    expect(restoreFeedback({ ok: true, premium: true })).toBe('Premium restored.');
    expect(restoreFeedback({ ok: true, premium: false })).toBe('No purchases to restore.');
    expect(restoreFeedback({ ok: false, reason: 'unavailable' })).toBe("The store isn't available.");
    expect(restoreFeedback({ ok: false, reason: 'failed' })).toBe("Couldn't restore just now.");
  });
});
