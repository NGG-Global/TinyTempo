import { describe, expect, it } from 'vitest';
import { RHYTHM } from '../src/config/rhythm';
import { handoverAt, turnCount } from '../src/game/beatTrack';
import { coach, completeTutorial, isPlayersWindow, momentOf, skipTutorial, TUTORIAL, tutorialComplete, tutorialSeen, TutorialRun, type JudgedStep } from '../src/game/TutorialRun';
import type { Judgement } from '../src/rhythm/judge';
import { createRoundPlan } from '../src/rhythm/RhythmScheduler';

const hit = (index: number, grade: Judgement['grade'] = 'Perfect'): Judgement => ({ kind: 'hit', grade, index, deltaMs: 0 });
const omission = (index: number): Judgement => ({ kind: 'omission', grade: 'Miss', index, deltaMs: null });
const extra = (): Judgement => ({ kind: 'extra', grade: 'Miss', index: null, deltaMs: null });

const beginOnce = (run: TutorialRun, step: JudgedStep, start = 100) => {
  const plan = createRoundPlan(1, TUTORIAL.pattern, TUTORIAL.bpm, start, TUTORIAL.leadBeats);
  run.begin(step, plan);
  return plan;
};
const missAll = (run: TutorialRun) => { for (let i = 0; i < 3; i++) run.judged(omission(i)); };

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

  it('names each moment from the plan, and opens the count-down on the beat the "3" strikes', () => {
    const run = new TutorialRun();
    const plan = run.watch(0);
    const beat = 60 / plan.bpm;
    const first = plan.targets[0]!;
    const countFrom = first - RHYTHM.turnCountBeats * beat;
    expect(momentOf(plan, plan.demo - 0.01)).toBe('count');
    expect(momentOf(plan, plan.demo)).toBe('theirs');
    // The words follow the count, not the baton: the "3" lands one beat before the
    // runway opens, and a sign still saying "Their turn" under it would lag the block.
    expect(turnCount(plan, countFrom - 0.001)).toBeNull();
    expect(turnCount(plan, countFrom + 0.001)?.count).toBe(3);
    expect(momentOf(plan, countFrom - 0.001)).toBe('theirs');
    expect(momentOf(plan, countFrom + 0.001)).toBe('runway');
    expect(handoverAt(plan)).toBeGreaterThan(countFrom);
    expect(momentOf(plan, handoverAt(plan) + 0.001)).toBe('runway');
    expect(momentOf(plan, first - 0.001)).toBe('runway');
    expect(momentOf(plan, first)).toBe('yours');
    expect(momentOf(plan, plan.end - 0.001)).toBe('yours');
    expect(momentOf(plan, plan.end)).toBe('after');
    expect(momentOf(null, 5)).toBe('count');
    expect(momentOf(plan, Number.NaN)).toBe('count');
  });

  it('says whose turn it is in words that follow the block, and offers tapping along only once the pass is over', () => {
    const run = new TutorialRun();
    const plan = run.watch(0);
    const beat = 60 / plan.bpm;
    const first = plan.targets[0]!;
    const countFrom = first - RHYTHM.turnCountBeats * beat;
    expect(coach(run, plan.demo - 0.1)).toMatchObject({ heading: 'Listen', action: null, next: null, side: 'none' });
    expect(coach(run, plan.demo + 0.1)).toMatchObject({ heading: 'Their turn', action: null, side: 'theirs' });
    expect(coach(run, countFrom + 0.1)).toMatchObject({ heading: 'Count down', action: null, side: 'handover' });
    expect(coach(run, countFrom + 0.1).copy).toContain('Go!');
    expect(coach(run, first + 0.1)).toMatchObject({ heading: 'Your turn', action: null, side: 'yours' });
    const done = coach(run, plan.end);
    expect(done).toMatchObject({ action: 'Tap along', next: 'along' });
    expect(done.copy).toContain('Go!');
    // Every line of the lesson says where to look — a row — or what to wait for — Go!
    // — and fits on one line: it is read while a bar is playing.
    for (const now of [plan.demo - 0.1, plan.demo + 0.1, countFrom + 0.1, first + 0.1, plan.end]) {
      const { copy } = coach(run, now);
      expect(copy).toMatch(/row|Go!/);
      expect(copy).not.toContain('\n');
      expect(copy.length).toBeLessThanOrEqual(52);
    }
  });
});

