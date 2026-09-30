import { MUSIC, TRACK_CYCLE, type TrackId } from '../config/music';

/**
 * Which gameplay track a level plays.
 *
 * Levels are taken in chapters of `MUSIC.chapterLevels` and the chapters go round
 * `TRACK_CYCLE`: 1–25 on the first track, 26–50 on the second, 51–75 on the first again.
 * The rule is the level alone — nothing is stored, so save codes, merges and old saves
 * hear the same track for the same level, and a replay plays what the level played.
 */
export function trackForLevel(level: number): TrackId {
  if (!Number.isInteger(level) || level < 1) throw new Error('Levels start at 1.');
  return TRACK_CYCLE[Math.floor((level - 1) / MUSIC.chapterLevels) % TRACK_CYCLE.length]!;
}
