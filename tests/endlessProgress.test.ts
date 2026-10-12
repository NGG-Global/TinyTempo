import { describe, expect, it, vi } from 'vitest';
import { ENDLESS } from '../src/config/endless';
import type { EndlessRunSummary } from '../src/game/endless';
import {
  EMPTY_ENDLESS_PROGRESS, EMPTY_RECORD, ENDLESS_PROGRESS_KEY, endlessRecord, loadEndlessProgress, markEndlessUnlockSeen,
  parseEndlessProgress, parseEndlessRecord, recordEndlessRun, saveEndlessProgress,
} from '../src/game/endlessProgress';

vi.mock('phaser', () => ({ default: {} }));

function memory(initial: Record<string, string> = {}): Storage & { readonly data: Record<string, string> } {
  const data: Record<string, string> = { ...initial };
  return {
    data,
    get length() { return Object.keys(data).length; },
    clear: () => { for (const key of Object.keys(data)) delete data[key]; },
    getItem: key => data[key] ?? null,
    key: i => Object.keys(data)[i] ?? null,
    removeItem: key => { delete data[key]; },
    setItem: (key, value) => { data[key] = String(value); },
  };
}

const run = (over: Partial<EndlessRunSummary> = {}): EndlessRunSummary => ({
  runId: 'run-1', rulesVersion: ENDLESS.rulesVersion, elapsedMs: 66_032, vignettes: 7, peakBpm: 134,
  perfect: 20, good: 5, missed: 2, extras: 1, ...over,
});

describe('the record', () => {
  it('starts empty, and a first run is a new best', () => {
    expect(endlessRecord(EMPTY_ENDLESS_PROGRESS)).toEqual(EMPTY_RECORD);
    const first = recordEndlessRun(EMPTY_ENDLESS_PROGRESS, run());
    expect(first.newBest).toBe(true);
    expect(first.firstRun).toBe(true);
    expect(first.duplicate).toBe(false);
    expect(first.record).toEqual({ bestMs: 66_032, bestVignettes: 7, bestBpm: 134, validRuns: 1, milestones: [], lastRunId: 'run-1' });
    expect(endlessRecord(first.next)).toEqual(first.record);
  });

  it('only ever rises, and says when a run beat the best', () => {
    const first = recordEndlessRun(EMPTY_ENDLESS_PROGRESS, run());
    const worse = recordEndlessRun(first.next, run({ runId: 'run-2', elapsedMs: 40_000, vignettes: 9, peakBpm: 130 }));
    expect(worse.newBest).toBe(false);
    expect(worse.firstRun).toBe(false);
    expect(worse.record).toEqual({ bestMs: 66_032, bestVignettes: 9, bestBpm: 134, validRuns: 2, milestones: [], lastRunId: 'run-2' });
    const better = recordEndlessRun(worse.next, run({ runId: 'run-3', elapsedMs: 130_000, vignettes: 12, peakBpm: 138 }));
    expect(better.newBest).toBe(true);
    expect(better.record.bestMs).toBe(130_000);
    expect(better.newMilestones).toEqual(['120s']);
    expect(better.record.milestones).toEqual(['120s']);
    // An equal time is not a new best.
    expect(recordEndlessRun(better.next, run({ runId: 'run-4', elapsedMs: 130_000 })).newBest).toBe(false);
  });

  it('records a run once, however often the same id arrives', () => {
    const first = recordEndlessRun(EMPTY_ENDLESS_PROGRESS, run());
    const again = recordEndlessRun(first.next, run());
    expect(again.duplicate).toBe(true);
    expect(again.next).toBe(first.next);
    expect(again.newBest).toBe(false);
    expect(again.record.validRuns).toBe(1);
  });

  it('earns each badge once, in order, and keeps the ones it has', () => {
    const a = recordEndlessRun(EMPTY_ENDLESS_PROGRESS, run({ elapsedMs: 300_000 }));
    expect(a.newMilestones).toEqual(['120s', '300s']);
    const b = recordEndlessRun(a.next, run({ runId: 'run-2', elapsedMs: 125_000 }));
    expect(b.newMilestones).toEqual([]);
    expect(b.record.milestones).toEqual(['120s', '300s']);
    const c = recordEndlessRun(b.next, run({ runId: 'run-3', elapsedMs: 600_000 }));
    expect(c.newMilestones).toEqual(['600s']);
    expect(c.record.milestones).toEqual(['120s', '300s', '600s']);
  });

  it('refuses a time the leaderboard would refuse, and a run without an id', () => {
    for (const elapsedMs of [-1, 1.5, Number.NaN, ENDLESS.maxRunMs + 1]) {
      const r = recordEndlessRun(EMPTY_ENDLESS_PROGRESS, run({ elapsedMs }));
      expect(r.next).toBe(EMPTY_ENDLESS_PROGRESS);
      expect(r.newBest).toBe(false);
    }
    expect(recordEndlessRun(EMPTY_ENDLESS_PROGRESS, run({ runId: '' })).next).toBe(EMPTY_ENDLESS_PROGRESS);
  });

  it('keeps each ruleset apart', () => {
    const v1 = recordEndlessRun(EMPTY_ENDLESS_PROGRESS, run({ elapsedMs: 200_000 }));
    const v2 = recordEndlessRun(v1.next, run({ runId: 'run-2', rulesVersion: 2, elapsedMs: 50_000 }));
    expect(v2.newBest).toBe(true);
    expect(endlessRecord(v2.next, 1).bestMs).toBe(200_000);
    expect(endlessRecord(v2.next, 2).bestMs).toBe(50_000);
    expect(endlessRecord(v2.next, 3)).toEqual(EMPTY_RECORD);
  });
});

