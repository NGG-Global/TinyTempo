import { describe, expect, it, vi } from 'vitest';
import { ENDLESS } from '../src/config/endless';
import { PROGRESSION } from '../src/config/progression';
import { RHYTHM } from '../src/config/rhythm';
import {
  applyAccuracy, createEndlessSequence, elapsedMs, eligibleActs, ENDLESS_RULES, endlessStep, endlessSteps, endlessUnlocked,
  formatSurvival, LIVES_START, milestonesFor, rampBpm, rampTier, rankedMs, stepBeats, thresholdAt,
  type EndlessLives,
} from '../src/game/endless';
import { gridFits, levelSpec, tightestSpacingMs } from '../src/game/levels';
import { mergeProgress, recordResult, type Progress } from '../src/game/progress';
import { createJudge, judgeTap } from '../src/rhythm/judge';
import { scoreRound } from '../src/game/scoring';
import { secondsPerBeat } from '../src/rhythm/patterns';
import { ROTATION, VIGNETTES } from '../src/vignettes/registry';
import { placementAt } from '../src/vignettes/rotation';
import fixture from './fixtures/endless-rules-v1.json';

vi.mock('phaser', () => ({ default: {} }));

/** A save where every level up to `through` is cleared at one star. */
function road(through: number): Progress {
  const best: Record<number, number> = {};
  for (let level = 1; level <= through; level++) best[level] = levelSpec(level).starAccuracy[0]!;
  return { unlocked: through + 1, best };
}

describe('the unlock', () => {
  it('is level 100 cleared, not merely reachable', () => {
    expect(endlessUnlocked(road(99))).toBe(false); // level 100 is open
    expect(endlessUnlocked(road(100))).toBe(true);
    expect(endlessUnlocked(road(140))).toBe(true);
    expect(endlessUnlocked({ unlocked: 1, best: {} })).toBe(false);
    // A clear recorded under the frontier, and a frontier past the level, each say so.
    expect(endlessUnlocked({ unlocked: 100, best: { 100: 60 } })).toBe(true);
    expect(endlessUnlocked({ unlocked: 101, best: {} })).toBe(true);
  });

  it('follows a result that clears level 100, a merged save, and nothing else', () => {
    const before = road(99);
    const cleared = recordResult(before, 100, levelSpec(100).clearAccuracy);
    expect(endlessUnlocked(cleared.progress)).toBe(true);
    const failed = recordResult(before, 100, levelSpec(100).clearAccuracy - 1);
    expect(endlessUnlocked(failed.progress)).toBe(false);
    // A restore merges: a device behind the road inherits the unlock, never loses it.
    expect(endlessUnlocked(mergeProgress(road(40), road(100)))).toBe(true);
    expect(endlessUnlocked(mergeProgress(road(100), road(40)))).toBe(true);
  });

  it('changes nothing about the road: the levels past 100 derive as they always did', () => {
    expect(levelSpec(101).level).toBe(101);
    expect(ENDLESS.unlockLevel).toBe(100);
  });
});

describe('the eligible pool', () => {
  it('is every act the road introduces by level 100, in order, read from the rotation', () => {
    const pool = eligibleActs();
    const ids = pool.map(index => VIGNETTES[index]!.id);
    expect(ids).toEqual(fixture.pool);
    // Every act in the pool plays a level at or before 100; none that joins later is in it.
    for (let level = 1; level <= 100; level++) expect(pool).toContain(placementAt(ROTATION, level).index);
    const later = new Set<number>();
    for (let level = 101; level <= 400; level++) later.add(placementAt(ROTATION, level).index);
    for (const index of later) if (!pool.includes(index)) expect(fixture.pool).not.toContain(VIGNETTES[index]!.id);
    expect(ids).not.toContain('paintbrush');
    expect(ids).not.toContain('frog');
    expect(new Set(pool).size).toBe(pool.length);
  });

  it('is larger than the no-repeat window, so a step always has a fresh act', () => {
    expect(eligibleActs().length).toBeGreaterThan(ENDLESS.recentActs);
  });
});

