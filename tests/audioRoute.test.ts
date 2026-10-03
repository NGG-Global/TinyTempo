import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The consent default is read at module load; pinned so these tests do not depend on `.env`.
vi.mock('../src/config/analytics', () => ({ ANALYTICS: { enabled: false, consentGranted: false } }));

import { AudioClock } from '../src/audio/AudioClock';
import {
  activeCalibration, activeOffset, clearActiveCalibration, currentRoute, dismissRouteNotice, onRouteChange,
  resetRouteState, routeNoticeWanted, saveActiveCalibration, setRoute, syncClockCalibration,
} from '../src/audio/audioRoute';
import { routeFrom } from '../src/audio/routeNative';
import {
  adoptLegacy, calibrationFor, NO_CALIBRATION, offsetFor, readRouteCalibration, ROUTE_LABELS, suggestCalibration,
  toRoute, withoutRouteOffset, withRouteOffset, type RouteCalibration,
} from '../src/game/routeCalibration';
import { decodeSaveCode, encodeSaveCode } from '../src/game/saveCode';
import { CALIBRATION_LIMIT_MS, clampCalibration, loadSettings, saveSettings } from '../src/game/settings';
import { createJudge, judgeTap } from '../src/rhythm/judge';

const KEY = 'tiny-tempo.settings.v1';

function memoryStorage(initial: Record<string, string> = {}): Storage & { map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, String(v)); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear(),
    key: () => null,
    get length() { return map.size; },
  } as Storage & { map: Map<string, string> };
}

/** A version-1 save: one offset, no routes — what every device has before this feature. */
const versionOne = (ms: number) => memoryStorage({ [KEY]: JSON.stringify({ version: 1, calibrationMs: ms, muted: false, music: 1, sfx: 1, haptics: true, analytics: false }) });

const stored = (storage: Storage) => JSON.parse(storage.getItem(KEY) ?? '{}') as { version?: number; calibration?: Record<string, number>; calibrationMs?: unknown };

beforeEach(() => resetRouteState());
afterEach(() => vi.restoreAllMocks());

describe('1. an existing calibration migrates without loss', () => {
  it('keeps the old offset as the legacy slot, and uses it exactly as before while no route is known', () => {
    const storage = versionOne(120);
    expect(loadSettings(storage).calibration).toEqual({ ...NO_CALIBRATION, legacy: 120 });
    // The browser, and a native device before its first answer: the old behaviour, to the millisecond.
    expect(currentRoute()).toBe('unknown');
    expect(activeOffset(storage)).toBe(120);
    expect(activeCalibration(storage)).toBe(120);
  });

  it('is adopted by the first real route a device reports, written once, and never moves again', () => {
    const storage = versionOne(120);
    setRoute('bluetooth', storage);
    expect(loadSettings(storage).calibration).toEqual({ ...NO_CALIBRATION, bluetooth: 120 });
    expect(stored(storage)).toMatchObject({ version: 2, calibration: { bluetooth: 120 } });
    expect(stored(storage).calibrationMs).toBeUndefined();
    expect(activeOffset(storage)).toBe(120);
    // A second route later does not take it too: adoption happens once.
    setRoute('speaker', storage);
    expect(loadSettings(storage).calibration).toEqual({ ...NO_CALIBRATION, bluetooth: 120 });
    expect(activeOffset(storage)).toBe(0);
  });

  it('is deterministic, and never overwrites a route that already has its own value', () => {
    const legacy: RouteCalibration = { ...NO_CALIBRATION, legacy: 90 };
    expect(adoptLegacy(legacy, 'wired')).toEqual(adoptLegacy(legacy, 'wired'));
    expect(adoptLegacy(adoptLegacy(legacy, 'wired'), 'wired')).toEqual({ ...NO_CALIBRATION, wired: 90 });
    expect(adoptLegacy({ ...legacy, wired: 12 }, 'wired')).toEqual({ ...NO_CALIBRATION, wired: 12 });
    expect(adoptLegacy(legacy, 'unknown')).toBe(legacy);
  });

  it('treats a version-1 offset of exactly zero as never calibrated', () => {
    expect(loadSettings(versionOne(0)).calibration).toEqual(NO_CALIBRATION);
    const storage = versionOne(0);
    setRoute('speaker', storage);
    expect(activeCalibration(storage)).toBeNull();
  });
});

