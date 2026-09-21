import { PROGRESSION } from '../config/progression';
import { RHYTHM } from '../config/rhythm';
import type { Judgement } from '../rhythm/judge';
import { createRoundPlan, type RoundPlan } from '../rhythm/RhythmScheduler';
import { parsePattern } from '../rhythm/patterns';
import { handover } from './beatTrack';

/**
 * The lesson, as a model with no Phaser in it.
 *
 * The old tutorial taught a cue the game no longer has: a sign that flipped from Watch
 * to Your turn on the downbeat, and a row of beads labelled TAP / WAIT that appears
 * nowhere in a level. A player who had learnt to read it then met the turn block for
 * the first time on level 1. This lesson teaches on the block itself — the same two
 * rows and the same token the level draws — and adds the one thing the game leaves
 * out on purpose: words. `coach` says what the block is showing at every moment, and
 * says it from the same `handover` numbers the block is drawn from, so the words and
 * the picture cannot disagree about whose turn it is.
 *
 * Two passes, both on the real grid with no pause between the demonstration and the
 * answer, because that is the thing to learn. The first is watched: the game plays both
 * halves. The second is tried: the level's own controller judges the taps, and the
 * verdict names the mistake a first player actually makes — tapping during the
 * hammer's turn, or letting their own bar go by — rather than a score.
 */
export const TUTORIAL = {
  /** The teaching tempo. Slow enough to read the handover, fast enough to still be a beat. */
  bpm: 72,
  gameBpm: PROGRESSION.baseBpm,
  pattern: parsePattern('tutorial', 'X X - X'),
  /** One counted bar before the hammer, the same lead-in a level opens with. */
  leadBeats: RHYTHM.leadInBeats,
  /** Judged hits, out of the pattern's three, that count as having understood the loop. */
  passHits: 2,
  /** After this many tries that did not pass, the way on is offered as well as another go. */
  offerPlayAfter: 3,
  /** Seconds of grace between a step ending and its plan starting, so the count-in is whole. */
  leadSec: 0.6,
} as const;

export type TutorialStep = 'watch' | 'try' | 'done';

/**
 * What went wrong on a try, as the thing to say about it. `clear` is the pass. `early`
 * is the first-player mistake this tutorial exists for: every tap landed in the hammer's
 * turn. `silent` is its mirror: the player's whole bar went by untouched. `partial` is
 * anything else — some taps landed, not enough of them.
 */
export type TryVerdict = 'clear' | 'early' | 'silent' | 'partial';

/** Where in a pass `now` falls, from the plan's own boundaries and the block's handover. */
export type Moment = 'count' | 'theirs' | 'runway' | 'yours' | 'after';

