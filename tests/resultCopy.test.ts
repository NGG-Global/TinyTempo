import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { AREAS, levelSpec, starsFor } from '../src/game/levels';
import { nextGateChip, nextStarCopy, offersReplay, replayCopy, scoreLabel, thresholdLabels } from '../src/game/resultCopy';
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
    // Dusk opens onto Garden; the areas then cycle, and a repeat carries its numeral.
    expect(nextGateChip(50, 0)).toMatchObject({ text: expect.stringMatching(/^Garden opens at \d+$/), ground: AREAS[5]!.ground });
    expect(nextGateChip(90, 0).text).toMatch(/^Grass II opens at \d+$/);
  });

  it('keeps every area’s chip readable: its ink on its own ground', () => {
    for (const area of AREAS) expect(contrastRatio(area.ink, area.ground), area.name).toBeGreaterThanOrEqual(4.5);
  });
});

describe('the score under the medals', () => {
  it('never reads a star\'s number while that star is unlit', () => {
    // A 78.6 on level 32 read "79%" over an unlit 79% second star: rounding to nearest.
    expect(scoreLabel(78.6)).toBe('78%');
    expect(scoreLabel(79)).toBe('79%');
    expect(scoreLabel(99.99)).toBe('99%');
    expect(scoreLabel(100)).toBe('100%');
    expect(scoreLabel(-3)).toBe('0%');
    expect(scoreLabel(Number.NaN)).toBe('0%');
    for (let level = 1; level <= 300; level++) {
      const spec = levelSpec(level);
      for (const threshold of spec.starAccuracy) {
        for (const accuracy of [threshold - 0.5, threshold - 0.01, threshold, threshold + 0.4]) {
          const shown = Number.parseInt(scoreLabel(accuracy), 10);
          const lit = starsFor(accuracy, spec);
          // The number reaches a chip exactly when that chip's star is lit.
          spec.starAccuracy.forEach((t, k) => expect(shown >= t, `level ${level} at ${accuracy}`).toBe(lit > k));
        }
      }
    }
  });

  it('is what the result screen shows', () => {
    const scene = readFileSync('src/scenes/PlayScene.ts', 'utf8');
    expect(scene).toContain('this.scoreValue.setText(scoreLabel(accuracy));');
    expect(scene).not.toMatch(/scoreValue\.setText\(`\$\{Math\.round/);
  });
});
