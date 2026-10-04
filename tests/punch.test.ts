import { describe, expect, it } from 'vitest';
import { punch, PUNCH } from '../src/ui/punch';

describe('the contact punch', () => {
  it('is at full reach on the contact, inside the 2–4 unit band', () => {
    expect(punch(0)).toBeCloseTo(PUNCH.reach, 9);
    expect(PUNCH.reach).toBeGreaterThanOrEqual(2);
    expect(PUNCH.reach).toBeLessThanOrEqual(4);
  });

  it('settles within about 120 ms and is nothing before the contact or after it', () => {
    expect(PUNCH.settleSec).toBeLessThanOrEqual(0.13);
    expect(punch(PUNCH.settleSec)).toBe(0);
    expect(punch(1)).toBe(0);
    expect(punch(-0.001)).toBe(0);
    expect(punch(NaN)).toBe(0);
    expect(punch(-Infinity)).toBe(0);
    // Approaches rest continuously: the last sample before settling is all but home.
    expect(Math.abs(punch(PUNCH.settleSec - 0.001))).toBeLessThan(0.01);
  });

  it('rebounds past rest once, smaller than the blow', () => {
    const samples = Array.from({ length: 121 }, (_, i) => punch(i / 1000));
    const rebound = Math.min(...samples);
    expect(rebound).toBeLessThan(0);
    expect(Math.abs(rebound)).toBeLessThan(PUNCH.reach * 0.25);
  });

  it('scales with strength and the treatment\'s exaggeration, and is still at zero', () => {
    expect(punch(0, 0.5, 1)).toBeCloseTo(PUNCH.reach / 2, 9);
    expect(punch(0.02, 1, 1.4)).toBeCloseTo(punch(0.02) * 1.4, 9);
    expect(punch(0.02, 1, 0)).toBeCloseTo(0, 12);
  });
});
