import { PROGRESSION } from '../config/progression';
import { RHYTHM } from '../config/rhythm';
import type { Judgement } from '../rhythm/judge';
import { createRoundPlan, type RoundPlan } from '../rhythm/RhythmScheduler';
import { parsePattern } from '../rhythm/patterns';
import { turnCount } from './beatTrack';

/**
 * The lesson, as a model with no Phaser in it.
 *
 * The old tutorial taught a cue the game no longer has: a sign that flipped from Watch
 * to Your turn on the downbeat, and a row of beads labelled TAP / WAIT that appears
 * nowhere in a level. A player who had learnt to read it then met the turn block for
 * the first time on level 1. This lesson teaches on the block itself — the same two
 * rows, the same token and the same struck count the level draws — and adds the one
 * thing the game leaves out on purpose: words. `coach` says what the block is showing
 * at every moment, and says it from the same plan the block is drawn from, so the
 * words and the picture cannot disagree about whose turn it is.
 *
 * The thing a first player gets wrong is *when*: they tap along with the hammer, or
 * they let their own bar go by waiting for a prompt. The level answers that with the
 * count — "3", "2", "1" on the last beats of the hammer's bar and "Go!" on the
 * downbeat — and the first version of this lesson left the count out, so a player met
 * it for the first time on level 1 with nothing to say what it was. The count is now the
 * spine of the lesson: every pass draws it, the words name it, and the one instruction
 * that matters is said in three words — *tap on Go!*
 *
 * Three passes, all on the real grid with no pause between the demonstration and the
 * answer, because that is the thing to learn. The first is watched: the game plays both
 * halves. The second is tapped along: the game sounds the answer on the grid and the
 * player taps with it, so the downbeat is felt before it has to be found. The third is
 * the player's own, judged by the level's controller with nothing sounded for them. A
 * verdict names the mistake rather than a score, and a tap that lands in the hammer's
 * turn is named the moment it lands, not after the bar.
 */
export const TUTORIAL = {
  /** The teaching tempo. Slow enough to read the handover, fast enough to still be a beat. */
  bpm: 72,
  gameBpm: PROGRESSION.baseBpm,
  pattern: parsePattern('tutorial', 'X X - X'),
  /** One counted bar before the hammer, the same lead-in a level opens with. */
  leadBeats: RHYTHM.leadInBeats,
  /** Judged hits, out of the pattern's three, that count as having understood the loop on their own. */
  passHits: 2,
  /**
   * Judged hits that count as having tapped along. One: the pass exists to put the
   * player's thumb on the downbeat with the answer sounding under it, and a single hit
   * is proof they found it. Two would hold a player in the scaffold who is ready to
   * leave it.
   */
  alongHits: 1,
  /** After this many tries that did not pass, the way on is offered as well as another go. */
  offerPlayAfter: 4,
  /** Seconds of grace between a step ending and its plan starting, so the count-in is whole. */
  leadSec: 0.6,
  /** How long the sign says *Not yet* after a tap lands in the hammer's turn. */
  nudgeSec: 1.1,
} as const;

/**
 * `watch`: the game plays both halves. `along`: the answer is voiced on the grid and the
 * player taps with it. `try`: the player's own bar, with nothing sounded for them.
 * `done`: the try was passed.
 */
export type TutorialStep = 'watch' | 'along' | 'try' | 'done';

/** The two steps the controller judges. */
export type JudgedStep = 'along' | 'try';

/**
 * What went wrong on a judged pass, as the thing to say about it. `clear` is the pass.
 * `early` is the first-player mistake this tutorial exists for: every tap landed in the
 * hammer's turn. `silent` is its mirror: the player's whole bar went by untouched.
 * `partial` is anything else — some taps landed, not enough of them.
 */
export type TryVerdict = 'clear' | 'early' | 'silent' | 'partial';

/**
 * Where in a pass `now` falls, from the plan's own boundaries. `runway` is the count:
 * it opens on the beat the "3" strikes — `RHYTHM.turnCountBeats` before the player's
 * first target, one beat ahead of the baton — because the count is what the words are
 * about from there on, and a sign still saying *Their turn* under a numeral that has
 * already struck would be the words lagging the block.
 */
