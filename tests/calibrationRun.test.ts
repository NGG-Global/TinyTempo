import { describe, expect, it } from 'vitest';
import { CalibrationRun, CALIBRATION } from '../src/game/CalibrationRun';
import { CALIBRATION_TAPS } from '../src/game/settings';

function measure(offsets: number[], current = 0): CalibrationRun {
  const run = new CalibrationRun(10, current);
  offsets.forEach((ms, i) => run.tap(10 + (CALIBRATION.leadBeats + i) * run.period + ms / 1000));
  return run;
}

describe('calibration sampling', () => {
  it('needs eight distinct beats, not eight presses around one beat', () => {
    const run = new CalibrationRun(10, 0);
    for (let i = 0; i < 8; i++) run.tap(14 + i * 0.01);
    expect(run.count).toBe(1);
    expect(run.result()).toBeNull();
  });

  it('ignores preparation, gaps, invalid timestamps and taps after the exercise', () => {
    const run = new CalibrationRun(10, 0);
    for (const time of [NaN, Infinity, 9, 10, 13, 14.5, run.end + 1]) expect(run.tap(time)).toBe(false);
    expect(run.count).toBe(0);
  });

  it('handles a 300 ms residual without wrapping it to a negative neighbouring beat', () => {
    expect(measure(Array(8).fill(300)).result()).toBe(300);
    expect(measure(Array(8).fill(-100), 200).result()).toBe(100);
  });

  it('keeps the median robust to one fumble but refuses erratic tapping', () => {
    expect(measure([90, 91, 92, 93, 92, 90, 95, 300]).result()).toBe(92);
    expect(measure([-190, 160, -150, 200, -120, 180, -170, 220]).result()).toBeNull();
  });

  it('is bounded after completion and each new run starts cleanly', () => {
    const run = measure(Array(8).fill(40));
    expect(run.complete).toBe(true);
    expect(run.tap(23)).toBe(false);
    expect(run.count).toBe(CALIBRATION_TAPS);
    expect(new CalibrationRun(30, 40).count).toBe(0);
    expect(new CalibrationRun(30, 40).result()).toBeNull();
  });
});

describe('what a run says about itself', () => {
  it('names where a tap went, and counts only the ones that landed', () => {
    const run = new CalibrationRun(10, 0);
    const beat = (n: number) => 10 + (CALIBRATION.leadBeats + n) * run.period;
    expect(run.place(10 + 2 * run.period)).toBe('outside');
    expect(run.place(beat(0) + 0.02)).toBe('landed');
    expect(run.place(beat(0) + 0.03)).toBe('repeat');
    expect(run.place(beat(1) - 0.45)).toBe('early');
    expect(run.place(beat(2) + 0.45)).toBe('late');
    expect(run.place(NaN)).toBe('outside');
    expect(run.count).toBe(1);
    expect([...run.residualsMs].map(Math.round)).toEqual([20]);
  });

  it('tells too few taps from uneven taps, and measures the rest with their spread', () => {
    expect(measure([30, 30, 30]).verdict()).toEqual({ kind: 'few', landed: 3 });
    const uneven = measure([-190, 160, -150, 200, -120, 180, -170, 220]).verdict();
    expect(uneven.kind).toBe('uneven');
    if (uneven.kind === 'uneven') expect(uneven.spreadMs).toBeGreaterThan(CALIBRATION.maxJitterMs);
    const steady = measure([90, 91, 92, 93, 92, 90, 95, 300], 10).verdict();
    expect(steady).toMatchObject({ kind: 'measured', offsetMs: 102 });
    if (steady.kind === 'measured') { expect(steady.residualMs).toBeCloseTo(92, 6); expect(steady.spreadMs).toBeLessThan(5); }
    expect(measure(Array(8).fill(0)).spreadMs).toBe(0);
    expect(new CalibrationRun(1, 0).spreadMs).toBe(0);
  });
});