describe('tapping along', () => {
  it('passes on one judged hit, and offers the pass on their own rather than the game', () => {
    const run = new TutorialRun();
    const plan = beginOnce(run, 'along');
    expect(run.step).toBe('along');
    expect(run.tries).toBe(1);
    expect(coach(run, plan.end + 0.05)).toMatchObject({ heading: 'Your turn', action: null });
    run.judged(omission(0));
    run.judged(hit(1, 'Good'));
    run.judged(omission(2));
    expect(run.complete()).toBe('clear');
    expect(run.step).toBe('along');
    expect(coach(run, plan.end + 1)).toMatchObject({ heading: 'With it', action: 'On your own', next: 'try', side: 'yours' });
  });

  it('names its own words: the hammer is sounding the answer and the player taps with it', () => {
    const run = new TutorialRun();
    const plan = beginOnce(run, 'along');
    expect(coach(run, plan.targets[0]! + 0.1).copy).toMatch(/with the hammer/i);
    const alone = new TutorialRun();
    const solo = beginOnce(alone, 'try');
    expect(coach(alone, solo.targets[0]! + 0.1).copy).not.toMatch(/with the hammer/i);
  });

  it('repeats itself on a miss, and offers the way on once enough has been tried', () => {
    const run = new TutorialRun();
    for (let attempt = 1; attempt <= TUTORIAL.offerPlayAfter; attempt++) {
      const plan = beginOnce(run, 'along');
      missAll(run);
      expect(run.complete()).toBe('silent');
      expect(run.step).toBe('along');
      const words = coach(run, plan.end + 1);
      expect(words).toMatchObject(attempt < TUTORIAL.offerPlayAfter ? { action: 'Try again', next: 'along' } : { action: 'Let’s play', next: 'play' });
    }
  });
});

