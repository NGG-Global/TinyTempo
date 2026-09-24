import { describe, expect, it, vi } from 'vitest';
import { APPLE_LOOKS, appleLook } from '../src/vignettes/appleLooks';
import { SLUSHY_LOOKS, slushyLook } from '../src/vignettes/slushyLooks';
import { definitionForLap } from '../src/vignettes/Vignette';
import { VIGNETTES } from '../src/vignettes/registry';
import { actLevel, levelSpec } from '../src/game/levels';

vi.mock('phaser', () => ({ default: {} }));

const colour = (value: number) => Number.isInteger(value) && value >= 0 && value <= 0xffffff;
const apple = VIGNETTES.find(v => v.id === 'apple')!;

describe('picnic looks', () => {
  it('puts an apple, a pear, a peach and a donut on the plate, in that order', () => {
    expect(APPLE_LOOKS.map(l => l.id)).toEqual(['apple', 'pear', 'peach', 'donut']);
    expect(appleLook(0).id).toBe('apple');
    expect(appleLook(APPLE_LOOKS.length)).toBe(appleLook(0));
    expect(appleLook(2.6)).toBe(appleLook(2));
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) expect(appleLook(bad)).toBe(appleLook(0));
    expect(levelSpec(25).vignette).toBe('apple');
    expect(levelSpec(25).lap).toBe(0);
    expect(appleLook(levelSpec(actLevel('apple', 1)).lap).id).toBe('pear');
    expect(actLevel('apple', 1)).toBe(50);
    expect(appleLook(levelSpec(actLevel('apple', 3)).lap).id).toBe('donut');
  });

  it('keeps the apple exactly as it was on the first lap', () => {
    const first = appleLook(0);
    if (first.kind !== 'fruit') throw new Error('lap 0 must be the apple');
    for (const p of [0, 0.25, 0.5, 0.8, 1]) expect(first.width(p)).toBeCloseTo(86 + 44 * Math.sin(p * Math.PI) - 12 * p, 10);
    expect(first.skin).toBe(0xd94b3f);
    expect(first.worm).toEqual([41, -57]);
    expect(first.copy).toEqual({});
  });

  it('gives every fruit a bounded silhouette with room for the core and the worm', () => {
    for (const look of APPLE_LOOKS) {
      for (const key of ['dough', 'doughInk', 'icing', 'icingInk', 'skin', 'skinInk', 'peelInk', 'flesh', 'fleshInk', 'dots', 'coreColour'] as const) {
        if (key in look) expect(colour((look as unknown as Record<string, number>)[key]!), `${look.id}.${key}`).toBe(true);
      }
      expect(look.crumbs.every(colour)).toBe(true);
      if (look.kind === 'donut') {
        expect(look.sprinkles.length).toBeGreaterThanOrEqual(3);
        expect(look.sprinkles.every(colour)).toBe(true);
        continue;
      }
      for (let i = 0; i <= 40; i++) {
        const w = look.width(i / 40);
        // Bites carve down to a 28-unit core; the whole fruit stays on the plate.
        expect(w).toBeGreaterThanOrEqual(28);
        expect(w).toBeLessThan(160);
      }
      // The worm surfaces inside what a failed round leaves: the right side, three bites in.
      const [x, y] = look.worm;
      const p = (y + 105) / 230;
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThan(1);
      expect(x).toBeLessThan(look.width(p) - 0.64 * (look.width(p) - 28) - 12);
    }
  });

  it('names the pear, the peach and the donut on the map and in the verdict', () => {
    expect(apple.looks).toHaveLength(APPLE_LOOKS.length);
    expect(definitionForLap(apple, 0)).toBe(apple);
    const titles = [0, 1, 2, 3, 4].map(lap => definitionForLap(apple, lap).title);
    expect(titles).toEqual(['Apple', 'Pear', 'Peach', 'Donut', 'Apple']);
    const donut = definitionForLap(apple, 3);
    expect(donut.rough[1]).not.toMatch(/apple|worm/i);
    expect(donut.success[0]).not.toBe(apple.success[0]);
    // Everything that is not wording is the apple's, so judgement and timing cannot drift.
    for (const lap of [1, 2, 3]) {
      const look = definitionForLap(apple, lap);
      expect(look.id).toBe('apple');
      expect(look.successAccuracy).toBe(apple.successAccuracy);
      expect(look.endingHoldBeats).toBe(apple.endingHoldBeats);
      expect(look.endingSec).toBe(apple.endingSec);
      expect(look.sounds).toBe(apple.sounds);
      expect(definitionForLap(apple, lap)).toBe(look);
      for (const words of [look.success, look.rough]) expect(words).toHaveLength(2);
    }
    // An act without wording per look is returned as it is.
    const slushy = VIGNETTES.find(v => v.id === 'slushy')!;
    expect(definitionForLap(slushy, 3)).toBe(slushy);
    for (const bad of [-1, Number.NaN]) expect(definitionForLap(apple, bad)).toBe(apple);
  });

  it('pours a different flavour on each lap and starts with the berry', () => {
    expect(SLUSHY_LOOKS.map(l => l.id)).toEqual(['berry', 'blue', 'lime', 'orange', 'grape']);
    expect(slushyLook(0).drink).toBe(0xd96a92);
    expect(slushyLook(0).stripe).toBe(0xd94f6b);
    expect(slushyLook(SLUSHY_LOOKS.length)).toBe(slushyLook(0));
    for (const bad of [-1, Number.NaN]) expect(slushyLook(bad)).toBe(slushyLook(0));
    expect(new Set(SLUSHY_LOOKS.map(l => l.drink)).size).toBe(SLUSHY_LOOKS.length);
    for (const look of SLUSHY_LOOKS) {
      for (const key of ['drink', 'deep', 'surface', 'ice', 'syrup', 'sip', 'stripe', 'fruit', 'fruitInk'] as const) {
        expect(colour(look[key]), `${look.id}.${key}`).toBe(true);
      }
    }
    expect(levelSpec(24).vignette).toBe('slushy');
    expect(slushyLook(levelSpec(actLevel('slushy', 1)).lap).id).toBe('blue');
    expect(actLevel('slushy', 1)).toBe(49);
  });
});