describe('the sequence', () => {
  it('is pinned: the shipped rules produce exactly these steps', () => {
    expect(ENDLESS_RULES.version).toBe(fixture.rulesVersion);
    const steps = endlessSteps(fixture.steps.length);
    const condensed = steps.map(s => ({
      index: s.index, role: s.role, vignette: s.vignette, lap: s.lap, bpm: s.bpm, tier: s.tier, grid: s.grid,
      pattern: s.pattern.id, threshold: s.threshold, start: Number(s.plannedStartSec.toFixed(3)),
    }));
    expect(condensed).toEqual(fixture.steps);
  });

  it('is the same from a fresh generator, from endlessStep, and from any restart', () => {
    const a = endlessSteps(60);
    const b = endlessSteps(60);
    expect(a).toEqual(b);
    for (const index of [0, 1, 7, 33, 59]) expect(endlessStep(index)).toEqual(a[index]);
    expect(() => endlessStep(-1)).toThrow();
    expect(() => endlessStep(1.5)).toThrow();
  });

  it('changes with the rules version and the seed, and with nothing else', () => {
    const shipped = endlessSteps(20).map(s => s.pattern.id + s.vignette);
    expect(endlessSteps(20, { version: 2, seed: ENDLESS.seed }).map(s => s.pattern.id + s.vignette)).not.toEqual(shipped);
    expect(endlessSteps(20, { version: 1, seed: 'other' }).map(s => s.pattern.id + s.vignette)).not.toEqual(shipped);
  });

  it('never repeats an act inside the recent window, and never a pattern back to back', () => {
    const steps = endlessSteps(400);
    for (let i = 1; i < steps.length; i++) {
      const recent = steps.slice(Math.max(0, i - ENDLESS.recentActs), i).map(s => s.actIndex);
      expect(recent, `step ${i}`).not.toContain(steps[i]!.actIndex);
      expect(steps[i]!.pattern, `step ${i}`).not.toBe(steps[i - 1]!.pattern);
    }
  });

  it('uses every act in the pool, and more than one look', () => {
    const steps = endlessSteps(300);
    expect(new Set(steps.map(s => s.actIndex)).size).toBe(eligibleActs().length);
    expect(new Set(steps.map(s => s.lap)).size).toBeGreaterThan(1);
    for (const step of steps) expect(step.lap).toBeGreaterThanOrEqual(0);
  });

  it('starts at 130 BPM, climbs in even steps, and never passes 150', () => {
    const steps = endlessSteps(300);
    expect(steps[0]!.bpm).toBe(ENDLESS.tempo.startBpm);
    for (const step of steps) {
      expect(step.bpm % 2).toBe(0);
      expect(step.bpm).toBeGreaterThanOrEqual(ENDLESS.tempo.startBpm);
      expect(step.bpm).toBeLessThanOrEqual(ENDLESS.tempo.capBpm);
    }
    // The ramp reaches the cap by five minutes of planned time and holds it.
    expect(rampBpm(0)).toBe(130);
    expect(rampBpm(150)).toBe(140);
    expect(rampBpm(300)).toBe(150);
    expect(rampBpm(3000)).toBe(150);
    const late = steps.filter(s => s.plannedStartSec >= ENDLESS.tempo.rampSec);
    expect(late.length).toBeGreaterThan(50);
    expect(Math.max(...late.map(s => s.bpm))).toBe(150);
    // And the music can follow it: the rate stays inside what MusicSystem accepts.
    for (const step of steps) expect(step.bpm / 120).toBeLessThanOrEqual(2);
  });

  it('raises the bar from 75% to 90% over five minutes and holds it', () => {
    expect(thresholdAt(0)).toBe(75);
    expect(thresholdAt(150)).toBe(83);
    expect(thresholdAt(300)).toBe(90);
    expect(thresholdAt(9999)).toBe(90);
    const steps = endlessSteps(200);
    for (let i = 1; i < steps.length; i++) expect(steps[i]!.threshold).toBeGreaterThanOrEqual(steps[i - 1]!.threshold);
    expect(steps[0]!.threshold).toBe(75);
    expect(steps.at(-1)!.threshold).toBe(90);
  });

  it('brings the tiers in low and wide, and keeps every pattern inside the tier range', () => {
    expect(rampTier(0)).toBe(0);
    expect(rampTier(300)).toBe(PROGRESSION.tierCount - 1);
    const steps = endlessSteps(200);
    expect(steps[0]!.tier).toBe(0);
    for (const step of steps) {
      expect(step.tier).toBeGreaterThanOrEqual(0);
      expect(step.tier).toBeLessThan(PROGRESSION.tierCount);
    }
    // Past the cap the cycle still varies the tier: a recovery is easier than a challenge.
    const late = steps.filter(s => s.plannedStartSec >= 300);
    expect(new Set(late.map(s => s.tier)).size).toBeGreaterThan(1);
  });

  it('never asks two taps closer than the thumb can give, on any grid', () => {
    for (const step of endlessSteps(400)) {
      expect(tightestSpacingMs(step.pattern, step.bpm), `step ${step.index}`).toBeGreaterThanOrEqual(PROGRESSION.subdivision.minSpacingMs);
      if (step.grid) expect(gridFits(step.grid, step.bpm)).toBe(true);
      // A grid pattern is what it says it is.
      if (step.grid === 'triplet') expect(step.pattern.grid).toBe(3);
      if (step.grid === 'sixteenth') expect(step.pattern.grid).toBe(4);
    }
  });

  it('offers no finer grid before two minutes, and triplets after', () => {
    const steps = endlessSteps(400);
    for (const step of steps) if (step.plannedStartSec < ENDLESS.grids.tripletFromSec) expect(step.grid).toBeNull();
    expect(steps.some(s => s.grid === 'triplet')).toBe(true);
    // Sixteenths need a tempo under 137 BPM, which the ramp has left behind by the time
    // they are allowed: the rule stands, and in this ruleset it never fires. Recorded here
    // so a change to the tempo band that lets them in is seen as the ruleset change it is.
    expect(steps.some(s => s.grid === 'sixteenth')).toBe(false);
  });

  it('plans whole bars: a step is its phrase twice, the act\'s ending and two bars, at one tempo', () => {
    for (const step of endlessSteps(60)) {
      const hold = VIGNETTES[step.actIndex]!.endingHoldBeats ?? 1;
      const beats = stepBeats(step.pattern, hold);
      expect(beats % RHYTHM.beatsPerBar).toBe(0);
      expect(step.durationSec).toBeCloseTo(beats * secondsPerBeat(step.bpm), 9);
      // The interlude is exactly two bars of it.
      expect(beats).toBeGreaterThanOrEqual(ENDLESS.interludeBars * RHYTHM.beatsPerBar + 8 + 4);
    }
    const steps = endlessSteps(60);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]!.plannedStartSec).toBeCloseTo(steps[i - 1]!.plannedStartSec + steps[i - 1]!.durationSec, 9);
    }
  });

  it('runs in bounded memory for as long as anyone could play', () => {
    const sequence = createEndlessSequence();
    let last = sequence.next();
    for (let i = 1; i < 5000; i++) last = sequence.next();
    expect(last.index).toBe(4999);
    expect(Number.isFinite(last.plannedStartSec)).toBe(true);
    expect(last.plannedStartSec).toBeGreaterThan(5000 * 8);
    expect(sequence.count).toBe(5000);
  });

  it('refuses an empty pool', () => {
    expect(() => createEndlessSequence(ENDLESS_RULES, [])).toThrow();
  });

  it('follows the ten-step cycle of roles', () => {
    const steps = endlessSteps(30);
    steps.forEach((step, i) => expect(step.role).toBe(ENDLESS.cycle[i % 10]!.role));
    // The cycle's offsets are whole tempo steps, so the band stays on even numbers.
    for (const row of ENDLESS.cycle) expect(Math.abs(row.bpm % ENDLESS.tempo.stepBpm)).toBe(0);
  });
});

