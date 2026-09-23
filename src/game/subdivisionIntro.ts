import { PROGRESSION } from '../config/progression';
import { parseSubdivided, type Pattern } from '../rhythm/patterns';
import { difficulty, levelSpec, type Grid, type LevelSpec } from './levels';

/**
 * The first meeting with a finer grid: one short, judged-but-forgiving task in front of
 * the first level that uses it, and never again.
 *
 * Triplets and sixteenths arrive through the curve (`PROGRESSION.subdivision`), and until
 * now they arrived unannounced: a task two-thirds of the way into a level simply asked
 * for three taps inside a beat. This is the introduction, and it is deliberately not a
 * tutorial. It is one task on the level's own act, turn block, judge and music, played
 * before the level's first task:
 *
 * - a count-in bar, under a two-line title — "New rhythm" and "3 inside the beat";
 * - one demonstration of a simple phrase: quarters, with the new group on beat three;
 * - the player's answer, judged by the level's own controller at the teaching tempo.
 *
 * **It never counts.** Its result is not a task result: it adds nothing to the level's
 * accuracy, stars or analytics tasks, and a miss in it is not called a miss. The judge's
 * windows are the ones every task gets — forgiving here means slower, simpler and
 * unscored, never wider — so nothing about how later subdivided tasks are judged moves.
 *
 * **A weak answer gets one more go**, straight away and without the count-in, and then the
 * level begins whatever happened. Nothing in this game waits for a tap, and a first
 * meeting that could not be got past would be the frustration it exists to prevent.
 */

export const SUBDIVISION_INTRO = {
  /** Fraction of the level's opening tempo the introduction plays at: the first-run pass's. */
  tempo: 0.75,
  /** Answer accuracy that counts as having got it. Below it, one more go. */
  passAccuracy: 50,
  /** Tries in all, the retry included. */
  maxTries: 2,
} as const;

/**
 * The phrase each introduction plays: quarter notes, and the new group once, on beat
 * three — the smallest change from what the player already plays. Written in the same
 * notation as `SUBDIVIDED_TIERS`, one bar opening on its downbeat.
 */
export const INTRO_PATTERNS: Readonly<Record<Grid, Pattern>> = Object.freeze({
  triplet: parseSubdivided('intro-triplet', 'X - - X - - X X X X - -', 3),
  sixteenth: parseSubdivided('intro-sixteenth', 'X - - - X - - - X X X X X - - -', 4),
});

/** Two short lines: what this is, and what to listen for. The retry says it once more. */
export function introCopy(grid: Grid, retry: boolean): { readonly title: string; readonly caption: string } {
  const inside = grid === 'triplet' ? '3 inside the beat' : '4 inside the beat';
  return retry ? { title: 'Once more', caption: inside } : { title: 'New rhythm', caption: inside };
}

/** Whether a finer grid may appear at a level, by the same test `subdivide` applies. */
export function gridEligible(grid: Grid, level: number): boolean {
  const S = PROGRESSION.subdivision;
  return difficulty(level) >= (grid === 'triplet' ? S.tripletsFrom : S.sixteenthsFrom);
}

/**
 * The first level the curve allows a grid on. Derived from the thresholds rather than
 * written down, so moving `tripletsFrom` moves this with it.
 */
export function firstEligibleLevel(grid: Grid): number {
  let level = 1;
  while (!gridEligible(grid, level)) level++;
  return level;
}

/**
 * The first level whose tasks actually use a grid. It can be a little after the first
 * eligible one: eligibility opens a chance, and the seeded draw decides where it lands.
 * This is where a new player meets the introduction.
 */
export function firstLevelWithGrid(grid: Grid, limit = 1_000): number | null {
  for (let level = firstEligibleLevel(grid); level <= limit; level++) {
    if (levelSpec(level).tasks.some(task => task.grid === grid)) return level;
  }
  return null;
}

export type SeenGrids = Readonly<Record<Grid, boolean>>;

/**
 * Which grid this level should introduce, or null.
 *
 * The level must actually use the grid — teaching a rhythm the level then never asks for
 * would be a lesson with nothing to apply it to — and the player must not have met the
 * introduction before. That one rule serves both kinds of player: a new one meets it on
 * the first level that uses the grid, and one who was already past that level when this
 * shipped meets it the next time a level they start uses it, and never at launch.
 *
 * One per level start: where both are new, the one the level reaches first. The other
 * waits for the next level that uses it, so no level opens with two lessons in a row.
 */
export function introGrid(spec: LevelSpec, seen: SeenGrids): Grid | null {
  for (const task of spec.tasks) {
    if (task.grid !== null && !seen[task.grid]) return task.grid;
  }
  return null;
}

export type IntroStep = 'try' | 'done';

/** One introduction's progress: how many tries, the best answer, and whether it is over. */
export class SubdivisionIntroRun {
  public step: IntroStep = 'try';
  public tries = 0;
  public best = 0;

  public constructor(public readonly grid: Grid) {}

  public get pattern(): Pattern { return INTRO_PATTERNS[this.grid]; }
  public get passed(): boolean { return this.best >= SUBDIVISION_INTRO.passAccuracy; }
  /** The try under way is the retry, which gets no count-in and says "Once more". */
  public get retrying(): boolean { return this.tries > 1; }

  public begin(): void {
    if (this.step === 'try') this.tries++;
  }

  /** A try was judged. `retry` for one more go, `done` to hand over to the level. */
  public complete(accuracy: number): 'retry' | 'done' {
    if (this.step === 'done') return 'done';
    if (Number.isFinite(accuracy)) this.best = Math.max(this.best, Math.max(0, Math.min(100, accuracy)));
    if (this.passed || this.tries >= SUBDIVISION_INTRO.maxTries) {
      this.step = 'done';
      return 'done';
    }
    return 'retry';
  }
}
