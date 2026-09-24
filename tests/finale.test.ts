import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { PROGRESSION } from '../src/config/progression';
import { RHYTHM } from '../src/config/rhythm';
import {
  AREAS, areaLevels, areaOf, areaRepertoire, areaStep, isAreaFinale, levelSpec, mapLevelState, openingBeats, tierTasks,
} from '../src/game/levels';
import {
  DEFAULT_TREATMENT, FINALE_COPY, FINALE_TREATMENTS, areaFinale, areaTrail, finaleMapMark, finaleTreatment, nextFinale,
} from '../src/game/finale';
import { attemptCostsHeart, beginAttempt, finishAttempt, HEALTH, type Health } from '../src/game/health';
import { recordResult, type Progress } from '../src/game/progress';
import { keepsakeAt } from '../src/game/scrapbook';
import { starsRequired } from '../src/game/stars';
import { contrastRatio } from '../src/ui/colour';
import { FINALE_POSE, buntingPoints, lineShift, pennantSwing, ribbonPose, titleCardPose } from '../src/ui/finalePose';
import { ROLL_CLEARANCE_SEC, synthesizeFinale } from '../src/audio/finaleSounds';

vi.mock('phaser', () => ({ default: {} }));

const LAST = 300;
const finales = (): number[] => Array.from({ length: LAST }, (_, i) => i + 1).filter(isAreaFinale);
/** A save where every level up to `through` holds exactly `stars` stars. */
function road(through: number, stars: 1 | 2 | 3): Progress {
  const best: Record<number, number> = {};
  for (let level = 1; level <= through; level++) best[level] = levelSpec(level).starAccuracy[stars - 1]!;
  return { unlocked: through + 1, best };
}
const FULL: Health = { hearts: HEALTH.max, refillStartedAt: null, spentAttempt: null };

describe('which levels are finales', () => {
  it('is the last level of every area, read from the area size alone', () => {
    for (let level = 1; level <= LAST; level++) {
      const spec = levelSpec(level);
      const last = areaStep(level).step === PROGRESSION.areaSize;
      expect(isAreaFinale(level), `level ${level}`).toBe(last);
      expect(spec.finale, `level ${level}`).toBe(last);
      expect(spec.role === 'finale').toBe(last);
      // The last level of the area and the finale are one fact.
      expect(areaLevels(level).finale).toBe(areaOf(level).index * PROGRESSION.areaSize + PROGRESSION.areaSize);
      if (last) expect(areaLevels(level).finale).toBe(level);
    }
    expect(finales()).toHaveLength(LAST / PROGRESSION.areaSize);
    expect(finales().slice(0, 3)).toEqual([1, 2, 3].map(k => k * PROGRESSION.areaSize));
    expect(() => isAreaFinale(0)).toThrow();
  });

  it('names the area each finale closes and the one it opens, laps included', () => {
    const size = PROGRESSION.areaSize;
    expect(areaFinale(size)).toMatchObject({ level: size, area: 1, areaName: 'Grass', nextAreaName: 'Pavement' });
    expect(areaFinale(2 * size)).toMatchObject({ area: 2, areaName: 'Pavement', nextAreaName: 'Sand' });
    expect(areaFinale(3 * size)).toMatchObject({ area: 3, areaName: 'Sand', nextAreaName: 'Snow' });
    // The last area of a lap hands over to the first area's second lap.
    const lap = AREAS.length * size;
    expect(areaFinale(lap)).toMatchObject({ areaName: 'Dusk', nextAreaName: 'Grass II' });
    expect(areaFinale(lap + size)).toMatchObject({ areaName: 'Grass II', treatment: FINALE_TREATMENTS.Grass });
    for (let level = 1; level <= LAST; level++) if (!isAreaFinale(level)) expect(areaFinale(level)).toBeNull();
  });
});

