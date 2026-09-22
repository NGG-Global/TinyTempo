import { describe, expect, it, vi } from 'vitest';
import { PROGRESSION } from '../src/config/progression';
import { levelSpec, starsFor } from '../src/game/levels';
import type { Progress } from '../src/game/progress';
import {
  areaIndexOf, areaOpen, canPlayLevel, firstClosedArea, firstLevelOfArea, gateFor, gateHolds, levelStars, nextGate,
  starsRequired, totalStars,
} from '../src/game/stars';

vi.mock('phaser', () => ({ default: {} }));

/** A save where every level up to `through` was cleared with exactly `stars` stars. */
function road(through: number, stars: 1 | 2 | 3): Progress {
  const best: Record<number, number> = {};
  for (let level = 1; level <= through; level++) best[level] = levelSpec(level).starAccuracy[stars - 1]!;
  return { unlocked: through + 1, best };
}

describe('the star collection', () => {
  it('is the sum of every level’s stars, read from the accuracies rather than stored', () => {
    const progress: Progress = { unlocked: 4, best: { 1: 100, 2: levelSpec(2).starAccuracy[1], 3: levelSpec(3).starAccuracy[0] } };
    expect(levelStars(progress, 1)).toBe(3);
    expect(levelStars(progress, 2)).toBe(2);
    expect(levelStars(progress, 3)).toBe(1);
    expect(levelStars(progress, 4)).toBe(0);
    expect(totalStars(progress)).toBe(6);
    expect(totalStars({ unlocked: 1, best: {} })).toBe(0);
  });

  it('agrees with the map’s own star plates, level by level', () => {
    const progress = road(25, 2);
    for (let level = 1; level <= 25; level++) {
      expect(levelStars(progress, level)).toBe(starsFor(progress.best[level]!, levelSpec(level)));
    }
  });
});

describe('the star gates', () => {
  it('leave the first area free and ask a growing, capped share of each area behind', () => {
    const { firstArea, growth, maxPerArea } = PROGRESSION.starGate;
    expect(starsRequired(0)).toBe(0);
    expect(starsRequired(1)).toBe(firstArea);
    expect(starsRequired(2)).toBe(firstArea + firstArea + growth);
    // Past the cap every area adds the same amount.
    const capAt = Math.ceil((maxPerArea - firstArea) / growth) + 1;
    expect(starsRequired(capAt + 5) - starsRequired(capAt + 4)).toBe(maxPerArea);
    expect(starsRequired(capAt + 9) - starsRequired(capAt + 8)).toBe(maxPerArea);
    expect(starsRequired(-1)).toBe(0);
    expect(starsRequired(2.5)).toBe(0);
  });

  it('never asks for more than the road behind the gate can hold', () => {
    for (let area = 1; area <= 40; area++) {
      expect(starsRequired(area)).toBeLessThanOrEqual(3 * PROGRESSION.areaSize * area);
      expect(starsRequired(area)).toBeGreaterThan(starsRequired(area - 1));
    }
  });

  it('never stops a player who averages 1.4 stars a level, however far they go', () => {
    // 14 stars per ten levels is the cap on what one area may ask, so a bank that grows
    // at that rate is always at or past every requirement. This is the promise that
    // keeps the gates from turning into a backlog for a decent player.
    for (let area = 1; area <= 40; area++) {
      const stars = Math.floor(1.4 * PROGRESSION.areaSize * area);
      expect(areaOpen(area, stars)).toBe(true);
    }
  });

  it('asks a player who scrapes every level for a couple of replays, not a grind', () => {
    // One star everywhere: 10 per area. Short by 2 at the first gate, and by the growth
    // of the share after that, until the cap stops it growing at all.
    const { firstArea, maxPerArea } = PROGRESSION.starGate;
    expect(nextGate(road(10, 1))).toEqual({ area: 1, level: 11, required: firstArea, have: 10, short: firstArea - 10 });
    const scraping = nextGate(road(20, 1));
    expect(scraping.area).toBe(2);
    expect(scraping.short).toBe(starsRequired(2) - 20);
    // Far along, each new area costs the same fixed number of extra stars over one-a-level.
    const far = starsRequired(12) - starsRequired(11);
    expect(far).toBe(maxPerArea);
  });

  it('opens every area a strong start has banked for, so the gates are a bank, not a quota', () => {
    // Three stars through the first two areas is 60. That opens areas 1 to 4 outright
    // (12, 25, 39 and 53) — the player will not see a barrier until their bank runs down.
    const banked = road(20, 3);
    expect(totalStars(banked)).toBe(60);
    expect(firstClosedArea(60)).toBe(5);
    expect(nextGate(banked).level).toBe(firstLevelOfArea(5));
  });

  it('holds only an uncleared level in a closed area, never a level already earned', () => {
    const progress = road(10, 1); // 10 stars, gate 1 asks 12
    expect(gateHolds(progress, 11)).toBe(true);
    expect(canPlayLevel(progress, 11)).toBe(false);
    for (let level = 1; level <= 10; level++) expect(canPlayLevel(progress, level)).toBe(true);
    // Beyond the frontier is not the gate's business; it is simply not reached.
    expect(canPlayLevel(progress, 12)).toBe(false);
    expect(gateFor(progress, 11)).toEqual({ area: 1, level: 11, required: 12, have: 10, short: 2 });
    expect(gateFor(progress, 5)).toBeNull();
  });

  it('lets a restored save keep replaying levels past a gate it has not earned', () => {
    // A code from before the gates existed can carry a frontier deep in a closed area.
    // Every level it cleared stays open — they are exactly what the gate wants replayed —
    // and only the uncleared frontier waits.
    const best: Record<number, number> = {};
    for (let level = 1; level <= 30; level++) best[level] = levelSpec(level).starAccuracy[0];
    const restored: Progress = { unlocked: 31, best };
    expect(totalStars(restored)).toBe(30);
    expect(canPlayLevel(restored, 25)).toBe(true);
    expect(canPlayLevel(restored, 31)).toBe(false);
    expect(gateFor(restored, 31)?.short).toBe(starsRequired(3) - 30);
  });

  it('lifts the moment the count reaches the requirement, and not before', () => {
    const progress = road(10, 1);
    const one = { ...progress, best: { ...progress.best, 1: 100 } }; // 3 stars on level 1: total 12
    expect(nextGate(progress).short).toBe(2);
    expect(canPlayLevel(one, 11)).toBe(true);
    expect(nextGate(one).area).toBe(2);
    const almost = { ...progress, best: { ...progress.best, 1: levelSpec(1).starAccuracy[1] } }; // total 11
    expect(canPlayLevel(almost, 11)).toBe(false);
  });

  it('places areas on the ten-level grid the map draws', () => {
    expect(areaIndexOf(1)).toBe(0);
    expect(areaIndexOf(10)).toBe(0);
    expect(areaIndexOf(11)).toBe(1);
    expect(firstLevelOfArea(0)).toBe(1);
    expect(firstLevelOfArea(3)).toBe(31);
  });
});
