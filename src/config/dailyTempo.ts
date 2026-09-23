/**
 * Whether the Daily Tempo mode exists in this build. It does not yet.
 *
 * Everything built for it ahead of the mode itself — the daily objective in
 * `game/objectives.ts`, the leaderboard in `playgames/dailyTempo.ts` and its button in
 * Settings — reads this one flag, so none of it can surface to a player before there is a
 * Daily Tempo to play. Flip it in the change that ships the mode.
 */
export const DAILY_TEMPO_AVAILABLE = false;
