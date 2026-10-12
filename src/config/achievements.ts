/**
 * Play Games achievements, and the Console id each one is unlocked by.
 *
 * **An empty id turns that one achievement off** rather than failing: nothing is sent for
 * it, and the game plays exactly as it does without Play Games. Fill each id by copying it
 * with the copy button in Play Console → Play Games Services → Setup and management →
 * Achievements → the achievement → **Achievement ID** (never retype one: see
 * `docs/LEADERBOARDS.md` for the id that was retyped and would have failed on every call).
 * `scripts/check-android-config.mjs` decodes each id and warns unless it names this game.
 *
 * **Append only.** `key` is the game's own name for an achievement, used by tests and
 * analytics; changing what an existing entry is earned by would hand it to players who did
 * not earn it, and Play Games cannot take an unlocked achievement back.
 *
 * Three kinds of rule, one per shape, so a new kind is a new member rather than an optional
 * field every reader has to guess at. What earns each is derived in
 * `playgames/achievements.ts`, never stored: see `docs/ACHIEVEMENTS.md`.
 */
interface AchievementBase {
  /** Stable, lower-case: the game's name for it. */
  readonly key: string;
  /** The Console's Achievement ID; empty until created, which leaves it off. */
  readonly id: string;
}

/** Earned by clearing this level. */
export interface ClearAchievement extends AchievementBase { readonly clearLevel: number }
/** Earned by a valid Endless run that survived this long, in milliseconds. */
export interface EndlessTimeAchievement extends AchievementBase { readonly endlessMs: number }
/** Earned by finishing this many valid Endless runs. */
export interface EndlessRunsAchievement extends AchievementBase { readonly endlessRuns: number }

export type AchievementConfig = ClearAchievement | EndlessTimeAchievement | EndlessRunsAchievement;

export const ACHIEVEMENTS: readonly AchievementConfig[] = Object.freeze([
  // The five area finales: Grass, Pavement, Sand, Snow and Dusk complete.
  { key: 'clear-10', clearLevel: 10, id: 'CgkI0Mey9o8ZEAIQAg' },
  { key: 'clear-20', clearLevel: 20, id: 'CgkI0Mey9o8ZEAIQAw' },
  { key: 'clear-30', clearLevel: 30, id: 'CgkI0Mey9o8ZEAIQBA' },
  { key: 'clear-40', clearLevel: 40, id: 'CgkI0Mey9o8ZEAIQBQ' },
  { key: 'clear-50', clearLevel: 50, id: 'CgkI0Mey9o8ZEAIQBg' },
  // Appended with Endless Mode (`docs/ENDLESS_MODE.md`), imported to the Console together.
  // The import numbered Bronze 11 and Silver 10: creation order, not a swap of meaning.
  // Century of Tempo: the level that opens Endless Mode, cleared.
  { key: 'clear-100', clearLevel: 100, id: 'CgkI0Mey9o8ZEAIQCA' },
  // Going On and On: one valid Endless run finished, however short.
  { key: 'endless-first-run', endlessRuns: 1, id: 'CgkI0Mey9o8ZEAIQCQ' },
  // Bronze, Silver and Golden Tempo: two, five and ten minutes survived.
  { key: 'endless-120s', endlessMs: 120_000, id: 'CgkI0Mey9o8ZEAIQCw' },
  { key: 'endless-300s', endlessMs: 300_000, id: 'CgkI0Mey9o8ZEAIQCg' },
  { key: 'endless-600s', endlessMs: 600_000, id: 'CgkI0Mey9o8ZEAIQDA' },
]);
