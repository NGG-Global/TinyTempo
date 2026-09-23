import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  AREAS, PATTERN_TIERS, SUBDIVIDED_TIERS, areaOf, baselineShape, breatherTask, difficulty, dimensionsOf, gridFits, levelSpec,
  mapLastLevel, mapLevelState, meanAccuracy, starsFor, tierTasks, tightestSpacingMs, type Grid, type LevelDimensions, type LevelSpec,
} from '../src/game/levels';
import { PROGRESSION } from '../src/config/progression';
import { RHYTHM } from '../src/config/rhythm';
import { RoundController, type RoundEvents } from '../src/game/RoundController';
import { TaskSequence } from '../src/game/TaskSequence';
import { windowsFor } from '../src/rhythm/judge';
import { VIGNETTES } from '../src/vignettes/registry';

vi.mock('phaser', () => ({ default: {} }));

/** What a spec actually asks for, in the three whole numbers the curve rounds to. */
const dims = (spec: LevelSpec): LevelDimensions => ({
  tasks: spec.tasks.length, peakBpm: spec.peakBpm, maxTier: Math.max(...spec.tasks.map(t => t.tier)),
});
/** The plain curve's dimensions for a level: the road as it was before the choreography. */
const plain = (level: number): LevelDimensions => dimensionsOf(baselineShape(difficulty(level)));
/** One number for how much a level asks, each dimension scaled 0–1 across its range. */
const load = (d: LevelDimensions): number =>
  ((d.tasks - PROGRESSION.tasksMin) / (PROGRESSION.tasksMax - PROGRESSION.tasksMin)
    + (d.peakBpm - PROGRESSION.baseBpm) / PROGRESSION.peakBpmRange
    + d.maxTier / (PROGRESSION.tierCount - 1)) / 3;
const areaMean = (area: number, of: (level: number) => number): number => {
  let sum = 0;
  for (let level = area * 10 + 1; level <= area * 10 + 10; level++) sum += of(level);
  return sum / 10;
};

