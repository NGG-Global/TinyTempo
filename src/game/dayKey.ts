import { PGS_DAILY_RESET_UTC_OFFSET_HOURS } from '../config/leaderboards';

/**
 * The Daily Tempo day, and what hangs off it. Pure, no Phaser.
 *
 * **One function decides the day**, shared by the chart, the rewards paid for it, the best
 * kept for it and the leaderboard, so none of them can disagree about "today". It is the
 * date on Play Games' own daily clock, UTC−7 all year, not the player's local date: a daily
 * leaderboard is one board for everyone, and keyed to local midnight a player in Tokyo and
 * one in London would be posting different days' charts onto the same daily view. On this
 * clock the chart, the rewards and the board all turn over together. The daily heart, the
 * base two restarts and the daily objectives stay on local time (`calendarDay` in
 * `health.ts`): they are the player's own day, not a shared one.
 */
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export function dailyTempoDay(now: number = Date.now()): string {
  const shifted = new Date(now + PGS_DAILY_RESET_UTC_OFFSET_HOURS * HOUR_MS);
  const y = shifted.getUTCFullYear(), m = shifted.getUTCMonth() + 1, d = shifted.getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function isDayKey(value: unknown): value is string {
  return typeof value === 'string' && DAY_KEY.test(value);
}

/** Milliseconds until the day turns: in (0, one day]. */
export function msUntilNextDay(now: number = Date.now()): number {
  const shifted = now + PGS_DAILY_RESET_UTC_OFFSET_HOURS * HOUR_MS;
  const sinceMidnight = ((shifted % DAY_MS) + DAY_MS) % DAY_MS;
  return DAY_MS - sinceMidnight;
}

/** The weekday a day key names, from the key alone: the card's "Friday" is the chart's day, never the local date. */
export function weekdayName(dayKey: string): string {
  const match = DAY_KEY.exec(dayKey);
  if (!match) return '';
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return WEEKDAYS[day.getUTCDay()] ?? '';
}

/** "6h 12m", "6h", "12m": minutes rounded up, never under a minute while the day still runs. */
export function untilNextDayCopy(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** A stable 32-bit seed from a day key or any short string: FNV-1a over its characters. */
export function daySeed(day: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < day.length; i++) hash = Math.imul(hash ^ day.charCodeAt(i), 0x01000193) >>> 0;
  return hash;
}
