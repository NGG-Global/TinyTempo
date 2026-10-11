import { describe, expect, it } from 'vitest';
import { HIT, hitPose, verdictPose } from '../src/ui/hitPose';

describe('what a hit does to the row', () => {
  it('throws a ring that spreads and fades, rays for the first instant, and a flash that cools', () => {
    const struck = hitPose(0, true, false)!;
    expect(struck.ring.spread).toBe(0);
    expect(struck.ring.alpha).toBeGreaterThan(0.8);
    expect(struck.rays.reach).toBe(0);
    expect(struck.rays.alpha).toBeGreaterThan(0.8);
    expect(struck.flash).toBe(1);
    const mid = hitPose(HIT.ring / 2, true, false)!;
    expect(mid.ring.spread).toBeGreaterThan(0.5);
    expect(mid.ring.alpha).toBeLessThan(struck.ring.alpha);
    expect(mid.rays.alpha).toBeLessThan(struck.rays.alpha);
    expect(hitPose(HIT.rays, true, false)!.rays.alpha).toBe(0);
    expect(mid.flash).toBeLessThan(struck.flash);
    expect(hitPose(HIT.ring * 0.999, true, false)!.ring.alpha).toBeLessThan(0.01);
  });

  it('hops the baton once and lets it back down, with a squash as it lands', () => {
    expect(hitPose(0, true, false)!.bob.lift).toBeCloseTo(0, 5);
    expect(hitPose(HIT.bob / 2, true, false)!.bob.lift).toBeCloseTo(HIT.bobReach, 5);
    expect(hitPose(HIT.bob * 0.999, true, false)!.bob.lift).toBeCloseTo(0, 1);
    expect(hitPose(HIT.bob * 0.2, true, false)!.bob.squash).toBe(0);
    expect(hitPose(HIT.bob * 0.95, true, false)!.bob.squash).toBeGreaterThan(0);
  });

  it('keeps a Good apart from a Perfect: a fainter ring, no rays, no hop', () => {
    const good = hitPose(0.02, false, false)!;
    const perfect = hitPose(0.02, true, false)!;
    expect(good.ring.alpha).toBeLessThan(perfect.ring.alpha / 1.8);
    expect(good.rays.alpha).toBe(0);
    expect(good.bob.lift).toBe(0);
    expect(good.flash).toBeLessThan(perfect.flash);
    expect(good.flash).toBeGreaterThan(0);
  });

  it('is the flash alone under reduced motion', () => {
    const still = hitPose(0.05, true, true)!;
    expect(still.flash).toBeGreaterThan(0);
    expect(still.ring.alpha).toBe(0);
    expect(still.rays.alpha).toBe(0);
    expect(still.bob).toEqual({ lift: 0, squash: 0 });
  });

  it('is nothing for a hit that has not happened, or is over', () => {
    expect(hitPose(-Infinity, true, false)).toBeNull();
    expect(hitPose(-0.01, true, false)).toBeNull();
    expect(hitPose(Infinity, true, false)).toBeNull();
    expect(hitPose(Number.NaN, true, false)).toBeNull();
    expect(hitPose(1, true, false)).toBeNull();
  });
});

describe('how the verdict lands', () => {
  it('stamps a Perfect in oversized from above, leaning by the beat it answered', () => {
    const struck = verdictPose(0, 'Perfect', 0, false)!;
    expect(struck.scale).toBeGreaterThan(1.4);
    expect(struck.rise).toBeLessThan(-10);
    const rested = verdictPose(HIT.verdictStamp * 1.4, 'Perfect', 0, false)!;
    expect(rested.scale).toBeCloseTo(1, 2);
    expect(rested.rise).toBeCloseTo(0, 2);
    expect(rested.alpha).toBeCloseTo(1, 4);
    expect(Math.sign(verdictPose(0.3, 'Perfect', 0, false)!.tilt)).not.toBe(Math.sign(verdictPose(0.3, 'Perfect', 1, false)!.tilt));
  });

  it('lets a Good arrive from below with its pop, and a Miss arrive flat with a shake', () => {
    const good = verdictPose(0.02, 'Good', 0, false)!;
    expect(good.rise).toBeLessThan(0);
    expect(good.scale).toBeLessThan(1);
    expect(good.tilt).toBe(0);
    const miss = verdictPose(0.02, 'Miss', 0, false)!;
    expect(miss.scale).toBe(1);
    expect(miss.tilt).not.toBe(0);
    expect(verdictPose(0.3, 'Good', 0, false)!.scale).toBeGreaterThan(0.99);
  });

  it('holds every grade the same time, leaves over the back of it, and is gone', () => {
    for (const grade of ['Perfect', 'Good', 'Miss'] as const) {
      expect(verdictPose(0.3, grade, 0, false)!.alpha).toBeCloseTo(1, 1);
      expect(verdictPose(HIT.verdictHold * 0.95, grade, 0, false)!.alpha).toBeLessThan(0.5);
      expect(verdictPose(HIT.verdictHold, grade, 0, false)).toBeNull();
      expect(verdictPose(-0.1, grade, 0, false)).toBeNull();
    }
  });

  it('is at rest under reduced motion, and still leaves', () => {
    expect(verdictPose(0.1, 'Perfect', 0, true)).toEqual({ alpha: 1, rise: 0, scale: 1, tilt: 0 });
    expect(verdictPose(HIT.verdictHold * 0.95, 'Perfect', 0, true)!.alpha).toBeLessThan(1);
  });
});
