import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  claimTimer, extendTimer, formatTimerLeft, isTimerProduct, loadReplayTimer, NO_TIMER, parseReplayTimer, redeemTimer,
  REPLAY_TIMER_KEY, REPLAY_TIMERS, replayTimerActive, resetReplayTimerSession, saveReplayTimer, shortTimerLeft, timerActive,
  timerLeftMs, timerOption,
} from '../src/game/replayTimer';
import { PRODUCT } from '../src/monetization/types';

vi.mock('phaser', () => ({ default: {} }));

const NOW = Date.UTC(2026, 9, 22, 12, 0, 0);
const MIN = 60_000;

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => { map.delete(key); },
    setItem: (key: string, value: string) => { map.set(key, value); },
  };
}

beforeEach(() => { resetReplayTimerSession(); });

describe('the four timers', () => {
  it('are thirty minutes, an hour, two hours and a day, each a Play consumable of its own', () => {
    expect(REPLAY_TIMERS.map(t => [t.product, t.minutes])).toEqual([
      [PRODUCT.timer30m, 30], [PRODUCT.timer1h, 60], [PRODUCT.timer2h, 120], [PRODUCT.timer1d, 1440],
    ]);
    expect(REPLAY_TIMERS.map(t => t.product)).toEqual(['replay_timer_30m', 'replay_timer_1h', 'replay_timer_2h', 'replay_timer_1d']);
    for (const timer of REPLAY_TIMERS) expect(isTimerProduct(timer.product)).toBe(true);
    expect(isTimerProduct(PRODUCT.heartRefill)).toBe(false);
    expect(isTimerProduct(PRODUCT.premium)).toBe(false);
    expect(timerOption('replay_timer_2h')?.label).toBe('2 hours');
  });
});

describe('what a timer holds', () => {
  it('starts from now with none running, and from the end of one that is', () => {
    expect(timerActive(null, NOW)).toBe(false);
    const first = extendTimer(null, PRODUCT.timer30m, NOW);
    expect(first.expiresAt).toBe(NOW + 30 * MIN);
    expect(timerActive(first, NOW)).toBe(true);
    expect(timerActive(first, NOW + 30 * MIN)).toBe(false);
    // Bought with ten minutes left: those ten are kept and the hour goes on top.
    const stacked = extendTimer(first, PRODUCT.timer1h, NOW + 20 * MIN);
    expect(stacked.expiresAt).toBe(NOW + 90 * MIN);
    // Bought after it ran out: from now, since nothing is left to add to.
    const later = extendTimer(first, PRODUCT.timer1d, NOW + 3 * 60 * MIN);
    expect(later.expiresAt).toBe(NOW + 3 * 60 * MIN + 24 * 60 * MIN);
  });

  it('reads what is left as whole minutes, rounded up, and never below zero', () => {
    expect(timerLeftMs({ expiresAt: NOW + 5 * MIN, claims: [] }, NOW)).toBe(5 * MIN);
    expect(timerLeftMs({ expiresAt: NOW - MIN, claims: [] }, NOW)).toBe(0);
    expect(timerLeftMs(null, NOW)).toBe(0);
    expect(formatTimerLeft(29.2 * MIN)).toBe('30 min');
    expect(formatTimerLeft(60 * MIN)).toBe('1 hr');
    expect(formatTimerLeft(83 * MIN)).toBe('1 hr 23 min');
    expect(formatTimerLeft(24 * 60 * MIN)).toBe('1 day');
    expect(formatTimerLeft(26 * 60 * MIN)).toBe('1 day 2 hr');
    expect(formatTimerLeft(49 * 60 * MIN)).toBe('2 days 1 hr');
    expect(formatTimerLeft(1)).toBe('1 min');
    expect(shortTimerLeft(29.2 * MIN)).toBe('30m');
    expect(shortTimerLeft(119 * MIN)).toBe('1h');
    expect(shortTimerLeft(23 * 60 * MIN)).toBe('23h');
    expect(shortTimerLeft(49 * 60 * MIN)).toBe('2d');
  });
});

