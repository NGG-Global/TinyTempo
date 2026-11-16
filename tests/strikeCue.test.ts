import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CALIBRATION } from '../src/game/CalibrationRun';
import { STRIKE, strikePose, strikeWord } from '../src/ui/strikeCue';

const period = 60 / CALIBRATION.bpm;

describe('the calibration strike cue', () => {
  it('lands the ball on the ring on every beat and lifts it between', () => {
    for (const beat of [0, 1, 4, 11]) {
      expect(strikePose(beat, period).height).toBe(0);
      expect(strikePose(beat, period).landing).toBe(1);
    }
    // Highest half way through the hop, and on its way down just before the next beat.
    const top = strikePose(STRIKE.restShare + (1 - STRIKE.restShare) / 2, period).height;
    expect(top).toBeCloseTo(1);
    expect(strikePose(0.9, period).height).toBeGreaterThan(0);
    expect(strikePose(0.9, period).height).toBeLessThan(strikePose(0.8, period).height);
    // It rests on the ring for a moment after landing, so the hit reads before it leaves.
    expect(strikePose(STRIKE.restShare / 2, period).height).toBe(0);
    // The landing fades out inside the beat.
    expect(strikePose(STRIKE.landingSec / period + 0.01, period).landing).toBe(0);
  });

  it('rests before the run begins, under reduced motion, and on bad input', () => {
    expect(strikePose(-0.5, period)).toEqual({ height: 0, landing: 0 });
    expect(strikePose(Number.NaN, period)).toEqual({ height: 0, landing: 0 });
    expect(strikePose(2.5, 0)).toEqual({ height: 0, landing: 0 });
    const still = strikePose(2.5, period, true);
    expect(still.height).toBe(0);
    // Reduced motion keeps the landing, which reads as a blink of the ring.
    expect(strikePose(2.05, period, true).landing).toBeGreaterThan(0);
  });

  it('says Listen, counts down to the first measured beat, and says Tap! from it on', () => {
    expect(strikeWord(-0.3)).toBe('Listen');
    expect(strikeWord(0)).toBe('Listen');
    expect(strikeWord(1.2)).toBe('3');
    expect(strikeWord(2)).toBe('2');
    expect(strikeWord(3.9)).toBe('1');
    expect(strikeWord(CALIBRATION.leadBeats)).toBe('Tap!');
    expect(strikeWord(CALIBRATION.leadBeats + 1)).toBe('Tap!');
    expect(strikeWord(CALIBRATION.leadBeats + CALIBRATION.measureBeats - 0.5)).toBe('Tap!');
    expect(strikeWord(Number.NaN)).toBeNull();
    // A longer count-in listens until three beats remain.
    expect(strikeWord(0, 6)).toBe('Listen');
    expect(strikeWord(2, 6)).toBe('Listen');
    expect(strikeWord(3, 6)).toBe('3');
  });

  it('is drawn from the heard clock in the scene, where the beads were', () => {
    const scene = readFileSync('src/scenes/CalibrateScene.ts', 'utf8');
    expect(scene).toContain('strikePose(elapsed, this.run.period, still)');
    expect(scene).toContain('strikeWord(elapsed)');
    // Heard clock, never currentTime: a cue on the write clock lands before the sound.
    const draw = scene.slice(scene.indexOf('  private drawStrike(): void {'), scene.indexOf('  /** Anywhere on the screen is a beat'));
    expect(draw).toContain('audio.clock.now()');
    expect(draw).not.toContain('currentTime');
  });
});
