import { describe, expect, it } from 'vitest';
import { GAMEPLAY_TRACKS, MUSIC } from '../src/config/music';
import { advanceLayers, OPENING_LAYERS } from '../src/game/musicLayers';

describe('how a level earns a layered track', () => {
  it('starts on the first stem and moves one stem a task by the task\'s accuracy', () => {
    expect(OPENING_LAYERS).toBe(1);
    expect(advanceLayers(1, MUSIC.layers.strong, 6)).toBe(2);
    expect(advanceLayers(2, 100, 6)).toBe(3);
    expect(advanceLayers(3, MUSIC.layers.strong - 1, 6)).toBe(3); // between: holds
    expect(advanceLayers(3, MUSIC.layers.weak, 6)).toBe(3);
    expect(advanceLayers(3, MUSIC.layers.weak - 1, 6)).toBe(2);
    expect(advanceLayers(1, 0, 6)).toBe(1); // the first stem is always heard
    expect(advanceLayers(6, 100, 6)).toBe(6); // and there is nothing past the last
  });
  it('is the same rule for a premix, which is always full', () => {
    expect(advanceLayers(1, 100, 1)).toBe(1);
    expect(advanceLayers(1, 0, 1)).toBe(1);
    expect(() => advanceLayers(0, 50, 6)).toThrow(/At least one/);
    expect(() => advanceLayers(1, 50, 0)).toThrow(/at least one stem/);
  });
  it('reaches everything a level can earn inside a strong level of ordinary length, and no more', () => {
    const cap = GAMEPLAY_TRACKS.b.levelStems;
    let layers = OPENING_LAYERS;
    // The synth lead is the last rung: it takes four strong tasks in a row from the drums
    // alone, and a weak task takes it away again before anything else.
    const lead = GAMEPLAY_TRACKS.b.stems.findIndex(stem => stem.id === 'lead') + 1;
    expect(lead).toBe(cap);
    for (let task = 0; task < 3; task++) layers = advanceLayers(layers, 90, cap);
    expect(layers).toBeLessThan(lead);
    layers = advanceLayers(layers, 90, cap);
    expect(layers).toBe(lead);
    expect(advanceLayers(layers, MUSIC.layers.weak - 1, cap)).toBe(lead - 1);
    for (let task = 0; task < 5; task++) layers = advanceLayers(layers, 90, cap);
    expect(layers).toBe(cap);
    // The risers are past the cap: no run, however strong, brings them into a level.
    expect(GAMEPLAY_TRACKS.b.stems.length).toBeGreaterThan(cap);
  });
});
