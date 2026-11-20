import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ADMOB, INTERSTITIAL } from '../src/config/ads';
import { HEALTH } from '../src/game/health';
import {
  countsTowardInterstitial, createInterstitialPacer, interstitialReachable, interstitialVerdict,
  type InterstitialMoment,
} from '../src/game/interstitialPacing';

vi.mock('phaser', () => ({ default: {} }));

const RULES = { fromLevel: 6, everyLevels: 1, minGapMs: 30_000 } as const;

function moment(overrides: Partial<InterstitialMoment> = {}): InterstitialMoment {
  return {
    level: 14, played: true, exits: 1, premium: false, reviewLaunched: false,
    now: 1_000_000, lastAdClosedAt: null, ...overrides,
  };
}

describe('interstitial pacing', () => {
  it('shows one on the way out of a played level when every rule agrees', () => {
    expect(interstitialVerdict(moment(), RULES)).toBe('show');
  });

  it('never counts or shows on the first five levels', () => {
    for (let level = 1; level <= 5; level += 1) {
      expect(countsTowardInterstitial(level, RULES)).toBe(false);
      expect(interstitialVerdict(moment({ level }), RULES)).toBe('level');
    }
    expect(countsTowardInterstitial(6, RULES)).toBe(true);
    expect(countsTowardInterstitial(6.5, RULES)).toBe(false);
  });

  it('never shows one to a player who left before an attempt began', () => {
    expect(interstitialVerdict(moment({ played: false }), RULES)).toBe('unplayed');
  });

  it('never shows Premium, or on the exit that asked for a review', () => {
    expect(interstitialVerdict(moment({ premium: true }), RULES)).toBe('premium');
    expect(interstitialVerdict(moment({ reviewLaunched: true }), RULES)).toBe('review');
  });

  it('waits for the gap after any full-screen ad', () => {
    expect(interstitialVerdict(moment({ lastAdClosedAt: 1_000_000 - 29_999 }), RULES)).toBe('gap');
    expect(interstitialVerdict(moment({ lastAdClosedAt: 1_000_000 - 30_000 }), RULES)).toBe('show');
    // A clock set back waits rather than shows.
    expect(interstitialVerdict(moment({ lastAdClosedAt: 2_000_000 }), RULES)).toBe('gap');
  });

  it('honours a count above one if the knob is ever raised', () => {
    const everyOther = { ...RULES, everyLevels: 2 };
    expect(interstitialVerdict(moment({ exits: 1 }), everyOther)).toBe('count');
    expect(interstitialVerdict(moment({ exits: 2 }), everyOther)).toBe('show');
  });

  it('counts only played exits past the first five levels, and starts again after one plays', () => {
    const pacer = createInterstitialPacer(RULES);
    pacer.noteExit(3, true);
    pacer.noteExit(5, true);
    pacer.noteExit(12, false);
    expect(pacer.exits).toBe(0);
    pacer.noteExit(6, true);
    pacer.noteExit(40, true);
    expect(pacer.exits).toBe(2);
    pacer.noteShown();
    expect(pacer.exits).toBe(0);
  });

  it('loads one only for a save that can reach a counting level', () => {
    expect(interstitialReachable(5, RULES)).toBe(false);
    expect(interstitialReachable(6, RULES)).toBe(true);
  });
});

describe('interstitial configuration', () => {
  it('leaves the first levels free of ads, and never shows two back to back', () => {
    expect(Number.isInteger(INTERSTITIAL.fromLevel)).toBe(true);
    expect(INTERSTITIAL.fromLevel).toBeGreaterThan(1);
    expect(INTERSTITIAL.fromLevel).toBeLessThanOrEqual(HEALTH.protectedThrough + 1);
    expect(INTERSTITIAL.everyLevels).toBeGreaterThanOrEqual(1);
    // Google forbids an interstitial straight after another ad closes; this is the floor.
    expect(INTERSTITIAL.minGapMs).toBeGreaterThanOrEqual(30_000);
  });

  it('uses an interstitial unit from the same AdMob account as the app', () => {
    const publisher = /^(ca-app-pub-\d+)~/.exec(ADMOB.appId)?.[1];
    expect(publisher).toBeDefined();
    expect(ADMOB.interstitialUnitId.startsWith(`${publisher}/`)).toBe(true);
    expect(ADMOB.interstitialUnitId).not.toBe(ADMOB.rewardedUnitId);
  });

  it('plays on every way out of a level: nothing in PlayScene leaves around it', () => {
    const play = readFileSync('src/scenes/PlayScene.ts', 'utf8');
    const leaves = play.split('\n').filter(line => line.includes('this.leaveForMap()'));
    // The two continuations (Continue, and every other exit) and the dev-only preview result.
    expect(leaves).toHaveLength(3);
    for (const line of leaves) expect(line).toMatch(/if \(!this\.disposed\) this\.leaveForMap\(\)|this\.previewResult/);
    expect(play).toMatch(/action === 'leave'\) \{ this\.closeRestartSheet\('left'\); this\.exitLevel\(\); \}/);
  });

  it('is shown from a level only: Daily Tempo and Endless stay free of ads', () => {
    for (const scene of ['src/scenes/DailyScene.ts', 'src/scenes/EndlessScene.ts']) {
      expect(readFileSync(scene, 'utf8')).not.toMatch(/interstitial/i);
    }
  });
});
