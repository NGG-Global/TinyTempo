/**
 * Whether the Daily Tempo mode exists in this build. It does not yet.
 *
 * Everything built for it ahead of the mode itself — the daily objective in
 * `game/objectives.ts`, the leaderboard in `playgames/dailyTempo.ts` and its button in
 * Settings — reads this one flag, so none of it can surface to a player before there is a
 * Daily Tempo to play. Flip it in the change that ships the mode.
 */
export const DAILY_TEMPO_AVAILABLE = false;

/**
 * How hard the day's chart is, as the card names it: three bands, each a step on the one
 * difficulty curve (`PROGRESSION`), derived from the area-step role the day draws
 * (`game/dailyChart.ts`). The band is what the rewards read.
 */
export type DailyBand = 'light' | 'steady' | 'tough';
export const DAILY_BANDS: readonly DailyBand[] = Object.freeze(['light', 'steady', 'tough']);

/**
 * What a Daily Tempo run's stars pay, once per day key (`game/dailyRewards.ts`). Each tier
 * pays once: a later, better run pays only the tiers it adds. The timer is one won item a
 * day whose length is the band's value for the stars reached (tuning); the longest stays
 * under the two-hour timer the store sells. Every number here is a knob for playtesting.
 */
export const DAILY_REWARDS = Object.freeze({
  /** Won replay-timer minutes by band, for one, two and three stars. */
  timerMinutes: Object.freeze({
    light: Object.freeze([15, 30, 45] as const),
    steady: Object.freeze([20, 40, 60] as const),
    tough: Object.freeze([30, 60, 90] as const),
  }),
  /** The star tiers that pay a heart: the first and the third. */
  heartTiers: Object.freeze([1, 3] as const),
  /** The star tier that pays a bonus restart for the day. */
  restartTier: 2,
  /** Caps a day can never pass, whatever the table says. */
  maxHearts: 2,
  maxRestarts: 1,
  maxTimerMinutes: 90,
});