describe('level progression', () => {
  it('starts very easy: three quarter-note tasks at the base tempo and a 40% clear bar', () => {
    const first = levelSpec(1);
    expect(first.tasks).toHaveLength(PROGRESSION.tasksMin);
    expect(first.tasks.map(t => t.bpm)).toEqual([120, 120, 120]);
    expect(first.tasks.every(t => t.tier === 0)).toBe(true);
    expect(first.clearAccuracy).toBe(40);
    expect(first.starAccuracy).toEqual([40, 60, 80]);
    expect(first.vignette).toBe('hammer');
    expect(first.lap).toBe(0);
    expect(first.areaName).toBe('Grass');
    expect(first.role).toBe('opener');
    expect(first.areaStep).toBe(1);
    // The guided level is the curve itself, to the pattern: the choreography starts at nothing.
    expect(first.tasks.map(t => `${t.pattern.id}@${t.bpm}/${t.tier}/${t.leadBeats}`))
      .toEqual(['t0-2@120/0/4', 't0-1@120/0/0', 't0-0@120/0/0']);
  });
  it('keeps the baseline curve, the clear bar and the vignettes rising or rotating as before', () => {
    // The choreography varies a level around the curve; the curve itself still never falls.
    let previous = levelSpec(1);
    for (let level = 2; level <= 200; level++) {
      const spec = levelSpec(level);
      const was = plain(level - 1), now = plain(level);
      expect(now.tasks).toBeGreaterThanOrEqual(was.tasks);
      expect(now.peakBpm).toBeGreaterThanOrEqual(was.peakBpm);
      expect(now.maxTier).toBeGreaterThanOrEqual(was.maxTier);
      expect(spec.clearAccuracy).toBeGreaterThanOrEqual(previous.clearAccuracy);
      expect(spec.vignette).toBe(VIGNETTES[(level - 1) % VIGNETTES.length]!.id);
      expect(spec.vignette).not.toBe(previous.vignette);
      // The lap counts completed rotations, so it steps up exactly when the first act returns.
      expect(spec.lap).toBe(spec.vignette === previous.vignette ? previous.lap : spec.vignette === 'hammer' ? previous.lap + 1 : previous.lap);
      expect(spec.lap).toBe(Math.floor((level - 1) / VIGNETTES.length));
      previous = spec;
    }
    // Level 200 is an area finale on the plateau: every ceiling at once, and no further.
    expect(previous.role).toBe('finale');
    expect(previous.tasks).toHaveLength(PROGRESSION.tasksMax);
    expect(previous.peakBpm).toBe(PROGRESSION.baseBpm + PROGRESSION.peakBpmRange);
    expect(previous.clearAccuracy).toBe(PROGRESSION.clearMin + PROGRESSION.clearRange);
    expect(difficulty(200)).toBeGreaterThan(0.99);
  });
  it('leaves every clear bar and star threshold where it was, so no saved star moves', () => {
    // Stars are recomputed from the best accuracy against these on every read. Recorded
    // from the derivation before the choreography: a threshold that moved would change a
    // player's collection, and a raised one could close a gate they had already passed.
    const before = JSON.parse(readFileSync(new URL('./fixtures/level-thresholds.json', import.meta.url), 'utf8')) as Record<string, number[]>;
    for (let level = 1; level <= 300; level++) {
      const spec = levelSpec(level);
      expect([...spec.starAccuracy], `level ${level}`).toEqual(before[String(level)]);
      expect(spec.clearAccuracy).toBe(spec.starAccuracy[0]);
      expect(spec.starAccuracy[0]).toBeLessThan(spec.starAccuracy[1]);
      expect(spec.starAccuracy[1]).toBeLessThan(spec.starAccuracy[2]);
      expect(spec.clearAccuracy).toBeGreaterThanOrEqual(PROGRESSION.clearMin);
      expect(spec.starAccuracy[2]).toBeLessThanOrEqual(100);
    }
  });
  it('keeps the first levels flat and gentle before the ramp shows', () => {
    for (let level = 1; level <= 3; level++) expect(levelSpec(level).tasks.every(t => t.bpm === 120 && t.tier === 0)).toBe(true);
    // The first area's finale is its hardest level, at half the choreography's strength:
    // two BPM and one tier past the old road's level 10, and no longer.
    expect(levelSpec(10).role).toBe('finale');
    expect(levelSpec(10).clearAccuracy).toBeLessThanOrEqual(55);
    expect(levelSpec(10).peakBpm).toBeLessThanOrEqual(128);
    expect(levelSpec(10).tasks.length).toBeLessThanOrEqual(5);
    expect(dims(levelSpec(10)).maxTier).toBeLessThanOrEqual(2);
    for (let level = 1; level <= 10; level++) expect(levelSpec(level).tasks.every(t => t.grid === null)).toBe(true);
  });
  it('starts every level at the base tempo and ramps task by task toward its peak', () => {
    for (const level of [1, 7, 15, 30, 60, 120]) {
      const spec = levelSpec(level);
      expect(spec.tasks[0]!.bpm).toBe(PROGRESSION.baseBpm);
      expect(spec.tasks[spec.tasks.length - 1]!.bpm).toBe(spec.peakBpm);
      for (let i = 1; i < spec.tasks.length; i++) {
        expect(spec.tasks[i]!.bpm).toBeGreaterThanOrEqual(spec.tasks[i - 1]!.bpm);
        expect(spec.tasks[i]!.tier).toBeGreaterThanOrEqual(spec.tasks[i - 1]!.tier);
        expect(spec.tasks[i]!.pattern).not.toBe(spec.tasks[i - 1]!.pattern);
      }
    }
  });
  it('is deterministic per level so a level can be learned', () => {
    for (let level = 1; level <= 300; level++) expect(levelSpec(level)).toEqual(levelSpec(level));
    expect(levelSpec(37).tasks.map(t => t.pattern.id)).not.toEqual(levelSpec(38).tasks.map(t => t.pattern.id));
  });
  it('matches the recorded road, task for task, so any change to it is a deliberate one', () => {
    // The choreography reassigned the road once, on purpose; this pins what it produced.
    // Regenerate only for a deliberate change to the curve, and say which levels moved.
    const road = JSON.parse(readFileSync(new URL('./fixtures/levels-choreography.json', import.meta.url), 'utf8')) as Record<string, string[]>;
    for (let level = 1; level <= 120; level++) {
      const spec = levelSpec(level);
      expect([spec.role, ...spec.tasks.map(t => `${t.pattern.id}@${t.bpm}/${t.tier}/${t.leadBeats}`)], `level ${level}`)
        .toEqual(road[String(level)]);
    }
  });
  it('never places hits closer than half a beat, so windows stay separable at the tempo ceiling', () => {
    const fastest = 60 / (PROGRESSION.baseBpm + PROGRESSION.peakBpmRange);
    for (const tier of PATTERN_TIERS) for (const pattern of tier) for (let i = 1; i < pattern.hits.length; i++) {
      const gap = pattern.hits[i]! - pattern.hits[i - 1]!;
      expect(gap).toBeGreaterThanOrEqual(0.5);
      expect(gap * fastest).toBeGreaterThan(RHYTHM.goodMs / 1000);
      expect(gap * fastest).toBeGreaterThan(2 * RHYTHM.perfectMs / 1000);
    }
  });
  it('groups ten levels per area and cycles areas with numerals forever', () => {
    expect(areaOf(1).name).toBe('Grass'); expect(areaOf(10).name).toBe('Grass');
    expect(areaOf(11).name).toBe('Pavement'); expect(areaOf(20).name).toBe('Pavement');
    expect(areaOf(21).name).toBe('Sand');
    expect(areaOf(AREAS.length * 10 + 1).name).toBe('Grass II');
    expect(areaOf(AREAS.length * 20 + 5).name).toBe('Grass III');
  });
  it('awards stars in thirds of the headroom above the clear bar', () => {
    const spec = levelSpec(1);
    expect(starsFor(39.9, spec)).toBe(0); expect(starsFor(40, spec)).toBe(1); expect(starsFor(60, spec)).toBe(2); expect(starsFor(80, spec)).toBe(3);
    expect(meanAccuracy([100, 70, 40])).toBe(70); expect(meanAccuracy([])).toBe(0);
  });
  it('splits the map into cleared, frontier, locked lookahead and faded preview', () => {
    expect(mapLevelState(1, 5)).toBe('cleared');
    expect(mapLevelState(5, 5)).toBe('frontier');
    expect(mapLevelState(6, 5)).toBe('locked');
    expect(mapLevelState(5 + PROGRESSION.mapLookahead, 5)).toBe('locked');
    expect(mapLevelState(5 + PROGRESSION.mapLookahead + 1, 5)).toBe('preview');
    expect(mapLastLevel(5)).toBe(5 + PROGRESSION.mapLookahead + PROGRESSION.mapPreview);
  });
  it.each([1, 12, 19, 45, 70, 200])('plays level %s end to end on one grid with the music tempo changing on task downbeats', level => {
    const spec = levelSpec(level);
    const sound = { play: vi.fn(), cancel: vi.fn() };
    const events: RoundEvents = { phase: vi.fn(), cue: vi.fn(), tap: vi.fn(), judgement: vi.fn(), complete: vi.fn(), interrupted: vi.fn() };
    const controller = new RoundController(sound, events);
    let origin = 0.2;
    const accuracies: number[] = [];
    for (const task of spec.tasks) {
      controller.start(task.pattern, task.bpm, origin - 0.2, (origin - 0.2) * 1000, origin, task.leadBeats);
      const plan = controller.plan!;
      expect(plan.start).toBe(origin);
      // Whole beats at this task's tempo: the swap downbeat is a beat of the new grid too.
      for (const point of [plan.demo, plan.response, plan.end]) { const beats = (point - origin) / (60 / task.bpm); expect(Math.abs(beats - Math.round(beats))).toBeLessThan(1e-6); }
      let target = 0;
      for (let now = origin; now <= plan.end + 0.22; now += 0.01) {
        controller.tick(now, now * 1000);
        if (target < plan.targets.length && now >= plan.targets[target]!) { controller.tap(plan.targets[target]!, now, now * 1000); target++; }
      }
      expect(controller.result).not.toBeNull();
      expect(controller.result!.perfect).toBe(plan.targets.length);
      accuracies.push(controller.result!.accuracy);
      origin = new TaskSequence(task.bpm, origin).ending(plan.end).next;
    }
    expect(meanAccuracy(accuracies)).toBe(100);
    expect(events.interrupted).not.toHaveBeenCalled();
    expect(events.complete).toHaveBeenCalledTimes(spec.tasks.length);
  });
  it('waits once at the start of a level and nowhere else, until a level is long enough to rest', () => {
    const bar = PROGRESSION.breatherBars * RHYTHM.beatsPerBar;
    // Short levels run straight through: one bar to find the pulse, then task after task.
    expect(levelSpec(1).tasks.map(t => t.leadBeats)).toEqual([RHYTHM.leadInBeats, 0, 0]);
    expect(breatherTask(PROGRESSION.tasksMin)).toBe(-1);
    expect(breatherTask(PROGRESSION.breatherFromTasks - 1)).toBe(-1);
    expect(breatherTask(PROGRESSION.breatherFromTasks)).toBe(3);
    expect(breatherTask(PROGRESSION.tasksMax)).toBe(4);
    // A level rests exactly when it is long enough to, at its midpoint, and nowhere else.
    for (let level = 1; level <= 300; level++) {
      const leads = levelSpec(level).tasks.map(t => t.leadBeats);
      const rest = breatherTask(leads.length);
      expect(leads, `level ${level}`).toEqual(leads.map((_, i) => (i === 0 ? RHYTHM.leadInBeats : i === rest ? bar : 0)));
    }
    // The first rest arrives on an endurance level: it is the one that is long for its place.
    let first = 1;
    while (levelSpec(first).tasks.length < PROGRESSION.breatherFromTasks) first++;
    expect(levelSpec(first).role).toBe('endurance');
    expect(levelSpec(first).tasks.map(t => t.leadBeats)).toEqual([RHYTHM.leadInBeats, 0, 0, bar, 0, 0]);
  });
});

