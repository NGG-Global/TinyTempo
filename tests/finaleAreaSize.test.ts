import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: {} }));
// The whole finale derivation under an area of four levels. Nothing may assume ten.
vi.mock('../src/config/progression', async original => {
  const { PROGRESSION } = await original<typeof import('../src/config/progression')>();
  const steps = PROGRESSION.choreography.steps;
  return {
    PROGRESSION: {
      ...PROGRESSION,
      areaSize: 4,
      choreography: { ...PROGRESSION.choreography, steps: [steps[0], steps[1], steps[8], steps[9]] },
    },
  };
});

const { PROGRESSION } = await import('../src/config/progression');
const { areaRepertoire, isAreaFinale, levelSpec } = await import('../src/game/levels');
const { areaFinale, areaTrail, nextFinale } = await import('../src/game/finale');

describe('finales under another area size', () => {
  it('fall on every fourth level when an area is four levels long', () => {
    expect(PROGRESSION.areaSize).toBe(4);
    const found = Array.from({ length: 24 }, (_, i) => i + 1).filter(isAreaFinale);
    expect(found).toEqual([4, 8, 12, 16, 20, 24]);
    for (let level = 1; level <= 24; level++) expect(levelSpec(level).finale).toBe(level % 4 === 0);
    expect(areaFinale(4)).toMatchObject({ area: 1, areaName: 'Grass', nextAreaName: 'Pavement' });
    expect(areaFinale(8)).toMatchObject({ area: 2, areaName: 'Pavement' });
    expect(areaFinale(10)).toBeNull();
  });

  it('reprise only the area’s own three levels, and trail four beads', () => {
    const own = new Set([5, 6, 7].flatMap(level => levelSpec(level).tasks.map(t => t.pattern)));
    expect(areaRepertoire(8).every(task => own.has(task.pattern))).toBe(true);
    for (const task of levelSpec(8).tasks) expect(own.has(task.pattern)).toBe(true);
    expect(areaTrail(6).map(b => [b.level, b.finale])).toEqual([[5, false], [6, false], [7, false], [8, true]]);
    expect(nextFinale(6)).toEqual({ level: 8, away: 2 });
  });
});
