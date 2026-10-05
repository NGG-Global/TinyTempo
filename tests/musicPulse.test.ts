import { describe, expect, it } from 'vitest';
import { barPose, pulseAt, PULSE } from '../src/ui/musicPulse';

describe('the music pulse', () => {
  it('turns a position on the music into beats at the source tempo, and reports the heard tempo', () => {
    const pulse = pulseAt(3, 120, 1.1, 99);
    expect(pulse.onMusic).toBe(true);
    // Source seconds, so the beat count is the source tempo's whatever the rate.
    expect(pulse.beats).toBeCloseTo(6, 9);
    expect(pulse.bpm).toBeCloseTo(132, 9);
  });

  it('falls back to the frame clock at the music\'s tempo, never freezing', () => {
    for (const position of [null, NaN, Infinity]) {
      const a = pulseAt(position, 120, 1, 10), b = pulseAt(position, 120, 1, 10.5);
      expect(a.onMusic).toBe(false);
      expect(b.beats - a.beats).toBeCloseTo(0.5 * PULSE.fallbackBpm / 60, 9);
    }
    // A rate or tempo that cannot be read is no music at all.
    expect(pulseAt(2, 120, 0, 1).onMusic).toBe(false);
    expect(pulseAt(2, 0, 1, 1).onMusic).toBe(false);
    expect(pulseAt(null, 120, 1, NaN).beats).toBe(0);
  });

  it('places beat 1 of every bar on the bar line', () => {
    const at = (sec: number) => barPose(pulseAt(sec, 120, 1, 0));
    // 120 BPM in 4/4: a bar is two seconds.
    expect(at(0)).toMatchObject({ bar: 0, beatInBar: 0, sinceBarSec: 0, untilBarSec: 2 });
    expect(at(2)).toMatchObject({ bar: 1, beatInBar: 0 });
    const mid = at(3.25);
    expect(mid.bar).toBe(1);
    expect(mid.beatInBar).toBe(2);
    expect(mid.phase).toBeCloseTo(0.5, 9);
    expect(mid.sinceBarSec).toBeCloseTo(1.25, 9);
    expect(mid.untilBarSec).toBeCloseTo(0.75, 9);
  });

  it('measures the time to the bar line at the tempo being heard', () => {
    // Twice as fast: the same beat position is half the seconds from the bar line.
    const pose = barPose(pulseAt(1, 120, 2, 0));
    expect(pose.sinceBarSec).toBeCloseTo(0.5, 9);
    expect(pose.untilBarSec).toBeCloseTo(0.5, 9);
  });

  it('counts back from bar 0 before the origin, and stays on the grid across thirty seconds', () => {
    const before = barPose(pulseAt(-0.5, 120, 1, 0));
    expect(before.bar).toBe(-1);
    expect(before.beatInBar).toBe(3);
    // Every bar line over half a minute lands exactly on a whole bar: no drift.
    for (let bar = 0; bar <= 15; bar++) {
      const pose = barPose(pulseAt(bar * 2, 120, 1, 0));
      expect(pose.bar).toBe(bar);
      expect(pose.sinceBarSec).toBeCloseTo(0, 9);
    }
  });

  it('takes any bar length, and never a bar of no beats', () => {
    expect(barPose(pulseAt(1.5, 120, 1, 0), 3)).toMatchObject({ bar: 1, beatInBar: 0 });
    expect(barPose(pulseAt(1.5, 120, 1, 0), 0).bar).toBe(3);
  });
});
