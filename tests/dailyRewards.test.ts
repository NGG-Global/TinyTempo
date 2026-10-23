import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DAILY_BANDS, DAILY_REWARDS } from '../src/config/dailyTempo';
import {
  applyDailyRewards, DAILY_REWARDS_KEY, loadDailyRewards, parseDailyRewards, payout, resetDailyRewardsSession, REWARD_TIERS,
  saveDailyRewards, timerMinutesFor, todaysRewards, type DailyRewardRecord,
} from '../src/game/dailyRewards';
import { dailyTempoDay } from '../src/game/dayKey';
import { loadReplayTimer, resetReplayTimerSession, shelfView, WON_START_WINDOW_MS } from '../src/game/replayTimer';
import { loadDailyRestarts, restartsLeft } from '../src/game/dailyRestarts';
import { HEALTH, loadHealth, saveHealth } from '../src/game/health';


vi.mock('phaser', () => ({ default: {} }));

const NOW = Date.UTC(2026, 9, 23, 12, 0, 0);
const DAY = dailyTempoDay(NOW);

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

beforeEach(() => { resetDailyRewardsSession(); resetReplayTimerSession(); });

describe('the reward table', () => {
  it('never pays a timer past the cap, and names a heart on the first and third star and a restart on the second', () => {
    for (const band of DAILY_BANDS) {
      for (const minutes of DAILY_REWARDS.timerMinutes[band]) expect(minutes).toBeLessThanOrEqual(DAILY_REWARDS.maxTimerMinutes);
      expect([1, 2, 3].map(stars => timerMinutesFor(band, stars as 1 | 2 | 3))).toEqual([...DAILY_REWARDS.timerMinutes[band]]);
    }
    expect(timerMinutesFor('tough', 0)).toBe(0);
    expect(DAILY_REWARDS.heartTiers).toHaveLength(DAILY_REWARDS.maxHearts);
    expect(REWARD_TIERS.map(tier => [tier.stars, tier.glyphs.join('+'), tier.label])).toEqual([
      [1, 'heart+timer', '+1 heart'], [2, 'restart+timer', '+1 restart'], [3, 'heart+timer', '+1 heart'],
    ]);
  });
});

describe('what a run pays', () => {
  it('pays each tier once a day, in the order the stars arrive', () => {
    const one = payout(null, { stars: 1, band: 'light', accuracy: 61 }, NOW);
    expect(one.grants).toEqual({ hearts: 1, restart: false, timerMinutes: 15 });
    expect(one.record).toMatchObject({ day: DAY, band: 'light', best: 61, bestStars: 1, runs: 1, paid: 1, timerMinutes: 15 });
    expect([one.paidBefore, one.paidNow, one.timerUpgraded]).toEqual([0, 1, false]);
    const two = payout(one.record, { stars: 2, band: 'light', accuracy: 75 }, NOW + 60_000);
    expect(two.grants).toEqual({ hearts: 0, restart: true, timerMinutes: 30 });
    expect(two.timerUpgraded).toBe(true);
    const three = payout(two.record, { stars: 3, band: 'light', accuracy: 90 }, NOW + 120_000);
    expect(three.grants).toEqual({ hearts: 1, restart: false, timerMinutes: 45 });
    expect(three.record).toMatchObject({ paid: 3, runs: 3, best: 90, bestStars: 3, timerMinutes: 45 });
    // A repeat pays nothing and a worse run changes no best; both count as runs.
    const repeat = payout(three.record, { stars: 3, band: 'light', accuracy: 88 }, NOW + 180_000);
    expect(repeat.grants).toEqual({ hearts: 0, restart: false, timerMinutes: null });
    expect(repeat.record).toMatchObject({ best: 90, runs: 4 });
    const worse = payout(three.record, { stars: 1, band: 'light', accuracy: 50 }, NOW + 180_000);
    expect(worse.grants).toEqual({ hearts: 0, restart: false, timerMinutes: null });
  });

  it('pays everything at once for three stars straight, and starts over on a new day', () => {
    const straight = payout(null, { stars: 3, band: 'tough', accuracy: 95 }, NOW);
    expect(straight.grants).toEqual({ hearts: 2, restart: true, timerMinutes: 90 });
    expect(straight.record.timerMinutes).toBe(DAILY_REWARDS.maxTimerMinutes);
    const tomorrow = payout(straight.record, { stars: 1, band: 'steady', accuracy: 60 }, NOW + 24 * 3_600_000);
    expect(tomorrow.grants).toEqual({ hearts: 1, restart: false, timerMinutes: 20 });
    expect(tomorrow.record).toMatchObject({ day: dailyTempoDay(NOW + 24 * 3_600_000), runs: 1, paid: 1 });
  });

  it('is stored validated, and "today" is only the record of the current day key', () => {
    const storage = memory();
    const record: DailyRewardRecord = { day: DAY, band: 'steady', best: 80.5, bestStars: 2, runs: 2, paid: 2, timerMinutes: 40 };
    expect(saveDailyRewards(record, storage)).toBe(true);
    expect(JSON.parse(storage.data[DAILY_REWARDS_KEY]!)).toEqual({ version: 1, ...record });
    expect(loadDailyRewards(storage)).toEqual(record);
    expect(todaysRewards(NOW, storage)).toEqual(record);
    expect(todaysRewards(NOW + 24 * 3_600_000, storage)).toBeNull();
    for (const bad of ['{"day":"x"}', `{"day":"${DAY}","band":"hard","best":1,"bestStars":1,"runs":1,"paid":1,"timerMinutes":1}`,
      `{"day":"${DAY}","band":"light","best":101,"bestStars":1,"runs":1,"paid":1,"timerMinutes":1}`,
      `{"day":"${DAY}","band":"light","best":1,"bestStars":4,"runs":1,"paid":1,"timerMinutes":1}`,
      `{"day":"${DAY}","band":"light","best":1,"bestStars":1,"runs":-1,"paid":1,"timerMinutes":1}`,
      `{"day":"${DAY}","band":"light","best":1,"bestStars":1,"runs":1,"paid":1,"timerMinutes":91}`, 'null', '[]', 'nonsense']) {
      expect(parseDailyRewards(bad), bad).toBeNull();
    }
  });
});

