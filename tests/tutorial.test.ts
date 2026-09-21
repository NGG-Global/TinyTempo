import { describe, expect, it } from 'vitest';
import { RHYTHM } from '../src/config/rhythm';
import { handoverAt } from '../src/game/beatTrack';
import { coach, completeTutorial, isPlayersWindow, momentOf, TUTORIAL, tutorialComplete, TutorialRun } from '../src/game/TutorialRun';
import type { Judgement } from '../src/rhythm/judge';
import { createRoundPlan } from '../src/rhythm/RhythmScheduler';

const hit = (index: number, grade: Judgement['grade'] = 'Perfect'): Judgement => ({ kind: 'hit', grade, index, deltaMs: 0 });
const omission = (index: number): Judgement => ({ kind: 'omission', grade: 'Miss', index, deltaMs: null });
const extra = (): Judgement => ({ kind: 'extra', grade: 'Miss', index: null, deltaMs: null });

describe('the watched pass', () => {
  it('runs on the level’s own grid: one counted bar, the hammer’s bar, then the answer with no pause', () => {
    const run = new TutorialRun();
    const plan = run.watch(10);
    const beat = 60 / TUTORIAL.bpm;
    expect(run.step).toBe('watch');
    expect(plan.bpm).toBe(TUTORIAL.bpm);
    expect(plan.pattern.hits).toEqual([0, 1, 3]);
    expect(plan.demo).toBeCloseTo(10 + TUTORIAL.leadSec + RHYTHM.leadInBeats * beat);
    expect(plan.response).toBeCloseTo(plan.demo + 4 * beat);
    expect(plan.targets[0]).toBe(plan.response);
    expect(plan.end).toBeCloseTo(plan.response + 4 * beat);
  });

  it('names each moment from the plan, and hands over before the downbeat it announces', () => {
    const run = new TutorialRun();
    const plan = run.watch(0);
    const beat = 60 / plan.bpm;
    const first = plan.targets[0]!;
    expect(momentOf(plan, plan.demo - 0.01)).toBe('count');
    expect(momentOf(plan, plan.demo)).toBe('theirs');
    // The runway opens RHYTHM.runwayBeats before the first target — inside the hammer's
    // own bar — and that is when the words say "get ready", not on the beat itself.
    expect(handoverAt(plan)).toBeCloseTo(first - RHYTHM.runwayBeats * beat);
    expect(momentOf(plan, handoverAt(plan) - 0.001)).toBe('theirs');
    expect(momentOf(plan, handoverAt(plan) + 0.001)).toBe('runway');
    expect(momentOf(plan, first - 0.001)).toBe('runway');
    expect(momentOf(plan, first)).toBe('yours');
    expect(momentOf(plan, plan.end - 0.001)).toBe('yours');
    expect(momentOf(plan, plan.end)).toBe('after');
    expect(momentOf(null, 5)).toBe('count');
    expect(momentOf(plan, Number.NaN)).toBe('count');
  });

  it('says whose turn it is in words that follow the block, and offers the try only once the pass is over', () => {
    const run = new TutorialRun();
    const plan = run.watch(0);
    const first = plan.targets[0]!;
    expect(coach(run, plan.demo - 0.1)).toMatchObject({ heading: 'Listen', action: null, side: 'none' });
    expect(coach(run, plan.demo + 0.1)).toMatchObject({ heading: 'Their turn', action: null, side: 'theirs' });
    expect(coach(run, handoverAt(plan) + 0.1)).toMatchObject({ heading: 'Get ready', action: null, side: 'handover' });
    expect(coach(run, first + 0.1)).toMatchObject({ heading: 'Your turn', action: null, side: 'yours' });
    const done = coach(run, plan.end);
    expect(done.action).toBe('Try it');
    expect(done.copy).toContain('Top row: theirs. Bottom row: yours.');
    // Every line of the lesson says where to look: the rows or the token.
    for (const now of [plan.demo - 0.1, plan.demo + 0.1, handoverAt(plan) + 0.1, first + 0.1, plan.end]) {
      expect(coach(run, now).copy).toMatch(/row|token/);
    }
  });
});

