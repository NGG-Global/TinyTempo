import { calendarDay } from './health';

/**
 * Restarts are a resource of their own, beside hearts: **two a day**, for the restarts that
 * used to cost a heart — a frontier attempt past the protected first area, once its scored
 * part has begun (`restartKind` in `game/restart.ts`). Hearts pay for starting a level and for
 * Try again; a restart pays with one of these and continues the same attempt, so no action is
 * charged twice. With none left the sheet offers a rewarded ad for one restart, or Keep playing.
 *
 * Everything else stays free and unlimited: a restart before the first scored tap, any
 * finished level, levels 1–10, and Premium, which is sold as unlimited hearts and no ads and
 * so could neither run out nor watch the ad.
 *
 * The allowance resets at the player's midnight (`calendarDay`, the daily heart's clock).
 * Only today's count is stored (`tiny-tempo.restarts.v1`), device-local and in no save code or
 * cloud snapshot, like hearts. A clock moved back keeps the day it already used rather than
 * handing out a fresh two.
 */
export const RESTARTS = Object.freeze({
  daily: 2,
});

export const RESTARTS_KEY = 'tiny-tempo.restarts.v1';

export interface DailyRestarts {
  /** The local day the count belongs to, `YYYY-MM-DD`. */
  readonly day: string;
  /** Restarts used on that day, 0 to `RESTARTS.daily`. */
  readonly used: number;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** How many of today's restarts are left. No record, or yesterday's, is a full allowance. */
export function restartsLeft(state: DailyRestarts | null, now: number): number {
  if (state === null) return RESTARTS.daily;
  const today = calendarDay(now);
  // A record from a later day than the clock says is a clock moved back: still that day.
  if (state.day < today) return RESTARTS.daily;
  return Math.max(0, RESTARTS.daily - state.used);
}

/** The record after spending one, or null when none is left. */
export function spendRestart(state: DailyRestarts | null, now: number): DailyRestarts | null {
  if (restartsLeft(state, now) <= 0) return null;
  const today = calendarDay(now);
  const current = state !== null && state.day >= today ? state : { day: today, used: 0 };
  return { day: current.day, used: current.used + 1 };
}

/** A stored record, or null for nothing, damage or a value no build could have written. */
export function parseDailyRestarts(raw: string | null): DailyRestarts | null {
  if (!raw) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    const { day, used } = data as { day?: unknown; used?: unknown };
    if (typeof day !== 'string' || !DAY.test(day)) return null;
    if (typeof used !== 'number' || !Number.isInteger(used) || used < 0 || used > RESTARTS.daily) return null;
    return { day, used };
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
    storage?.setItem(RESTARTS_KEY, JSON.stringify({ version: 1, day: state.day, used: state.used }));
    return storage !== null;
  } catch {
    return false;
  }
}

/**
 * Spend one of today's restarts and write it, before the restart runs. Null when none was
 * left, so the caller asks again rather than restarting for free.
 */
export function useDailyRestart(now: number = Date.now(), storage: Storage | null = safeStorage()): DailyRestarts | null {
  const next = spendRestart(loadDailyRestarts(storage), now);
  if (next === null) return null;
  saveDailyRestarts(next, storage);
  return next;
}
