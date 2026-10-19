import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: { Geom: {}, Math: {} } }));

const { ACHIEVEMENT_BATCH, CONSOLE_NAMES } = await import('../src/config/achievementImport');
const { ACHIEVEMENTS } = await import('../src/config/achievements');
const { firstLevelWith } = await import('../src/game/conceptIntro');
const { areaOf, levelSpec } = await import('../src/game/levels');
const { KEEPSAKES } = await import('../src/game/scrapbook');
const { areaIndexOf } = await import('../src/game/stars');
const { DEBUT_LEVELS, VIGNETTES } = await import('../src/vignettes/registry');
const { achievementArtIds } = await import('../src/ui/achievementArt');

const csv = (path: string): string | null => {
  const url = new URL(`../store/achievements/import/${path}`, import.meta.url);
  return existsSync(url) ? readFileSync(url, 'utf8') : null;
};

describe('the Play Console achievement import', () => {
  it('keeps every row inside the import format', () => {
    for (const row of ACHIEVEMENT_BATCH) {
      expect(row.name.length, row.key).toBeLessThanOrEqual(100);
      expect(row.description.length, row.key).toBeLessThanOrEqual(500);
      // The CSV has no quoting: a comma would move every column after it.
      expect(row.name + row.description, row.key).not.toMatch(/[,"\n]/);
      expect(row.points % 5, row.key).toBe(0);
      expect(row.points, row.key).toBeGreaterThanOrEqual(5);
      expect(row.points, row.key).toBeLessThanOrEqual(200);
    }
  });

  it('repeats no name, key or list place, here or in the Console', () => {
    const names = ACHIEVEMENT_BATCH.map(row => row.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(CONSOLE_NAMES).not.toContain(name);
    const keys = ACHIEVEMENT_BATCH.map(row => row.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const existing of ACHIEVEMENTS) expect(keys).not.toContain(existing.key);
    expect(ACHIEVEMENT_BATCH.map(row => row.order)).toEqual(ACHIEVEMENT_BATCH.map((_, i) => 11 + i));
  });

  it('leaves the whole game under 1,000 points if the first ten hold 435 or less', () => {
    expect(ACHIEVEMENT_BATCH.reduce((sum, row) => sum + row.points, 0)).toBe(565);
  });

  it('names each level by what the game really puts there', () => {
    for (const row of ACHIEVEMENT_BATCH) {
      if (!('clearLevel' in row.earn)) continue;
      const level = row.earn.clearLevel;
      if (row.art.startsWith('area-')) {
        expect(levelSpec(level).finale, row.key).toBe(true);
        expect(row.name).toBe(`${areaOf(level).name} Complete`);
        expect(row.art).toBe(`area-${areaIndexOf(level)}`);
      }
    }
    const level = (key: string): number => {
      const earn = ACHIEVEMENT_BATCH.find(row => row.key === key)!.earn;
      return 'clearLevel' in earn ? earn.clearLevel : NaN;
    };
    expect(level('clear-6')).toBe(firstLevelWith('offbeat'));
    expect(level('clear-18')).toBe(firstLevelWith('longPhrase'));
    expect(level('clear-43')).toBe(firstLevelWith('triplet'));
    expect(level('clear-59')).toBe(firstLevelWith('sixteenth'));
    // Full Cast: the last act's debut, and the description's count.
    expect(level('clear-171')).toBe(Math.max(...DEBUT_LEVELS));
    expect(ACHIEVEMENT_BATCH.find(row => row.key === 'clear-171')!.description).toContain(`all ${VIGNETTES.length} acts`);
    // Treasure Trove says half the Scrapbook.
    const trove = ACHIEVEMENT_BATCH.find(row => row.key === 'keepsakes-36')!.earn;
    expect('keepsakes' in trove && trove.keepsakes * 2).toBe(KEEPSAKES.length);
  });

  it('has a drawing for every icon', () => {
    const drawn = achievementArtIds();
    for (const row of ACHIEVEMENT_BATCH) expect(drawn, row.key).toContain(row.art);
  });

  it('ships a ZIP built from this list', () => {
    const metadata = csv('AchievementsMetadata.csv');
    const mappings = csv('AchievementsIconsMappings.csv');
    expect(metadata, 'run node scripts/achievement-import.mjs').not.toBeNull();
    expect(metadata!.trimEnd().split('\n')).toEqual(ACHIEVEMENT_BATCH.map(r => `${r.name},${r.description},False,,Revealed,${r.points},${r.order}`));
    expect(mappings!.trimEnd().split('\n')).toEqual(ACHIEVEMENT_BATCH.map(r => `${r.name},${r.key}.png`));
  });
});