describe('the finale’s rules are every level’s', () => {
  it('keeps the curve’s clear bar and star thresholds, which saved stars are read against', () => {
    const pinned = JSON.parse(readFileSync(new URL('./fixtures/level-thresholds.json', import.meta.url), 'utf8')) as Record<string, [number, number, number]>;
    for (const level of finales()) {
      expect([...levelSpec(level).starAccuracy], `level ${level}`).toEqual(pinned[String(level)]);
      expect(levelSpec(level).clearAccuracy).toBe(levelSpec(level).starAccuracy[0]);
    }
  });

  it('keeps the curve’s length, tempo ramp and peak: the top of its area', () => {
    for (const level of finales()) {
      const spec = levelSpec(level);
      const curve = tierTasks(level);
      expect(spec.tasks.map(t => [t.bpm, t.leadBeats]), `level ${level}`).toEqual(curve.map(t => [t.bpm, t.leadBeats]));
      expect(spec.tasks.at(-1)!.bpm).toBe(spec.peakBpm);
    }
  });

  it('costs one heart on the frontier, none on a replay, and refunds on three stars — like any level', () => {
    const level = 2 * PROGRESSION.areaSize;
    const ordinary = level - 1;
    for (const at of [level, ordinary]) {
      const progress = road(at - 1, 2);
      expect(attemptCostsHeart(progress, at)).toBe(true);
      const begun = beginAttempt(FULL, progress, at, `a${at}`, 0);
      expect(begun).toMatchObject({ ok: true, spent: true });
      expect(begun.health.hearts).toBe(HEALTH.max - 1);
      // Resume and restart are the same attempt: still one heart.
      expect(beginAttempt(begun.health, progress, at, `a${at}`, 0).health.hearts).toBe(HEALTH.max - 1);
      expect(finishAttempt(begun.health, `a${at}`, 3, 0)).toMatchObject({ refunded: true });
      expect(finishAttempt(begun.health, `a${at}`, 2, 0).health.hearts).toBe(HEALTH.max - 1);
    }
    // A finished finale replays for free, exactly as a finished level does.
    expect(attemptCostsHeart(road(level, 1), level)).toBe(false);
    expect(beginAttempt(FULL, road(level, 1), level, 'again', 0)).toMatchObject({ ok: true, spent: false });
  });

  it('unlocks the next area’s first level on a clear and nothing more, and keeps its keepsake and gate', () => {
    const level = PROGRESSION.areaSize;
    const before = road(level - 1, 3);
    const cleared = recordResult(before, level, levelSpec(level).clearAccuracy);
    expect(cleared).toMatchObject({ cleared: true, stars: 1 });
    expect(cleared.progress.unlocked).toBe(level + 1);
    const failed = recordResult(before, level, levelSpec(level).clearAccuracy - 1);
    expect(failed).toMatchObject({ cleared: false, stars: 0 });
    expect(failed.progress.unlocked).toBe(level);
    // The act keepsakes the first finales already carried stay where they were.
    expect(keepsakeAt(10)?.id).toBe('egg-painted');
    expect(keepsakeAt(20)?.id).toBe('trombone-mouthpiece');
    // And the star gates are a function of the area, not of the finale.
    expect([1, 2, 3, 4].map(starsRequired)).toEqual([12, 25, 39, 53]);
  });

  it('is the same level on every call', () => {
    for (const level of [10, 20, 30, 60, 100]) expect(levelSpec(level)).toEqual(levelSpec(level));
    expect(areaRepertoire(30)).toEqual(areaRepertoire(30));
  });
});