describe('applying the rewards', () => {
  it('writes the record first, then the hearts, the bonus restart and the won timer', () => {
    const storage = memory();
    const applied = applyDailyRewards({ stars: 3, band: 'steady', accuracy: 92 }, NOW, storage);
    expect(applied.grants).toEqual({ hearts: 2, restart: true, timerMinutes: 60 });
    expect(loadDailyRewards(storage)).toMatchObject({ paid: 3, timerMinutes: 60 });
    // Two hearts on a full bar: the first becomes the spare, the second has nowhere to go.
    expect(loadHealth(storage, NOW)).toMatchObject({ hearts: HEALTH.max, spare: 1 });
    expect(restartsLeft(loadDailyRestarts(storage), NOW)).toBe(3);
    const shelf = shelfView(loadReplayTimer(storage, NOW), NOW);
    expect(shelf.items.map(item => [item.id, item.minutes, item.source])).toEqual([[`won:${DAY}`, 60, 'won']]);
    expect(loadReplayTimer(storage, NOW)?.shelf[0]?.startBy).toBe(NOW + WON_START_WINDOW_MS);
    // The same run again pays nothing more.
    const again = applyDailyRewards({ stars: 3, band: 'steady', accuracy: 92 }, NOW + 60_000, storage);
    expect(again.grants).toEqual({ hearts: 0, restart: false, timerMinutes: null });
    expect(restartsLeft(loadDailyRestarts(storage), NOW)).toBe(3);
  });

  it('puts a heart on a bar with room, and a second run adds only the tiers it reaches', () => {
    const storage = memory();
    saveHealth({ hearts: 2, refillStartedAt: NOW - 60_000, spentAttempt: null, spare: 0 }, storage);
    applyDailyRewards({ stars: 1, band: 'light', accuracy: 60 }, NOW, storage);
    expect(loadHealth(storage, NOW)).toMatchObject({ hearts: 3, spare: 0 });
    const better = applyDailyRewards({ stars: 2, band: 'light', accuracy: 75 }, NOW + 60_000, storage);
    expect(better.grants).toEqual({ hearts: 0, restart: true, timerMinutes: 30 });
    expect(better.timerUpgraded).toBe(true);
    expect(shelfView(loadReplayTimer(storage, NOW), NOW + 60_000).items[0]).toMatchObject({ minutes: 30 });
  });

  it('cannot pay a tier twice in a session even when storage refuses the record', () => {
    const blocked = { ...memory(), setItem: () => { throw new Error('quota'); } } as unknown as Storage;
    const first = applyDailyRewards({ stars: 1, band: 'light', accuracy: 60 }, NOW, blocked);
    expect(first.grants.hearts).toBe(1);
    const second = applyDailyRewards({ stars: 1, band: 'light', accuracy: 60 }, NOW + 1, blocked);
    expect(second.grants).toEqual({ hearts: 0, restart: false, timerMinutes: null });
  });
});
