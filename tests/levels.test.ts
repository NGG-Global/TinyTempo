import { describe, expect, it, vi } from 'vitest';
import { AREAS, PATTERN_TIERS, areaOf, breatherTask, difficulty, levelSpec, mapLastLevel, mapLevelState, meanAccuracy, starsFor } from '../src/game/levels';
import { PROGRESSION } from '../src/config/progression';
import { RHYTHM } from '../src/config/rhythm';
import { RoundController, type RoundEvents } from '../src/game/RoundController';
import { TaskSequence } from '../src/game/TaskSequence';

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
  it.each([1, 12, 19, 45])('plays level %s end to end on one grid with the music tempo changing on task downbeats', level => {
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
