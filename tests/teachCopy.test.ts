import { describe, expect, it, vi } from 'vitest';
import { noBallLevel, showsBall, TEACH_WORDS, teachWords, type TeachPass } from '../src/game/teachCopy';
import { guidedLevel } from '../src/game/progress';
import type { Moment } from '../src/game/TutorialRun';

vi.mock('phaser', () => ({ default: {} }));

const MOMENTS: readonly Moment[] = ['count', 'theirs', 'runway', 'yours', 'after'];

describe('the ball on the first levels', () => {
  it('rides the block through the first few levels and no further', () => {
    expect(TEACH_WORDS.ballThrough).toBe(3);
    expect([1, 2, 3].map(showsBall)).toEqual([true, true, true]);
    expect([0, 4, 5, 10].map(showsBall)).toEqual([false, false, false, false]);
  });

  it('is announced gone on the first level without it, until that level is cleared', () => {
    expect(noBallLevel({ unlocked: 1, best: {} })).toBe(4);
    expect(noBallLevel({ unlocked: 4, best: { 1: 90, 2: 80, 3: 85 } })).toBe(4);
    expect(noBallLevel({ unlocked: 5, best: { 1: 90, 2: 80, 3: 85, 4: 70 } })).toBeNull();
    // A save already past it, from before the words existed, is never told.
    expect(noBallLevel({ unlocked: 30, best: { 4: 60 } })).toBeNull();
    // Derived the way the guided level is: level 1 until cleared.
    expect(guidedLevel({ unlocked: 1, best: {} })).toBe(1);
  });
});

describe('the words over the first levels', () => {
  it('name the ball, the rows and the baton, and say when it is the player’s turn', () => {
    expect(teachWords('watch', 'count')).toMatch(/red ball/i);
    expect(teachWords('watch', 'theirs')).toMatch(/game’s turn/);
    expect(teachWords('watch', 'runway')).toMatch(/baton/);
    expect(teachWords('watch', 'yours')).toMatch(/your turn/i);
    expect(teachWords('watch', 'after')).toMatch(/tap when the ball hits a circle/i);
    expect(teachWords('play', 'count')).toMatch(/follow the red ball/i);
    expect(teachWords('play', 'theirs')).toMatch(/game’s turn/);
    expect(teachWords('play', 'runway')).toMatch(/baton/);
    expect(teachWords('play', 'yours')).toMatch(/tap when the ball hits a circle/i);
    expect(teachWords('noBall', 'count')).toBe('No ball this time. Follow the rhythm.');
    expect(teachWords('noBall', 'yours')).toBe('No ball this time. Follow the rhythm.');
  });

  it('say nothing over a coda, and keep every line short enough to sit under the act’s title', () => {
    expect(teachWords('play', 'after')).toBe('');
    expect(teachWords('noBall', 'after')).toBe('');
    const passes: TeachPass[] = ['watch', 'play', 'noBall'];
    for (const pass of passes) {
      for (const moment of MOMENTS) {
        const line = teachWords(pass, moment);
        expect(line.length, `${pass} ${moment}`).toBeLessThanOrEqual(40);
        expect(line).not.toContain('\n');
      }
    }
  });
});
