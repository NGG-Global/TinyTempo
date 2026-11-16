import { calendarDay } from './health';
import { dailyTempoDay, isDayKey } from './dayKey';

/**
 * Restarts are a resource of their own, beside hearts: **two a day**, for the restarts that
 * used to cost a heart — a frontier attempt past the protected first area, once its scored
 * part has begun (`restartKind` in `game/restart.ts`). Hearts pay for starting a level and for
 * Try again; a restart pays with one of these and continues the same attempt, so no action is
 * charged twice. With none left the sheet offers a held replay timer, a rewarded ad for one
 * restart, a timer to buy, or Keep playing.
 *
 * Everything else stays free and unlimited: a restart before the first scored tap, any
 * finished level, levels 1–10, and Premium, which is sold as unlimited hearts and no ads and
 * so could neither run out nor watch the ad.
 *
 * The allowance resets at the player's midnight (`calendarDay`, the daily heart's clock).
 * **A Daily Tempo's second star adds one bonus restart** for the Daily Tempo day it was won
 * on (`dailyTempoDay`, UTC−7), not the local day: a restart won late in the evening would
 * otherwise be gone within minutes. The base two are spent first, because the base turns
 * over at local midnight and the bonus at 07:00 UTC — for nearly every player midnight comes
 * first, so spending the base first never wastes the bonus and lets it carry past midnight.
 * Only today's count is stored (`tiny-tempo.restarts.v1`), device-local and in no save code
 * or cloud snapshot, like hearts. A clock moved back keeps the day it already used rather
 * than handing out a fresh two.
 */
export const RESTARTS = Object.freeze({
  daily: 2,
  /** Bonus restarts a Daily Tempo day can hold: one, from its second star. */
  bonusMax: 1,
});

export const RESTARTS_KEY = 'tiny-tempo.restarts.v1';

export interface BonusRestart {
  /** The Daily Tempo day the bonus belongs to (`dailyTempoDay`). */
  readonly day: string;
  /** Bonus restarts left, 0 to `RESTARTS.bonusMax`. */
  readonly left: number;
}

export interface DailyRestarts {
  /** The local day the count belongs to, `YYYY-MM-DD`. */
  readonly day: string;
  /** Restarts used on that day, 0 to `RESTARTS.daily`. */
  readonly used: number;
  /** The Daily Tempo day's bonus, if one was won. */
  readonly bonus: BonusRestart | null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function baseLeft(state: DailyRestarts | null, now: number): number {
  if (state === null) return RESTARTS.daily;
  const today = calendarDay(now);
  // A record from a later day than the clock says is a clock moved back: still that day.
  if (state.day < today) return RESTARTS.daily;
  return Math.max(0, RESTARTS.daily - state.used);
}

function bonusLeft(state: DailyRestarts | null, now: number): number {
  const bonus = state?.bonus ?? null;
  if (bonus === null || bonus.day !== dailyTempoDay(now)) return 0;
  return Math.max(0, Math.min(RESTARTS.bonusMax, bonus.left));
}

/** How many restarts are left: today's base, plus the Daily Tempo day's bonus while that day lasts. */
export function restartsLeft(state: DailyRestarts | null, now: number): number {
  return baseLeft(state, now) + bonusLeft(state, now);
}

/** The record after spending one — the base first, then the bonus — or null when none is left. */
export function spendRestart(state: DailyRestarts | null, now: number): DailyRestarts | null {
  if (restartsLeft(state, now) <= 0) return null;
  const today = calendarDay(now);
  const current: DailyRestarts = state !== null && state.day >= today ? state : { day: today, used: 0, bonus: state?.bonus ?? null };
  if (baseLeft(current, now) > 0) return { ...current, used: current.used + 1 };
  const bonus = current.bonus!;
  return { ...current, bonus: { day: bonus.day, left: bonus.left - 1 } };
}

/** A Daily Tempo day's bonus restart: once per day key, so a replayed payout adds nothing. */
export function grantBonusRestart(state: DailyRestarts | null, dayKey: string, now: number): { readonly granted: boolean; readonly state: DailyRestarts } {
  const current: DailyRestarts = state ?? { day: calendarDay(now), used: 0, bonus: null };
  if (current.bonus !== null && current.bonus.day === dayKey) return { granted: false, state: current };
  return { granted: true, state: { ...current, bonus: { day: dayKey, left: RESTARTS.bonusMax } } };
}

function parseBonus(raw: unknown): BonusRestart | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { day, left } = raw as { day?: unknown; left?: unknown };
  if (!isDayKey(day)) return null;
  if (typeof left !== 'number' || !Number.isInteger(left) || left < 0 || left > RESTARTS.bonusMax) return null;
  return { day, left };
}

/** A stored record, or null for nothing, damage or a value no build could have written. A bad bonus drops the bonus, not the record. */
export function parseDailyRestarts(raw: string | null): DailyRestarts | null {
  if (!raw) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    const { day, used, bonus } = data as { day?: unknown; used?: unknown; bonus?: unknown };
    if (typeof day !== 'string' || !DAY.test(day)) return null;
    if (typeof used !== 'number' || !Number.isInteger(used) || used < 0 || used > RESTARTS.daily) return null;
    return { day, used, bonus: parseBonus(bonus) };
  } catch {
    return null;
  }
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export function loadDailyRestarts(storage: Storage | null = safeStorage()): DailyRestarts | null {
  try { return parseDailyRestarts(storage?.getItem(RESTARTS_KEY) ?? null); } catch { return null; }
}

/** False means nothing was written. */
export function saveDailyRestarts(state: DailyRestarts, storage: Storage | null = safeStorage()): boolean {
  try {
    storage?.setItem(RESTARTS_KEY, JSON.stringify({ version: 1, day: state.day, used: state.used, ...(state.bonus ? { bonus: state.bonus } : {}) }));
    return storage !== null;
  } catch {
    return false;
  }
}

/**
 * Spend one restart and write it, before the restart runs. Null when none was left, so the
 * caller asks again rather than restarting for free.
 */
export function useDailyRestart(now: number = Date.now(), storage: Storage | null = safeStorage()): DailyRestarts | null {
  const next = spendRestart(loadDailyRestarts(storage), now);
  if (next === null) return null;
  saveDailyRestarts(next, storage);
  return next;
}
