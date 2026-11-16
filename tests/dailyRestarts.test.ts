import { describe, expect, it, vi } from 'vitest';
import {
  RESTARTS, RESTARTS_KEY, grantBonusRestart, loadDailyRestarts, parseDailyRestarts, restartsLeft, saveDailyRestarts, spendRestart, useDailyRestart,
} from '../src/game/dailyRestarts';
import { dailyTempoDay } from '../src/game/dayKey';
import { calendarDay } from '../src/game/health';

// `health.ts` reaches Phaser through the level specs; nothing here draws.
vi.mock('phaser', () => ({ default: {} }));

/** Noon, so a day either side is unambiguous in any timezone the tests run in. */
const NOW = new Date(2026, 9, 21, 12, 0, 0).getTime();
const DAY_MS = 24 * 3_600_000;
const TODAY = calendarDay(NOW);

function memory(initial: Record<string, string> = {}): Storage & { readonly data: Record<string, string> } {
  const data: Record<string, string> = { ...initial };
  return {
    data,
    get length() { return Object.keys(data).length; },
    clear: () => { for (const key of Object.keys(data)) delete data[key]; },
    getItem: key => data[key] ?? null,
    key: i => Object.keys(data)[i] ?? null,
    removeItem: key => { delete data[key]; },
    setItem: (key, value) => { data[key] = String(value); },
  };
}

describe('two restarts a day', () => {
  it('starts every day with two, and spends them one at a time', () => {
    expect(RESTARTS.daily).toBe(2);
    expect(restartsLeft(null, NOW)).toBe(2);
    const one = spendRestart(null, NOW)!;
    expect(one).toEqual({ day: TODAY, used: 1, bonus: null });
    expect(restartsLeft(one, NOW)).toBe(1);
    const two = spendRestart(one, NOW)!;
    expect(restartsLeft(two, NOW)).toBe(0);
    expect(spendRestart(two, NOW)).toBeNull();
  });

  it('resets at the player\'s midnight, and a clock moved back does not hand out more', () => {
    const spent = { day: TODAY, used: 2, bonus: null };
    expect(restartsLeft(spent, NOW + DAY_MS)).toBe(2);
    expect(spendRestart(spent, NOW + DAY_MS)).toEqual({ day: calendarDay(NOW + DAY_MS), used: 1, bonus: null });
    // Yesterday's clock reading against today's record: still today's count.
    expect(restartsLeft(spent, NOW - DAY_MS)).toBe(0);
    expect(spendRestart(spent, NOW - DAY_MS)).toBeNull();
  });

  it('reads only what this build could have written, and treats the rest as nothing stored', () => {
    expect(parseDailyRestarts(JSON.stringify({ version: 1, day: TODAY, used: 1 }))).toEqual({ day: TODAY, used: 1, bonus: null });
    for (const raw of [null, '', 'not json', '[]', 'null', '{"day":"2026-10-21"}', '{"day":"today","used":1}',
      '{"day":"2026-10-21","used":-1}', '{"day":"2026-10-21","used":1.5}', '{"day":"2026-10-21","used":3}', '{"day":"2026-10-21","used":"1"}']) {
      expect(parseDailyRestarts(raw), String(raw)).toBeNull();
    }
  });

  it('writes the restart before it is used, and refuses one when none is left', () => {
    const storage = memory();
    expect(useDailyRestart(NOW, storage)).toEqual({ day: TODAY, used: 1, bonus: null });
    expect(JSON.parse(storage.data[RESTARTS_KEY]!)).toMatchObject({ day: TODAY, used: 1 });
    expect(useDailyRestart(NOW, storage)).toEqual({ day: TODAY, used: 2, bonus: null });
    expect(useDailyRestart(NOW, storage)).toBeNull();
    expect(loadDailyRestarts(storage)).toEqual({ day: TODAY, used: 2, bonus: null });
    // Tomorrow, two more.
    expect(useDailyRestart(NOW + DAY_MS, storage)).toEqual({ day: calendarDay(NOW + DAY_MS), used: 1, bonus: null });
  });

  it('survives blocked or broken storage', () => {
    expect(loadDailyRestarts(null)).toBeNull();
    expect(saveDailyRestarts({ day: TODAY, used: 1, bonus: null }, null)).toBe(false);
    const full = { ...memory(), setItem: () => { throw new Error('quota'); } } as unknown as Storage;
    expect(saveDailyRestarts({ day: TODAY, used: 1, bonus: null }, full)).toBe(false);
    expect(loadDailyRestarts(memory({ [RESTARTS_KEY]: 'not json' }))).toBeNull();
  });
});

describe('the bonus restart a Daily Tempo second star wins', () => {
  const DAY_KEY = dailyTempoDay(NOW);

  it('adds one while its Daily Tempo day lasts, is spent after the base two, and never twice a day', () => {
    const won = grantBonusRestart(null, DAY_KEY, NOW);
    expect(won.granted).toBe(true);
    expect(won.state).toEqual({ day: TODAY, used: 0, bonus: { day: DAY_KEY, left: 1 } });
    expect(restartsLeft(won.state, NOW)).toBe(3);
    expect(grantBonusRestart(won.state, DAY_KEY, NOW).granted).toBe(false);
    // Base first: two spends leave the bonus, the third takes it.
    const one = spendRestart(won.state, NOW)!, two = spendRestart(one, NOW)!, three = spendRestart(two, NOW)!;
    expect([one.used, two.used, three.used]).toEqual([1, 2, 2]);
    expect([one.bonus?.left, two.bonus?.left, three.bonus?.left]).toEqual([1, 1, 0]);
    expect(spendRestart(three, NOW)).toBeNull();
    // The bonus is gone with its day; a stale one adds nothing and a new day's base is back.
    const later = NOW + 2 * DAY_MS;
    expect(restartsLeft(won.state, later)).toBe(2);
    expect(spendRestart(won.state, later)).toEqual({ day: calendarDay(later), used: 1, bonus: { day: DAY_KEY, left: 1 } });
  });

  it('carries past the player’s midnight while the Daily Tempo day has not turned', () => {
    // Noon on the 21st local; the Daily Tempo day turns at 07:00 UTC, so pick a clock inside both.
    const state = { day: TODAY, used: 2, bonus: { day: DAY_KEY, left: 1 } };
    expect(restartsLeft(state, NOW)).toBe(1);
    const afterMidnight = new Date(2026, 9, 22, 0, 30, 0).getTime();
    expect(restartsLeft(state, afterMidnight)).toBe(2 + (dailyTempoDay(afterMidnight) === DAY_KEY ? 1 : 0));
  });

  it('reads a bonus only as this build writes it, and a bad bonus drops the bonus rather than the record', () => {
    const storage = memory();
    saveDailyRestarts({ day: TODAY, used: 1, bonus: { day: DAY_KEY, left: 1 } }, storage);
    expect(JSON.parse(storage.data[RESTARTS_KEY]!)).toEqual({ version: 1, day: TODAY, used: 1, bonus: { day: DAY_KEY, left: 1 } });
    expect(loadDailyRestarts(storage)).toEqual({ day: TODAY, used: 1, bonus: { day: DAY_KEY, left: 1 } });
    for (const bonus of ['{"day":"x","left":1}', '{"day":"2026-10-21","left":2}', '{"day":"2026-10-21","left":-1}', '{"day":"2026-10-21"}', '"bonus"']) {
      expect(parseDailyRestarts(`{"day":"${TODAY}","used":1,"bonus":${bonus}}`), bonus).toEqual({ day: TODAY, used: 1, bonus: null });
    }
  });
});