describe('2–3, 7–8. each route keeps its own offset, and the active route chooses', () => {
  it('calibrates the speaker, then Bluetooth, and each comes back with its route', () => {
    const storage = memoryStorage();
    // 1. Calibrate on the phone speaker.
    setRoute('speaker', storage);
    expect(saveActiveCalibration(18, storage)).toBe(true);
    // 2–3. Earbuds in: a different route, never calibrated, and not the speaker's 18.
    setRoute('bluetooth', storage);
    expect(activeCalibration(storage)).toBeNull();
    expect(activeOffset(storage)).toBe(0);
    // 4. Calibrate Bluetooth: Bluetooth only.
    saveActiveCalibration(142, storage);
    expect(loadSettings(storage).calibration).toMatchObject({ speaker: 18, bluetooth: 142, wired: null });
    // 5–6. Earbuds out: the speaker's own value, at once.
    setRoute('speaker', storage);
    expect(activeOffset(storage)).toBe(18);
    // 7. Earbuds back: Bluetooth's.
    setRoute('bluetooth', storage);
    expect(activeOffset(storage)).toBe(142);
    expect(stored(storage).calibration).toEqual({ speaker: 18, bluetooth: 142 });
  });

  it('resets only the active route', () => {
    const storage = memoryStorage();
    setRoute('speaker', storage);
    saveActiveCalibration(18, storage);
    setRoute('bluetooth', storage);
    saveActiveCalibration(142, storage);
    clearActiveCalibration(storage);
    expect(loadSettings(storage).calibration).toMatchObject({ speaker: 18, bluetooth: null });
    setRoute('speaker', storage);
    expect(activeOffset(storage)).toBe(18);
  });

  it('never lends one route’s value to another', () => {
    const calibration = { ...NO_CALIBRATION, bluetooth: 142 };
    expect(offsetFor(calibration, 'speaker')).toBe(0);
    expect(offsetFor(calibration, 'wired')).toBe(0);
    expect(offsetFor(calibration, 'unknown')).toBe(0);
    expect(calibrationFor(calibration, 'speaker')).toBeNull();
    expect(withRouteOffset(calibration, 'speaker', 20, clampCalibration)).toMatchObject({ speaker: 20, bluetooth: 142 });
  });

  it('a browser’s calibration replaces the legacy value it stood on, and its reset clears both', () => {
    const storage = versionOne(60);
    saveActiveCalibration(75, storage);
    expect(loadSettings(storage).calibration).toEqual({ ...NO_CALIBRATION, unknown: 75 });
    clearActiveCalibration(storage);
    expect(loadSettings(storage).calibration).toEqual(NO_CALIBRATION);
    expect(withoutRouteOffset({ ...NO_CALIBRATION, legacy: 60 }, 'unknown')).toEqual(NO_CALIBRATION);
  });
});

describe('4–5. an unknown or unavailable route', () => {
  it('reads any malformed bridge answer as unknown, which is the old single-offset behaviour', () => {
    expect(routeFrom({ route: 'bluetooth' })).toBe('bluetooth');
    expect(routeFrom({ route: 'wired' })).toBe('wired');
    expect(routeFrom({ route: 'speaker' })).toBe('speaker');
    for (const junk of [null, undefined, 42, 'bluetooth', {}, { route: 'BLUETOOTH' }, { route: 'hdmi' }, { route: 7 }]) {
      expect(routeFrom(junk)).toBe('unknown');
    }
    expect(toRoute('earpiece')).toBe('unknown');
    expect(ROUTE_LABELS.unknown).toBeTruthy();
  });

  it('a device that reports unknown neither crashes nor migrates nor changes the offset', () => {
    const storage = versionOne(40);
    expect(() => setRoute('unknown', storage)).not.toThrow();
    expect(loadSettings(storage).calibration).toEqual({ ...NO_CALIBRATION, legacy: 40 });
    expect(activeOffset(storage)).toBe(40);
    // Blocked storage is the defaults, not a throw.
    expect(activeOffset(null)).toBe(0);
    expect(saveActiveCalibration(20, null)).toBe(false);
  });

  it('the browser never leaves unknown: the route boot returns before touching a plugin', async () => {
    const { bootAudioRoute } = await import('../src/audio/routeBoot');
    await expect(bootAudioRoute()).resolves.toBeUndefined();
    expect(currentRoute()).toBe('unknown');
  });

  it('a listener that throws does not stop the route, or the next listener', () => {
    const heard: string[] = [];
    onRouteChange(() => { throw new Error('screen gone'); });
    const stop = onRouteChange(route => heard.push(route));
    setRoute('wired', memoryStorage());
    stop();
    setRoute('speaker', memoryStorage());
    expect(heard).toEqual(['wired']);
  });
});

describe('6. a route change never reaches a task already being judged', () => {
  /** A clock on a fixed, latency-free context, with the page clock pinned. */
  function pinnedClock(): AudioClock {
    vi.spyOn(performance, 'now').mockReturnValue(10_000);
    const context = { currentTime: 10, baseLatency: 0, outputLatency: 0 } as unknown as AudioContext;
    const clock = new AudioClock(context);
    clock.refresh();
    return clock;
  }

  it('keeps the offset the task started with until the next task is placed', () => {
    const storage = memoryStorage();
    setRoute('speaker', storage);
    saveActiveCalibration(0, storage);
    setRoute('bluetooth', storage);
    saveActiveCalibration(142, storage);
    setRoute('speaker', storage);

    const clock = pinnedClock();
    // A task is placed on the speaker: its offset is taken now.
    expect(syncClockCalibration(clock, storage)).toBe(0);
    const tapAt = clock.input(10_000);
    const judge = createJudge([tapAt, tapAt + 1]);
    expect(judgeTap(judge, clock.input(10_000))).toMatchObject({ kind: 'hit', grade: 'Perfect' });

    // Earbuds connect mid-phrase. Nothing writes the clock, so the rest of this task is
    // judged exactly as it began — the next tap maps to the same instant as before.
    setRoute('bluetooth', storage);
    expect(clock.calibrationMs).toBe(0);
    expect(clock.input(10_000)).toBe(tapAt);

    // The next task is placed: Bluetooth's offset arrives with it.
    expect(syncClockCalibration(clock, storage)).toBe(142);
    expect(clock.input(10_000)).toBeCloseTo(tapAt - 0.142, 6);
  });
});