describe('the tried pass', () => {
  const tryOnce = (run: TutorialRun, start = 100) => {
    const plan = createRoundPlan(1, TUTORIAL.pattern, TUTORIAL.bpm, start, TUTORIAL.leadBeats);
    run.try(plan);
    return plan;
  };

  it('passes on two judged hits of three, and ends the lesson', () => {
    const run = new TutorialRun();
    const plan = tryOnce(run);
    expect(run.step).toBe('try');
    expect(run.tries).toBe(1);
    // Until the verdict is in, the judged bar is still the player's: no button appears.
    expect(coach(run, plan.end + 0.05)).toMatchObject({ heading: 'Your turn', action: null });
    run.judged(hit(0));
    run.judged(hit(1, 'Good'));
    run.judged(omission(2));
    expect(run.complete()).toBe('clear');
    expect(run.step).toBe('done');
    expect(run.verdict).toBe('clear');
    expect(coach(run, plan.end + 1)).toMatchObject({ heading: 'You’ve got it', action: 'Let’s play', side: 'yours' });
  });

  it('names taps in the hammer’s turn as the mistake, rather than scoring them', () => {
    const run = new TutorialRun();
    const plan = tryOnce(run);
    run.earlyTap();
    run.earlyTap();
    run.judged(omission(0));
    run.judged(omission(1));
    run.judged(omission(2));
    expect(run.complete()).toBe('early');
    expect(run.step).toBe('try');
    const words = coach(run, plan.end + 1);
    expect(words.heading).toBe('Too early');
    expect(words.copy).toContain('hammer’s turn');
    expect(words.action).toBe('Try again');
  });

  it('tells a player whose bar went by that their turn starts the moment the hammer’s ends', () => {
    const run = new TutorialRun();
    const plan = tryOnce(run);
    for (let i = 0; i < 3; i++) run.judged(omission(i));
    expect(run.complete()).toBe('silent');
    const words = coach(run, plan.end + 1);
    expect(words.heading).toBe('That was your turn');
    expect(words.copy).toMatch(/no pause/i);
  });

  it('calls one hit, or a burst of extras, nearly rather than wrong', () => {
    const run = new TutorialRun();
    tryOnce(run);
    run.judged(hit(0));
    run.judged(omission(1));
    run.judged(omission(2));
    expect(run.complete()).toBe('partial');
    const spam = new TutorialRun();
    tryOnce(spam);
    spam.judged(extra());
    spam.judged(extra());
    for (let i = 0; i < 3; i++) spam.judged(omission(i));
    expect(spam.complete()).toBe('partial');
  });

  it('ignores judgements outside a try and after its verdict, and a hit graded Miss is a miss', () => {
    const run = new TutorialRun();
    run.watch(0);
    run.judged(hit(0));
    run.earlyTap();
    expect(run.tally).toEqual({ hits: 0, misses: 0, extras: 0, early: 0 });
    tryOnce(run);
    run.judged(hit(0, 'Miss'));
    expect(run.tally.misses).toBe(1);
    run.judged(hit(1));
    run.judged(hit(2));
    expect(run.complete()).toBe('clear');
    run.judged(omission(0));
    run.earlyTap();
    expect(run.tally).toEqual({ hits: 2, misses: 1, extras: 0, early: 0 });
    expect(run.complete()).toBe('clear');
  });

  it('offers the way on after three tries that did not pass, so nobody is held in the lesson', () => {
    const run = new TutorialRun();
    for (let attempt = 1; attempt <= TUTORIAL.offerPlayAfter; attempt++) {
      const plan = tryOnce(run);
      for (let i = 0; i < 3; i++) run.judged(omission(i));
      run.complete();
      expect(run.tries).toBe(attempt);
      const words = coach(run, plan.end + 1);
      expect(words.action).toBe(attempt < TUTORIAL.offerPlayAfter ? 'Try again' : 'Let’s play');
    }
    expect(run.step).toBe('try');
    expect(run.offersPlay).toBe(true);
  });

  it('knows which taps belong to the player: from the first target’s early window onward', () => {
    const plan = createRoundPlan(1, TUTORIAL.pattern, TUTORIAL.bpm, 0, TUTORIAL.leadBeats);
    const first = plan.targets[0]!;
    expect(isPlayersWindow(plan, plan.demo + 0.5)).toBe(false);
    expect(isPlayersWindow(plan, first - RHYTHM.goodMs / 1000 - 0.001)).toBe(false);
    expect(isPlayersWindow(plan, first - RHYTHM.goodMs / 1000)).toBe(true);
    expect(isPlayersWindow(plan, first)).toBe(true);
    expect(isPlayersWindow(null, first)).toBe(false);
  });

  it('starts each try clean, and a watched pass clears the verdict', () => {
    const run = new TutorialRun();
    tryOnce(run);
    run.judged(hit(0));
    run.earlyTap();
    run.judged(omission(1));
    run.judged(omission(2));
    expect(run.complete()).toBe('partial');
    tryOnce(run, 200);
    expect(run.tally).toEqual({ hits: 0, misses: 0, extras: 0, early: 0 });
    expect(run.verdict).toBeNull();
    expect(run.tries).toBe(2);
    run.watch(300);
    expect(run.step).toBe('watch');
    expect(run.verdict).toBeNull();
  });
});

describe('tutorial completion', () => {
  it('remembers only explicit completion, using a separate key from game progress', () => {
    const values = new Map<string, string>([['small-acts.progress.v1', '{"unlocked":8}']]);
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    expect(tutorialComplete(storage)).toBe(false);
    completeTutorial(storage);
    expect(tutorialComplete(storage)).toBe(true);
    expect(values.get('small-acts.progress.v1')).toBe('{"unlocked":8}');
  });

  it('tolerates missing, malformed and blocked storage', () => {
    expect(tutorialComplete(null)).toBe(false);
    expect(tutorialComplete({ getItem: () => 'true' })).toBe(false);
    expect(tutorialComplete({ getItem: () => { throw new Error('blocked'); } })).toBe(false);
    expect(() => completeTutorial(null)).not.toThrow();
    expect(() => completeTutorial({ setItem: () => { throw new Error('full'); } })).not.toThrow();
  });
});
