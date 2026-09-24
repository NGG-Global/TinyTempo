import { describe, expect, it, vi } from 'vitest';
import { DOOR_LOOKS, doorLook } from '../src/vignettes/doorLooks';
import { actLevel, levelSpec } from '../src/game/levels';

vi.mock('phaser', () => ({ default: {} }));

describe('doorbell doors', () => {
  it('puts a different leaf on the frame on each lap of the rotation', () => {
    expect(DOOR_LOOKS.length).toBe(4);
    expect(new Set(DOOR_LOOKS.map(l => l.id)).size).toBe(DOOR_LOOKS.length);
    expect(new Set(DOOR_LOOKS.map(l => l.style)).size).toBe(DOOR_LOOKS.length);
    expect(new Set(DOOR_LOOKS.map(l => l.door)).size).toBe(DOOR_LOOKS.length);
    // The first visit keeps the original teal four-panel.
    expect(doorLook(0).id).toBe('teal');
    expect(doorLook(0).style).toBe('panels');
    expect(doorLook(0).door).toBe(0x527e73);
    expect(doorLook(1).id).toBe('crimson');
    expect(doorLook(2).id).toBe('ochre');
    expect(doorLook(3).id).toBe('navy');
    expect(doorLook(DOOR_LOOKS.length)).toBe(doorLook(0));
    expect(doorLook(2.4)).toBe(doorLook(2));
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) expect(doorLook(bad)).toBe(doorLook(0));
    for (const look of DOOR_LOOKS) {
      for (const key of ['brick', 'brickInk', 'mortar', 'frame', 'frameInk', 'door', 'doorShade', 'panel', 'panelInk', 'panelLit', 'hardware', 'hardwareLit'] as const) {
        expect(Number.isInteger(look[key]) && look[key] >= 0 && look[key] <= 0xffffff).toBe(true);
      }
    }
    expect(levelSpec(13).vignette).toBe('doorbell');
    expect(levelSpec(13).lap).toBe(0);
    expect(levelSpec(actLevel('doorbell', 1)).lap).toBe(1);
    expect(levelSpec(actLevel('doorbell', 3)).lap).toBe(3);
  });
});
