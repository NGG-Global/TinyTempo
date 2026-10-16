import { describe, expect, it, vi } from 'vitest';
import { ENDLESS } from '../src/config/endless';
import { applyAccuracy } from '../src/game/endless';
import { levelSpec, meanAccuracy, starsFor } from '../src/game/levels';
import { barsFor, finishOutcome, layerStep, levelBars, VERDICT } from '../src/game/taskVerdict';

vi.mock('phaser', () => ({ default: {} }));

describe('a task’s ending reads the bar the task is held to', () => {
  it('ends well exactly at the level’s clear bar, near-misses within the band, rough below it', () => {
    const bars = levelBars(levelSpec(60));
    expect(finishOutcome(bars.clear, bars, true)).toBe('success');
    expect(finishOutcome(bars.clear - 0.01, bars, true)).toBe('partial');
    expect(finishOutcome(bars.clear - VERDICT.partialBand, bars, true)).toBe('partial');
    expect(finishOutcome(bars.clear - VERDICT.partialBand - 0.01, bars, true)).toBe('rough');
    // An act with two endings has no near miss to show.
    expect(finishOutcome(bars.clear - 0.01, bars, false)).toBe('rough');
  });

  it('never tells a level one thing and the result another', () => {
    for (let level = 1; level <= 300; level++) {
      const spec = levelSpec(level);
      const bars = levelBars(spec);
      const success = Array.from({ length: spec.tasks.length }, (_, i) => bars.clear + (i % 3) * 3);
      const rough = Array.from({ length: spec.tasks.length }, (_, i) => Math.max(0, bars.clear - VERDICT.partialBand - 1 - i));
      expect(success.every(a => finishOutcome(a, bars, true) === 'success')).toBe(true);
      expect(starsFor(meanAccuracy(success), spec), `level ${level}`).toBeGreaterThan(0);
      expect(rough.every(a => finishOutcome(a, bars, true) === 'rough')).toBe(true);
      expect(starsFor(meanAccuracy(rough), spec), `level ${level}`).toBe(0);
    }
  });

  it('fixes what the old fixed 70% got wrong at both ends of the road', () => {
    // Level 1: a clearing 60% task used to play the rough ending.
    expect(finishOutcome(60, levelBars(levelSpec(1)), false)).toBe('success');
    // The plateau: a 75% task used to play the success ending in a level it cannot clear.
    expect(finishOutcome(75, levelBars(levelSpec(120)), false)).toBe('rough');
    expect(finishOutcome(75, levelBars(levelSpec(120)), true)).toBe('partial');
  });

  it('earns a stem at the second star and loses one only on a rough task', () => {
    const bars = levelBars(levelSpec(30));
    expect(bars.strong).toBe(levelSpec(30).starAccuracy[1]);
    expect(layerStep(bars.strong, bars)).toBe(1);
    expect(layerStep(bars.strong - 0.01, bars)).toBe(0);
    expect(layerStep(bars.clear - VERDICT.partialBand, bars)).toBe(0);
    expect(layerStep(bars.clear - VERDICT.partialBand - 0.01, bars)).toBe(-1);
  });
});

describe('Endless reads the same rule against its own bar', () => {
  it('never plays the success ending on a step that costs a life, nor withholds it from one that keeps it', () => {
    const { start, peak } = ENDLESS.threshold;
    for (let threshold = start; threshold <= peak; threshold += 0.5) {
      const bars = barsFor(threshold);
      for (const accuracy of [0, threshold - 15.5, threshold - 0.5, threshold, threshold + 0.5, 100]) {
        const lost = applyAccuracy({ lives: 3, excellentStreak: 0 }, accuracy, threshold).event === 'lost';
        expect(finishOutcome(accuracy, bars, true) === 'success', `${accuracy} against ${threshold}`).toBe(!lost);
      }
    }
  });

  it('shapes its strong bar as a level’s second star sits above its clear bar', () => {
    for (let level = 1; level <= 300; level++) {
      const spec = levelSpec(level);
      expect(barsFor(spec.clearAccuracy).strong, `level ${level}`).toBe(spec.starAccuracy[1]);
    }
  });
});
