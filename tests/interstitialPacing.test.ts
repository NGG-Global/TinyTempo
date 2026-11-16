import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ADMOB, INTERSTITIAL } from '../src/config/ads';
import { HEALTH } from '../src/game/health';
import {
  countsTowardInterstitial, createInterstitialPacer, interstitialReachable, interstitialVerdict,
  type InterstitialMoment,
} from '../src/game/interstitialPacing';

vi.mock('phaser', () => ({ default: {} }));

const RULES = { fromLevel: 11, everyClears: 3, minGapMs: 180_000 } as const;

function moment(overrides: Partial<InterstitialMoment> = {}): InterstitialMoment {
  return {
    level: 14, clears: 3, premium: false, timerRunning: false, reviewLaunched: false,
    now: 1_000_000, lastAdClosedAt: null, ...overrides,
  };
}

describe('interstitial pacing', () => {
  it('shows one when every rule agrees', () => {
    expect(interstitialVerdict(moment(), RULES)).toBe('show');
  });

  it('never counts or shows in the first area', () => {
    for (let level = 1; level <= 10; level += 1) {
      expect(countsTowardInterstitial(level, RULES)).toBe(false);
      expect(interstitialVerdict(moment({ level }), RULES)).toBe('level');
    }
    expect(countsTowardInterstitial(11, RULES)).toBe(true);
    expect(countsTowardInterstitial(11.5, RULES)).toBe(false);
  });

  it('never shows Premium, a running timer, or on the Continue that asked for a review', () => {
    expect(interstitialVerdict(moment({ premium: true }), RULES)).toBe('premium');
    expect(interstitialVerdict(moment({ timerRunning: true }), RULES)).toBe('timer');
    expect(interstitialVerdict(moment({ reviewLaunched: true }), RULES)).toBe('review');
  });

  it('waits for the clears, and for the gap after any full-screen ad', () => {
    expect(interstitialVerdict(moment({ clears: 2 }), RULES)).toBe('count');
    expect(interstitialVerdict(moment({ lastAdClosedAt: 1_000_000 - 179_999 }), RULES)).toBe('gap');
    expect(interstitialVerdict(moment({ lastAdClosedAt: 1_000_000 - 180_000 }), RULES)).toBe('show');
    // A clock set back waits rather than shows.
    expect(interstitialVerdict(moment({ lastAdClosedAt: 2_000_000 }), RULES)).toBe('gap');
  });

  it('counts only clears past the first area, and starts again after one plays', () => {
    const pacer = createInterstitialPacer(RULES);
    for (const level of [3, 10, 11, 12]) pacer.noteClear(level);
    expect(pacer.clears).toBe(2);
    pacer.noteClear(40);
    expect(pacer.clears).toBe(3);
    pacer.noteShown();
    expect(pacer.clears).toBe(0);
  });

  it('loads one only for a save that can reach a counting level', () => {
    expect(interstitialReachable(10, RULES)).toBe(false);
    expect(interstitialReachable(11, RULES)).toBe(true);
  });
});

describe('interstitial configuration', () => {
  it('leaves the free first area free of ads too', () => {
    expect(INTERSTITIAL.fromLevel).toBeGreaterThan(HEALTH.protectedThrough);
    expect(INTERSTITIAL.everyClears).toBeGreaterThanOrEqual(2);
    expect(INTERSTITIAL.minGapMs).toBeGreaterThan(0);
  });

  it('uses an interstitial unit from the same AdMob account as the app', () => {
    const publisher = /^(ca-app-pub-\d+)~/.exec(ADMOB.appId)?.[1];
    expect(publisher).toBeDefined();
    expect(ADMOB.interstitialUnitId.startsWith(`${publisher}/`)).toBe(true);
    expect(ADMOB.interstitialUnitId).not.toBe(ADMOB.rewardedUnitId);
  });

  it('is shown from a level result only: Daily Tempo and Endless stay free of ads', () => {
    for (const scene of ['src/scenes/DailyScene.ts', 'src/scenes/EndlessScene.ts']) {
      expect(readFileSync(scene, 'utf8')).not.toMatch(/interstitial/i);
    }
  });
});
