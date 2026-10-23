import { DAILY_BANDS, DAILY_REWARDS, type DailyBand } from '../config/dailyTempo';
import { dailyTempoDay, isDayKey } from './dayKey';
import { grantBonusRestart, loadDailyRestarts, saveDailyRestarts } from './dailyRestarts';
import { grantRewardHeart, loadHealth, saveHealth, type Health } from './health';
import { loadReplayTimer, NO_TIMER, saveReplayTimer, upgradeWonTimer, type ReplayTimer } from './replayTimer';

/**
 * What a Daily Tempo run pays, and the one record that keeps it honest.
 *
 * Each star tier pays **once per day key** (`dailyTempoDay`, UTC−7): the first star a heart
 * and a won replay timer, the second a bonus restart and a longer timer, the third a heart
 * and the longest. A later, better run pays only the tiers it adds; a worse or equal run
 * pays nothing and counts as a replay. The record (`tiny-tempo.daily.v1`) is device-local
 * and is **written before the grants**, the rule `useDailyRestart` already follows, so a
 * crash between the two forfeits a reward rather than paying it twice; a session set of
 * `day:paid` covers the gap when storage refuses the write. A heart won on a full bar
 * becomes the spare (`grantRewardHeart`); the won timer is one item a day that a better
 * run upgrades (`upgradeWonTimer`). Reset progress leaves this record alone: a reset must
 * not pay the day out again.
 */
export const DAILY_REWARDS_KEY = 'tiny-tempo.daily.v1';
/** More runs than a day has minutes; a bound on a tampered count. */
const MAX_RUNS = 10_000;

export type Stars = 0 | 1 | 2 | 3;

export interface DailyRewardRecord {
  readonly day: string;
  readonly band: DailyBand;
  /** The day's best accuracy, 0–100, unrounded. */
  readonly best: number;
  readonly bestStars: Stars;
  readonly runs: number;
  /** The highest tier paid today. */
  readonly paid: Stars;
  /** Won timer minutes granted so far today, 0 to `maxTimerMinutes`. */
  readonly timerMinutes: number;
}

export interface DailyRun {
  readonly stars: Stars;
  readonly band: DailyBand;
  readonly accuracy: number;
}

export interface DailyGrants {
  readonly hearts: number;
  readonly restart: boolean;
  /** The day's new timer total, or null when the run won no more time. */
  readonly timerMinutes: number | null;
}

export interface Payout {
  readonly record: DailyRewardRecord;
  readonly grants: DailyGrants;
  readonly paidBefore: Stars;
  readonly paidNow: Stars;
  /** True when a won timer already stood today and this run made it longer. */
  readonly timerUpgraded: boolean;
}

/** A reward row's glyphs and label, for the ladder on the card and the plaque. */
export interface RewardTier {
  readonly stars: 1 | 2 | 3;
  readonly glyphs: readonly ('heart' | 'restart' | 'timer')[];
  readonly label: string;
}

export const REWARD_TIERS: readonly RewardTier[] = Object.freeze([1, 2, 3].map((stars): RewardTier => {
  const heart = (DAILY_REWARDS.heartTiers as readonly number[]).includes(stars);
  const restart = DAILY_REWARDS.restartTier === stars;
  return {
    stars: stars as 1 | 2 | 3,
    glyphs: [...(heart ? ['heart' as const] : []), ...(restart ? ['restart' as const] : []), 'timer'],
    label: heart ? '+1 heart' : restart ? '+1 restart' : 'Longer timer',
  };
}));

export function timerMinutesFor(band: DailyBand, stars: Stars): number {
  if (stars === 0) return 0;
  return Math.min(DAILY_REWARDS.maxTimerMinutes, DAILY_REWARDS.timerMinutes[band][stars - 1] ?? 0);
}

function fresh(day: string, band: DailyBand): DailyRewardRecord {
  return { day, band, best: 0, bestStars: 0, runs: 0, paid: 0, timerMinutes: 0 };
}

/**
 * The record after a run, and what it pays. Pure: a record from another day is discarded,
 * the tiers in `(paid, newPaid]` pay, and the timer grows only when the band's value for
 * the stars reached is above what the day has already won.
 */
export function payout(record: DailyRewardRecord | null, run: DailyRun, now: number): Payout {
  const day = dailyTempoDay(now);
  const current = record !== null && record.day === day ? record : fresh(day, run.band);
  const paidBefore = current.paid;
  const paidNow = Math.max(paidBefore, run.stars) as Stars;
  let hearts = 0;
  let restart = false;
  for (let tier = paidBefore + 1; tier <= paidNow; tier++) {
    if ((DAILY_REWARDS.heartTiers as readonly number[]).includes(tier)) hearts++;
    if (DAILY_REWARDS.restartTier === tier) restart = true;
  }
  hearts = Math.min(hearts, DAILY_REWARDS.maxHearts);
  const target = timerMinutesFor(run.band, run.stars);
  const timerMinutes = target > current.timerMinutes ? target : null;
  const best = Math.max(current.best, Math.max(0, Math.min(100, run.accuracy)));
  return {
    record: {
      day, band: run.band, best, bestStars: Math.max(current.bestStars, run.stars) as Stars,
      runs: Math.min(MAX_RUNS, current.runs + 1), paid: paidNow,
      timerMinutes: Math.max(current.timerMinutes, target),
    },
    grants: { hearts, restart, timerMinutes },
    paidBefore, paidNow,
    timerUpgraded: timerMinutes !== null && current.timerMinutes > 0,
  };
}