describe('Groove Lives', () => {
  const at = (lives: number, excellentStreak = 0): EndlessLives => ({ lives, excellentStreak });

  it('start at three, and one vignette below the bar costs exactly one', () => {
    expect(LIVES_START).toEqual({ lives: 3, excellentStreak: 0 });
    const r = applyAccuracy(LIVES_START, 74, 75);
    expect(r).toEqual({ next: { lives: 2, excellentStreak: 0 }, event: 'lost', over: false });
    const again = applyAccuracy(r.next, 10, 75);
    expect(again.next.lives).toBe(1);
    expect(again.over).toBe(false);
    const last = applyAccuracy(again.next, 0, 75);
    expect(last).toEqual({ next: { lives: 0, excellentStreak: 0 }, event: 'lost', over: true });
    // Applied past zero it stays at zero and over: a duplicate can never take two.
    expect(applyAccuracy(last.next, 0, 75)).toEqual({ next: { lives: 0, excellentStreak: 0 }, event: 'lost', over: true });
  });

  it('compares the unrounded accuracy strictly against the bar', () => {
    expect(applyAccuracy(LIVES_START, 74.999, 75).event).toBe('lost');
    expect(applyAccuracy(LIVES_START, 75, 75).event).toBe('none');
    expect(applyAccuracy(LIVES_START, 89.999, 90).event).toBe('lost');
    expect(applyAccuracy(LIVES_START, 90, 90).event).toBe('none');
    expect(() => applyAccuracy(LIVES_START, Number.NaN, 75)).toThrow();
  });

  it('restores one life after three excellent vignettes in a row, and only below full', () => {
    let state = at(2);
    const first = applyAccuracy(state, 95, 75);
    expect(first).toEqual({ next: at(2, 1), event: 'none', over: false });
    const second = applyAccuracy(first.next, 100, 80);
    expect(second.next).toEqual(at(2, 2));
    const third = applyAccuracy(second.next, 95, 90);
    expect(third).toEqual({ next: at(3, 0), event: 'recovered', over: false });
    // Full: the third excellent resets the streak and banks nothing.
    state = at(3, 2);
    expect(applyAccuracy(state, 99, 75)).toEqual({ next: at(3, 0), event: 'none', over: false });
    // 94.999 is not excellent; it keeps the life and ends the streak.
    expect(applyAccuracy(at(2, 2), 94.999, 75)).toEqual({ next: at(2, 0), event: 'none', over: false });
    expect(applyAccuracy(at(2, 2), 95, 75).event).toBe('recovered');
  });

  it('cannot recover on the vignette that loses a life', () => {
    expect(applyAccuracy(at(2, 2), 60, 75)).toEqual({ next: at(1, 0), event: 'lost', over: false });
  });

  it('reads the scorer as it is: a round judged through the real judge', () => {
    // Four targets, three Perfect and one missed: 75% exactly, which keeps a life at 75.
    const targets = [10, 10.5, 11, 11.5];
    const judge = createJudge(targets);
    for (const t of targets.slice(0, 3)) judgeTap(judge, t);
    judge.outcomes[3] = { kind: 'omission', grade: 'Miss', index: 3, deltaMs: null };
    const result = scoreRound(judge);
    expect(result.accuracy).toBe(75);
    expect(applyAccuracy(LIVES_START, result.accuracy, 75).event).toBe('none');
    expect(applyAccuracy(LIVES_START, result.accuracy, 76).event).toBe('lost');
  });
});