describe('the reprise', () => {
  it('only ever plays patterns the area’s earlier levels already used', () => {
    for (const level of finales()) {
      const repertoire = areaRepertoire(level);
      const known = new Map(repertoire.map(task => [task.pattern, task]));
      for (const task of levelSpec(level).tasks) {
        const source = known.get(task.pattern);
        expect(source, `level ${level}: ${task.pattern.id} is new to its area`).toBeDefined();
        expect(task.grid, `level ${level}: ${task.pattern.id}`).toBe(source!.grid);
      }
    }
  });

  it('never brings a tier or a grid the road has not already shown', () => {
    let tierSeen = -1;
    const gridsSeen = new Set<string>();
    for (let level = 1; level <= LAST; level++) {
      const spec = levelSpec(level);
      if (spec.finale) {
        for (const task of spec.tasks) {
          if (task.grid === null) expect(task.tier, `level ${level}`).toBeLessThanOrEqual(tierSeen);
          else expect(gridsSeen.has(task.grid), `level ${level}: ${task.grid}`).toBe(true);
        }
      }
      for (const task of spec.tasks) {
        if (task.grid === null) tierSeen = Math.max(tierSeen, task.tier);
        else gridsSeen.add(task.grid);
      }
    }
  });

  it('stays at or under each task’s tier on the curve, opens on the pulse, and never repeats a neighbour it can avoid', () => {
    for (const level of finales()) {
      const tasks = levelSpec(level).tasks;
      const curve = tierTasks(level);
      tasks.forEach((task, i) => {
        if (task.grid === null) expect(task.tier, `level ${level} task ${i + 1}`).toBeLessThanOrEqual(curve[i]!.tier);
        if (i > 0) expect(task.pattern, `level ${level} task ${i + 1}`).not.toBe(tasks[i - 1]!.pattern);
      });
      expect(tasks[0]!.grid).toBeNull();
    }
  });

  it('walks through the area rather than replaying one favourite', () => {
    for (const level of finales()) {
      const tasks = levelSpec(level).tasks;
      const distinct = new Set(tasks.map(t => t.pattern)).size;
      // Every task distinct wherever the repertoire has the room, which it has from the start.
      expect(distinct, `level ${level}`).toBe(tasks.length);
    }
  });

  it('gives the finale its longer opening and every other level one bar', () => {
    for (let level = 1; level <= 60; level++) {
      expect(levelSpec(level).tasks[0]!.leadBeats).toBe(openingBeats(level));
    }
    expect(openingBeats(PROGRESSION.areaSize)).toBe(PROGRESSION.finale.openingBars * RHYTHM.beatsPerBar);
    expect(openingBeats(PROGRESSION.areaSize - 1)).toBe(RHYTHM.leadInBeats);
  });
});

describe('the map', () => {
  it('marks every finale in every state, and nothing else', () => {
    const size = PROGRESSION.areaSize;
    expect(finaleMapMark(size, 3)).toEqual({ state: 'locked', complete: false });
    expect(finaleMapMark(size, size)).toEqual({ state: 'frontier', complete: false });
    expect(finaleMapMark(size, size + 1)).toEqual({ state: 'cleared', complete: true });
    const far = 1 + PROGRESSION.mapLookahead + 1;
    expect(finaleMapMark(Math.ceil(far / size) * size, 1)!.state).toBe(mapLevelState(Math.ceil(far / size) * size, 1));
    for (let level = 1; level <= 60; level++) {
      const mark = finaleMapMark(level, 17);
      expect(mark === null).toBe(!isAreaFinale(level));
    }
  });

  it('shows the finale at the end of the dock’s trail from the area’s first stop', () => {
    const size = PROGRESSION.areaSize;
    const trail = areaTrail(size + 3);
    expect(trail).toHaveLength(size);
    expect(trail.map(b => b.level)).toEqual(Array.from({ length: size }, (_, i) => size + 1 + i));
    expect(trail.filter(b => b.finale).map(b => b.level)).toEqual([2 * size]);
    expect(trail.map(b => b.state)).toEqual(trail.map(b => (b.level < size + 3 ? 'done' : b.level === size + 3 ? 'current' : 'ahead')));
    expect(nextFinale(size + 3)).toEqual({ level: 2 * size, away: size - 3 });
    expect(nextFinale(2 * size)).toEqual({ level: 2 * size, away: 0 });
  });
});

