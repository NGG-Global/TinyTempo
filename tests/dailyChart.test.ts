import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { DAILY_BANDS, DAILY_CHART } from '../src/config/dailyTempo';
import { PROGRESSION } from '../src/config/progression';
import { RHYTHM } from '../src/config/rhythm';
import { BAND_FOR_ROLE, bandBars, bandLabel, dailyChart } from '../src/game/dailyChart';
import { dailyTempoDay } from '../src/game/dayKey';
import { breatherTask, PATTERN_TIERS, starsFor, starThresholds, tightestSpacingMs, type LevelRole } from '../src/game/levels';
import { VIGNETTES } from '../src/vignettes/registry';

vi.mock('phaser', () => ({ default: {} }));

const DAY_MS = 86_400_000;
/** A year of day keys from a fixed start, on the Daily Tempo clock. */
const YEAR = Array.from({ length: 365 }, (_, i) => dailyTempoDay(Date.UTC(2026, 9, 23, 12) + i * DAY_MS));

describe('the daily chart', () => {
  it('is pinned for version 1: eight days of charts, task for task', () => {
    const pinned = JSON.parse(readFileSync(new URL('./fixtures/daily-chart-v1.json', import.meta.url), 'utf8')) as Record<string, {
      band: string; role: string; areaStep: number; actIndex: number; vignette: string; lap: number; peakBpm: number; maxTier: number;
      clearAccuracy: number; starAccuracy: number[]; tasks: { pattern: string; bpm: number; tier: number; leadBeats: number }[];
    }>;
    expect(Object.keys(pinned)).toHaveLength(8);
    for (const [day, before] of Object.entries(pinned)) {
      const chart = dailyChart(day);
      expect({
        band: chart.band, role: chart.role, areaStep: chart.areaStep, actIndex: chart.actIndex, vignette: chart.vignette, lap: chart.lap,
        peakBpm: chart.peakBpm, maxTier: chart.maxTier, clearAccuracy: chart.clearAccuracy, starAccuracy: [...chart.starAccuracy],
        tasks: chart.tasks.map(t => ({ pattern: t.pattern.id, bpm: t.bpm, tier: t.tier, leadBeats: t.leadBeats })),
      }, day).toEqual(before);
    }
    // The pool the version was pinned at is the registry as it stands: an appended act is a new version.
    expect(DAILY_CHART.actCount).toBe(VIGNETTES.length);
    expect(DAILY_CHART.version).toBe(1);
  });

  it('is the same chart for the same day, and a different one on another day or under another version', () => {
    expect(dailyChart('2026-10-23')).toEqual(dailyChart('2026-10-23'));
    const a = dailyChart('2026-10-23'), b = dailyChart('2026-10-24');
    expect(a.tasks.map(t => t.pattern.id).join() === b.tasks.map(t => t.pattern.id).join() && a.actIndex === b.actIndex).toBe(false);
    const v2 = dailyChart('2026-10-23', { seed: DAILY_CHART.seed, version: 2 });
    expect(v2.version).toBe(2);
    expect(v2.actIndex === a.actIndex && v2.areaStep === a.areaStep && v2.lap === a.lap).toBe(false);
    expect(() => dailyChart('23/10/2026')).toThrow();
    expect(() => dailyChart('')).toThrow();
  });

  it('is a level by another route: the band from the step, the band on the curve, and tasks the tiers choose', () => {
    const roles = new Set<LevelRole>();
    const bands = { light: 0, steady: 0, tough: 0 };
    const acts = new Set<number>();
    for (const day of YEAR) {
      const chart = dailyChart(day);
      roles.add(chart.role);
      bands[chart.band]++;
      acts.add(chart.actIndex);
      const spec = DAILY_CHART.bands[chart.band];
      expect(chart.band).toBe(BAND_FOR_ROLE[chart.role]);
      expect(chart.areaStep).toBeGreaterThanOrEqual(1);
      expect(chart.areaStep).toBeLessThanOrEqual(PROGRESSION.areaSize);
      expect(PROGRESSION.choreography.steps[chart.areaStep - 1]!.role).toBe(chart.role);
      expect(chart.difficulty).toBe(spec.difficulty);
      expect(chart.tasks).toHaveLength(spec.tasks);
      expect(chart.vignette).toBe(VIGNETTES[chart.actIndex]!.id);
      expect(chart.lap).toBeGreaterThanOrEqual(0);
      expect(chart.lap).toBeLessThan(DAILY_CHART.laps);
      // Tempo: from the base on the first task, rising to the peak on the last, inside the band's cap.
      expect(chart.tasks[0]!.bpm).toBe(PROGRESSION.baseBpm);
      expect(chart.tasks.at(-1)!.bpm).toBe(chart.peakBpm);
      expect(chart.peakBpm).toBeLessThanOrEqual(spec.bpmCap);
      expect(chart.peakBpm).toBeGreaterThanOrEqual(PROGRESSION.baseBpm);
      for (let i = 1; i < chart.tasks.length; i++) expect(chart.tasks[i]!.bpm).toBeGreaterThanOrEqual(chart.tasks[i - 1]!.bpm);
      // Tiers: the eighth-note vocabulary only, from `PATTERN_TIERS`, no phrase twice running, no grid.
      for (const task of chart.tasks) {
        expect(task.grid).toBeNull();
        expect(task.tier).toBeLessThanOrEqual(chart.maxTier);
        expect(task.tier).toBeGreaterThanOrEqual(Math.max(0, chart.maxTier - PROGRESSION.tierSpan));
        expect(PATTERN_TIERS[task.tier]).toContain(task.pattern);
        expect(tightestSpacingMs(task.pattern, task.bpm)).toBeGreaterThanOrEqual(PROGRESSION.subdivision.minSpacingMs);
      }
      for (let i = 1; i < chart.tasks.length; i++) expect(chart.tasks[i]!.pattern).not.toBe(chart.tasks[i - 1]!.pattern);
      // Lead-ins: one bar before the first, the breather at the midpoint of a long chart, nothing else.
      expect(chart.tasks[0]!.leadBeats).toBe(RHYTHM.leadInBeats);
      const breather = breatherTask(chart.tasks.length);
      chart.tasks.forEach((task, i) => {
        if (i === 0) return;
        expect(task.leadBeats).toBe(i === breather ? PROGRESSION.breatherBars * RHYTHM.beatsPerBar : 0);
      });
      // Thresholds: the curve's at the band's value, rising, as a level's are.
      expect({ clearAccuracy: chart.clearAccuracy, starAccuracy: chart.starAccuracy }).toEqual(starThresholds(spec.difficulty));
      expect(chart.starAccuracy[0]).toBeLessThan(chart.starAccuracy[1]);
      expect(chart.starAccuracy[1]).toBeLessThan(chart.starAccuracy[2]);
      expect(starsFor(chart.starAccuracy[2], chart)).toBe(3);
      expect(starsFor(chart.starAccuracy[0] - 1, chart)).toBe(0);
    }
    // A year sees every band in roughly the 20 / 60 / 20 the steps give, and most of the cast.
    for (const band of DAILY_BANDS) expect(bands[band]).toBeGreaterThan(0);
    expect(bands.steady).toBeGreaterThan(bands.light);
    expect(bands.steady).toBeGreaterThan(bands.tough);
    expect(acts.size).toBeGreaterThanOrEqual(20);
    expect(roles.size).toBeGreaterThanOrEqual(6);
  });

  it('maps every role to a band, two light, six steady, two tough', () => {
    const roles = PROGRESSION.choreography.steps.map(step => step.role);
    const counts = { light: 0, steady: 0, tough: 0 };
    for (const role of roles) counts[BAND_FOR_ROLE[role]]++;
    expect(counts).toEqual({ light: 2, steady: 6, tough: 2 });
    expect(bandLabel('light')).toBe('Light chart');
    expect(bandLabel('steady')).toBe('Steady chart');
    expect(bandLabel('tough')).toBe('Tough chart');
    expect([bandBars('light'), bandBars('steady'), bandBars('tough')]).toEqual([1, 2, 3]);
  });

  it('keeps the bands in order and under the ceilings the game already has', () => {
    const { light, steady, tough } = DAILY_CHART.bands;
    expect(light.difficulty).toBeLessThan(steady.difficulty);
    expect(steady.difficulty).toBeLessThan(tough.difficulty);
    expect(light.tasks).toBeLessThan(steady.tasks);
    expect(steady.tasks).toBeLessThan(tough.tasks);
    expect(tough.tasks).toBeLessThanOrEqual(PROGRESSION.tasksMax);
    expect(light.tasks).toBeGreaterThanOrEqual(PROGRESSION.tasksMin);
    expect(tough.bpmCap).toBeLessThanOrEqual(PROGRESSION.baseBpm + PROGRESSION.peakBpmRange);
  });
});
