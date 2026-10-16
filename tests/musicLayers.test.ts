import { describe, expect, it, vi } from 'vitest';
import { GAMEPLAY_TRACKS } from '../src/config/music';
import { levelSpec } from '../src/game/levels';
import { advanceLayers, OPENING_LAYERS } from '../src/game/musicLayers';
import { levelBars, VERDICT } from '../src/game/taskVerdict';

vi.mock('phaser', () => ({ default: {} }));

/** Level 1's bars: clear at 40, the second star at 60. */
const L1 = levelBars(levelSpec(1));

describe('how a level earns a layered track', () => {
  it('starts on the first stem and moves one stem a task by the task\'s accuracy against the level\'s bars', () => {
    expect(OPENING_LAYERS).toBe(1);
    expect(L1).toEqual({ clear: 40, strong: 60 });
    expect(advanceLayers(1, L1.strong, 6, L1)).toBe(2);
    expect(advanceLayers(2, 100, 6, L1)).toBe(3);
    expect(advanceLayers(3, L1.strong - 1, 6, L1)).toBe(3); // between: holds
    expect(advanceLayers(3, L1.clear - VERDICT.partialBand, 6, L1)).toBe(3); // a near miss holds too
    expect(advanceLayers(3, L1.clear - VERDICT.partialBand - 1, 6, L1)).toBe(2); // a rough task loses one
    expect(advanceLayers(1, 0, 6, L1)).toBe(1); // the first stem is always heard
    expect(advanceLayers(6, 100, 6, L1)).toBe(6); // and there is nothing past the last
  });
  it('asks more of a harder level: the plateau earns a stem only at its second star', () => {
    const plateau = levelBars(levelSpec(120));
    expect(plateau).toEqual({ clear: 80, strong: 87 });
    // 75% was a strong task everywhere once; on the plateau it is under the bar, and holds.
    expect(advanceLayers(3, 75, 6, L1)).toBe(4);
    expect(advanceLayers(3, 75, 6, plateau)).toBe(3);
    expect(advanceLayers(3, 64, 6, plateau)).toBe(2);
  });
  it('is the same rule for a premix, which is always full', () => {
    expect(advanceLayers(1, 100, 1, L1)).toBe(1);
    expect(advanceLayers(1, 0, 1, L1)).toBe(1);
    expect(() => advanceLayers(0, 50, 6, L1)).toThrow(/At least one/);
    expect(() => advanceLayers(1, 50, 0, L1)).toThrow(/at least one stem/);
  });
  it('reaches everything a level can earn inside a strong level of ordinary length, and no more', () => {
    const cap = GAMEPLAY_TRACKS.b.levelStems;
    let layers = OPENING_LAYERS;
    // The synth lead is the last rung: it takes four strong tasks from the drums alone, and
    // a rough task takes it away again before anything else.
    const lead = GAMEPLAY_TRACKS.b.stems.findIndex(stem => stem.id === 'lead') + 1;
    expect(lead).toBe(cap);
    for (let task = 0; task < 3; task++) layers = advanceLayers(layers, 90, cap, L1);
    expect(layers).toBeLessThan(lead);
    layers = advanceLayers(layers, 90, cap, L1);
    expect(layers).toBe(lead);
    expect(advanceLayers(layers, 0, cap, L1)).toBe(lead - 1);
    for (let task = 0; task < 5; task++) layers = advanceLayers(layers, 90, cap, L1);
    expect(layers).toBe(cap);
    // The risers are past the cap: no run, however strong, brings them into a level.
    expect(GAMEPLAY_TRACKS.b.stems.length).toBeGreaterThan(cap);
  });
});
