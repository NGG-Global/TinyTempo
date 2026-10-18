import { describe, expect, it, vi } from 'vitest';
import { PROGRESSION } from '../src/config/progression';
import { ENDLESS } from '../src/config/endless';
import { actLevel, levelSpec } from '../src/game/levels';
import { DEBUT_LEVELS, VIGNETTES } from '../src/vignettes/registry';
import { checkDebuts, levelAt, placementAt, type DebutSchedule } from '../src/vignettes/rotation';
import endlessFixture from './fixtures/endless-rules-v1.json';

vi.mock('phaser', () => ({ default: {} }));

const AREA = PROGRESSION.areaSize;

describe('the debut schedule', () => {
  it('gives every act in the registry one debut, in order, never on a finale', () => {
    expect(() => checkDebuts(DEBUT_LEVELS, VIGNETTES.length, AREA)).not.toThrow();
    // An appended act without a debut level would never play: the table must say where it arrives.
    expect(() => checkDebuts(DEBUT_LEVELS, VIGNETTES.length + 1, AREA)).toThrow();
  });

  it('refuses a schedule that skips, repeats, reorders or lands on a finale', () => {
    const bad: readonly (readonly number[])[] = [[], [2, 3], [1, 1, 3], [1, 3, 2], [1, 2.5], [1, 10], [1, 0]];
    for (const debuts of bad) expect(() => checkDebuts(debuts, debuts.length || 1, AREA), debuts.join(',')).toThrow();
  });

  it('introduces at least one act in every area until the cast is complete', () => {
    const last = DEBUT_LEVELS.at(-1)!;
    const lastArea = Math.ceil(last / AREA);
    for (let area = 1; area <= lastArea; area++) {
      const debuts = DEBUT_LEVELS.filter(level => Math.ceil(level / AREA) === area);
      expect(debuts.length, `area ${area}`).toBeGreaterThanOrEqual(1);
      // On an area's opener or its first pattern level, past the first area's run of one a level.
      if (area > 2) for (const level of debuts) expect((level - 1) % AREA, `level ${level}`).toBeLessThan(2);
    }
  });

  it('plays each act first on its debut level, and nothing new anywhere else', () => {
    const met = new Set<number>();
    for (let level = 1; level <= 400; level++) {
      const { index, lap } = placementAt(DEBUT_LEVELS, level);
      const debut = DEBUT_LEVELS.indexOf(level);
      if (debut >= 0) {
        expect({ index, lap }, `level ${level}`).toEqual({ index: debut, lap: 0 });
      } else {
        expect(met.has(index), `level ${level} plays act ${index} before its debut`).toBe(true);
      }
      met.add(index);
    }
    expect(met.size).toBe(VIGNETTES.length);
  });

  it('keeps levels 1–9 as they always were', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(level => levelSpec(level).vignette))
      .toEqual(['hammer', 'window', 'bug', 'saw', 'tomato', 'curl', 'cucumber', 'banana', 'paper']);
  });

  it('has met exactly the Endless pool, in its order, when Endless opens', () => {
    const met: string[] = [];
    for (let level = 1; level <= ENDLESS.unlockLevel; level++) {
      const id = levelSpec(level).vignette;
      if (!met.includes(id)) met.push(id);
    }
    expect(met).toEqual(endlessFixture.pool);
  });

  it('never plays one act two levels running, and spaces repeats evenly', () => {
    for (let level = 2; level <= 600; level++) {
      expect(levelSpec(level).vignette, `level ${level}`).not.toBe(levelSpec(level - 1).vignette);
    }
    // Once the cast is complete, every act plays exactly once in any run of that many levels.
    const from = DEBUT_LEVELS.at(-1)! + 1;
    for (let start = from; start < from + 100; start++) {
      const run = new Set<number>();
      for (let level = start; level < start + VIGNETTES.length; level++) run.add(placementAt(DEBUT_LEVELS, level).index);
      expect(run.size, `levels ${start}+`).toBe(VIGNETTES.length);
    }
  });

  it('reads the same backwards as forwards, for every act and lap', () => {
    for (let level = 1; level <= 1200; level++) {
      const { index, lap } = placementAt(DEBUT_LEVELS, level);
      expect(levelAt(DEBUT_LEVELS, index, lap)).toBe(level);
      expect(actLevel(VIGNETTES[index]!.id, lap)).toBe(level);
    }
  });

  it('counts each act’s own visits as its lap, on any schedule', () => {
    const debuts: DebutSchedule = [1, 2, 5, 11, 12];
    checkDebuts(debuts, 5, AREA);
    const seen = new Map<number, number>();
    for (let level = 1; level <= 80; level++) {
      const { index, lap } = placementAt(debuts, level);
      expect(lap, `level ${level}`).toBe(seen.get(index) ?? 0);
      seen.set(index, lap + 1);
      expect(levelAt(debuts, index, lap)).toBe(level);
    }
    // Two acts alternate until the third arrives; it then waits its turn behind them.
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(level => placementAt(debuts, level).index)).toEqual([0, 1, 0, 1, 2, 0, 1, 2]);
  });

  it('places nonsense as level 1 and refuses to invent a level for one', () => {
    for (const level of [0, -4, Number.NaN, Number.NEGATIVE_INFINITY]) expect(placementAt(DEBUT_LEVELS, level)).toEqual({ index: 0, lap: 0 });
    expect(placementAt(DEBUT_LEVELS, 2.9)).toEqual(placementAt(DEBUT_LEVELS, 2));
    expect(() => levelAt(DEBUT_LEVELS, -1, 0)).toThrow();
    expect(() => levelAt(DEBUT_LEVELS, 0, 1.5)).toThrow();
    expect(() => levelAt(DEBUT_LEVELS, VIGNETTES.length, 0)).toThrow();
    expect(() => actLevel('nobody', 0)).toThrow();
  });
});
