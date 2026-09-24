import { describe, expect, it, vi } from 'vitest';
import { actLevel, levelSpec } from '../src/game/levels';
import { ROTATION, VIGNETTES } from '../src/vignettes/registry';
import { checkRotation, levelAt, placementAt, type RotationEra } from '../src/vignettes/rotation';

vi.mock('phaser', () => ({ default: {} }));

describe('the rotation', () => {
  it('is a table every level can be placed in, ending on the whole registry', () => {
    expect(() => checkRotation(ROTATION, VIGNETTES.length)).not.toThrow();
    // An appended act that no era carries would never play; the table must say where it joins.
    expect(() => checkRotation(ROTATION, VIGNETTES.length + 1)).toThrow();
  });

  it('refuses a table that would reassign or skip levels', () => {
    const bad: readonly (readonly RotationEra[])[] = [
      [],
      [{ fromLevel: 2, acts: 3 }],
      [{ fromLevel: 1, acts: 3 }, { fromLevel: 7, acts: 3 }],
      [{ fromLevel: 1, acts: 4 }, { fromLevel: 7, acts: 3 }],
      [{ fromLevel: 1, acts: 3 }, { fromLevel: 8, acts: 4 }],
      [{ fromLevel: 1, acts: 3 }, { fromLevel: 1, acts: 4 }],
      [{ fromLevel: 1, acts: 0 }],
    ];
    for (const eras of bad) expect(() => checkRotation(eras, eras.at(-1)?.acts ?? 1)).toThrow();
  });

  it('keeps levels 1–50 exactly as the single rotation had them, so no keepsake moves', () => {
    for (let level = 1; level <= 50; level++) {
      const spec = levelSpec(level);
      expect(spec.vignette, `level ${level}`).toBe(VIGNETTES[(level - 1) % 25]!.id);
      expect(spec.lap, `level ${level}`).toBe(Math.floor((level - 1) / 25));
    }
  });

  it('opens its second era on the acts it adds, then runs in registry order', () => {
    expect([51, 52, 53, 54, 55].map(level => levelSpec(level).vignette)).toEqual(['barber', 'popcorn', 'toothbrush', 'hammer', 'window']);
    expect([51, 52, 53].map(level => levelSpec(level).lap)).toEqual([0, 0, 0]);
    // The first twenty-five come back for their third look.
    expect(levelSpec(54).lap).toBe(2);
    expect(levelSpec(78)).toMatchObject({ vignette: 'apple', lap: 2 });
    expect(levelSpec(79)).toMatchObject({ vignette: 'barber', lap: 1 });
    // The third era starts past every keepsake and opens on the act it adds.
    expect(levelSpec(106).vignette).not.toBe('paintbrush');
    expect(levelSpec(107)).toMatchObject({ vignette: 'paintbrush', lap: 0 });
  });

  it('reads the same backwards as forwards, for every act and lap', () => {
    for (let level = 1; level <= 600; level++) {
      const { index, lap } = placementAt(ROTATION, level);
      expect(levelAt(ROTATION, index, lap)).toBe(level);
      expect(actLevel(VIGNETTES[index]!.id, lap)).toBe(level);
    }
  });

  it('counts each act’s own visits as its lap, across any number of eras', () => {
    const eras: readonly RotationEra[] = [{ fromLevel: 1, acts: 2 }, { fromLevel: 5, acts: 3 }, { fromLevel: 11, acts: 5 }];
    checkRotation(eras, 5);
    const seen = new Map<number, number>();
    for (let level = 1; level <= 60; level++) {
      const { index, lap } = placementAt(eras, level);
      expect(lap, `level ${level}`).toBe(seen.get(index) ?? 0);
      seen.set(index, lap + 1);
      expect(levelAt(eras, index, lap)).toBe(level);
    }
    // Levels 1–4 are the first era's, and each later era opens on what it added.
    expect([1, 2, 3, 4, 5, 11, 12].map(level => placementAt(eras, level).index)).toEqual([0, 1, 0, 1, 2, 3, 4]);
  });

  it('places nonsense as level 1 and refuses to invent a level for one', () => {
    for (const level of [0, -4, Number.NaN, Number.NEGATIVE_INFINITY]) expect(placementAt(ROTATION, level)).toEqual({ index: 0, lap: 0 });
    expect(placementAt(ROTATION, 2.9)).toEqual(placementAt(ROTATION, 2));
    expect(() => levelAt(ROTATION, -1, 0)).toThrow();
    expect(() => levelAt(ROTATION, 0, 1.5)).toThrow();
    expect(() => levelAt(ROTATION, VIGNETTES.length, 0)).toThrow();
    expect(() => actLevel('nobody', 0)).toThrow();
  });
});
