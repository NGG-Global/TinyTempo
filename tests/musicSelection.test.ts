import { describe, expect, it } from 'vitest';
import { GAMEPLAY_TRACKS, MUSIC, TRACK_CYCLE } from '../src/config/music';
import { trackForLevel } from '../src/game/musicSelection';

describe('which track a level plays', () => {
  it('takes the tracks in turn, a chapter of twenty-five levels each', () => {
    expect(MUSIC.chapterLevels).toBe(25);
    expect(TRACK_CYCLE).toEqual(['a', 'b']);
    expect(trackForLevel(1)).toBe('a');
    expect(trackForLevel(25)).toBe('a');
    expect(trackForLevel(26)).toBe('b');
    expect(trackForLevel(50)).toBe('b');
    expect(trackForLevel(51)).toBe('a');
    expect(trackForLevel(75)).toBe('a');
    expect(trackForLevel(76)).toBe('b');
    expect(trackForLevel(1000)).toBe(TRACK_CYCLE[Math.floor(999 / 25) % TRACK_CYCLE.length]);
  });
  it('is the level alone, so nothing has to be stored', () => {
    for (let level = 1; level <= 200; level++) expect(trackForLevel(level)).toBe(trackForLevel(level));
    expect(() => trackForLevel(0)).toThrow(/start at 1/);
    expect(() => trackForLevel(1.5)).toThrow(/start at 1/);
  });
  it('names only shipped tracks, each a whole number of bars at the source tempo', () => {
    for (const id of TRACK_CYCLE) {
      const track = GAMEPLAY_TRACKS[id];
      expect(track.url).toMatch(/\.mp3$/);
      expect(Number.isInteger(track.bars)).toBe(true);
      expect(track.gain).toBeGreaterThan(0);
      expect(track.gain).toBeLessThanOrEqual(1);
    }
  });
});
