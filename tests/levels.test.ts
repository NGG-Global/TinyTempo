import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  AREAS, PATTERN_TIERS, SUBDIVIDED_TIERS, areaOf, breatherTask, difficulty, gridFits, levelSpec, mapLastLevel, mapLevelState,
  meanAccuracy, starsFor, tightestSpacingMs, type Grid,
} from '../src/game/levels';
import { PROGRESSION } from '../src/config/progression';
import { RHYTHM } from '../src/config/rhythm';
import { RoundController, type RoundEvents } from '../src/game/RoundController';
import { TaskSequence } from '../src/game/TaskSequence';
import { windowsFor } from '../src/rhythm/judge';
import { VIGNETTES } from '../src/vignettes/registry';

vi.mock('phaser', () => ({ default: {} }));

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
  });
  it('raises length, tempo ceiling, density and clear bar together and never lowers them', () => {
    let previous = levelSpec(1);
    for (let level = 2; level <= 200; level++) {
      const spec = levelSpec(level);
      expect(spec.tasks.length).toBeGreaterThanOrEqual(previous.tasks.length);
      expect(spec.peakBpm).toBeGreaterThanOrEqual(previous.peakBpm);
      expect(spec.clearAccuracy).toBeGreaterThanOrEqual(previous.clearAccuracy);
      expect(Math.max(...spec.tasks.map(t => t.tier))).toBeGreaterThanOrEqual(Math.max(...previous.tasks.map(t => t.tier)));
      expect(spec.vignette).not.toBe(previous.vignette);
      // The lap counts completed rotations, so it steps up exactly when the first act returns.
      expect(spec.lap).toBe(spec.vignette === previous.vignette ? previous.lap : spec.vignette === 'hammer' ? previous.lap + 1 : previous.lap);
      expect(spec.lap).toBe(Math.floor((level - 1) / VIGNETTES.length));
      previous = spec;
    }
    expect(previous.tasks).toHaveLength(PROGRESSION.tasksMax);
    expect(previous.peakBpm).toBe(PROGRESSION.baseBpm + PROGRESSION.peakBpmRange);
    expect(previous.clearAccuracy).toBe(PROGRESSION.clearMin + PROGRESSION.clearRange);
    expect(difficulty(200)).toBeGreaterThan(0.99);
  });
  it('keeps the first levels flat and gentle before the ramp shows', () => {
    for (let level = 1; level <= 3; level++) expect(levelSpec(level).tasks.every(t => t.bpm === 120 && t.tier === 0)).toBe(true);
    expect(levelSpec(10).clearAccuracy).toBeLessThanOrEqual(55);
    expect(levelSpec(10).peakBpm).toBeLessThanOrEqual(126);
    expect(levelSpec(10).tasks.length).toBeLessThanOrEqual(5);
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
    expect(levelSpec(37)).toEqual(levelSpec(37));
    expect(levelSpec(37).tasks.map(t => t.pattern.id)).not.toEqual(levelSpec(38).tasks.map(t => t.pattern.id));
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
    // Level 19 is the first to reach six tasks on the curve, so it is the first to rest.
    expect(levelSpec(18).tasks).toHaveLength(PROGRESSION.breatherFromTasks - 1);
    expect(levelSpec(19).tasks).toHaveLength(PROGRESSION.breatherFromTasks);
    expect(levelSpec(18).tasks.map(t => t.leadBeats)).toEqual([RHYTHM.leadInBeats, 0, 0, 0, 0]);
    expect(levelSpec(19).tasks.map(t => t.leadBeats)).toEqual([RHYTHM.leadInBeats, 0, 0, bar, 0, 0]);
    // However long a level gets, it never waits more than twice.
    for (const level of [1, 19, 45, 200, 5000]) {
      const leads = levelSpec(level).tasks.map(t => t.leadBeats);
      expect(leads.filter(n => n > 0).length).toBeLessThanOrEqual(2);
      expect(leads[0]).toBe(RHYTHM.leadInBeats);
    }
  });
});

describe('the finer grids', () => {
  const S = PROGRESSION.subdivision;
  /** The first level at or past a difficulty on the curve. */
  const levelAt = (d: number) => { let level = 1; while (difficulty(level) < d) level++; return level; };
  const grids = (level: number) => levelSpec(level).tasks.map(t => t.grid);

  it('leaves every level below the triplet threshold exactly as it was, to the seed', () => {
    // Recorded from the derivation before the second stage existed. A finer grid that
    // moved any of these would be the registry trap again: a level a player has learnt,
    // silently reassigned.
    const before = JSON.parse(readFileSync(new URL('./fixtures/levels-before-subdivision.json', import.meta.url), 'utf8')) as Record<string, string[]>;
    const first = levelAt(S.tripletsFrom);
    expect(first).toBeGreaterThan(40);
    for (let level = 1; level < first; level++) {
      const spec = levelSpec(level);
      expect(spec.tasks.map(t => `${t.pattern.id}@${t.bpm}/${t.tier}/${t.leadBeats}`)).toEqual(before[String(level)]);
      expect(spec.tasks.every(t => t.grid === null)).toBe(true);
    }
    // Past it, the tiers' own draws still stand: only the swapped tasks differ.
    for (let level = first; level <= 120; level++) {
      const spec = levelSpec(level);
      spec.tasks.forEach((task, i) => {
        const was = before[String(level)]![i]!;
        if (task.grid === null) expect(`${task.pattern.id}@${task.bpm}/${task.tier}/${task.leadBeats}`).toBe(was);
        else expect(`@${task.bpm}/${task.tier}/${task.leadBeats}`).toBe(was.slice(was.indexOf('@')));
      });
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