describe('storage', () => {
  it('round-trips, and reads blocked or missing storage as empty', () => {
    const storage = memory();
    const progress = markEndlessUnlockSeen(recordEndlessRun(EMPTY_ENDLESS_PROGRESS, run({ elapsedMs: 130_000 })).next);
    expect(saveEndlessProgress(progress, storage)).toBe(true);
    expect(loadEndlessProgress(storage)).toEqual(progress);
    expect(loadEndlessProgress(null)).toEqual(EMPTY_ENDLESS_PROGRESS);
    expect(saveEndlessProgress(progress, null)).toBe(false);
    const throwing = { ...memory(), getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } } as unknown as Storage;
    expect(loadEndlessProgress(throwing)).toEqual(EMPTY_ENDLESS_PROGRESS);
    expect(saveEndlessProgress(progress, throwing)).toBe(false);
    expect(storage.data[ENDLESS_PROGRESS_KEY]).toContain('"version":1');
  });

  it('is a key of its own, beside the road\'s save and the Daily Tempo best', () => {
    expect(ENDLESS_PROGRESS_KEY).toBe('tiny-tempo.endless.v1');
    expect(ENDLESS_PROGRESS_KEY).not.toBe('small-acts.progress.v1');
    expect(ENDLESS_PROGRESS_KEY).not.toBe('tiny-tempo.daily-tempo-best.v1');
  });

  it('drops a damaged record and keeps the rest', () => {
    const good = { bestMs: 1000, bestVignettes: 1, bestBpm: 130, validRuns: 1, milestones: ['120s', 'bogus'], lastRunId: 'x' };
    const raw = JSON.stringify({ version: 1, seenUnlock: 'yes', records: { '1': good, '2': { bestMs: -5 }, abc: good, '3': 'junk' } });
    const parsed = parseEndlessProgress(raw);
    expect(Object.keys(parsed.records)).toEqual(['1']);
    expect(parsed.records['1']).toEqual({ ...good, milestones: ['120s'] });
    expect(parsed.seenUnlock).toBe(false);
    for (const junk of ['', 'not json', '[]', '42', JSON.stringify({ records: null })]) expect(parseEndlessProgress(junk)).toEqual(EMPTY_ENDLESS_PROGRESS);
  });

  it('rejects any record field that is not a bounded whole number', () => {
    const base = { bestMs: 1000, bestVignettes: 1, bestBpm: 130, validRuns: 1, milestones: [], lastRunId: null };
    expect(parseEndlessRecord(base)).toEqual(base);
    for (const bad of [
      { bestMs: 1.5 }, { bestMs: -1 }, { bestMs: Number.POSITIVE_INFINITY }, { bestMs: '1000' }, { bestMs: ENDLESS.maxRunMs + 1 },
      { validRuns: -1 }, { bestBpm: 2000 }, { bestVignettes: 'many' },
    ]) expect(parseEndlessRecord({ ...base, ...bad })).toBeNull();
    expect(parseEndlessRecord({ ...base, lastRunId: 42 })!.lastRunId).toBeNull();
    expect(parseEndlessRecord({ ...base, lastRunId: 'x'.repeat(65) })!.lastRunId).toBeNull();
    expect(parseEndlessRecord({ ...base, milestones: 'all' })!.milestones).toEqual([]);
    expect(parseEndlessRecord(null)).toBeNull();
  });

  it('marks the unlock seen once', () => {
    const seen = markEndlessUnlockSeen(EMPTY_ENDLESS_PROGRESS);
    expect(seen.seenUnlock).toBe(true);
    expect(markEndlessUnlockSeen(seen)).toBe(seen);
  });
});