describe('a purchase added once', () => {
  it('adds the span for a new claim and refuses the same claim again, in the session and after a reload', () => {
    const storage = memoryStorage();
    const first = redeemTimer(PRODUCT.timer30m, 'play:aaaa', NOW, storage);
    expect(first.granted).toBe(true);
    expect(first.timer.expiresAt).toBe(NOW + 30 * MIN);
    expect(first.timer.claims).toEqual(['play:aaaa']);
    expect(replayTimerActive(NOW, storage)).toBe(true);
    // Play replays the purchase after a crash before the consume: nothing is added again.
    const replayed = redeemTimer(PRODUCT.timer30m, 'play:aaaa', NOW + MIN, storage);
    expect(replayed.granted).toBe(false);
    expect(replayed.timer.expiresAt).toBe(NOW + 30 * MIN);
    resetReplayTimerSession();
    expect(redeemTimer(PRODUCT.timer30m, 'play:aaaa', NOW + MIN, storage).granted).toBe(false);
    // A different purchase stacks.
    const second = redeemTimer(PRODUCT.timer2h, 'play:bbbb', NOW + MIN, storage);
    expect(second.granted).toBe(true);
    expect(second.timer.expiresAt).toBe(NOW + 150 * MIN);
    expect(loadReplayTimer(storage, NOW)?.claims).toEqual(['play:aaaa', 'play:bbbb']);
  });

  it('grants nothing for an empty claim or a product that is not a timer', () => {
    expect(claimTimer(null, PRODUCT.heartRefill, 'play:cccc', NOW)).toEqual({ granted: false, timer: NO_TIMER });
    expect(claimTimer(null, PRODUCT.timer1h, '', NOW).granted).toBe(false);
    expect(claimTimer(null, 'replay_timer_1w', 'play:dddd', NOW).granted).toBe(false);
  });

  it('keeps a bounded list of claims, so the record cannot grow without end', () => {
    let timer = NO_TIMER;
    for (let i = 0; i < 100; i++) timer = claimTimer(timer, PRODUCT.timer30m, `play:${i}`, NOW).timer;
    expect(timer.claims.length).toBeLessThanOrEqual(64);
    expect(timer.claims.at(-1)).toBe('play:99');
  });
});

describe('the stored record', () => {
  it('round-trips through storage and validates every field on the way back', () => {
    const storage = memoryStorage();
    expect(saveReplayTimer({ expiresAt: NOW + MIN, claims: ['play:1'] }, storage)).toBe(true);
    expect(JSON.parse(storage.getItem(REPLAY_TIMER_KEY)!)).toEqual({ version: 1, expiresAt: NOW + MIN, claims: ['play:1'] });
    expect(loadReplayTimer(storage, NOW)).toEqual({ expiresAt: NOW + MIN, claims: ['play:1'] });
    expect(parseReplayTimer(null, NOW)).toBeNull();
    expect(parseReplayTimer('nonsense', NOW)).toBeNull();
    expect(parseReplayTimer('[]', NOW)).toBeNull();
    expect(parseReplayTimer(JSON.stringify({ expiresAt: 'soon' }), NOW)).toBeNull();
    expect(parseReplayTimer(JSON.stringify({ expiresAt: -1 }), NOW)).toBeNull();
    expect(parseReplayTimer(JSON.stringify({ expiresAt: NOW, claims: 'x' }), NOW)).toEqual({ expiresAt: NOW, claims: [] });
    expect(parseReplayTimer(JSON.stringify({ expiresAt: NOW, claims: [1, '', 'ok'] }), NOW)).toEqual({ expiresAt: NOW, claims: ['ok'] });
  });

  it('reads an expiry further ahead than any purchase could set as damage, not a timer', () => {
    // A tampered or corrupted record is not a licence; a week is well past the longest stack.
    expect(parseReplayTimer(JSON.stringify({ expiresAt: NOW + 8 * 24 * 60 * MIN }), NOW)).toBeNull();
    expect(parseReplayTimer(JSON.stringify({ expiresAt: NOW + 6 * 24 * 60 * MIN }), NOW)?.expiresAt).toBe(NOW + 6 * 24 * 60 * MIN);
    // A run-out timer is still a record: its claims are what stops a replayed purchase.
    expect(parseReplayTimer(JSON.stringify({ expiresAt: NOW - 24 * 60 * MIN, claims: ['play:old'] }), NOW)).toEqual({ expiresAt: NOW - 24 * 60 * MIN, claims: ['play:old'] });
  });

  it('is never in a save code or a cloud snapshot', () => {
    // Paid for, so the save carries nothing of it: the code and the snapshot never read the module.
    for (const file of ['src/game/saveCode.ts', 'src/playgames/cloudSave.ts']) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/replayTimer|REPLAY_TIMER/);
    }
  });
});
