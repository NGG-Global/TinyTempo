import { describe, expect, it, vi } from 'vitest';
import {
  RESTARTS, RESTARTS_KEY, loadDailyRestarts, parseDailyRestarts, restartsLeft, saveDailyRestarts, spendRestart, useDailyRestart,
} from '../src/game/dailyRestarts';
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
    expect(one).toEqual({ day: TODAY, used: 1 });
    expect(restartsLeft(one, NOW)).toBe(1);
    const two = spendRestart(one, NOW)!;
    expect(restartsLeft(two, NOW)).toBe(0);
    expect(spendRestart(two, NOW)).toBeNull();
  });

  it('resets at the player\'s midnight, and a clock moved back does not hand out more', () => {
    const spent = { day: TODAY, used: 2 };
    expect(restartsLeft(spent, NOW + DAY_MS)).toBe(2);
    expect(spendRestart(spent, NOW + DAY_MS)).toEqual({ day: calendarDay(NOW + DAY_MS), used: 1 });
    // Yesterday's clock reading against today's record: still today's count.
    expect(restartsLeft(spent, NOW - DAY_MS)).toBe(0);
    expect(spendRestart(spent, NOW - DAY_MS)).toBeNull();
  });

  it('reads only what this build could have written, and treats the rest as nothing stored', () => {
    expect(parseDailyRestarts(JSON.stringify({ version: 1, day: TODAY, used: 1 }))).toEqual({ day: TODAY, used: 1 });
    for (const raw of [null, '', 'not json', '[]', 'null', '{"day":"2026-10-21"}', '{"day":"today","used":1}',
      '{"day":"2026-10-21","used":-1}', '{"day":"2026-10-21","used":1.5}', '{"day":"2026-10-21","used":3}', '{"day":"2026-10-21","used":"1"}']) {
      expect(parseDailyRestarts(raw), String(raw)).toBeNull();
    }
  });

  it('writes the restart before it is used, and refuses one when none is left', () => {
    const storage = memory();
    expect(useDailyRestart(NOW, storage)).toEqual({ day: TODAY, used: 1 });
    expect(JSON.parse(storage.data[RESTARTS_KEY]!)).toMatchObject({ day: TODAY, used: 1 });
    expect(useDailyRestart(NOW, storage)).toEqual({ day: TODAY, used: 2 });
    expect(useDailyRestart(NOW, storage)).toBeNull();
    expect(loadDailyRestarts(storage)).toEqual({ day: TODAY, used: 2 });
    // Tomorrow, two more.
    expect(useDailyRestart(NOW + DAY_MS, storage)).toEqual({ day: calendarDay(NOW + DAY_MS), used: 1 });
  });

  it('survives blocked or broken storage', () => {
    expect(loadDailyRestarts(null)).toBeNull();
    expect(saveDailyRestarts({ day: TODAY, used: 1 }, null)).toBe(false);
    const full = { ...memory(), setItem: () => { throw new Error('quota'); } } as unknown as Storage;
    expect(saveDailyRestarts({ day: TODAY, used: 1 }, full)).toBe(false);
    expect(loadDailyRestarts(memory({ [RESTARTS_KEY]: 'not json' }))).toBeNull();
  });
});
