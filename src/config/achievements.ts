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
 * What earns each is derived in `playgames/achievements.ts`, never stored: see
 * `docs/ACHIEVEMENTS.md`.
 */
export interface AchievementConfig {
  /** Stable, lower-case: the game's name for it. */
  readonly key: string;
  /** Earned by clearing this level — each is an area finale. */
  readonly clearLevel: number;
  /** The Console's Achievement ID; empty until created. */
  readonly id: string;
}

export const ACHIEVEMENTS: readonly AchievementConfig[] = Object.freeze([
  // The five area finales: Grass, Pavement, Sand, Snow and Dusk complete.
  { key: 'clear-10', clearLevel: 10, id: '' },
  { key: 'clear-20', clearLevel: 20, id: '' },
  { key: 'clear-30', clearLevel: 30, id: '' },
  { key: 'clear-40', clearLevel: 40, id: '' },
  { key: 'clear-50', clearLevel: 50, id: '' },
]);