export type Moment = 'count' | 'theirs' | 'runway' | 'yours' | 'after';

export function momentOf(plan: RoundPlan | null, now: number): Moment {
  if (!plan || !Number.isFinite(now)) return 'count';
  if (now < plan.demo) return 'count';
  if (now >= plan.end) return 'after';
  // Yours from the downbeat itself: the block's `yours` ramps over a fraction of a beat
  // after it, but the word must not lag the beat it names.
  if (now >= (plan.targets[0] ?? plan.response)) return 'yours';
  return turnCount(plan, now) !== null ? 'runway' : 'theirs';
}

export interface Tally {
  readonly hits: number;
  readonly misses: number;
  readonly extras: number;
  /** Taps that arrived during the count-in or the hammer's turn, before the judge would look. */
  readonly early: number;
}

const NO_TALLY: Tally = Object.freeze({ hits: 0, misses: 0, extras: 0, early: 0 });

export class TutorialRun {
  public step: TutorialStep = 'watch';
  public plan: RoundPlan | null = null;
  /** Judged passes started, along and alone together. */
  public tries = 0;
  public verdict: TryVerdict | null = null;
  public tally: Tally = NO_TALLY;
  /** When the last tap landed in the hammer's turn, on the audio clock; -Infinity if none has. */
  public earlyAt = -Infinity;
  private planId = 0;

  /** The watched pass: the game will play both halves of this plan. */
  public watch(now: number): RoundPlan {
    this.step = 'watch';
    this.verdict = null;
    this.tally = NO_TALLY;
    this.earlyAt = -Infinity;
    this.plan = createRoundPlan(++this.planId, TUTORIAL.pattern, TUTORIAL.bpm, now + TUTORIAL.leadSec, TUTORIAL.leadBeats);
    return this.plan;
  }

  /**
   * A judged pass, on the controller's own plan rather than a copy of it: the judge and
   * the coach must be reading the same downbeat.
   */
  public begin(step: JudgedStep, plan: RoundPlan): void {
    this.step = step;
    this.tries++;
    this.verdict = null;
    this.tally = NO_TALLY;
    this.earlyAt = -Infinity;
    this.plan = plan;
  }

  private get judging(): boolean {
    return (this.step === 'along' || this.step === 'try') && this.verdict === null;
  }

  /** One verdict from the judge. Only a judged pass counts them; a watched pass judges nothing. */
  public judged(result: Judgement): void {
    if (!this.judging) return;
    const t = this.tally;
    if (result.kind === 'extra') this.tally = { ...t, extras: t.extras + 1 };
    else if (result.kind === 'omission' || result.grade === 'Miss') this.tally = { ...t, misses: t.misses + 1 };
    else this.tally = { ...t, hits: t.hits + 1 };
  }

  /** A tap the judge never saw, because it came before the player's window opened. */
  public earlyTap(now = -Infinity): void {
    if (!this.judging) return;
    this.tally = { ...this.tally, early: this.tally.early + 1 };
    this.earlyAt = now;
  }

  /**
   * The pass is over; name what happened. A clear on the player's own pass ends the
   * lesson. A clear tapping along does not: it earns the pass on their own.
   */
  public complete(): TryVerdict {
    if (this.step !== 'along' && this.step !== 'try') return this.verdict ?? 'partial';
    if (this.verdict !== null) return this.verdict;
    const { hits, extras, early } = this.tally;
    const needed = this.step === 'along' ? TUTORIAL.alongHits : TUTORIAL.passHits;
    let verdict: TryVerdict;
    if (hits >= needed) verdict = 'clear';
    else if (hits === 0 && extras === 0 && early > 0) verdict = 'early';
    else if (hits === 0 && extras === 0) verdict = 'silent';
    else verdict = 'partial';
    this.verdict = verdict;
    if (verdict === 'clear' && this.step === 'try') this.step = 'done';
    return verdict;
  }