describe('the ranked time', () => {
  it('is whole milliseconds between two grid times', () => {
    expect(elapsedMs(10, 10)).toBe(0);
    expect(elapsedMs(12.5, 78.532)).toBe(66032);
    expect(() => elapsedMs(5, 4)).toThrow();
    expect(() => elapsedMs(Number.NaN, 4)).toThrow();
  });

  it('is only ever a plausible whole number', () => {
    expect(rankedMs(66032)).toBe(66032);
    expect(rankedMs(0)).toBe(0);
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '66032', null, ENDLESS.maxRunMs + 1]) expect(rankedMs(bad)).toBeNull();
    expect(rankedMs(ENDLESS.maxRunMs)).toBe(ENDLESS.maxRunMs);
  });

  it('reads as minutes, seconds and tenths, truncated', () => {
    expect(formatSurvival(66032)).toBe('1:06.0');
    expect(formatSurvival(66032, true)).toBe('1:06.03');
    expect(formatSurvival(119999)).toBe('1:59.9');
    expect(formatSurvival(0)).toBe('0:00.0');
    expect(formatSurvival(600000, true)).toBe('10:00.00');
    expect(formatSurvival(Number.NaN)).toBe('0:00.0');
  });

  it('earns the badges at 2, 5 and 10 minutes, never a moment sooner', () => {
    expect(milestonesFor(119_999)).toEqual([]);
    expect(milestonesFor(120_000)).toEqual(['120s']);
    expect(milestonesFor(300_000)).toEqual(['120s', '300s']);
    expect(milestonesFor(600_000)).toEqual(['120s', '300s', '600s']);
    expect(milestonesFor(Number.NaN)).toEqual([]);
  });
});
