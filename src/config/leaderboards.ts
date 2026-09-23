/**
 * Play Games Services leaderboard ids. **Empty until the leaderboard exists in the Play
 * Console**, and an empty or malformed id turns the feature off rather than failing:
 * nothing is submitted, no button is shown, and the browser and development builds behave
 * exactly as they do without Play Games (`playgames/leaderboard.ts`, `leaderboardId`).
 *
 * Where the value comes from: Play Console → the app → Grow users → Play Games Services →
 * Setup and management → Leaderboards → the leaderboard → its **Leaderboard ID**, a string
 * the Console generates, such as `CgkI…`. It is *not* the numeric Games project id
 * (`game_services_project_id` in strings.xml), which is all digits and is rejected here for
 * exactly that reason. It is public — it ships in every APK — so it lives in source, like
 * the AdMob ids in `config/ads.ts`.
 *
 * Nothing else in the game names a leaderboard id: scenes ask `playgames/dailyTempo.ts`.
 */
export const LEADERBOARDS = {
  /** Daily Tempo: one leaderboard; Play Games provides its daily, weekly and all-time views. */
  dailyTempo: '',
} as const;

/**
 * Hours from UTC at which Play Games resets every leaderboard's daily view: "Daily
 * leaderboards reset at UTC-7 (that is, 'midnight Pacific Daylight Time') all year long",
 * and weekly views at midnight between Saturday and Sunday on the same clock
 * (https://developer.android.com/games/pgs/leaderboards). Daily Tempo's day is read on this
 * clock (`playgames/dailyTempo.ts`), so a day's chart, the best kept for it and the daily
 * view it is posted to all turn over at the same instant, for every player everywhere.
 */
export const PGS_DAILY_RESET_UTC_OFFSET_HOURS = -7;
