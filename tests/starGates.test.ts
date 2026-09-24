import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { PROGRESSION } from '../src/config/progression';
import { levelSpec } from '../src/game/levels';
import { recordResult, type Progress } from '../src/game/progress';
import {
  formatGateCurve, gateCurve, starsRequiredFor, validateGateCurve, type GateStep, type StarGateKnobs,
} from '../src/game/starGates';
import { canPlayLevel, starsRequired } from '../src/game/stars';

vi.mock('phaser', () => ({ default: {} }));

interface Snapshot {
  readonly knobs: StarGateKnobs;
  readonly report: string;
  readonly areas: readonly GateStep[];
}

const snapshot = JSON.parse(readFileSync(new URL('./fixtures/star-gates.json', import.meta.url), 'utf8')) as Snapshot;

/** A save where every level up to `through` was cleared with exactly `stars` stars. */
function road(through: number, stars: 1 | 2 | 3): Progress {
  const best: Record<number, number> = {};
  for (let level = 1; level <= through; level++) best[level] = levelSpec(level).starAccuracy[stars - 1]!;
  return { unlocked: through + 1, best };
}

describe('the shipped star-gate curve', () => {
  it('still asks 12 to leave the first area, then 25, 39 and 53', () => {
    expect(PROGRESSION.starGate).toEqual({ firstArea: 12, growth: 1, maxPerArea: 14 });
    expect([0, 1, 2, 3, 4].map(starsRequired)).toEqual([0, 12, 25, 39, 53]);
    expect(starsRequired(1)).toBe(starsRequiredFor(1));
  });

  it('matches the areas 1–20 report', () => {
    const steps = gateCurve(20);
    expect(snapshot.knobs).toEqual(PROGRESSION.starGate);
    expect(steps).toEqual(snapshot.areas);
    expect(formatGateCurve(steps)).toBe(snapshot.report);
    expect(validateGateCurve(steps)).toEqual([]);
  });

  it('climbs at every area and never adds more than the cap', () => {
    const steps = gateCurve(40);
    const { maxPerArea } = PROGRESSION.starGate;
    for (let i = 1; i < steps.length; i++) {
      const step = steps[i]!;
      const previous = steps[i - 1]!;
      expect(step.required).toBeGreaterThan(previous.required);
      expect(step.added).toBeLessThanOrEqual(maxPerArea);
    }
    const firstCapped = steps.find(step => step.capped);
    expect(firstCapped?.added).toBe(maxPerArea);
    expect(steps.filter(step => step.capped).every(step => step.added === maxPerArea)).toBe(true);
  });

  it('rejects a curve that could never be earned', () => {
    const harsh: StarGateKnobs = { firstArea: 100, growth: 0, maxPerArea: 100 };
    const problems = validateGateCurve(gateCurve(3, harsh), harsh);
    expect(problems.some(problem => problem.includes('only 30 can be earned'))).toBe(true);
    // A softer first ask is a preview, not a change to production.
    const softer: StarGateKnobs = { firstArea: 10, growth: 1, maxPerArea: 14 };
    expect(validateGateCurve(gateCurve(20, softer), softer)).toEqual([]);
    expect(gateCurve(2, softer)[1]?.required).toBe(10);
    expect(starsRequired(1)).toBe(12);
  });
});

describe('a closed gate never locks the campaign', () => {
  it('opens the frontier once a replay brings the collection up to the ask', () => {
    const before = road(10, 1);
    expect(starsRequired(1)).toBe(12);
    expect(canPlayLevel(before, 11)).toBe(false);
    const improved = recordResult(before, 4, levelSpec(4).starAccuracy[2]!).progress;
    expect(canPlayLevel(improved, 11)).toBe(true);
    expect(canPlayLevel(improved, 4)).toBe(true);
  });

  it('leaves every cleared level replayable while the frontier waits', () => {
    const held = road(10, 1);
    for (let level = 1; level <= 10; level++) expect(canPlayLevel(held, level)).toBe(true);
    expect(canPlayLevel(held, 11)).toBe(false);

    const best: Record<number, number> = {};
    for (let level = 1; level <= 30; level++) best[level] = levelSpec(level).starAccuracy[0]!;
    const restored: Progress = { unlocked: 31, best };
    for (let level = 1; level <= 30; level++) expect(canPlayLevel(restored, level)).toBe(true);
    expect(canPlayLevel(restored, 31)).toBe(false);
  });

  it('always leaves something to play, however far a one-star road has reached', () => {
    for (let through = 0; through <= 80; through++) {
      const progress = through === 0 ? { unlocked: 1, best: {} } : road(through, 1);
      let playable = 0;
      for (let level = 1; level <= progress.unlocked; level++) {
        if (canPlayLevel(progress, level)) playable++;
      }
      expect(playable, `through ${through}`).toBeGreaterThan(0);
    }
  });
});
