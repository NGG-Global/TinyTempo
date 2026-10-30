import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HIT, hitPose, verdictGroup, verdictPose, verdictWord } from '../src/ui/hitPose';

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
    // A surplus tap is struck the way a miss is, under its own word.
    expect(verdictPose(0.02, 'Extra', 0, false)).toEqual(verdictPose(0.02, 'Miss', 0, false));
  });

  it('names a surplus tap apart from an untapped beat, and leaves every grade its own word', () => {
    expect(verdictWord({ kind: 'extra', grade: 'Miss' })).toBe('Extra');
    expect(verdictWord({ kind: 'omission', grade: 'Miss' })).toBe('Miss');
    expect(verdictWord({ kind: 'hit', grade: 'Perfect' })).toBe('Perfect');
    expect(verdictWord({ kind: 'hit', grade: 'Good' })).toBe('Good');
  });

  it('holds every grade the same time, leaves over the back of it, and is gone', () => {
    for (const grade of ['Perfect', 'Good', 'Miss', 'Extra'] as const) {
      expect(verdictPose(0.3, grade, 0, false)!.alpha).toBeCloseTo(1, 1);
      expect(verdictPose(HIT.verdictHold * 0.95, grade, 0, false)!.alpha).toBeLessThan(0.5);
      expect(verdictPose(HIT.verdictHold, grade, 0, false)).toBeNull();
      expect(verdictPose(-0.1, grade, 0, false)).toBeNull();
    }
  });

  it('is at rest under reduced motion, and still leaves', () => {
    expect(verdictPose(0.1, 'Perfect', 0, true)).toEqual({ alpha: 1, rise: 0, scale: 1, tilt: 0, tag: 1 });
    expect(verdictPose(HIT.verdictHold * 0.95, 'Perfect', 0, true)!.alpha).toBeLessThan(1);
  });

  it('is opaque from its first frame: a strike is not faded in', () => {
    expect(verdictPose(0.017, 'Perfect', 0, false)!.alpha).toBeCloseTo(1, 2);
  });

  it('lifts off as it leaves, a little up and a little smaller, and is at rest through its hold', () => {
    // A Perfect sits on its line through the hold; a Good and a Miss hold where they arrived.
    expect(verdictPose(0.34, 'Perfect', 0, false)!.rise).toBeCloseTo(0, 1);
    for (const grade of ['Perfect', 'Good', 'Miss', 'Extra'] as const) {
      const held = verdictPose(0.34, grade, 0, false)!;
      const going = verdictPose(HIT.verdictHold * 0.95, grade, 0, false)!;
      expect(going.rise).toBeLessThan(held.rise - 3);
      expect(going.scale).toBeLessThan(held.scale);
    }
  });

  it('brings the tag in a few frames behind the word, and whole under reduced motion', () => {
    expect(verdictPose(0, 'Good', 0, false)!.tag).toBe(0);
    expect(verdictPose(0.05, 'Good', 0, false)!.tag).toBe(0);
    const mid = verdictPose(0.12, 'Good', 0, false)!.tag;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(verdictPose(0.25, 'Good', 0, false)!.tag).toBe(1);
    expect(verdictPose(0, 'Good', 0, true)!.tag).toBe(1);
  });
});

describe('the verdict and its early/late tag', () => {
  it('centres the word alone when there is no tag, exactly as before', () => {
    expect(verdictGroup(120, 0, 1.2, 12)).toEqual({ wordX: 0, tagX: 0, width: 144 });
  });

  it('centres the word and the tag as one group, a gap apart, at the word’s scale', () => {
    const { wordX, tagX, width } = verdictGroup(100, 60, 1.5, 10);
    expect(width).toBeCloseTo(100 * 1.5 + 10 * 1.5 + 60 * 1.5);
    // The group's left edge and right edge sit the same distance either side of the line.
    const left = wordX - (100 * 1.5) / 2;
    const right = tagX + (60 * 1.5) / 2;
    expect(left).toBeCloseTo(-width / 2);
    expect(right).toBeCloseTo(width / 2);
    expect(tagX - wordX).toBeCloseTo((100 + 60) * 1.5 / 2 + 10 * 1.5);
  });

  it('is made once and only shown, never re-rasterised on the frame of a tap', () => {
    const tag = readFileSync('src/ui/verdictTag.ts', 'utf8');
    expect(tag).not.toMatch(/setText\(/);
    // The word, its tag and the pill live in one object the three run scenes share.
    const words = readFileSync('src/ui/turnWords.ts', 'utf8');
    expect(words).toContain('this.verdictTag.set(tapTiming(result));');
    expect(words).toMatch(/this\.verdictTag = new VerdictTag\(/);
    // The pill behind the word is as wide as the word and its tag together.
    expect(words).toContain('this.verdictTag.width(this.verdict, pose.scale)');
    for (const scene of ['src/scenes/PlayScene.ts', 'src/scenes/EndlessScene.ts', 'src/scenes/DailyScene.ts']) {
      const source = readFileSync(scene, 'utf8');
      expect(source).toMatch(/this\.words = new TurnWords\(/);
      expect(source).not.toContain('new VerdictTag(');
      expect(source).not.toContain("'Flawless!'");
    }
  });
});
