import { describe, expect, it, vi } from 'vitest';
import { arrangementForLevel } from '../src/game/musicSelection';
import { ROTATION, VIGNETTES } from '../src/vignettes/registry';
import { levelSpec } from '../src/game/levels';
vi.mock('phaser', () => ({ default: {} }));

describe('stable music chapters', () => {
  it.each([[1, 'a'], [25, 'a'], [26, 'b'], [50, 'b'], [51, 'a'], [63, 'a'], [75, 'a'], [76, 'b'], [100, 'b'], [101, 'a'], [126, 'b'], [10000, 'b']] as const)(
    'selects level %i deterministically as %s', (level, expected) => {
      expect(arrangementForLevel(level)).toBe(expected);
      expect(arrangementForLevel(level)).toBe(expected);
    });
  it('derives chapters from the original rotation, not the expanded registry or per-act visual lap', () => {
    expect(VIGNETTES.length).toBeGreaterThan(ROTATION[0]!.acts);
    expect(arrangementForLevel(ROTATION[0]!.acts)).toBe('a');
    expect(arrangementForLevel(ROTATION[0]!.acts + 1)).toBe('b');
    expect(levelSpec(76).lap % 2).toBe(0);
    expect(arrangementForLevel(76)).toBe('b');
  });
  it('uses the supplied chapter size rather than a hidden 25 literal', () => {
    for (const size of [7, 28, 29]) {
      expect(arrangementForLevel(size, size)).toBe('a');
      expect(arrangementForLevel(size + 1, size)).toBe('b');
      expect(arrangementForLevel(size * 2 + 1, size)).toBe('a');
      expect(arrangementForLevel(size * 13 + 1, size)).toBe('b');
    }
  });
  it('does not modify level tasks, difficulty, or visual placement', () => {
    const before = [25, 26, 50, 51, 76, 107].map(levelSpec);
    for (const spec of before) arrangementForLevel(spec.level);
    expect(before.map(spec => levelSpec(spec.level))).toEqual(before);
  });
});
