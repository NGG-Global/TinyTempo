import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { keptKeepsakes, LEGACY_KEEPSAKE_LEVELS, legacyOwned, parseKept } from '../src/game/keepsakeLegacy';
import { levelSpec } from '../src/game/levels';
import type { Progress } from '../src/game/progress';
import { recordResult } from '../src/game/progress';
import { KEEPSAKES, keepsakeAt, keepsakeEarned, ownedKeepsakes, ownsKeepsake } from '../src/game/scrapbook';

vi.mock('phaser', () => ({ default: {} }));

const PROGRESS_KEY = 'small-acts.progress.v1';
const KEPT_KEY = 'tiny-tempo.keepsakes.v1';
const on = (level: number, stars: 1 | 2 | 3) => levelSpec(level).starAccuracy[stars - 1]!;
const byId = (id: string) => KEEPSAKES.find(k => k.id === id)!;

function memory(initial: Record<string, string> = {}): Storage & { readonly data: Record<string, string>; writes: number } {
  const data: Record<string, string> = { ...initial };
  const store = {
    data, writes: 0,
    get length() { return Object.keys(data).length; },
    clear: () => { for (const key of Object.keys(data)) delete data[key]; },
    getItem: (key: string) => data[key] ?? null,
    key: (index: number) => Object.keys(data)[index] ?? null,
    removeItem: (key: string) => { delete data[key]; },
    setItem: (key: string, value: string) => { store.writes++; data[key] = value; },
  };
  return store;
}

/** A tester's save from before the debut schedule: three stars on the old levels 9, 18 and 28. */
const TESTER: Progress = { unlocked: 31, best: { 9: on(9, 3), 18: on(18, 3), 28: on(28, 3), 29: on(29, 2) } };

describe('keepsakes kept from before the debut schedule', () => {
  it('freezes every keepsake’s old level, exactly as the fixture pinned it before the change', () => {
    expect(Object.keys(LEGACY_KEEPSAKE_LEVELS)).toHaveLength(KEEPSAKES.length);
    for (const id of Object.keys(LEGACY_KEEPSAKE_LEVELS)) expect(KEEPSAKES.some(k => k.id === id), id).toBe(true);
    // A sample of the old schedule: one act a level to 25, the second lap to 50, then the eras.
    expect(LEGACY_KEEPSAKE_LEVELS).toMatchObject({
      'hammer-lucky-nail': 1, 'egg-painted': 10, 'bug-ladybird': 28, 'apple-pear': 50, 'barber-pole': 51,
      'paintbrush-studio': 107, 'glasses-lemonade': 393,
    });
    // Not the current levels: the fixture moved, the frozen copy did not.
    const current = JSON.parse(readFileSync(new URL('./fixtures/keepsakes.json', import.meta.url), 'utf8')) as Record<string, [string, number, number]>;
    expect(current['bug-ladybird']![2]).not.toBe(LEGACY_KEEPSAKE_LEVELS['bug-ladybird']);
  });

  it('reads what a save owned under the old schedule: three stars on the old level, nothing less', () => {
    // Old levels 9, 18 and 28: the paper star, the fisherman's lure and the ladybird. Level 29
    // has two stars, so the old cherry round is not among them.
    expect([...legacyOwned(TESTER)].sort()).toEqual(['bug-ladybird', 'fisherman-lure', 'paper-star']);
    expect(legacyOwned({ unlocked: 1, best: {} })).toEqual([]);
  });

  it('records it once, on the first launch, and keeps every one of them owned', () => {
    const storage = memory({ [PROGRESS_KEY]: JSON.stringify(TESTER) });
    const kept = keptKeepsakes(storage);
    expect([...kept].sort()).toEqual(['bug-ladybird', 'fisherman-lure', 'paper-star']);
    expect(JSON.parse(storage.data[KEPT_KEY]!)).toEqual({ version: 1, kept: [...kept] });
    // The ladybird's level is now 15, which this save never played: still owned.
    expect(byId('bug-ladybird').level).toBe(15);
    expect(ownsKeepsake(TESTER, byId('bug-ladybird'), kept)).toBe(true);
    expect(ownsKeepsake(TESTER, byId('bug-ladybird'), new Set())).toBe(false);
    // Level 9 is the paper star on both schedules; owned once either way.
    expect(ownedKeepsakes(TESTER, kept).filter(k => k.id === 'paper-star')).toHaveLength(1);
    // Asked again, nothing is written and the answer is the same set.
    const writes = storage.writes;
    expect(keptKeepsakes(storage)).toBe(kept);
    expect(storage.writes).toBe(writes);
  });

  it('records nothing for a new player, so the new schedule alone decides their collection', () => {
    const storage = memory();
    expect(keptKeepsakes(storage).size).toBe(0);
    expect(JSON.parse(storage.data[KEPT_KEY]!)).toEqual({ version: 1, kept: [] });
    // Three stars later, on an old keepsake level, earn the old keepsake only if it is there now.
    const later = memory({ [KEPT_KEY]: storage.data[KEPT_KEY]!, [PROGRESS_KEY]: JSON.stringify({ unlocked: 29, best: { 28: on(28, 3) } }) });
    expect(keptKeepsakes(later).size).toBe(0);
  });

  it('never reports a kept keepsake as newly earned when its new level is three-starred', () => {
    const kept = new Set(['bug-ladybird']);
    const level = byId('bug-ladybird').level;
    expect(keepsakeAt(level)?.id).toBe('bug-ladybird');
    const before: Progress = { unlocked: level, best: {} };
    const after = recordResult(before, level, 100).progress;
    expect(keepsakeEarned(before, after, level, kept)).toBeNull();
    expect(keepsakeEarned(before, after, level, new Set())?.id).toBe('bug-ladybird');
  });

  it('reads a damaged record as empty and never rewrites it as if this were the first launch', () => {
    for (const raw of ['{', '[]', '{"version":2,"kept":[]}', '{"version":1,"kept":"bug-ladybird"}']) {
      const storage = memory({ [KEPT_KEY]: raw, [PROGRESS_KEY]: JSON.stringify(TESTER) });
      expect(keptKeepsakes(storage).size, raw).toBe(0);
      expect(storage.data[KEPT_KEY]).toBe(raw);
    }
    // Unknown ids are dropped, known ones kept.
    expect([...parseKept('{"version":1,"kept":["bug-ladybird","made-up",3]}')!]).toEqual(['bug-ladybird']);
    expect(parseKept(null)).toBeNull();
    expect(keptKeepsakes(null).size).toBe(0);
  });
});