describe('the pass on their own', () => {
  it('passes on two judged hits of three, and ends the lesson', () => {
    const run = new TutorialRun();
    const plan = beginOnce(run, 'try');
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
    expect(coach(run, plan.end + 1)).toMatchObject({ heading: 'You’ve got it', action: 'Let’s play', next: 'play', side: 'yours' });
  });

  it('needs more than tapping along did: one hit is nearly, not a pass', () => {
    const run = new TutorialRun();
    beginOnce(run, 'try');
    run.judged(hit(0));
    run.judged(omission(1));
    run.judged(omission(2));
    expect(run.complete()).toBe('partial');
    expect(run.step).toBe('try');
  });

  it('names taps in the hammer’s turn as the mistake, rather than scoring them', () => {
    const run = new TutorialRun();
    const plan = beginOnce(run, 'try');
    run.earlyTap(plan.demo + 0.2);
    run.earlyTap(plan.demo + 1);
    missAll(run);
    expect(run.complete()).toBe('early');
    expect(run.step).toBe('try');
    const words = coach(run, plan.end + 1);
    expect(words.heading).toBe('Too early');
    expect(words.copy).toContain('hammer’s turn');
    // No downbeat was found: back to the scaffold, where the answer sounds under the thumb.
    expect(words).toMatchObject({ action: 'Tap along again', next: 'along' });
  });

  it('sends a pass that found no downbeat back to tapping along, and one that found some back to itself', () => {
    const silent = new TutorialRun();
    const silentPlan = beginOnce(silent, 'try');
    missAll(silent);
    expect(silent.complete()).toBe('silent');
    expect(coach(silent, silentPlan.end + 1)).toMatchObject({ action: 'Tap along again', next: 'along' });
    const partial = new TutorialRun();
    const partialPlan = beginOnce(partial, 'try');
    partial.judged(hit(0));
    partial.judged(omission(1));
    partial.judged(omission(2));
    expect(partial.complete()).toBe('partial');
    expect(coach(partial, partialPlan.end + 1)).toMatchObject({ action: 'Try again', next: 'try' });
    // Tapping along never sends anyone further back than itself.
    const along = new TutorialRun();
    const alongPlan = beginOnce(along, 'along');
    missAll(along);
    expect(along.complete()).toBe('silent');
    expect(coach(along, alongPlan.end + 1)).toMatchObject({ action: 'Try again', next: 'along' });
  });

  it('says there is no pause, in words, before the player is ever judged', () => {
    const run = new TutorialRun();
    const plan = run.watch(0);
    const said = [plan.demo + 0.1, plan.targets[0]! + 0.1, plan.end].map(now => coach(run, now).copy).join(' ');
    expect(said).toMatch(/no pause/i);
    const judged = new TutorialRun();
    const judgedPlan = beginOnce(judged, 'try');
    expect(coach(judged, judgedPlan.demo + 0.1).copy).toMatch(/no pause/i);
  });

  it('says "Not yet" the moment a tap lands in the hammer’s turn, and lets it go by the player’s bar', () => {
    const run = new TutorialRun();
    const plan = beginOnce(run, 'try');
    const at = plan.demo + 0.5;
    expect(coach(run, at).heading).toBe('Their turn');
    run.earlyTap(at);
    expect(coach(run, at)).toMatchObject({ heading: 'Not yet', side: 'theirs', action: null });
    expect(coach(run, at).copy).toContain('Go!');
    expect(coach(run, at + TUTORIAL.nudgeSec - 0.01).heading).toBe('Not yet');
    // By the time the nudge has run its course the "3" has struck, so the sign goes to the count.
    expect(momentOf(plan, at + TUTORIAL.nudgeSec + 0.01)).toBe('runway');
    expect(coach(run, at + TUTORIAL.nudgeSec + 0.01).heading).toBe('Count down');
    // A nudge never covers the player's own bar: once it is their turn, the words say so.
    run.earlyTap(plan.targets[0]! - 0.2);
    expect(coach(run, plan.targets[0]! + 0.05).heading).toBe('Your turn');
    // Nor the verdict.
    missAll(run);
    run.complete();
    expect(coach(run, plan.end + 0.1).heading).toBe('Too early');
  });

  it('tells a player whose bar went by that their turn starts on Go!, with no pause', () => {
    const run = new TutorialRun();
    const plan = beginOnce(run, 'try');
    missAll(run);
    expect(run.complete()).toBe('silent');
    const words = coach(run, plan.end + 1);
    expect(words.heading).toBe('That was your turn');
    expect(words.copy).toMatch(/no pause/i);
    expect(words.copy).toContain('Go!');
  });

  it('calls a burst of extras nearly rather than wrong', () => {
    const spam = new TutorialRun();
    beginOnce(spam, 'try');
    spam.judged(extra());
    spam.judged(extra());
    missAll(spam);
    expect(spam.complete()).toBe('partial');
  });

  it('ignores judgements outside a judged pass and after its verdict, and a hit graded Miss is a miss', () => {
    const run = new TutorialRun();
    run.watch(0);
    run.judged(hit(0));
    run.earlyTap(1);
    expect(run.tally).toEqual({ hits: 0, misses: 0, extras: 0, early: 0 });
    expect(run.earlyAt).toBe(-Infinity);
    beginOnce(run, 'try');
    run.judged(hit(0, 'Miss'));
    expect(run.tally.misses).toBe(1);
    run.judged(hit(1));
    run.judged(hit(2));
    expect(run.complete()).toBe('clear');
    run.judged(omission(0));
    run.earlyTap(5);
    expect(run.tally).toEqual({ hits: 2, misses: 1, extras: 0, early: 0 });
    expect(run.complete()).toBe('clear');
  });

  it('offers the way on after enough tries that did not pass, counting tapping along, so nobody is held in the lesson', () => {
    const run = new TutorialRun();
    const alongPlan = beginOnce(run, 'along');
    missAll(run);
    run.complete();
    expect(coach(run, alongPlan.end + 1).action).toBe('Try again');
    for (let attempt = 2; attempt <= TUTORIAL.offerPlayAfter; attempt++) {
      const plan = beginOnce(run, 'try');
      missAll(run);
      run.complete();
      expect(run.tries).toBe(attempt);
      const words = coach(run, plan.end + 1);
      // A silent bar on their own goes back to the scaffold until the way on is offered.
      expect(words.action).toBe(attempt < TUTORIAL.offerPlayAfter ? 'Tap along again' : 'Let’s play');
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

  it('starts each pass clean, and a watched pass clears the verdict', () => {
    const run = new TutorialRun();
    beginOnce(run, 'try');
    run.judged(hit(0));
    run.earlyTap(101);
    run.judged(omission(1));
    run.judged(omission(2));
    expect(run.complete()).toBe('partial');
    beginOnce(run, 'try', 200);
    expect(run.tally).toEqual({ hits: 0, misses: 0, extras: 0, early: 0 });
    expect(run.earlyAt).toBe(-Infinity);
    expect(run.verdict).toBeNull();
    expect(run.tries).toBe(2);
    run.watch(300);
    expect(run.step).toBe('watch');
    expect(run.verdict).toBeNull();
  });

  it('keeps every line of every judged pass to one line, and the count-down says what to do', () => {
    for (const step of ['along', 'try'] as const) {
      const run = new TutorialRun();
      const plan = beginOnce(run, step);
      const beat = 60 / plan.bpm;
      const first = plan.targets[0]!;
      const countFrom = first - RHYTHM.turnCountBeats * beat;
      expect(coach(run, countFrom + 0.1)).toMatchObject({ heading: 'Count down', copy: '3, 2, 1 — tap on Go!' });
      for (const now of [plan.demo - 0.1, plan.demo + 0.1, countFrom + 0.1, first + 0.1]) {
        const { copy } = coach(run, now);
        expect(copy).not.toContain('\n');
        expect(copy.length).toBeLessThanOrEqual(52);
      }
    }
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

  it('counts a skip as seen for the first Play, without calling it complete', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    expect(tutorialSeen(storage)).toBe(false);
    skipTutorial(storage);
    // The menu stops opening the lesson on every Play; a save code and Support still say it was not passed.
    expect(tutorialSeen(storage)).toBe(true);
    expect(tutorialComplete(storage)).toBe(false);
    completeTutorial(storage);
    expect(tutorialComplete(storage)).toBe(true);
    // A later skip, from the title screen's own button, never demotes a pass.
    skipTutorial(storage);
    expect(tutorialComplete(storage)).toBe(true);
    expect(tutorialSeen(storage)).toBe(true);
    expect(tutorialSeen(null)).toBe(false);
    expect(tutorialSeen({ getItem: () => { throw new Error('blocked'); } })).toBe(false);
    expect(() => skipTutorial({ getItem: () => null, setItem: () => { throw new Error('blocked'); } })).not.toThrow();
  });

  it('tolerates missing, malformed and blocked storage', () => {
    expect(tutorialComplete(null)).toBe(false);
    expect(tutorialComplete({ getItem: () => 'true' })).toBe(false);
    expect(tutorialComplete({ getItem: () => { throw new Error('blocked'); } })).toBe(false);
    expect(() => completeTutorial(null)).not.toThrow();
    expect(() => completeTutorial({ setItem: () => { throw new Error('full'); } })).not.toThrow();
  });
});
