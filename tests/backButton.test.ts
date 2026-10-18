import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { dispatchBack, isBackAware, levelBackAction } from '../src/core/backButton';

vi.mock('phaser', () => ({ default: {} }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

const scene = (answer: boolean, log: string[], name: string) => ({ handleBack: () => { log.push(name); return answer; } });

describe('one back press', () => {
  it('goes to a DOM sheet first, and no further when one was up', () => {
    const log: string[] = [];
    expect(dispatchBack(() => true, [scene(true, log, 'map')])).toBe(true);
    expect(log).toEqual([]);
  });

  it('goes to the scenes from the top down, stopping at the first that takes it', () => {
    const log: string[] = [];
    const taken = dispatchBack(() => false, [scene(true, log, 'below'), {}, scene(false, log, 'passes'), scene(true, log, 'top')]);
    expect(taken).toBe(true);
    expect(log).toEqual(['top']);
    const passed: string[] = [];
    expect(dispatchBack(() => false, [scene(true, passed, 'below'), scene(false, passed, 'top')])).toBe(true);
    expect(passed).toEqual(['top', 'below']);
  });

  it('is left untaken when nothing answers, which sends the app to the background', () => {
    expect(dispatchBack(() => false, [{}, { handleBack: 'no' }, null])).toBe(false);
    expect(isBackAware({ handleBack: () => true })).toBe(true);
    expect(isBackAware(undefined)).toBe(false);
  });
});

describe('back in a level', () => {
  const facts = { busy: false, sheetOpen: false, sheetBusy: false, running: false };

  it('pauses a running level and leaves only from a level that is not running', () => {
    expect(levelBackAction({ ...facts, running: true })).toBe('pause');
    expect(levelBackAction(facts)).toBe('leave');
  });

  it('closes the restart sheet first, unless it is mid-action', () => {
    expect(levelBackAction({ ...facts, running: true, sheetOpen: true })).toBe('closeSheet');
    expect(levelBackAction({ ...facts, sheetOpen: true, sheetBusy: true })).toBe('ignore');
  });

  it('keeps the press while a transition, a Continue or a purchase is under way', () => {
    expect(levelBackAction({ ...facts, busy: true, running: true, sheetOpen: true })).toBe('ignore');
  });
});

describe('every screen answers back', () => {
  it('has a handler on each scene the player can be on, and the game boots the listener', () => {
    for (const name of ['Menu', 'Map', 'Play', 'Tutorial', 'Endless', 'Settings', 'Calibrate', 'Transfer', 'Support', 'Scrapbook']) {
      expect(readFileSync(`src/scenes/${name}Scene.ts`, 'utf8'), name).toMatch(/public handleBack\(\): boolean \{/);
    }
    expect(readFileSync('src/main.ts', 'utf8')).toContain('void bootBackButton(game);');
    // The title screen is the only one that lets the press through, to the background, and
    // only once neither of its cards is open.
    expect(readFileSync('src/scenes/MenuScene.ts', 'utf8')).toMatch(/if \(this\.objectivesCard\.open\) \{ this\.objectivesCard\.hide\(\); return true; \}\n    if \(this\.endlessCard\.open\) \{ this\.endlessCard\.hide\(\); return true; \}\n    return false;/);
  });
});
