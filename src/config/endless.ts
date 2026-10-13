/**
 * Endless Mode: the versioned rules of the one competition, and nothing a player can tune.
 *
 * Everything here is part of the ruleset the leaderboard ranks against. A change to any
 * of it — the seed, a tempo, a threshold, the eligible pool, the step cycle — makes old
 * and new runs incomparable, so it is made deliberately: raise `rulesVersion`, and give
 * the new rules their own Play Games leaderboard (`LEADERBOARDS.endless`, see
 * `docs/ENDLESS_MODE.md`). `tests/endless.test.ts` pins the sequence the current rules
 * produce, so an accidental change fails there rather than quietly re-seeding the board.
 *
 * Nothing here reads the clock, the player, their save or their purchases: every player
 * on one rules version meets the same acts, patterns, tempi and bars at the same step.
 */
export const ENDLESS = {
  /** Whether the mode is offered at all. Off hides the map entry and nothing else changes. */
  available: true,
  /** The level that has to be *cleared* — not merely reachable — before the mode opens. */
  unlockLevel: 100,
  /** The ruleset every run on the current leaderboard is played under. Bump on any change below. */
  rulesVersion: 1,
  /** The one seed every run draws from. Never the date, never the player. */
  seed: 'tiny-tempo-endless',
  /**
   * Tempo over the run: `startBpm` on the first vignette, climbing in `stepBpm` steps to
   * `capBpm` by `rampSec` of planned run time, and never above it. Capped because the
   * music is time-stretched by rate (pitch rises with it), and because past 150 BPM the
   * sixteenth grid can no longer fit the thumb (`PROGRESSION.subdivision.minSpacingMs`).
   */
  tempo: { startBpm: 130, capBpm: 150, stepBpm: 2, rampSec: 300 },
  /**
   * The accuracy a vignette has to reach to keep a life: `start` on the first, rising to
   * `peak` by `rampSec`, held there. A result *below* the bar (strictly) loses one life;
   * the round's unrounded accuracy is compared, exactly as the scorer produced it.
   */
  threshold: { start: 75, peak: 90, rampSec: 300 },
  /**
   * Groove Lives. `excellentAccuracy` or better counts toward the recovery streak;
   * `recoveryStreak` of them in a row restore one life, up to `max`, and reset the streak
   * either way — a full set banks nothing.
   */
  lives: { start: 3, max: 3, excellentAccuracy: 95, recoveryStreak: 3 },
  /** The unscored count-in before the first vignette. The clock starts on the demonstration after it. */
  countInBeats: 4,
  /**
   * The finer grids: a pattern role may swap onto triplets from `tripletFromSec` and
   * sixteenths from `sixteenthFromSec`, with `chance` per eligible step, and only where
   * `gridFits` says the tempo leaves room between two taps. Their denser row is used from
   * `denseFromSec`.
   */
  grids: { tripletFromSec: 120, sixteenthFromSec: 180, denseFromSec: 300, chance: 0.3 },
  /** How many of the most recent acts a step will not repeat. Must stay below the pool size. */
  recentActs: 6,
  /** The lap range an act's look is drawn from (`lap % looks.length` picks the look). */
  laps: 4,
  /** Planned seconds survived that earn a local badge, and the achievement of the same name. */
  milestonesSec: [120, 300, 600],
  /** A run longer than this is not a plausible run and is never ranked. Six hours. */
  maxRunMs: 6 * 3_600_000,
  /**
   * The ten-step cycle the roles follow, after the choreography's own
   * (`PROGRESSION.choreography.steps`): each role shifts the tempo and the pattern tier the
   * ramp gives a step, so the run has waves and recoveries rather than one straight climb.
   * Offsets are whole steps of `stepBpm` and whole tiers; every result is clamped to the
   * tempo band and the tier range.
   */
  cycle: [
    { role: 'opener', bpm: -2, tier: -1, grid: false },
    { role: 'pattern', bpm: 0, tier: 0, grid: true },
    { role: 'pattern', bpm: 0, tier: 1, grid: true },
    { role: 'tempo', bpm: 4, tier: -1, grid: false },
    { role: 'endurance', bpm: 0, tier: 0, grid: false },
    { role: 'recovery', bpm: -4, tier: -1, grid: false },
    { role: 'combination', bpm: 2, tier: 1, grid: true },
    { role: 'combination', bpm: 2, tier: 1, grid: true },
    { role: 'challenge', bpm: 4, tier: 1, grid: true },
    { role: 'finale', bpm: 4, tier: 1, grid: true },
  ],
} as const;

export type EndlessRole = typeof ENDLESS.cycle[number]['role'];
