import { describe, expect, it, vi } from 'vitest';
import { dailyTempoDay, daySeed, isDayKey, msUntilNextDay, untilNextDayCopy, weekdayName } from '../src/game/dayKey';
import { dailyTempoDay as fromLeaderboard } from '../src/playgames/dailyTempo';
import { daySeed as fromObjectives } from '../src/game/objectives';

vi.mock('phaser', () => ({ default: {} }));

const HOUR = 3_600_000;

describe('the Daily Tempo day', () => {
  it('turns at 07:00 UTC, Play Games’ daily clock, and is one function wherever it is read', () => {
    const before = Date.UTC(2026, 9, 23, 6, 59, 59);
    const after = Date.UTC(2026, 9, 23, 7, 0, 0);
    expect(dailyTempoDay(before)).toBe('2026-10-22');
    expect(dailyTempoDay(after)).toBe('2026-10-23');
    expect(fromLeaderboard).toBe(dailyTempoDay);
    expect(isDayKey('2026-10-23')).toBe(true);
    expect(isDayKey('2026-1-23')).toBe(false);
    expect(isDayKey(20261023)).toBe(false);
  });

  it('knows how long the day has left, and the next key is the one that follows', () => {
    for (const now of [Date.UTC(2026, 9, 23, 7, 0, 0), Date.UTC(2026, 9, 23, 12, 48, 0), Date.UTC(2026, 9, 24, 6, 59, 59, 999)]) {
      const ms = msUntilNextDay(now);
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeLessThanOrEqual(24 * HOUR);
      expect(dailyTempoDay(now + ms)).not.toBe(dailyTempoDay(now));
      expect(dailyTempoDay(now + ms - 1)).toBe(dailyTempoDay(now));
    }
    expect(msUntilNextDay(Date.UTC(2026, 9, 23, 7, 0, 0))).toBe(24 * HOUR);
  });

  it('names the weekday from the key, never from the local date', () => {
    expect(weekdayName('2026-10-23')).toBe('Friday');
    expect(weekdayName('2026-10-25')).toBe('Sunday');
    expect(weekdayName('2028-02-29')).toBe('Tuesday');
    expect(weekdayName('nonsense')).toBe('');
  });

  it('writes the time to the next pattern as hours and minutes, rounded up, never under a minute', () => {
    expect(untilNextDayCopy(6 * HOUR + 12 * 60_000)).toBe('6h 12m');
    expect(untilNextDayCopy(6 * HOUR)).toBe('6h');
    expect(untilNextDayCopy(12 * 60_000)).toBe('12m');
    expect(untilNextDayCopy(11.2 * 60_000)).toBe('12m');
    expect(untilNextDayCopy(1)).toBe('1m');
  });

  it('seeds a day the way the objectives always have, so no draw moved with the function', () => {
    expect(daySeed('2026-10-23')).toBe(3682064657);
    expect(daySeed('2026-01-01')).toBe(2049302883);
    expect(fromObjectives).toBe(daySeed);
  });
});
