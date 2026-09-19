import { afterEach, describe, expect, it, vi } from 'vitest';
import { isTabletSized, isTouchPrimary, wrongOrientation } from '../src/core/shell';

/**
 * The rule that decides whether the game asks to be turned back to portrait — and, in
 * PlayScene and TutorialScene, whether the level runs at all. It was three copies of one
 * expression before Android stopped honouring the portrait lock on large displays.
 */
function stubDevice(options: { readonly coarse: boolean; readonly width: number; readonly height: number }): void {
  vi.stubGlobal('window', {
    innerWidth: options.width,
    innerHeight: options.height,
    matchMedia: (query: string) => ({ matches: query.includes('coarse') ? options.coarse : false }),
  });
}

const HANDSET_PORTRAIT = { coarse: true, width: 393, height: 851 };
const HANDSET_LANDSCAPE = { coarse: true, width: 851, height: 393 };
const TABLET_PORTRAIT = { coarse: true, width: 768, height: 1024 };
const TABLET_LANDSCAPE = { coarse: true, width: 1024, height: 768 };
const DESKTOP = { coarse: false, width: 1440, height: 900 };

afterEach(() => { vi.unstubAllGlobals(); });

describe('what counts as a tablet', () => {
  it('measures the shorter side, so orientation cannot change the answer', () => {
    stubDevice(TABLET_LANDSCAPE);
    expect(isTabletSized()).toBe(true);
    stubDevice(TABLET_PORTRAIT);
    expect(isTabletSized()).toBe(true);
    stubDevice(HANDSET_LANDSCAPE);
    expect(isTabletSized()).toBe(false);
    stubDevice(HANDSET_PORTRAIT);
    expect(isTabletSized()).toBe(false);
  });

  it('puts the boundary where Android puts it, at 600 inclusive', () => {
    stubDevice({ coarse: true, width: 600, height: 960 });
    expect(isTabletSized()).toBe(true);
    stubDevice({ coarse: true, width: 599, height: 960 });
    expect(isTabletSized()).toBe(false);
  });
});

describe('asking for portrait', () => {
  it('asks a handset held sideways', () => {
    stubDevice(HANDSET_LANDSCAPE);
    expect(wrongOrientation(true)).toBe(true);
  });

  it('says nothing to a handset already held upright', () => {
    stubDevice(HANDSET_PORTRAIT);
    expect(wrongOrientation(false)).toBe(false);
  });

  it('leaves a tablet in landscape alone', () => {
    // Android ignores the manifest lock at 600dp and up, so this would be a prompt the
    // player cannot obey — and it would stop PlayScene and TutorialScene outright.
    stubDevice(TABLET_LANDSCAPE);
    expect(wrongOrientation(true)).toBe(false);
  });

  it('leaves a tablet in portrait alone too', () => {
    stubDevice(TABLET_PORTRAIT);
    expect(wrongOrientation(false)).toBe(false);
  });

  it('never nags a landscape desktop window, which is a normal development setup', () => {
    stubDevice(DESKTOP);
    expect(isTouchPrimary()).toBe(false);
    expect(wrongOrientation(true)).toBe(false);
  });

  it('is false for every device when the game is not in landscape', () => {
    for (const device of [HANDSET_PORTRAIT, HANDSET_LANDSCAPE, TABLET_LANDSCAPE, DESKTOP]) {
      stubDevice(device);
      expect(wrongOrientation(false)).toBe(false);
    }
  });
});
