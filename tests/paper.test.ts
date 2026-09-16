import { describe, expect, it, vi } from 'vitest';
import { PAPER_CONTOURS, PAPER_MOTION, PAPER_SHAPES, paperCutPoint, paperHandoff, paperOutcome, paperReveal, paperShape, scissorOpening } from '../src/vignettes/paperMotion';
import { TURN_OPEN_SEC } from '../src/vignettes/motion';
import { synthesizePaper } from '../src/audio/paperSounds';
import { TaskSequence } from '../src/game/TaskSequence';
import { VIGNETTES } from '../src/vignettes/registry';
import { levelSpec } from '../src/game/levels';

vi.mock('phaser', () => ({ default: {} }));

describe('paper cutting presentation', () => {
  it('cycles all three silhouettes between tasks and repeats deterministically', () => {
    expect([1, 2, 3, 4, 5, 6].map(paperShape)).toEqual(['star', 'heart', 'angel', 'star', 'heart', 'angel']);
    for (const shape of PAPER_SHAPES) {
      const points = PAPER_CONTOURS[shape];
      expect(points[0]!.x).toBe(0);
      expect(points.at(-1)!.x).toBe(0);
      expect(points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 194 && Math.abs(p.y) <= 194)).toBe(true);
      expect(paperCutPoint(shape, -1)).toEqual(points[0]);
      expect(paperCutPoint(shape, 2)).toEqual(points.at(-1));
      for (let i = 0; i <= 100; i++) {
        const p = paperCutPoint(shape, i / 100);
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      }
    }
  });

  it('uses authoritative accuracy for success, half success and failure', () => {
    expect([0, 39.99, 40, 50, 69.99, 70, 100].map(paperOutcome)).toEqual(['fail', 'fail', 'partial', 'partial', 'partial', 'success', 'success']);
    const def = VIGNETTES.find(v => v.id === 'paper')!;
    expect(def.successAccuracy).toBe(PAPER_MOTION.successAccuracy);
    expect(def.partial?.minAccuracy).toBe(PAPER_MOTION.partialAccuracy);
    // Ninth in the registry, so it first falls on level 9 and every ninth level after.
    expect(levelSpec(9).vignette).toBe('paper');
    expect(levelSpec(18).vignette).toBe('paper');
  });

  it('closes on contact and reopens before the next possible fast tap', () => {
    for (const bpm of [72, 120, 136, 150]) {
      const beat = 60 / bpm;
      expect(scissorOpening(-1, beat)).toBe(1);
      expect(scissorOpening(0, beat)).toBe(0);
      expect(scissorOpening(beat / 2, beat)).toBe(1);
      expect(scissorOpening(beat * 0.1, beat)).toBeGreaterThan(0);
      expect(scissorOpening(beat * 0.1, beat)).toBeLessThan(1);
    }
  });

  it('eases the scissors back to the start of the fold as the turn opens', () => {
    expect(paperHandoff(0.88, 0)).toBeCloseTo(0.88);
    expect(paperHandoff(0.88, TURN_OPEN_SEC)).toBe(0);
    expect(paperHandoff(0.88, TURN_OPEN_SEC / 2)).toBeGreaterThan(0);
    expect(paperHandoff(0.88, TURN_OPEN_SEC / 2)).toBeLessThan(0.88);
    expect(paperHandoff(0, 0)).toBe(0);
  });

  it('makes the five endings distinct, bounded and complete before the stage leaves', () => {
    for (const shape of PAPER_SHAPES) {
      expect(paperReveal(-1, 'success', shape).open).toBe(0);
      const success = paperReveal(PAPER_MOTION.revealSec, 'success', shape);
      const partial = paperReveal(PAPER_MOTION.revealSec, 'partial', shape);
      const fail = paperReveal(PAPER_MOTION.revealSec, 'fail', shape);
      expect(success.open).toBe(1);
      expect(partial.open).toBeGreaterThan(0.5);
      expect(partial.open).toBeLessThan(1);
      expect(fail.crumple).toBe(1);
      expect(fail.open).toBeLessThan(0.2);
      for (const result of [success, partial, fail]) expect(Object.values(result).every(Number.isFinite)).toBe(true);
      const still = paperReveal(2, 'success', shape, true);
      expect(still.open).toBe(1);
      expect(still.lift).toBe(0);
      expect(still.tilt).toBe(0);
    }
    expect(paperReveal(1, 'success', 'angel').lift).toBeGreaterThan(paperReveal(1, 'success', 'heart').lift);
  });

  it('gives the reveal an extra musical bar without shifting the next task off the downbeat', () => {
    const hold = VIGNETTES.find(v => v.id === 'paper')!.endingHoldBeats!;
    for (const bpm of [120, 136, 150]) {
      const sequence = new TaskSequence(bpm, 10);
      const ending = sequence.ending(10, hold), beat = 60 / bpm;
      expect((ending.next - 10) / (4 * beat)).toBeCloseTo(2);
      expect(ending.slide - ending.contact).toBeGreaterThan(PAPER_MOTION.revealSec);
      expect(ending.swap - ending.slide).toBeCloseTo(beat);
      expect(sequence.ending(10).next - 10).toBeCloseTo(4 * beat);
    }
    for (const invalid of [0, 1.5, 2, 4, -1]) expect(() => new TaskSequence(120, 0).ending(1, invalid)).toThrow();
  });

  it.each(['action', 'success', 'rough', 'scrape', 'judder'] as const)('synthesizes an audible, deterministic and bounded %s voice', kind => {
    const samples = synthesizePaper(48000, kind);
    expect(samples).toEqual(synthesizePaper(48000, kind));
    expect(samples[0]).toBe(0);
    expect(Math.abs(samples.at(-1)!)).toBe(0);
    expect(samples.every(v => Number.isFinite(v) && Math.abs(v) <= 1)).toBe(true);
    expect(samples.reduce((max, v) => Math.max(max, Math.abs(v)), 0)).toBeGreaterThan(0.04);
  });
});