describe('the difficulty choreography', () => {
  const ROLES = ['opener', 'pattern', 'pattern', 'tempo', 'endurance', 'recovery', 'combination', 'combination', 'challenge', 'finale'];

  it('gives every step of every area its role, from the level number alone', () => {
    expect(PROGRESSION.choreography.steps).toHaveLength(PROGRESSION.areaSize);
    for (let level = 1; level <= 300; level++) {
      const spec = levelSpec(level);
      expect(spec.areaStep).toBe((level - 1) % 10 + 1);
      expect(spec.role).toBe(ROLES[spec.areaStep - 1]);
    }
    expect(levelSpec(10).role).toBe('finale');
    expect(levelSpec(11).role).toBe('opener');
    expect(levelSpec(100).role).toBe('finale');
  });

  it('stays inside every ceiling the game was designed to', () => {
    for (let level = 1; level <= 300; level++) {
      const spec = levelSpec(level);
      expect(spec.tasks.length).toBeGreaterThanOrEqual(PROGRESSION.tasksMin);
      expect(spec.tasks.length).toBeLessThanOrEqual(PROGRESSION.tasksMax);
      for (const task of spec.tasks) {
        expect(task.bpm).toBeGreaterThanOrEqual(PROGRESSION.baseBpm);
        expect(task.bpm).toBeLessThanOrEqual(PROGRESSION.baseBpm + PROGRESSION.peakBpmRange);
        expect(task.tier).toBeGreaterThanOrEqual(0);
        expect(task.tier).toBeLessThan(PROGRESSION.tierCount);
      }
      const tiers = spec.tasks.map(t => t.tier);
      expect(Math.max(...tiers) - Math.min(...tiers)).toBeLessThanOrEqual(PROGRESSION.tierSpan);
    }
  });

  it('never asks more of a level than the plain curve asks one area further on', () => {
    // A challenge previews the next area; it never arrives from three areas away.
    for (let level = 1; level <= 300; level++) {
      const now = dims(levelSpec(level)), cap = plain(level + PROGRESSION.choreography.lookahead);
      expect(now.tasks, `level ${level}`).toBeLessThanOrEqual(cap.tasks);
      expect(now.peakBpm, `level ${level}`).toBeLessThanOrEqual(cap.peakBpm);
      expect(now.maxTier, `level ${level}`).toBeLessThanOrEqual(cap.maxTier);
    }
  });

  it('has no sudden spikes: from one level to the next, and against the old road', () => {
    for (let level = 2; level <= 300; level++) {
      const was = dims(levelSpec(level - 1)), now = dims(levelSpec(level)), old = plain(level);
      expect(now.tasks - was.tasks, `level ${level}`).toBeLessThanOrEqual(2);
      expect(now.peakBpm - was.peakBpm, `level ${level}`).toBeLessThanOrEqual(10);
      expect(now.maxTier - was.maxTier, `level ${level}`).toBeLessThanOrEqual(2);
      expect(now.tasks - old.tasks).toBeLessThanOrEqual(2);
      expect(now.peakBpm - old.peakBpm).toBeLessThanOrEqual(10);
      expect(now.maxTier - old.maxTier).toBeLessThanOrEqual(1);
    }
  });

  it('keeps each area’s average on the curve: rising area by area, and never above the old road by much', () => {
    const areas = Array.from({ length: 30 }, (_, a) => areaMean(a, l => load(dims(levelSpec(l)))));
    const old = Array.from({ length: 30 }, (_, a) => areaMean(a, l => load(plain(l))));
    for (let a = 1; a < 30; a++) expect(areas[a]!).toBeGreaterThanOrEqual(areas[a - 1]! - 1e-9);
    // Strictly rising while the curve itself is still rising.
    for (let a = 1; a < 10; a++) expect(areas[a]!).toBeGreaterThan(areas[a - 1]!);
    for (let a = 0; a < 30; a++) {
      // The first area is a touch harder at its end (its challenge and finale); every
      // later one is within a tenth of the old road's average, below it on the plateau,
      // where a challenge cannot rise past the ceiling and a recovery still eases.
      expect(areas[a]! - old[a]!).toBeLessThanOrEqual(0.03);
      expect(old[a]! - areas[a]!).toBeLessThanOrEqual(0.1);
    }
  });

  it('builds each area to its finale and eases after it', () => {
    for (let area = 2; area < 20; area++) {
      const at = (step: number) => load(dims(levelSpec(area * 10 + step)));
      const peak = Math.max(...Array.from({ length: 10 }, (_, i) => at(i + 1)));
      expect(at(10), `area ${area + 1}`).toBe(peak);
      expect(at(9)).toBeGreaterThanOrEqual(at(8));
      expect(at(8)).toBeGreaterThanOrEqual(at(7));
      // The next area opens below the finale that closed this one.
      expect(load(dims(levelSpec(area * 10 + 11)))).toBeLessThan(at(10));
    }
  });

  it('makes each role trade the way its name says, once the choreography is at full strength', () => {
    for (let level = PROGRESSION.choreography.rampLevels + 1; level <= 300; level++) {
      const spec = levelSpec(level), now = dims(spec), old = plain(level);
      switch (spec.role) {
        case 'tempo':
          // Speed for pattern: at least the curve's tempo, at most its tier, and no finer grid.
          expect(now.peakBpm).toBeGreaterThanOrEqual(old.peakBpm);
          expect(now.maxTier).toBeLessThanOrEqual(old.maxTier);
          expect(spec.tasks.every(t => t.grid === null)).toBe(true);
          break;
        case 'endurance':
          // Length for pressure: at least the curve's tasks, at most its tempo and tier.
          expect(now.tasks).toBeGreaterThanOrEqual(old.tasks);
          expect(now.peakBpm).toBeLessThanOrEqual(old.peakBpm);
          expect(now.maxTier).toBeLessThanOrEqual(old.maxTier);
          break;
        case 'pattern':
          expect(now.maxTier).toBeGreaterThanOrEqual(old.maxTier);
          expect(now.peakBpm).toBeLessThanOrEqual(old.peakBpm);
          break;
        case 'opener':
        case 'recovery':
          expect(now.tasks).toBeLessThanOrEqual(old.tasks);
          expect(now.peakBpm).toBeLessThanOrEqual(old.peakBpm);
          expect(now.maxTier).toBeLessThanOrEqual(old.maxTier);
          break;
        case 'combination':
        case 'challenge':
        case 'finale':
          expect(now.tasks).toBeGreaterThanOrEqual(old.tasks);
          expect(now.peakBpm).toBeGreaterThanOrEqual(old.peakBpm);
          expect(now.maxTier).toBeGreaterThanOrEqual(old.maxTier);
          break;
      }
    }
  });

  it('makes a recovery level noticeably easier than its neighbours, but never trivial', () => {
    for (let level = PROGRESSION.choreography.rampLevels + 6; level <= 300; level += 10) {
      const spec = levelSpec(level);
      expect(spec.role).toBe('recovery');
      const here = load(dims(spec));
      expect(here).toBeLessThan(load(dims(levelSpec(level - 1))));
      expect(here).toBeLessThan(load(dims(levelSpec(level + 1))));
      // Noticeably easier than the curve at its place, and never more than a quarter of
      // the whole range below it.
      const curve = load(plain(level));
      expect(curve - here).toBeGreaterThanOrEqual(0.1);
      expect(curve - here).toBeLessThanOrEqual(0.25);
      // Same bar as its neighbours, easier material: easier to three-star, never harder.
      expect(spec.clearAccuracy).toBeLessThanOrEqual(levelSpec(level + 1).clearAccuracy);
    }
  });

  it.each([
    // level, role, tasks, peak BPM, top tier — a representative across the first 100 levels.
    [1, 'opener', 3, 120, 0], [5, 'endurance', 4, 120, 0], [9, 'challenge', 5, 126, 2], [10, 'finale', 5, 128, 2],
    [14, 'tempo', 5, 132, 1], [15, 'endurance', 6, 126, 2], [16, 'recovery', 5, 124, 1], [20, 'finale', 6, 138, 3],
    [24, 'tempo', 6, 138, 2], [26, 'recovery', 5, 130, 2], [30, 'finale', 7, 142, 4], [36, 'recovery', 6, 134, 2],
    [44, 'tempo', 7, 144, 3], [50, 'finale', 8, 146, 4], [55, 'endurance', 8, 140, 4], [66, 'recovery', 7, 140, 3],
    [74, 'tempo', 8, 148, 3], [90, 'finale', 8, 150, 4], [96, 'recovery', 7, 142, 3], [100, 'finale', 8, 150, 4],
  ] as const)('level %i is a %s level: %i tasks up to %i BPM, tier %i', (level, role, tasks, peakBpm, maxTier) => {
    const spec = levelSpec(level);
    expect(spec.role).toBe(role);
    expect(dims(spec)).toEqual({ tasks, peakBpm, maxTier });
  });
});

