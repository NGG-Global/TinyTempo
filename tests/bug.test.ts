import { describe, expect, it, vi } from 'vitest';
import { BUG_LOOKS, bugLook } from '../src/vignettes/bugLooks';
import { actLevel, levelSpec } from '../src/game/levels';

vi.mock('phaser', () => ({ default: {} }));

describe('bug and shoe looks', () => {
  it('sends a different bug and sneaker out on each lap of the rotation', () => {
    expect(BUG_LOOKS.length).toBeGreaterThanOrEqual(3);
    expect(new Set(BUG_LOOKS.map(l => l.id)).size).toBe(BUG_LOOKS.length);
    expect(new Set(BUG_LOOKS.map(l => l.body)).size).toBe(BUG_LOOKS.length);
    expect(new Set(BUG_LOOKS.map(l => l.markings)).size).toBe(BUG_LOOKS.length);
    // The first visit keeps the original plum bug and slate sneaker.
    expect(bugLook(0).id).toBe('plum');
    expect(bugLook(0).upper).toBe(0x303f43);
    expect(bugLook(BUG_LOOKS.length)).toBe(bugLook(0));
    for (const bad of [-3, Number.NaN, Number.NEGATIVE_INFINITY]) expect(bugLook(bad)).toBe(bugLook(0));
    for (const look of BUG_LOOKS) {
      for (const key of ['body', 'marking', 'upper', 'trim'] as const) {
        expect(Number.isInteger(look[key]) && look[key] >= 0 && look[key] <= 0xffffff).toBe(true);
      }
    }
    // Its introduction stays at level 3; the lap only changes on later rotations.
    expect(levelSpec(3).vignette).toBe('bug');
    expect(levelSpec(3).lap).toBe(0);
    expect(levelSpec(actLevel('bug', 1)).lap).toBe(1);
    expect(levelSpec(actLevel('bug', 2)).lap).toBe(2);
  });
});