describe('9. a damaged stored calibration', () => {
  it('ignores what is not a number and clamps what is out of range, field by field', () => {
    const storage = memoryStorage({
      [KEY]: JSON.stringify({ version: 2, calibration: { speaker: 'x', wired: 1e9, bluetooth: null, unknown: -1e9, legacy: true, extra: 5 }, muted: true }),
    });
    const settings = loadSettings(storage);
    expect(settings.calibration).toEqual({ speaker: null, wired: CALIBRATION_LIMIT_MS, bluetooth: null, unknown: -CALIBRATION_LIMIT_MS, legacy: null });
    // The neighbouring field still reads: the save parsed rather than fell back.
    expect(settings.muted).toBe(true);
  });

  it('a calibration that is not an object at all is no calibration, never a crash', () => {
    for (const calibration of ['junk', 42, [1, 2], null]) {
      const storage = memoryStorage({ [KEY]: JSON.stringify({ version: 2, calibration }) });
      expect(() => loadSettings(storage)).not.toThrow();
      expect(loadSettings(storage).calibration.speaker).toBeNull();
    }
    expect(readRouteCalibration(undefined, 'not a number', clampCalibration)).toEqual(NO_CALIBRATION);
    expect(readRouteCalibration(undefined, Number.NaN, clampCalibration)).toEqual(NO_CALIBRATION);
  });

  it('writes only what holds a value, so a cleared route stays absent', () => {
    const storage = memoryStorage();
    saveSettings({ ...loadSettings(storage), calibration: { ...NO_CALIBRATION, speaker: 18.4 } }, storage);
    expect(stored(storage).calibration).toEqual({ speaker: 18 });
  });
});

describe('the "calibrate this route" note', () => {
  it('suggests Bluetooth always, another route only once the player calibrates, and never unknown', () => {
    expect(suggestCalibration(NO_CALIBRATION, 'bluetooth')).toBe(true);
    // A new player on the speaker: the default case, never nagged.
    expect(suggestCalibration(NO_CALIBRATION, 'speaker')).toBe(false);
    expect(suggestCalibration(NO_CALIBRATION, 'wired')).toBe(false);
    expect(suggestCalibration({ ...NO_CALIBRATION, bluetooth: 142 }, 'speaker')).toBe(true);
    expect(suggestCalibration({ ...NO_CALIBRATION, bluetooth: 142 }, 'bluetooth')).toBe(false);
    expect(suggestCalibration({ ...NO_CALIBRATION, legacy: 30 }, 'unknown')).toBe(false);
    expect(suggestCalibration({ ...NO_CALIBRATION, bluetooth: 142 }, 'unknown')).toBe(false);
  });

  it('stays closed for the route it was closed on, for the session, and comes back for another', () => {
    const storage = memoryStorage();
    setRoute('bluetooth', storage);
    expect(routeNoticeWanted(storage)).toBe(true);
    dismissRouteNotice();
    expect(routeNoticeWanted(storage)).toBe(false);
    setRoute('speaker', storage);
    setRoute('bluetooth', storage);
    expect(routeNoticeWanted(storage)).toBe(false);
    // Calibrated elsewhere, a fresh route is worth one mention.
    saveActiveCalibration(140, storage);
    setRoute('wired', storage);
    expect(routeNoticeWanted(storage)).toBe(true);
    // A new session is a new chance to mention it.
    resetRouteState();
    setRoute('wired', storage);
    expect(routeNoticeWanted(storage)).toBe(true);
  });
});

describe('device-local', () => {
  it('a save code still carries one offset for older builds, and nothing per route', () => {
    const code = encodeSaveCode({ progress: { unlocked: 3, best: { 1: 90, 2: 80 } }, settings: { calibrationMs: 142, muted: false, music: 1, sfx: 1, haptics: true }, tutorialComplete: false });
    const decoded = decodeSaveCode(code);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(Object.keys(decoded.data.settings).sort()).toEqual(['calibrationMs', 'haptics', 'music', 'muted', 'sfx']);
    expect(JSON.stringify(decoded.data)).not.toMatch(/speaker|bluetooth|wired|route/i);
  });

  it('saving the other settings, as a restored code does, leaves every route’s offset where it was', () => {
    const storage = memoryStorage();
    setRoute('bluetooth', storage);
    saveActiveCalibration(142, storage);
    // TransferScene writes the code's mute, levels and haptics, and no calibration.
    saveSettings({ ...loadSettings(storage), muted: true, music: 0.4, sfx: 0.6, haptics: false }, storage);
    expect(loadSettings(storage).calibration).toMatchObject({ bluetooth: 142 });
    expect(stored(storage).calibrationMs).toBeUndefined();
  });
});
