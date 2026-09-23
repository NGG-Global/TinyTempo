import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { levelSpec } from '../src/game/levels';
import {
  loadProgress, markDemonstrationSeen, markScrapbookSeen, mergeProgress, recordResult, seenScrapbook, seenSubdivisions,
  type Progress,
} from '../src/game/progress';
import { decodeSaveCode, encodeSaveCode } from '../src/game/saveCode';
import {
  KEEPSAKES, collectionCount, earnedBy, keepsakeAt, keepsakeEarned, levelOf, ownedKeepsakes, ownsKeepsake, scrapbookPages,
} from '../src/game/scrapbook';
import { levelStars } from '../src/game/stars';
import { validName } from '../src/analytics/eventShape';
import { VIGNETTES } from '../src/vignettes/registry';

vi.mock('phaser', () => ({ default: {} }));

const EMPTY: Progress = { unlocked: 1, best: {} };
/** A best accuracy exactly on a level's star threshold. */
const on = (level: number, stars: 1 | 2 | 3) => levelSpec(level).starAccuracy[stars - 1]!;
/** A save where every level up to `through` holds exactly `stars` stars. */
function road(through: number, stars: 1 | 2 | 3): Progress {
  const best: Record<number, number> = {};
  for (let level = 1; level <= through; level++) best[level] = on(level, stars);
  return { unlocked: through + 1, best };
}
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