describe('the finer grids', () => {
  const S = PROGRESSION.subdivision;
  /** The first level at or past a difficulty on the curve. */
  const levelAt = (d: number) => { let level = 1; while (difficulty(level) < d) level++; return level; };
  const grids = (level: number) => levelSpec(level).tasks.map(t => t.grid);

  it('swaps tasks only onto a finer grid, and leaves every task it does not swap as the tiers chose it', () => {
    // The second stage draws from its own seeded stream after the tiers have chosen, so
    // the tier draws never depend on it. Every task that did not swap is the tiers' task
    // to the pattern; a swapped one keeps its tempo, tier and lead-in.
    const first = levelAt(S.tripletsFrom);
    expect(first).toBeGreaterThan(40);
    for (let level = 1; level <= 300; level++) {
      const tiers = tierTasks(level);
      const spec = levelSpec(level);
      expect(spec.tasks).toHaveLength(tiers.length);
      spec.tasks.forEach((task, i) => {
        const was = tiers[i]!;
        if (task.grid === null) expect(task).toEqual(was);
        else expect({ bpm: task.bpm, tier: task.tier, leadBeats: task.leadBeats }).toEqual({ bpm: was.bpm, tier: was.tier, leadBeats: was.leadBeats });
      });
      if (level < first) expect(spec.tasks.every(t => t.grid === null)).toBe(true);
    }
  });

  it('arrives in two steps — triplets first, sixteenths later — and grows denser toward the plateau', () => {
    const firstTriplet = levelAt(S.tripletsFrom);
    const firstSixteenth = levelAt(S.sixteenthsFrom);
    for (let level = 1; level < firstTriplet; level++) expect(grids(level).every(g => g === null)).toBe(true);
    for (let level = 1; level < firstSixteenth; level++) expect(grids(level).includes('sixteenth')).toBe(false);
    const count = (from: number, to: number) => { let n = 0; for (let level = from; level <= to; level++) n += grids(level).filter(Boolean).length; return n / (to - from + 1); };
    const early = count(firstTriplet, firstTriplet + 9);
    const middle = count(firstSixteenth, firstSixteenth + 19);
    const plateau = count(150, 250);
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(middle);
    expect(middle).toBeLessThan(plateau);
    // At most the stated share of a level, and never the task that sets the pulse.
    for (let level = 1; level <= 300; level++) {
      const g = grids(level);
      expect(g[0]).toBeNull();
      expect(g.filter(Boolean).length).toBeLessThanOrEqual(Math.floor(g.length * S.maxShare));
    }
    // Some level on the plateau has both grids in it.
    let both = false;
    for (let level = 150; level <= 250 && !both; level++) { const g = grids(level); both = g.includes('triplet') && g.includes('sixteenth'); }
    expect(both).toBe(true);
  });

  it('writes every subdivided phrase as one exact bar opening on its downbeat', () => {
    for (const grid of Object.keys(SUBDIVIDED_TIERS) as Grid[]) {
      for (const density of SUBDIVIDED_TIERS[grid]) for (const pattern of density) {
        expect(pattern.lengthBeats).toBe(RHYTHM.beatsPerBar);
        expect(pattern.hits[0]).toBe(0);
        expect(pattern.grid).toBe(grid === 'triplet' ? 3 : 4);
        // At least a third of a beat before the next task's downbeat: no sixteenth pickup into it.
        expect(RHYTHM.beatsPerBar - pattern.hits.at(-1)!).toBeGreaterThanOrEqual(1 / 3 - 1e-9);
      }
    }
    // The second density is denser than the first, which is what makes it a second step.
    for (const grid of Object.keys(SUBDIVIDED_TIERS) as Grid[]) {
      const hits = (density: number) => SUBDIVIDED_TIERS[grid][density]!.reduce((n, p) => n + p.hits.length, 0);
      expect(hits(1)).toBeGreaterThan(hits(0));
    }
  });

  it('never asks the thumb for two taps closer than the floor, whatever the task’s tempo', () => {
    for (let level = 1; level <= 300; level++) {
      for (const task of levelSpec(level).tasks) {
        expect(tightestSpacingMs(task.pattern, task.bpm)).toBeGreaterThanOrEqual(S.minSpacingMs);
      }
    }
    // Triplets fit every tempo the curve reaches; sixteenths fall off the fastest tasks.
    const ceiling = PROGRESSION.baseBpm + PROGRESSION.peakBpmRange;
    expect(gridFits('triplet', ceiling)).toBe(true);
    expect(gridFits('sixteenth', PROGRESSION.baseBpm)).toBe(true);
    expect(gridFits('sixteenth', ceiling)).toBe(false);
  });

  it('narrows only the Perfect window, and only where two neighbours would otherwise share it', () => {
    for (let level = 1; level <= 300; level++) {
      for (const task of levelSpec(level).tasks) {
        const beat = 60 / task.bpm;
        const windows = windowsFor(task.pattern.hits.map(h => h * beat));
        expect(windows.goodMs).toBe(RHYTHM.goodMs);
        expect(windows.perfectMs).toBeLessThanOrEqual(RHYTHM.perfectMs);
        expect(2 * windows.perfectMs).toBeLessThan(tightestSpacingMs(task.pattern, task.bpm));
        if (task.grid === null) expect(windows.perfectMs).toBe(RHYTHM.perfectMs);
      }
    }
  });
});