  /** Whether the way on is offered alongside another try, so nobody is held in the lesson. */
  public get offersPlay(): boolean {
    return this.step === 'done' || this.tries >= TUTORIAL.offerPlayAfter;
  }
}

/** Whether a tap at `now` belongs to the player: on or after their first target's window. */
export function isPlayersWindow(plan: RoundPlan | null, now: number): boolean {
  if (!plan) return false;
  const first = plan.targets[0] ?? plan.response;
  return now >= first - RHYTHM.goodMs / 1000;
}

/** What the coral block starts: the next pass, or the game. */
export type Next = JudgedStep | 'play';

export interface Coach {
  readonly heading: string;
  /** One line. It is read while a bar is playing, and a second line is one the player never gets to. */
  readonly copy: string;
  /** The word on the coral block, or null while the pass is playing and there is nothing to press. */
  readonly action: string | null;
  /** What pressing it does. Null with `action`. */
  readonly next: Next | null;
  /** Whose the moment is, for the sign's colour: the hammer's, the handover's, or the player's. */
  readonly side: 'theirs' | 'handover' | 'yours' | 'none';
}

const PLAYING: Pick<Coach, 'action' | 'next'> = { action: null, next: null };

/**
 * What to say, at this moment of this step. The words name what the block is doing —
 * the top row, the count, the bottom row — because the block is what the player will
 * have in front of them on every level after this one. Each line is short enough to be
 * read in the beat it is up for.
 */
export function coach(run: Pick<TutorialRun, 'step' | 'plan' | 'verdict' | 'tries' | 'offersPlay' | 'earlyAt'>, now: number): Coach {
  const step = run.step;
  let moment = momentOf(run.plan, now);
  const judged = step === 'along' || step === 'try';
  // A judged pass resolves a beat after its last target; until the verdict is in, it is still on.
  if (judged && moment === 'after' && run.verdict === null) moment = 'yours';

  if (step === 'done' || (judged && moment === 'after')) return verdictWords(run);

  // A tap in the hammer's turn is named as it lands, where the player is looking, rather
  // than after a bar in which they may have made the same mistake twice more.
  if (judged && run.verdict === null && moment !== 'yours' && now - run.earlyAt < TUTORIAL.nudgeSec) {
    return { heading: 'Not yet', copy: 'That’s the hammer’s turn. Wait for Go!', ...PLAYING, side: 'theirs' };
  }

  // The words follow the ball: it is on their row, it hops, it is on yours — and the one
  // fact a first player needs is said outright, more than once: there is no pause.
  if (step === 'watch') {
    switch (moment) {
      case 'count':
        return { heading: 'Listen', copy: 'Four clicks, then the hammer plays the top row.', ...PLAYING, side: 'none' };
      case 'theirs':
        return { heading: 'Their turn', copy: 'Watch the ball hop along the hammer’s row.', ...PLAYING, side: 'theirs' };
      case 'runway':
        return { heading: 'Count down', copy: '3, 2, 1 — on Go! the ball lands in your row.', ...PLAYING, side: 'handover' };
      case 'yours':
        return { heading: 'Your turn', copy: 'Your row, straight after theirs. No pause.', ...PLAYING, side: 'yours' };
      case 'after':
        return { heading: 'That’s the whole game', copy: 'Their row, then yours on Go! No pause.', action: 'Tap along', next: 'along', side: 'none' };
    }
  }

  const along = step === 'along';
  switch (moment) {
    case 'count':
      return { heading: 'Listen', copy: along ? 'The hammer first. On Go! you tap with it.' : 'The hammer first. Then the count, then Go!', ...PLAYING, side: 'none' };
    case 'theirs':
      return { heading: 'Their turn', copy: 'Not yet. The count, then Go! No pause.', ...PLAYING, side: 'theirs' };
    case 'runway':
      return { heading: 'Count down', copy: '3, 2, 1 — tap on Go!', ...PLAYING, side: 'handover' };
    default:
      return {
        heading: 'Your turn',
        copy: along ? 'Tap with the hammer: tap, tap, rest, tap.' : 'Tap, tap, rest, tap.',
        ...PLAYING, side: 'yours',
      };
  }
}

