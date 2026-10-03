import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetMusicBedState } from '../src/audio/musicBed';
import { startTheme, stopTheme, type ThemeHost } from '../src/audio/sharedAudio';

vi.mock('phaser', () => ({ default: {} }));

/**
 * Which music plays off the title screen and off the road. Settings, the Scrapbook and
 * the pages under Settings play whatever the screen that opened them plays: the title
 * theme from the title screen, the gameplay loop from the map. Tap offset plays neither.
 */

function host(state: 'running' | 'suspended' = 'running') {
  let resolveResume: () => void = () => {};
  const context = {
    state,
    resume: vi.fn(() => new Promise<void>(resolve => { resolveResume = () => { context.state = 'running'; resolve(); }; })),
  };
  const music = {
    playbackGeneration: 1, activeSources: 0, gain: 0, trackGain: 0.8,
    setGain: vi.fn(), stop: vi.fn(),
  };
  const theme = { enter: vi.fn(async () => {}), leave: vi.fn() };
  const engine = { context, music, theme } as unknown as ThemeHost;
  return { engine, context, music, theme, resume: () => resolveResume() };
}

afterEach(() => resetMusicBedState());

describe('the title theme off the title screen', () => {
  it('plays on a screen the title screen opened, with the gameplay loop silenced under it', async () => {
    const { engine, theme, music } = host();
    music.activeSources = 0;
    await startTheme(engine);
    expect(theme.enter).toHaveBeenCalledTimes(1);
    // The loop's bed went silent before the theme was asked for, so the two never overlap.
    expect(music.setGain).toHaveBeenCalled();
  });

  it('carries a theme that is already playing rather than restarting it', () => {
    // `ThemeMusic.enter` leaves a running source alone (tests/theme.test.ts, "does not
    // stack a second copy"), and the title screen no longer stops it on the way to Settings
    // or the Scrapbook — so the track plays on through the curtain.
    const menu = readFileSync('src/scenes/MenuScene.ts', 'utf8');
    const settings = menu.slice(menu.indexOf("this.puckPressed = 'setup';"), menu.indexOf('SceneKey.Settings, { from: SceneKey.Menu }'));
    const book = menu.slice(menu.indexOf("this.puckPressed = 'book';"), menu.indexOf('SceneKey.Scrapbook, { from: SceneKey.Menu }'));
    for (const way of [settings, book]) {
      expect(way).toContain('this.keepTheme = true;');
      expect(way).not.toContain('closeTheme');
    }
    expect(menu).toContain('if (!this.keepTheme) this.closeTheme();');
    expect(menu).toMatch(/this\.disposed = false;\n\s+this\.keepTheme = false;/);
  });

  it('gives up a start that is still waiting when something stops the theme first', async () => {
    // Settings opened, and Tap offset straight after it, while the context was resuming:
    // the late start must not bring the theme up under the metronome.
    const { engine, theme, resume } = host('suspended');
    const pending = startTheme(engine);
    stopTheme(engine);
    resume();
    await pending;
    expect(theme.enter).not.toHaveBeenCalled();
    expect(theme.leave).toHaveBeenCalledTimes(1);
  });

  it('stops quietly when there is no engine yet', () => {
    expect(() => stopTheme(null)).not.toThrow();
  });
});

describe('which screen plays what', () => {
  const source = (file: string) => readFileSync(file, 'utf8');

  it('chooses by the screen that opened it', () => {
    expect(source('src/scenes/SettingsScene.ts')).toContain('ensureScreenMusic(this, this.from === SceneKey.Menu);');
    expect(source('src/scenes/ScrapbookScene.ts')).toContain('ensureScreenMusic(this, this.from === SceneKey.Menu);');
    for (const page of ['src/scenes/TransferScene.ts', 'src/scenes/SupportScene.ts']) {
      expect(source(page), page).toContain('ensureScreenMusic(this, this.enteredFrom() === SceneKey.Menu);');
      expect(source(page), page).not.toContain('ensureShellMusic(this)');
    }
  });

  it('keeps the road on the gameplay loop, and Tap offset on its metronome alone', () => {
    const shared = source('src/audio/sharedAudio.ts');
    const shell = shared.slice(shared.indexOf('export function ensureShellMusic('), shared.indexOf('export function ensureScreenMusic('));
    // The map's own call, and Settings opened from it, both stop a theme that is still around.
    expect(shell).toContain('stopTheme(audio);');
    expect(source('src/scenes/MapScene.ts')).toContain('ensureShellMusic(this);');
    expect(source('src/scenes/CalibrateScene.ts')).toMatch(/stopTheme\(currentAudio\(this\)\);\n\s+hushMusic\(this\);/);
  });

  it('still stops the theme on every other way off the title screen', () => {
    const menu = source('src/scenes/MenuScene.ts');
    const play = menu.slice(menu.indexOf('private async play('), menu.indexOf('private shutdown('));
    expect(play).toContain('this.closeTheme();');
    expect(menu).toContain('stopTheme(currentAudio(this));');
  });
});
