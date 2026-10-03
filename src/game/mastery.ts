import type { LevelOutcome, Progress } from './progress';

/**
 * Mastery outside the result screen: which levels a save has played IN THE POCKET.
 *
 * **Nothing is stored for it.** A level is mastered exactly when its saved best accuracy is
 * 100, and that is the same fact as the result's `isMastered` (`game/groove.ts`), not an
 * approximation of it:
 *
 * - a task scores 100 only when every target is a Perfect hit and there are no extra taps
 *   (`scoreRound`: a Good is worth 70, a miss 0, an extra −25, over the target count), and
 *   that is the scene's flawless test, `isFlawless(marks) && extras === 0`;
 * - a level's accuracy is the plain mean of its tasks (`meanAccuracy`), so it is 100 only
 *   when every task is, and 100 clears every level, since no star threshold reaches it;
 * - `recordResult` stores the unrounded mean and only ever raises it, and every merge —
 *   save code, Saved Games, Auto Backup's restored storage — takes the higher best.
 *
 * `tests/mastery.test.ts` checks the first two against the real judge, scorer and groove
 * rather than trusting this comment. The one carrier that used to break the equivalence is
 * the save code, which rounds to whole percent: a 99.6 written as 100 came back mastered.
 * It now writes a flawless level as its own byte, 101, and a level below 100 as at most 99
 * (`game/saveCode.ts`), so the code carries the bit without a new field; a byte of 100 in
 * a code written before that is ambiguous and is read as 99.5, which keeps its three stars
 * and claims no mastery it cannot prove.
 *
 * So old saves, save codes, merges, cloud saves and backups carry mastery without knowing it
 * exists, a worse replay cannot lower a best and so cannot take it away, and nothing can be
 * mastered twice. Every reader goes through here rather than comparing a best with 100.
 */

/** The best accuracy a mastered level holds: every scored hit Perfect, no extras. */
export const MASTERED_ACCURACY = 100;

/** Whether the save holds an IN THE POCKET run of `level`. */
export function isLevelMastered(progress: Progress, level: number): boolean {
  return progress.best[level] === MASTERED_ACCURACY;
}

/** How many levels the save has mastered. */
export function masteredCount(progress: Progress): number {
  let count = 0;
  for (const accuracy of Object.values(progress.best)) if (accuracy === MASTERED_ACCURACY) count++;
  return count;
}

/**
 * What a finished run did for mastery. `first` is the reveal: the level was not mastered
 * before this run and is now. `repeat` is a flawless run of a level the save already had
 * mastered — worth acknowledging, never presented as newly earned. `none` is everything
 * else, including a flawless run on a level that was not cleared, which cannot happen.
 *
 * `flawless` is the run's own groove verdict (`isMastered`). The outcome must also hold the
 * mastery, so the reveal can never promise a mark the map will not draw.
 */
export type MasteryResult = 'none' | 'first' | 'repeat';

export function masteryResult(before: Progress, outcome: LevelOutcome, level: number, flawless: boolean): MasteryResult {
  if (!flawless || !outcome.cleared || !isLevelMastered(outcome.progress, level)) return 'none';
  return isLevelMastered(before, level) ? 'repeat' : 'first';
}

/**
 * Whether the map marks `level`'s stop as mastered. Only a cleared stop carries the mark:
 * the frontier is coral and hops, locked and previewed stops are faded, and a best that a
 * tampered save holds in front of its own frontier is not a cleared level on the road.
 */
export function mapMastered(progress: Progress, level: number): boolean {
  // `mapLevelState`'s cleared, written out: this module is imported by `saveCode.ts`, which
  // stays free of Phaser, and `levels.ts` reaches the vignette registry. The test checks
  // the two agree.
  return Number.isInteger(level) && level >= 1 && level < progress.unlocked && isLevelMastered(progress, level);
}
