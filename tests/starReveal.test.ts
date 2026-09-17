import { describe, expect, it } from 'vitest';
import {
  chorusBurst, chorusGlow, PLAQUE, plaqueJolt, plaquePose, starAge, starImpactAge, starPose, STAR_REVEAL,
} from '../src/ui/starReveal';

describe('star reveal pose', () => {
  it('keeps an earned slot seated until its medal starts falling', () => {
    const seat = starPose(0, true);
    expect(seat.alpha).toBe(1);
    expect(seat.fill).toBe(0);
    expect(seat.drop).toBe(0);
    expect(seat.landed).toBe(false);
    expect(starPose(-0.2, true).fill).toBe(0);
    expect(starPose(-0.2, false).alpha).toBe(0);
  });

  it('stamps an earned star at the authored impact age', () => {
    expect(starPose(STAR_REVEAL.impact - 0.001, true).landed).toBe(false);
    expect(starPose(STAR_REVEAL.impact, true).landed).toBe(true);
    expect(starImpactAge(STAR_REVEAL.impact, true)).toBeCloseTo(0);
    expect(starImpactAge(STAR_REVEAL.impact, false)).toBe(-1);
    expect(starPose(STAR_REVEAL.impact, true).fill).toBeGreaterThan(0.8);
    expect(starPose(STAR_REVEAL.impact, true).drop).toBeGreaterThan(-0.4);
  });

  it('drops from above and settles near rest without ballooning', () => {
    const early = starPose(0.05, true);
    expect(early.drop).toBeLessThan(-0.8);
    expect(early.spin).toBeLessThan(0);
    const samples = Array.from({ length: 81 }, (_, i) => starPose(i / 40, true));
    expect(Math.max(...samples.map(p => p.scaleX))).toBeLessThan(1.5);
    expect(Math.max(...samples.map(p => p.scaleY))).toBeLessThan(1.5);
    const rest = starPose(8, true);
    expect(rest.scaleX).toBeCloseTo(1, 2);
    expect(rest.scaleY).toBeCloseTo(1, 2);
    expect(rest.drop).toBeCloseTo(0, 2);
    expect(rest.spin).toBeCloseTo(0, 2);
    expect(rest.fill).toBe(1);
    expect(rest.glow).toBeGreaterThan(0);
  });

  it('never lights an empty star', () => {
    for (const age of [0.1, 0.4, 1, 8]) {
      const empty = starPose(age, false);
      expect(empty.fill).toBe(0);
      expect(empty.glow).toBe(0);
      expect(empty.shine).toBe(0);
    }
  });

  it('staggers the three medals and holds a settled pose for reduced motion', () => {
    expect(starAge(0, 0)).toBeCloseTo(-STAR_REVEAL.delay);
    expect(starAge(STAR_REVEAL.delay, 0)).toBeCloseTo(0);
    expect(starAge(STAR_REVEAL.delay + STAR_REVEAL.spread, 2)).toBeCloseTo(0);
    expect(starAge(STAR_REVEAL.delay, 2)).toBeLessThan(starAge(STAR_REVEAL.delay, 0));
    expect(starAge(0.2, 0, true)).toBe(8);
    expect(starPose(starAge(0.2, 0, true), true).fill).toBe(1);
  });

  it('reserves the chorus bloom for a three-star finish after the last stamp', () => {
    const peakAt = STAR_REVEAL.delay + STAR_REVEAL.spread + STAR_REVEAL.impact + 0.06 + 0.09;
    expect(chorusGlow(peakAt, 2)).toBe(0);
    expect(chorusGlow(0, 3)).toBe(0);
    expect(chorusGlow(peakAt, 3)).toBeGreaterThan(0.4);
    expect(chorusGlow(peakAt + 1.5, 3)).toBeLessThan(0.05);
  });
});

describe('the result plaque', () => {
  it('swings in from above and comes to rest', () => {
    const start = plaquePose(0);
    expect(start.alpha).toBe(0);
    expect(start.drop).toBeCloseTo(-PLAQUE.rise, 5);
    const rest = plaquePose(8);
    expect(rest.alpha).toBe(1);
    expect(rest.drop).toBeCloseTo(0, 3);
    expect(rest.tilt).toBeCloseTo(0, 3);
    // Never above its anchor, and never further down than the jolt can take it.
    const samples = Array.from({ length: 121 }, (_, i) => plaquePose(i / 60));
    expect(Math.min(...samples.map(p => p.drop))).toBeGreaterThanOrEqual(-PLAQUE.rise);
    expect(Math.max(...samples.map(p => p.drop))).toBeLessThan(0.08);
    expect(Math.max(...samples.map(p => Math.abs(p.tilt)))).toBeLessThan(PLAQUE.tilt * 1.4);
  });

  it('is still under reduced motion rather than merely quicker', () => {
    expect(plaquePose(0, true)).toEqual({ alpha: 1, drop: 0, tilt: 0 });
    expect(plaquePose(0.3, true)).toEqual({ alpha: 1, drop: 0, tilt: 0 });
  });

  it('takes one knock per medal, in time with the brass', () => {
    // Before the first stamp nothing has hit it.
    expect(plaqueJolt(0, 3)).toBe(0);
    expect(plaqueJolt(STAR_REVEAL.delay + STAR_REVEAL.impact - 0.01, 3)).toBe(0);
    const afterFirst = plaqueJolt(STAR_REVEAL.delay + STAR_REVEAL.impact + 0.02, 3);
    expect(afterFirst).toBeGreaterThan(0);
    // A level that earned nothing never knocks the plaque at all.
    const idle = Array.from({ length: 60 }, (_, i) => plaqueJolt(i / 30, 0));
    expect(Math.max(...idle)).toBe(0);
    // Three medals knock harder than one, and every knock rings out.
    const peak = (earned: number): number =>
      Math.max(...Array.from({ length: 180 }, (_, i) => plaqueJolt(i / 60, earned)));
    expect(peak(3)).toBeGreaterThan(peak(1));
    expect(plaqueJolt(6, 3)).toBeCloseTo(0, 4);
  });

  it('throws the chorus only on a clean sweep', () => {
    const at = STAR_REVEAL.delay + STAR_REVEAL.spread + STAR_REVEAL.impact + 0.2;
    expect(chorusBurst(at, 2)).toEqual({ scale: 0, alpha: 0, spin: 0 });
    expect(chorusBurst(0, 3).alpha).toBe(0);
    const burst = chorusBurst(at, 3);
    expect(burst.alpha).toBeGreaterThan(0);
    // It opens outward and turns as it goes, then leaves.
    const later = chorusBurst(at + 0.4, 3);
    expect(later.scale).toBeGreaterThan(burst.scale);
    expect(later.spin).toBeGreaterThan(burst.spin);
    expect(later.alpha).toBeLessThan(burst.alpha);
    expect(chorusBurst(at + 4, 3).alpha).toBeCloseTo(0, 6);
  });
});
