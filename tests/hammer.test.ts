import { describe, expect, it } from 'vitest';
import { anticipation, recoil, nailHeight, knockDepth, HAMMER_MOTION, KNOCK } from '../src/vignettes/hammerMotion';
import { synthesizeImpact } from '../src/audio/hammerSounds';

describe('hammer presentation curves', () => {
  it('lands exactly on the scheduled contact and lifts before striking', () => {
    expect(anticipation(0)).toBeCloseTo(0);
    expect(anticipation(HAMMER_MOTION.anticipationSec)).toBeCloseTo(0.55);
    expect(anticipation(HAMMER_MOTION.anticipationSec * 0.58)).toBeCloseTo(0.82);
    expect(recoil(0)).toBe(0);
    expect(recoil(HAMMER_MOTION.contactHoldSec)).toBe(0);
    expect(recoil(HAMMER_MOTION.recoilSec * 0.7)).toBeGreaterThan(0.55);
    expect(recoil(HAMMER_MOTION.recoilSec)).toBeCloseTo(0.55);
    expect(anticipation(HAMMER_MOTION.anticipationSec, 0.2)).toBeCloseTo(0.2);
    expect(anticipation(0, 0.2)).toBeCloseTo(0);
  });
  it('never overshoots the depth bounds and finishes flush', () => {
    expect(nailHeight(0)).toBe(203);
    expect(nailHeight(0.5)).toBeLessThan(nailHeight(0));
    expect(nailHeight(1) + 10).toBe(0);
    expect(nailHeight(3)).toBe(nailHeight(1));
    expect(nailHeight(-1)).toBe(nailHeight(0));
  });
  it('lets the title screen knock the nail a little, hold it there, and let it back up', () => {
    // A screen never tapped, and a nail left alone for the rest, both stand at the top.
    expect(knockDepth(Infinity)).toBe(0);
    expect(knockDepth(KNOCK.restSec)).toBe(0);
    expect(knockDepth(-1)).toBe(0);
    // The first knock sinks it; every knock inside the rest finds it exactly where the first left it.
    expect(knockDepth(0)).toBe(KNOCK.depth);
    expect(knockDepth(KNOCK.restSec * 0.5)).toBe(KNOCK.depth);
    expect(knockDepth(KNOCK.restSec * 0.99)).toBe(KNOCK.depth);
    // Never driven home: the head stays well proud of the timber.
    expect(KNOCK.depth).toBeGreaterThan(0);
    expect(nailHeight(KNOCK.depth)).toBeGreaterThan(nailHeight(0) * 0.7);
    expect(nailHeight(KNOCK.depth)).toBeLessThan(nailHeight(0));
    expect(KNOCK.riseSec).toBeGreaterThan(HAMMER_MOTION.contactHoldSec);
  });
  it.each(['hit', 'flush', 'bent'] as const)('generates a bounded, finite %s sound without leading silence', kind => {
    const sound = synthesizeImpact(48000, kind);
    expect(sound.length).toBeGreaterThan(8000);
    expect(sound[0]).toBe(0);
    expect(Array.from(sound.subarray(1, 48)).some(value => Math.abs(value) > 0.01)).toBe(true);
    expect(sound.every(value => Number.isFinite(value) && Math.abs(value) <= 1)).toBe(true);
    expect(synthesizeImpact(48000, kind)).toEqual(sound);
  });
});