function verdictWords(run: Pick<TutorialRun, 'step' | 'verdict' | 'offersPlay'>): Coach {
  const verdict = run.verdict ?? 'clear';
  const along = run.step === 'along';
  // Another go at the same step, or the way on once enough have been tried. A pass on
  // their own that found no downbeat at all — every tap in the hammer's turn, or none —
  // goes back to tapping along, where the answer sounds under the thumb, rather than to
  // another silent bar; a pass that landed some of them tries again as it was.
  const lost = !along && (verdict === 'early' || verdict === 'silent');
  const again: Pick<Coach, 'action' | 'next'> = run.offersPlay
    ? { action: 'Let’s play', next: 'play' }
    : lost ? { action: 'Tap along again', next: 'along' }
      : { action: 'Try again', next: along ? 'along' : 'try' };
  switch (verdict) {
    case 'clear':
      return along
        ? { heading: 'With it', copy: 'You tapped with the hammer. Now without it.', action: 'On your own', next: 'try', side: 'yours' }
        : { heading: 'You’ve got it', copy: 'Right on cue. Faster levels, same count, same Go!', action: 'Let’s play', next: 'play', side: 'yours' };
    case 'early':
      return { heading: 'Too early', copy: 'Those taps were in the hammer’s turn. Wait for Go!', ...again, side: 'theirs' };
    case 'silent':
      return { heading: 'That was your turn', copy: 'Your bar starts on Go! There is no pause.', ...again, side: 'yours' };
    case 'partial':
      return { heading: 'Nearly', copy: 'Some landed. Start on Go! and keep the spacing.', ...again, side: 'yours' };
  }
}

const KEY = 'small-acts.tutorial.v1';

/** Passed, or *Let's play* taken: what a save code carries and Support reports. */
export function tutorialComplete(storage: Pick<Storage, 'getItem'> | null = tutorialStorage()): boolean {
  try { return storage?.getItem(KEY) === 'complete'; } catch { return false; }
}

export function completeTutorial(storage: Pick<Storage, 'setItem'> | null = tutorialStorage()): void {
  try { storage?.setItem(KEY, 'complete'); } catch { /* Practice is still complete in this session. */ }
}

/**
 * Whether a first Play should still open the lesson. Complete counts, and so does a
 * skip: *Skip* is there throughout so nobody is held in the lesson, and a player who
 * took it has said they know the game — the lesson is a button on the title screen
 * after that, not a gate in front of every Play. A skip never overwrites `complete`,
 * which is the stronger fact and the one a save code carries.
 */
export function tutorialSeen(storage: Pick<Storage, 'getItem'> | null = tutorialStorage()): boolean {
  try { const value = storage?.getItem(KEY); return value === 'complete' || value === 'skipped'; } catch { return false; }
}

export function skipTutorial(storage: Pick<Storage, 'getItem' | 'setItem'> | null = tutorialStorage()): void {
  try { if (storage?.getItem(KEY) !== 'complete') storage?.setItem(KEY, 'skipped'); } catch { /* Skipped for this session at least. */ }
}

/** The stored fact in one word, for the cloud save: passed, skipped, or neither. */
export type TutorialState = 'complete' | 'skipped' | 'none';

export function tutorialState(storage: Pick<Storage, 'getItem'> | null = tutorialStorage()): TutorialState {
  try {
    const value = storage?.getItem(KEY);
    return value === 'complete' ? 'complete' : value === 'skipped' ? 'skipped' : 'none';
  } catch { return 'none'; }
}

/**
 * Set the stored fact exactly, `none` included. Only for the device changing hands
 * between two Play Games players: a new player meets the lesson, whatever the last one
 * did. Everywhere else the two one-way writes above are the right tool.
 */
export function setTutorialState(state: TutorialState, storage: Pick<Storage, 'setItem' | 'removeItem'> | null = tutorialStorage()): boolean {
  try {
    if (state === 'none') storage?.removeItem(KEY);
    else storage?.setItem(KEY, state);
    return storage !== null;
  } catch { return false; }
}

function tutorialStorage(): Storage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}