export function parseDailyRewards(raw: string | null): DailyRewardRecord | null {
  if (!raw) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    const { day, band, best, bestStars, runs, paid, timerMinutes } = data as Record<string, unknown>;
    if (!isDayKey(day)) return null;
    if (typeof band !== 'string' || !(DAILY_BANDS as readonly string[]).includes(band)) return null;
    const stars = (value: unknown): Stars | null => (value === 0 || value === 1 || value === 2 || value === 3 ? value : null);
    const paidClean = stars(paid), bestStarsClean = stars(bestStars);
    if (paidClean === null || bestStarsClean === null) return null;
    if (typeof best !== 'number' || !Number.isFinite(best) || best < 0 || best > 100) return null;
    if (typeof runs !== 'number' || !Number.isInteger(runs) || runs < 0 || runs > MAX_RUNS) return null;
    if (typeof timerMinutes !== 'number' || !Number.isInteger(timerMinutes) || timerMinutes < 0 || timerMinutes > DAILY_REWARDS.maxTimerMinutes) return null;
    return { day, band: band as DailyBand, best, bestStars: bestStarsClean, runs, paid: paidClean, timerMinutes };
  } catch {
    return null;
  }
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export function loadDailyRewards(storage: Storage | null = safeStorage()): DailyRewardRecord | null {
  try { return parseDailyRewards(storage?.getItem(DAILY_REWARDS_KEY) ?? null); } catch { return null; }
}

/** False means nothing was written. */
export function saveDailyRewards(record: DailyRewardRecord, storage: Storage | null = safeStorage()): boolean {
  try {
    storage?.setItem(DAILY_REWARDS_KEY, JSON.stringify({ version: 1, ...record }));
    return storage !== null;
  } catch {
    return false;
  }
}

/** Today's record, or null when the day has no run yet: "Best today" and the ladder read this. */
export function todaysRewards(now: number = Date.now(), storage: Storage | null = safeStorage()): DailyRewardRecord | null {
  const record = loadDailyRewards(storage);
  return record !== null && record.day === dailyTempoDay(now) ? record : null;
}

export interface AppliedRewards extends Payout {
  readonly health: Health;
  readonly timer: ReplayTimer;
}

/** Session memory of the tiers paid, so a write storage refused cannot let a tier pay twice before a reload. */
const paidThisSession = new Set<string>();

/**
 * Load, pay out, persist: the record first, then the hearts, the bonus restart and the won
 * timer. The scene calls this once per finished run and reads the grants for its plaque.
 */
export function applyDailyRewards(run: DailyRun, now: number = Date.now(), storage: Storage | null = safeStorage()): AppliedRewards {
  const day = dailyTempoDay(now);
  const paid = payout(loadDailyRewards(storage), run, now);
  const key = (tier: number): string => `${day}:${tier}`;
  // Tiers this session already paid are not paid again, whatever the record on disk says.
  let hearts = paid.grants.hearts;
  let restart = paid.grants.restart;
  let timerMinutes = paid.grants.timerMinutes;
  for (let tier = paid.paidBefore + 1; tier <= paid.paidNow; tier++) {
    if (!paidThisSession.has(key(tier))) continue;
    if ((DAILY_REWARDS.heartTiers as readonly number[]).includes(tier)) hearts = Math.max(0, hearts - 1);
    if (DAILY_REWARDS.restartTier === tier) restart = false;
    timerMinutes = null;
  }
  for (let tier = paid.paidBefore + 1; tier <= paid.paidNow; tier++) paidThisSession.add(key(tier));
  saveDailyRewards(paid.record, storage);
  let health = loadHealth(storage, now);
  for (let i = 0; i < hearts; i++) {
    const granted = grantRewardHeart(health, now);
    health = granted.health;
  }
  if (hearts > 0) saveHealth(health, storage);
  if (restart) {
    const bonus = grantBonusRestart(loadDailyRestarts(storage), day, now);
    if (bonus.granted) saveDailyRestarts(bonus.state, storage);
  }
  let timer = loadReplayTimer(storage, now) ?? NO_TIMER;
  if (timerMinutes !== null) {
    const won = upgradeWonTimer(timer, day, paid.record.timerMinutes, now);
    if (won.granted > 0) { timer = won.timer; saveReplayTimer(timer, storage); }
  }
  return { ...paid, grants: { hearts, restart, timerMinutes }, health, timer };
}

/** Tests only: forget the session's paid tiers. */
export function resetDailyRewardsSession(): void {
  paidThisSession.clear();
}
