import { describe, expect, it, vi } from 'vitest';
import { LIGHT_LOOKS, lightLook } from '../src/vignettes/lightLooks';
import { actLevel, levelSpec } from '../src/game/levels';

vi.mock('phaser', () => ({ default: {} }));

describe('light switch interiors', () => {
  it('opens a different room on each lap of the rotation', () => {
    expect(LIGHT_LOOKS.length).toBe(4);
    expect(new Set(LIGHT_LOOKS.map(l => l.id)).size).toBe(LIGHT_LOOKS.length);
    expect(new Set(LIGHT_LOOKS.map(l => l.interior)).size).toBe(LIGHT_LOOKS.length);
    expect(new Set(LIGHT_LOOKS.map(l => l.wall)).size).toBe(LIGHT_LOOKS.length);
    // The first visit keeps the original sage salon.
    expect(lightLook(0).id).toBe('salon');
    expect(lightLook(0).interior).toBe('salon');
    expect(lightLook(0).wall).toBe(0x678c80);
    expect(lightLook(1).id).toBe('kitchen');
    expect(lightLook(2).id).toBe('study');
    expect(lightLook(3).id).toBe('bedroom');
    expect(lightLook(LIGHT_LOOKS.length)).toBe(lightLook(0));
    expect(lightLook(1.7)).toBe(lightLook(1));
    for (const bad of [-3, Number.NaN, Number.NEGATIVE_INFINITY]) expect(lightLook(bad)).toBe(lightLook(0));
    for (const look of LIGHT_LOOKS) {
      for (const key of ['wall', 'wallMark', 'floor', 'floorGrain', 'trim', 'curtain', 'rug', 'furniture', 'furnitureLit', 'accent'] as const) {
        expect(Number.isInteger(look[key]) && look[key] >= 0 && look[key] <= 0xffffff).toBe(true);
      }
    }
    expect(levelSpec(12).vignette).toBe('light');
    expect(levelSpec(12).lap).toBe(0);
    expect(levelSpec(actLevel('light', 1)).lap).toBe(1);
    expect(levelSpec(actLevel('light', 3)).lap).toBe(3);
  });
});
