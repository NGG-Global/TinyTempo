import { describe, expect, it } from 'vitest';
import { parsePattern, parseSubdivided, secondsPerBeat, tightestGap, validatePattern } from '../src/rhythm/patterns';
import { createRoundPlan, RhythmScheduler } from '../src/rhythm/RhythmScheduler';

describe('patterns and absolute scheduling', () => {
  it('preserves rests, phrase length and half beats', () => {
    expect(parsePattern('p', 'X X - X X').hits).toEqual([0, 1, 3, 4]);
    const p = parsePattern('p', 'X - X - - - X X', 0.5);
    expect(p.hits).toEqual([0, 1, 3, 3.5]);
    expect(p.lengthBeats).toBe(4);
    expect(parsePattern('p', 'X - -').lengthBeats).toBe(3);
  });
  it.each(['', '- -', 'X Y', 'XX'])('rejects invalid notation: %s', notation => {
    expect(() => parsePattern('p', notation)).toThrow();
    expect(() => parseSubdivided('p', notation, 3)).toThrow();
  });
  it('writes triplets and sixteenths on an exact grid, so twelve triplet steps are one bar and not two', () => {
    const triplets = parseSubdivided('t', 'X - - X - - X X X X - -', 3);
    expect(triplets.lengthBeats).toBe(4);
    expect(triplets.grid).toBe(3);
    expect(triplets.hits.map(h => Math.round(h * 3))).toEqual([0, 3, 6, 7, 8, 9]);
    expect(tightestGap(triplets)).toBeCloseTo(1 / 3);
    // Multiplying the step out instead would not: a third of a beat has no exact binary form.
    expect(createRoundPlan(1, triplets, 120, 0).response - createRoundPlan(1, triplets, 120, 0).demo).toBeCloseTo(2);
    const sixteenths = parseSubdivided('s', 'X - - - X X X X X - - - X - - -', 4);
    expect(sixteenths.lengthBeats).toBe(4);
    expect(sixteenths.hits).toEqual([0, 1, 1.25, 1.5, 1.75, 2, 3]);
    expect(tightestGap(sixteenths)).toBe(0.25);
    expect(tightestGap(parsePattern('one', 'X - - -'))).toBe(Infinity);
    expect(parsePattern('e', 'X - X -', 0.5).grid).toBe(2);
  });
  it.each([0, 1.5, -2, NaN])('rejects a grid of %s steps per beat', steps => {
    expect(() => parseSubdivided('p', 'X - -', steps)).toThrow();
  });
  it.each([0, -1, NaN, Infinity])('rejects invalid BPM and step %s', value => {
    expect(() => secondsPerBeat(value)).toThrow();
    expect(() => parsePattern('p', 'X', value)).toThrow();
  });
  it.each([[1, 0], [0, 0], [-1], [4], [NaN], []])('rejects malformed hits %s', (...hits) => {
    expect(() => validatePattern({ id: 'p', label: '', lengthBeats: 4, hits })).toThrow();
  });
  it('derives both phrases from the same beat offsets at different BPM', () => {
    const pattern = parsePattern('p', 'X - X - - - X X', 0.5);
    for (const bpm of [80, 100, 120]) {
      const plan = createRoundPlan(1, pattern, bpm, 10);
      // The response starts one phrase after the demonstration, with nothing in between.
      expect(plan.response - plan.demo).toBeCloseTo(4 * 60 / bpm);
      expect(plan.targets.map(t => (t - plan.response) / (60 / bpm))).toEqual(expect.arrayContaining([0]));
      plan.targets.forEach((target, i) => expect(target).toBeCloseTo(plan.response + pattern.hits[i]! * 60 / bpm));
      expect(plan.cues.filter(c => c.kind === 'action').length).toBe(4);
      expect(plan.cues.every(c => c.time < plan.response)).toBe(true);
    }
  });
  it('replaces scheduled sources without timers or accumulating old cues', () => {
    const active: number[] = [];
    const scheduler = new RhythmScheduler({ play: t => active.push(t), cancel: () => { active.length = 0; } });
    for (let i = 0; i < 100; i++) {
      const plan = createRoundPlan(i, parsePattern('p', 'X X -'), 100, i * 10);
      scheduler.schedule(plan);
      expect(active).toEqual(plan.cues.map(c => c.time));
    }
    scheduler.cancel(); scheduler.cancel();
    expect(active).toEqual([]);
  });
});