export function momentOf(plan: RoundPlan | null, now: number): Moment {
  if (!plan || !Number.isFinite(now)) return 'count';
  if (now < plan.demo) return 'count';
  if (now >= plan.end) return 'after';
  // Yours from the downbeat itself: the block's `yours` ramps over a fraction of a beat
  // after it, but the word must not lag the beat it names.
  if (now >= (plan.targets[0] ?? plan.response)) return 'yours';
  return handover(plan, now).runway > 0 ? 'runway' : 'theirs';
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
  public tries = 0;
  public verdict: TryVerdict | null = null;
  public tally: Tally = NO_TALLY;
  private planId = 0;

  /** The watched pass: the game will play both halves of this plan. */
  public watch(now: number): RoundPlan {
    this.step = 'watch';
    this.verdict = null;
    this.tally = NO_TALLY;
    this.plan = createRoundPlan(++this.planId, TUTORIAL.pattern, TUTORIAL.bpm, now + TUTORIAL.leadSec, TUTORIAL.leadBeats);
    return this.plan;
  }

  /**
   * A tried pass, on the controller's own plan rather than a copy of it: the judge and
   * the coach must be reading the same downbeat.
   */
  public try(plan: RoundPlan): void {
    this.step = 'try';
    this.tries++;
    this.verdict = null;
    this.tally = NO_TALLY;
    this.plan = plan;
  }

  /** One verdict from the judge. Only a try counts them; a watched pass judges nothing. */
  public judged(result: Judgement): void {
    if (this.step !== 'try' || this.verdict !== null) return;
    const t = this.tally;
    if (result.kind === 'extra') this.tally = { ...t, extras: t.extras + 1 };
    else if (result.kind === 'omission' || result.grade === 'Miss') this.tally = { ...t, misses: t.misses + 1 };
    else this.tally = { ...t, hits: t.hits + 1 };
  }

  /** A tap the judge never saw, because it came before the player's window opened. */
  public earlyTap(): void {
    if (this.step !== 'try' || this.verdict !== null) return;
    this.tally = { ...this.tally, early: this.tally.early + 1 };
  }

  /** The try is over; name what happened. A pass ends the lesson. */
  public complete(): TryVerdict {
    if (this.step !== 'try') return this.verdict ?? 'partial';
    if (this.verdict !== null) return this.verdict;
    const { hits, extras, early } = this.tally;
    let verdict: TryVerdict;
    if (hits >= TUTORIAL.passHits) verdict = 'clear';
    else if (hits === 0 && extras === 0 && early > 0) verdict = 'early';
    else if (hits === 0 && extras === 0) verdict = 'silent';
    else verdict = 'partial';
    this.verdict = verdict;
    if (verdict === 'clear') this.step = 'done';
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

export interface Coach {
  readonly heading: string;
  readonly copy: string;
  /** The word on the coral block, or null while the pass is playing and there is nothing to press. */
  readonly action: string | null;
  /** Whose the moment is, for the sign's colour: the hammer's, the handover's, or the player's. */
  readonly side: 'theirs' | 'handover' | 'yours' | 'none';
}

/**
 * What to say, at this moment of this step. The words name what the block is doing —
 * the top row, the token, the bottom row — because the block is what the player will
 * have in front of them on every level after this one.
 */
export function coach(run: Pick<TutorialRun, 'step' | 'plan' | 'verdict' | 'tries' | 'offersPlay'>, now: number): Coach {
  const step = run.step;
  let moment = momentOf(run.plan, now);
  // A try is judged a beat after its last target; until the verdict is in, it is still on.
  if (step === 'try' && moment === 'after' && run.verdict === null) moment = 'yours';

  if (step === 'done' || (step === 'try' && moment === 'after')) {
    const verdict = run.verdict ?? 'clear';
    const again = run.offersPlay ? 'Let’s play' : 'Try again';
    switch (verdict) {
      case 'clear':
        return {
          heading: 'You’ve got it',
          copy: 'Right on cue. Levels get faster,\nbut the handover is always the same:\ntheir row, then yours.',
          action: 'Let’s play', side: 'yours',
        };
      case 'early':
        return {
          heading: 'Too early',
          copy: 'Those taps landed in the hammer’s turn.\nWait until the token is on your row.',
          action: again, side: 'theirs',
        };
      case 'silent':
        return {
          heading: 'That was your turn',
          copy: 'It starts right when the hammer’s bar ends.\nNo pause: tap as soon as the token lands.',
          action: again, side: 'yours',
        };
      case 'partial':
        return {
          heading: 'Nearly',
          copy: 'Some landed. Keep the hammer’s spacing,\nand leave the quiet beat quiet.',
          action: again, side: 'yours',
        };
    }
  }

  if (step === 'watch') {
    switch (moment) {
      case 'count':
        return { heading: 'Listen', copy: 'Four counts, then the hammer plays.\nIts beats land on the top row.', action: null, side: 'none' };
      case 'theirs':
        return { heading: 'Their turn', copy: 'The hammer is playing. Just listen.\nEach beat lights a bead on the top row.', action: null, side: 'theirs' };
      case 'runway':
        return { heading: 'Get ready', copy: 'The token is crossing to your row.\nYour turn starts on the very next beat.', action: null, side: 'handover' };
      case 'yours':
        return { heading: 'Your turn', copy: 'No pause: the finger plays the bottom row.\nTap, tap, rest, tap — one tap per socket.', action: null, side: 'yours' };
      case 'after':
        return { heading: 'That’s the whole game', copy: 'Top row: theirs. Bottom row: yours.\nWhen the token lands on your row, you play.', action: 'Try it', side: 'none' };
    }
  }

  switch (moment) {
    case 'count':
      return { heading: 'Listen', copy: 'Here comes the hammer.\nYour turn is next. Wait for the token.', action: null, side: 'none' };
    case 'theirs':
      return { heading: 'Their turn', copy: 'Not yet. Listen to the four beats,\nand count the rest in the middle.', action: null, side: 'theirs' };
    case 'runway':
      return { heading: 'Get ready', copy: 'The token is crossing to you.\nStart tapping on the next beat.', action: null, side: 'handover' };
    default:
      return { heading: 'Your turn', copy: 'Tap anywhere: tap, tap, rest, tap.\nMatch the spacing you just heard.', action: null, side: 'yours' };
  }
}

const KEY = 'small-acts.tutorial.v1';

export function tutorialComplete(storage: Pick<Storage, 'getItem'> | null = tutorialStorage()): boolean {
  try { return storage?.getItem(KEY) === 'complete'; } catch { return false; }
}

export function completeTutorial(storage: Pick<Storage, 'setItem'> | null = tutorialStorage()): void {
  try { storage?.setItem(KEY, 'complete'); } catch { /* Practice is still complete in this session. */ }
}

function tutorialStorage(): Storage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}
