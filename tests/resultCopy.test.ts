import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { AREAS, levelSpec } from '../src/game/levels';
import { nextGateChip, nextStarCopy, offersReplay, replayCopy, thresholdLabels } from '../src/game/resultCopy';
import { contrastRatio } from '../src/ui/colour';

vi.mock('phaser', () => ({ default: {} }));

const pinned = JSON.parse(readFileSync(new URL('./fixtures/level-thresholds.json', import.meta.url), 'utf8')) as Record<string, [number, number, number]>;

describe('the result’s words', () => {
  it('labels each seat with the threshold the level actually scores against', () => {
    for (let level = 1; level <= 200; level++) {
      const spec = levelSpec(level);
      expect(thresholdLabels(spec)).toEqual(spec.starAccuracy.map(a => `${a}%`));
    }
    // Read from the spec, so the pinned thresholds and the chips cannot drift apart.
    for (const [level, thresholds] of Object.entries(pinned)) {
      expect(thresholdLabels(levelSpec(Number(level)))).toEqual(thresholds.map(a => `${a}%`));
    }
    expect(thresholdLabels(levelSpec(14))).toEqual(['56%', '71%', '85%']);
  });

  it('names the next star, and nothing once all three are earned', () => {
    const at = levelSpec(14).starAccuracy;
    expect(nextStarCopy(0, at)).toBe('First star at 56%');
    expect(nextStarCopy(1, at)).toBe('Second star at 71%');
    expect(nextStarCopy(2, at)).toBe('Third star at 85%');
    expect(nextStarCopy(3, at)).toBeNull();
    for (const bad of [-1, 4, 1.5, Number.NaN]) expect(nextStarCopy(bad, at)).toBeNull();
  });

  it('offers a replay on every clear short of three stars, and never instead of Try again', () => {
    expect(offersReplay(true, 1)).toBe(true);
    expect(offersReplay(true, 2)).toBe(true);
    expect(offersReplay(true, 3)).toBe(false);
    expect(offersReplay(false, 0)).toBe(false);
    expect(replayCopy(14)).toBe('Replay level 14');
  });

  it('tells a cleared finale whether the next area is open, in that area’s own colours', () => {
    const sand = AREAS[2]!;
    expect(nextGateChip(20, 57)).toEqual({ text: 'Sand is open', open: true, ground: sand.ground, ink: sand.ink });
    expect(nextGateChip(20, 25)).toMatchObject({ text: 'Sand is open', open: true });
    expect(nextGateChip(20, 24)).toMatchObject({ text: 'Sand opens at 25', open: false });
    expect(nextGateChip(10, 3)).toMatchObject({ text: 'Pavement opens at 12', open: false, ground: AREAS[1]!.ground });
    // The areas cycle, and a repeat carries its numeral.
    expect(nextGateChip(50, 0).text).toMatch(/^Grass II opens at \d+$/);
  });

  it('keeps every area’s chip readable: its ink on its own ground', () => {
    for (const area of AREAS) expect(contrastRatio(area.ink, area.ground), area.name).toBeGreaterThanOrEqual(4.5);
  });
});
