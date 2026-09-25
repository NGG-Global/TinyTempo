/**
 * Groove: how locked in the player is, as the level is being played.
 *
 * Pure — no Phaser, no audio — so every rule is tested under node. The scene holds one
 * state per pass through a level and hands it each scored task's verdict; what it gets
 * back is a level from 0 to 3 that the presentation reads and nothing else does. It is
 * not a score, a multiplier, a currency or a difficulty: the judge, the scorer, the
 * stars, the hearts and the curve never see it. `tests/groove.test.ts` checks that by
 * reading the sources.
 *
 * Only the level's own scored tasks move it. The first-run pass, a finer grid's
 * introduction and the breather are not tasks the scorer counts, so they do not reach
 * `advanceGroove` at all — the scene never calls it from those paths — which is also what
 * keeps mastery honest: it is every scored task flawless, over exactly the level's tasks.
 */

export type GrooveLevel = 0 | 1 | 2 | 3;

export interface GrooveState {
  readonly level: GrooveLevel;
  /** Scored tasks answered Perfect throughout, this pass. */
  readonly flawlessTasks: number;
  /** Scored tasks resolved this pass, flawless or not. */
  readonly scoredTasks: number;
  /** No scored task this pass has been anything but flawless. True at the start. */
  readonly allFlawless: boolean;
  /** The highest level this pass has reached, for the once-per-run analytics. */
  readonly peak: GrooveLevel;
}

export const GROOVE_MAX: GrooveLevel = 3;

export const GROOVE_START: GrooveState = Object.freeze({
  level: 0, flawlessTasks: 0, scoredTasks: 0, allFlawless: true, peak: 0,
});

function clampLevel(value: number): GrooveLevel {
  return Math.max(0, Math.min(GROOVE_MAX, Math.round(value))) as GrooveLevel;
}

/**
 * One scored task resolved. A flawless task steps the level up, any other steps it down
 * — never to zero in one go, so a slip from three is a slide to two rather than a fall.
 * The scorer has no "very poor" verdict of its own and none is invented here for the
 * purpose: only the flawless bit moves the level.
 */
export function advanceGroove(state: GrooveState, task: { readonly flawless: boolean }): GrooveState {
  const level = clampLevel(state.level + (task.flawless ? 1 : -1));
  return Object.freeze({
    level,
    flawlessTasks: state.flawlessTasks + (task.flawless ? 1 : 0),
    scoredTasks: state.scoredTasks + 1,
    allFlawless: state.allFlawless && task.flawless,
    peak: Math.max(state.peak, level) as GrooveLevel,
  });
}

/**
 * A full-level flawless run: every one of the level's `taskCount` scored tasks was
 * flawless, and the level was cleared. The count is checked as well as the flag, so a
 * pass that ended early — a pause, a restart — can never be mastered on the tasks it
 * happened to play, and a failed level cannot be mastered however its tasks went.
 */
export function isMastered(state: GrooveState, taskCount: number, cleared: boolean): boolean {
  return cleared && taskCount > 0 && state.scoredTasks === taskCount && state.flawlessTasks === taskCount && state.allFlawless;
}