describe('the collection', () => {
  it('is the recorded set, so no keepsake can move to another level unnoticed', () => {
    // A keepsake's level is where players earned it. Moving one would take it from some
    // players and hand it to others; appending a new one is the only safe change.
    const pinned = JSON.parse(readFileSync(new URL('./fixtures/keepsakes.json', import.meta.url), 'utf8')) as Record<string, [string, number, number]>;
    for (const [id, [vignette, lap, level]] of Object.entries(pinned)) {
      const keepsake = KEEPSAKES.find(k => k.id === id);
      expect(keepsake, `keepsake ${id} was removed or renamed`).toBeDefined();
      expect([keepsake!.vignette, keepsake!.lap, keepsake!.level]).toEqual([vignette, lap, level]);
    }
    // Entries may be added after the pinned ones, never before or between them.
    expect(KEEPSAKES.slice(0, Object.keys(pinned).length).map(k => k.id)).toEqual(Object.keys(pinned));
  });

  it('has a deterministic total and no duplicates of any kind', () => {
    expect(KEEPSAKES).toHaveLength(50);
    expect(new Set(KEEPSAKES.map(k => k.id)).size).toBe(KEEPSAKES.length);
    expect(new Set(KEEPSAKES.map(k => k.level)).size).toBe(KEEPSAKES.length);
    expect(new Set(KEEPSAKES.map(k => `${k.vignette}:${k.lap}`)).size).toBe(KEEPSAKES.length);
    expect(new Set(KEEPSAKES.map(k => k.name)).size).toBe(KEEPSAKES.length);
    expect(collectionCount(EMPTY)).toEqual({ owned: 0, total: 50 });
  });

  it('gives every act at least one keepsake, and the acts with looks a second', () => {
    for (const definition of VIGNETTES) {
      expect(KEEPSAKES.some(k => k.vignette === definition.id && k.lap === 0), definition.id).toBe(true);
    }
    expect(KEEPSAKES.filter(k => k.lap === 1).map(k => k.vignette).sort())
      .toEqual(VIGNETTES.map(definition => definition.id).sort());
  });

  it('puts each keepsake on the level where its act plays that lap, so it shows that level’s look', () => {
    for (const keepsake of KEEPSAKES) {
      const spec = levelSpec(keepsake.level);
      expect(spec.vignette, keepsake.id).toBe(keepsake.vignette);
      expect(spec.lap, keepsake.id).toBe(keepsake.lap);
      expect(keepsake.level).toBe(levelOf(keepsake.vignette, keepsake.lap));
    }
    expect(keepsakeAt(1)!.id).toBe('hammer-lucky-nail');
    expect(keepsakeAt(28)!.id).toBe('bug-ladybird');
    expect(keepsakeAt(26)!.id).toBe('hammer-brass-head');
    expect(() => levelOf('nobody', 0)).toThrow();
  });

  it('uses ids analytics can carry: short, stable and lower-case', () => {
    for (const keepsake of KEEPSAKES) {
      expect(keepsake.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(keepsake.id.length).toBeLessThanOrEqual(40);
      expect(keepsake.id.startsWith(`${keepsake.vignette.split('-')[0]}`)).toBe(true);
    }
    // The parameter names the unlock event carries are Firebase-safe too.
    for (const name of ['vignette', 'collectible']) expect(validName(name, 40)).toBe(true);
  });

  it('groups the book by act in the rotation’s order, and each act’s keepsakes by lap', () => {
    const pages = scrapbookPages();
    expect(pages.map(p => p.vignette)).toEqual(VIGNETTES.map(v => v.id));
    for (const page of pages) {
      const laps = page.keepsakes.map(k => k.lap);
      expect(laps).toEqual([...laps].sort((a, b) => a - b));
    }
    expect(pages.flatMap(p => p.keepsakes)).toHaveLength(KEEPSAKES.length);
  });

  it('says in so many words what earns each keepsake', () => {
    expect(earnedBy(keepsakeAt(14)!)).toBe('Three stars on level 14');
  });
});

describe('what earns a keepsake', () => {
  it('is three stars on its level: two is not enough, exactly the threshold is', () => {
    const nail = keepsakeAt(1)!;
    expect(ownsKeepsake({ unlocked: 2, best: { 1: on(1, 2) } }, nail)).toBe(false);
    expect(ownsKeepsake({ unlocked: 2, best: { 1: on(1, 3) - 0.01 } }, nail)).toBe(false);
    expect(ownsKeepsake({ unlocked: 2, best: { 1: on(1, 3) } }, nail)).toBe(true);
    expect(ownsKeepsake({ unlocked: 2, best: { 1: 100 } }, nail)).toBe(true);
  });

  it('is the stars and nothing else: never another level, never a total', () => {
    // Every other level at three stars, this one at two: not owned.
    const best: Record<number, number> = { ...road(60, 3).best, 7: on(7, 2) };
    expect(ownsKeepsake({ unlocked: 61, best }, keepsakeAt(7)!)).toBe(false);
    expect(ownedKeepsakes({ unlocked: 61, best })).toHaveLength(31);
  });

  it('reports the moment a finished level earns its keepsake, and never again after', () => {
    const level = 12;
    let progress = road(11, 3);
    const results = [on(level, 1), on(level, 2), on(level, 3), 100, on(level, 3), on(level, 2)];
    const earned = results.map(accuracy => {
      const outcome = recordResult(progress, level, accuracy);
      const keepsake = keepsakeEarned(progress, outcome.progress, level);
      progress = outcome.progress;
      return keepsake?.id ?? null;
    });
    expect(earned).toEqual([null, null, 'light-salon-switch', null, null, null]);
    expect(ownsKeepsake(progress, keepsakeAt(level)!)).toBe(true);
  });

  it('never reports a keepsake for a level that has none', () => {
    const outcome = recordResult(road(25, 3), 26, 100);
    expect(keepsakeEarned(road(25, 3), outcome.progress, 26)).toBeNull();
  });
});

describe('existing saves', () => {
  it('already own everything their three-star scores qualify for, with no new state', () => {
    // A save as the game wrote it before the Scrapbook existed.
    const best: Record<string, number> = {};
    for (let level = 1; level <= 40; level++) best[level] = on(level, level % 3 === 0 ? 2 : 3);
    const storage = memory({ 'small-acts.progress.v1': JSON.stringify({ version: 1, unlocked: 41, best }) });
    const progress = loadProgress(storage);
    const owned = ownedKeepsakes(progress).map(k => k.level);
    const expected = KEEPSAKES.filter(k => k.level <= 40 && k.level % 3 !== 0).map(k => k.level);
    expect(owned).toEqual(expected);
    // Nothing was written to own them.
    expect(Object.keys(storage.data)).toEqual(['small-acts.progress.v1']);
  });

  it('keep every other teach flag when the Scrapbook marks itself seen', () => {
    const storage = memory({ 'small-acts.teach.v1': JSON.stringify({ seen: true, triplet: true }) });
    expect(seenScrapbook(storage)).toBe(false);
    markScrapbookSeen(storage);
    markDemonstrationSeen(storage);
    expect(seenScrapbook(storage)).toBe(true);
    expect(seenSubdivisions(storage)).toEqual({ triplet: true, sixteenth: false });
  });
});

describe('restores and merges', () => {
  it('only ever add keepsakes: a merge owns exactly what either side owned', () => {
    const phone = { ...road(20, 2), best: { ...road(20, 2).best, 3: on(3, 3), 9: on(9, 3) } };
    const tablet = { ...road(30, 1), best: { ...road(30, 1).best, 9: on(9, 3), 14: 100, 28: 100 } };
    const merged = mergeProgress(phone, tablet);
    const ids = (p: Progress) => ownedKeepsakes(p).map(k => k.id).sort();
    expect(ids(merged)).toEqual([...new Set([...ids(phone), ...ids(tablet)])].sort());
    // Levels 3 and 9 from the phone; 9, 14 and 28 from the tablet.
    expect(ids(merged)).toEqual(['bug-ladybird', 'bug-plum-beetle', 'paper-star', 'roller-swatch'].sort());
    // Merging again changes nothing: no keepsake is counted twice.
    expect(ids(mergeProgress(merged, tablet))).toEqual(ids(merged));
    expect(collectionCount(mergeProgress(merged, merged)).owned).toBe(ids(merged).length);
  });

  it('travel in a save code without the code knowing about them', () => {
    const progress = { ...road(50, 2), best: { ...road(50, 2).best, 1: 100, 24: on(24, 3), 50: on(50, 3) } };
    const code = encodeSaveCode({ progress, settings: { calibrationMs: 0, muted: false, haptics: true }, tutorialComplete: true });
    const decoded = decodeSaveCode(code);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(ownedKeepsakes(decoded.data.progress).map(k => k.id)).toEqual(ownedKeepsakes(progress).map(k => k.id));
    expect(ownedKeepsakes(decoded.data.progress).map(k => k.level)).toEqual([1, 24, 50]);
    // And the stars that carry them survived intact.
    for (const level of [1, 24, 50]) expect(levelStars(decoded.data.progress, level)).toBe(3);
  });
});
