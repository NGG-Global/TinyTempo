import { describe, expect, it } from 'vitest';
import { startingConsent } from '../src/analytics/startingConsent';
import { createConsentRegionSignal, regionFromStatus } from '../src/monetization/consentRegion';

describe('the consent region', () => {
  it('reads UMP’s status as a region, and anything else as unknown, never open', () => {
    expect(regionFromStatus('REQUIRED')).toBe('regulated');
    expect(regionFromStatus('OBTAINED')).toBe('regulated');
    expect(regionFromStatus('NOT_REQUIRED')).toBe('open');
    for (const other of ['UNKNOWN', undefined, null, 3, 'required']) expect(regionFromStatus(other)).toBe('unknown');
  });

  it('keeps the first report, and answers unknown when none arrives in time', async () => {
    const signal = createConsentRegionSignal();
    signal.report('regulated');
    signal.report('open');
    await expect(signal.wait(1_000)).resolves.toBe('regulated');
    let fire: () => void = () => { /* set below */ };
    const silent = createConsentRegionSignal((run) => { fire = run; });
    const waiting = silent.wait(8_000);
    fire();
    await expect(waiting).resolves.toBe('unknown');
  });
});

describe('where analytics starts', () => {
  const unchosen = (analytics: boolean) => ({ analytics, analyticsChosen: false });
  const chosen = (analytics: boolean) => ({ analytics, analyticsChosen: true });

  it('lets the player’s own answer stand in every region', () => {
    for (const region of ['regulated', 'open', 'unknown'] as const) {
      expect(startingConsent(chosen(true), region)).toEqual({ granted: true, storeOff: false });
      expect(startingConsent(chosen(false), region)).toEqual({ granted: false, storeOff: false });
    }
  });

  it('collects nothing where consent is required until it is given, and says so on the switch', () => {
    expect(startingConsent(unchosen(true), 'regulated')).toEqual({ granted: false, storeOff: true });
    expect(startingConsent(unchosen(false), 'regulated')).toEqual({ granted: false, storeOff: false });
  });

  it('holds collection for a session whose region is unknown, without opting anyone out for good', () => {
    expect(startingConsent(unchosen(true), 'unknown')).toEqual({ granted: false, storeOff: false });
  });

  it('runs the build’s default elsewhere', () => {
    expect(startingConsent(unchosen(true), 'open')).toEqual({ granted: true, storeOff: false });
    expect(startingConsent(unchosen(false), 'open')).toEqual({ granted: false, storeOff: false });
  });
});
