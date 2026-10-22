import { isCleared } from './health';
import type { Progress } from './progress';
import type { Moment } from './TutorialRun';

/**
 * The words over the first levels, and how long the ball stays.
 *
 * Level 1's first-run pass said one line — *Watch once: their row, then yours. No pause.* —
 * and the level's own tasks carried no words at all, so a first player met the ball, the
 * two rows and the baton with nothing naming them. User testing asked for the obvious:
 * say what the ball is for, say which row is whose, and say when it is their turn. These
 * are those words, by the moment of the plan (`momentOf`, the same reading the lesson's
 * coach makes), so they change as the block does and never lag it. Each line is short
 * enough to sit under the act's title on a handset without wrapping.
 *
 * The ball used to leave after level 1. It now rides the block through
 * `TEACH_WORDS.ballThrough`, and the first level without it says so once — *No ball this
 * time. Follow the rhythm.* — on its first task, until that level has been cleared. Both
 * are derived from the level and the save, like `guidedLevel`; nothing new is stored.
 */
export const TEACH_WORDS = {
  /** The pulse ball rides the block on every level up to and including this one. */
  ballThrough: 3,
} as const;

/** Whether a level draws the ball on every task, as a scaffold. Level 1's guided ring is separate. */
export function showsBall(level: number): boolean {
  return level >= 1 && level <= TEACH_WORDS.ballThrough;
}

/**
 * The first level without the ball, until it has been cleared: where "No ball this time"
 * is said. Null once it is cleared, so the line is said on the attempts that need it and
 * never to a save already past it.
 */
export function noBallLevel(progress: Progress): number | null {
  const level = TEACH_WORDS.ballThrough + 1;
  return isCleared(progress, level) ? null : level;
}

/**
 * `watch`: the first-run pass, where the game plays both halves and the player watches.
 * `play`: the guided level's own tasks, which the player answers. `noBall`: the first task
 * of the first level without the ball.
 */
export type TeachPass = 'watch' | 'play' | 'noBall';

const WATCH: Readonly<Record<Moment, string>> = Object.freeze({
  count: 'Watch the red ball',
  theirs: 'Top row: the game’s turn',
  runway: '3, 2, 1 — the baton drops to you',
  yours: 'Bottom row: your turn',
  after: 'Next: tap when the ball hits a circle',
});

const PLAY: Readonly<Record<Moment, string>> = Object.freeze({
  count: 'Follow the red ball',
  theirs: 'Top row: the game’s turn. Watch.',
  runway: '3, 2, 1 — the baton drops to you',
  yours: 'Tap when the ball hits a circle',
  after: '',
});

const NO_BALL = 'No ball this time. Follow the rhythm.';

/** One line for this moment of this pass; empty where there is nothing to say. */
export function teachWords(pass: TeachPass, moment: Moment): string {
  switch (pass) {
    case 'watch': return WATCH[moment];
    case 'play': return PLAY[moment];
    case 'noBall': return moment === 'after' ? '' : NO_BALL;
  }
}
