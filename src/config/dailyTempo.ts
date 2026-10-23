/**
 * Whether the Daily Tempo mode is shipped in this build (`scenes/DailyScene.ts`,
 * `docs/DAILY_TEMPO.md`). Everything built for it — the title screen's block, the daily
 * objective in `game/objectives.ts`, the leaderboard in `playgames/dailyTempo.ts` and its
 * button in Settings — reads this one flag, so turning it off hides the whole mode at once.
 */
export const DAILY_TEMPO_AVAILABLE = true;

/**
 * How hard the day's chart is, as the card names it: three bands, each a step on the one
 * difficulty curve (`PROGRESSION`), derived from the area-step role the day draws
 * (`game/dailyChart.ts`). The band is what the rewards read.
 */
export type DailyBand = 'light' | 'steady' | 'tough';
export const DAILY_BANDS: readonly DailyBand[] = Object.freeze(['light', 'steady', 'tough']);

/**
 * The day's chart: how it is drawn and how hard each band is (`game/dailyChart.ts`).
 *
 * **Any change here is a new chart version**: the chart is a pure function of
 * `(seed, version, day)`, every player's chart for a day has to be the same chart for the
 * leaderboard to mean anything, and `tests/fixtures/daily-chart-v1.json` pins eight days of
 * version 1. A band is a point on the one difficulty curve (`PROGRESSION`): its task count,
 * the curve's value its tempo, tier and thresholds are read at, and a tempo cap. `actCount`
 * is the registry's length the version was pinned at — an act appended later joins the
 * pool only when the version moves, so a day's chart never changes under a player who
 * updated mid-day.
 */
export const DAILY_CHART = Object.freeze({
  version: 1,
  seed: 'tiny-tempo-daily',
  actCount: 36,
  /** Looks per act the draw may land on; an act with fewer wraps (`lap % looks`). */
  laps: 4,
  bands: Object.freeze({
    light: Object.freeze({ tasks: 4, difficulty: 0.35, bpmCap: 132 }),
    steady: Object.freeze({ tasks: 6, difficulty: 0.5, bpmCap: 142 }),
    tough: Object.freeze({ tasks: 8, difficulty: 0.7, bpmCap: 150 }),
  }),
});

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