describe('the treatments', () => {
  it('dress every area, with ids analytics can carry', () => {
    for (const area of AREAS) expect(FINALE_TREATMENTS[area.name], area.name).toBeDefined();
    const all = [...Object.values(FINALE_TREATMENTS), DEFAULT_TREATMENT];
    expect(new Set(all.map(t => t.id)).size).toBe(all.length);
    for (const t of all) {
      expect(t.id).toMatch(/^[a-z]{1,12}$/);
      expect(t.pennants.length).toBeGreaterThan(1);
      // The ribbon's words are read at a glance, over a moving scene.
      expect(contrastRatio(t.ribbon, t.ribbonInk), t.id).toBeGreaterThanOrEqual(4.5);
    }
    expect(finaleTreatment(PROGRESSION.areaSize)).toBe(FINALE_TREATMENTS.Grass);
    expect(finaleTreatment(5 * PROGRESSION.areaSize).motif).toBe('lanterns');
  });

  it('say what the card and the ribbon say', () => {
    expect(FINALE_COPY.strapline('Snow')).toBe('The best of Snow, one more time');
  });
});

describe('the poses', () => {
  it('hang the title card inside its window and nowhere else', () => {
    const span = 3;
    expect(titleCardPose(-0.1, span).alpha).toBe(0);
    expect(titleCardPose(span, span).alpha).toBe(0);
    expect(titleCardPose(Infinity, NaN).alpha).toBe(0);
    expect(titleCardPose(span / 2, span)).toMatchObject({ offset: 0, alpha: 1 });
    // Out of the way before the window closes: nearly gone in its last tenth of a second.
    expect(titleCardPose(span - 0.02, span).alpha).toBeLessThan(0.1);
    // A window shorter than both motions still enters and leaves inside it.
    expect(titleCardPose(0.5, 0.6).alpha).toBeLessThan(1);
    expect(titleCardPose(1, span, true)).toEqual({ offset: 0, tilt: 0, alpha: 1 });
  });

  it('move the pennant line only once the result calls for it, and settle it there', () => {
    expect(lineShift(Infinity)).toBe(0);
    expect(lineShift(-0.1)).toBe(0);
    expect(lineShift(0)).toBe(0);
    expect(lineShift(FINALE_POSE.lineMove / 2)).toBeGreaterThan(0.5);
    expect(lineShift(FINALE_POSE.lineMove)).toBe(1);
    expect(lineShift(100)).toBe(1);
    expect(lineShift(0.01, true)).toBe(1);
    expect(lineShift(Infinity, true)).toBe(0);
  });

  it('keep the ribbon away until it is called for, then unroll it whole', () => {
    expect(ribbonPose(Infinity).alpha).toBe(0);
    expect(ribbonPose(-1).alpha).toBe(0);
    expect(ribbonPose(FINALE_POSE.ribbonUnroll * 4)).toMatchObject({ unroll: 1, alpha: 1 });
    expect(ribbonPose(0.01, true)).toEqual({ unroll: 1, stamp: 0, alpha: 1 });
  });

  it('string the pennants symmetrically, sagging in the middle, and still them under reduced motion', () => {
    const points = buntingPoints(0, 100, 10, 20, 5);
    expect(points).toHaveLength(5);
    expect(points[2]).toMatchObject({ x: 50, y: 30 });
    expect(points[2]!.slope).toBeCloseTo(0);
    expect(points[0]!.y).toBeCloseTo(points[4]!.y);
    expect(points[0]!.slope).toBeCloseTo(-points[4]!.slope);
    expect(buntingPoints(0, 0, 0, 10, 4)).toEqual([]);
    expect(pennantSwing(3, 2, 0.1, true)).toBe(0);
    expect(Math.abs(pennantSwing(3, 2, Infinity))).toBeLessThanOrEqual(FINALE_POSE.sway);
  });
});

describe('the sounds', () => {
  it('stop the roll short of the downbeat, and keep both sounds finite and in range', () => {
    const rate = 8000, beat = 0.5;
    const roll = synthesizeFinale(rate, 'roll', beat, 4);
    expect(roll.length).toBe(Math.ceil(rate * (beat * 4 - ROLL_CLEARANCE_SEC)));
    const fanfare = synthesizeFinale(rate, 'fanfare');
    for (const data of [roll, fanfare]) {
      expect(data.every(Number.isFinite)).toBe(true);
      expect(Math.max(...data.map(Math.abs))).toBeLessThanOrEqual(1);
    }
    // Deterministic: the same buffer every time it is made.
    expect(synthesizeFinale(rate, 'fanfare')).toEqual(fanfare);
  });
});
