import { describe, expect, it, vi } from 'vitest';

/*
 * The consent default comes from `VITE_ANALYTICS_CONSENT`, which `game/settings.ts` reads
 * while its module body runs. Without this mock these tests answer to whatever `.env` the
 * machine happens to have — green in CI, which has none, and red on any developer who has
 * turned analytics on. Pinned rather than read, so the defaults under test are the ones
 * written here. `vi.hoisted` because `vi.mock` is lifted above the file's own consts.
 */
const analyticsConfig = vi.hoisted(() => ({ enabled: false, consentGranted: false }));
vi.mock('../src/config/analytics', () => ({ ANALYTICS: analyticsConfig }));

import { AudioClock } from '../src/audio/AudioClock';
import { createJudge, judgeTap } from '../src/rhythm/judge';
import {
  CALIBRATION_LIMIT_MS, CALIBRATION_TAPS, calibrationFrom, clampCalibration,
  loadSettings, saveSettings,
} from '../src/game/settings';

function fakeStorage(initial?: string) {
  const store = new Map<string, string>();
  if (initial !== undefined) store.set('tiny-tempo.settings.v1', initial);
  return {
    store,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
    key: () => null, length: 0,
  } as unknown as Storage & { store: Map<string, string> };
}

describe('stored settings', () => {
  it('falls back to the defaults for missing, unparseable and wrongly shaped values', () => {
    expect(loadSettings(null)).toEqual({ calibrationMs: 0, muted: false, haptics: true, analytics: false });
    expect(loadSettings(fakeStorage())).toEqual({ calibrationMs: 0, muted: false, haptics: true, analytics: false });
    expect(loadSettings(fakeStorage('not json'))).toEqual({ calibrationMs: 0, muted: false, haptics: true, analytics: false });
    expect(loadSettings(fakeStorage('[1,2]'))).toEqual({ calibrationMs: 0, muted: false, haptics: true, analytics: false });
    expect(loadSettings(fakeStorage('{"calibrationMs":"120","muted":"yes"}'))).toEqual({ calibrationMs: 0, muted: false, haptics: true, analytics: false });
    expect(loadSettings(fakeStorage('{"calibrationMs":null}'))).toEqual({ calibrationMs: 0, muted: false, haptics: true, analytics: false });
  });
  it('clamps a stored offset rather than trusting it', () => {
    expect(loadSettings(fakeStorage('{"calibrationMs":180,"muted":true}'))).toEqual({ calibrationMs: 180, muted: true, haptics: true, analytics: false });
    expect(loadSettings(fakeStorage(`{"calibrationMs":${1e9}}`)).calibrationMs).toBe(CALIBRATION_LIMIT_MS);
    expect(loadSettings(fakeStorage('{"calibrationMs":-1e9}')).calibrationMs).toBe(-CALIBRATION_LIMIT_MS);
    expect(clampCalibration(NaN)).toBe(0);
    // An infinite offset is nonsense rather than a very large one, so it reads as zero.
    expect(clampCalibration(Infinity)).toBe(0);
    expect(clampCalibration(83.4)).toBe(83);
  });
  it('defaults haptics on, and only an explicit false turns them off', () => {
    // A save written before the switch existed carries no field; the player gets the pulse.
    expect(loadSettings(fakeStorage('{"calibrationMs":0,"muted":false}')).haptics).toBe(true);
    expect(loadSettings(fakeStorage('{"haptics":false}')).haptics).toBe(false);
    expect(loadSettings(fakeStorage('{"haptics":"no"}')).haptics).toBe(true);
    expect(loadSettings(null).haptics).toBe(true);
  });
  it('reports whether a write landed and clamps on the way out', () => {
    const storage = fakeStorage();
    expect(saveSettings({ calibrationMs: 5000, muted: true, haptics: true, analytics: false }, storage)).toBe(true);
    expect(JSON.parse(storage.store.get('tiny-tempo.settings.v1')!)).toEqual({ version: 1, calibrationMs: CALIBRATION_LIMIT_MS, muted: true, haptics: true, analytics: false });
    expect(saveSettings({ calibrationMs: 0, muted: false, haptics: true, analytics: false }, null)).toBe(false);
    const blocked = { setItem: () => { throw new Error('quota'); } } as unknown as Storage;
    expect(saveSettings({ calibrationMs: 0, muted: false, haptics: true, analytics: false }, blocked)).toBe(false);
    // A round trip through storage is the shape the game actually uses.
    saveSettings({ calibrationMs: -40, muted: false, haptics: false, analytics: false }, storage);
    expect(loadSettings(storage)).toEqual({ calibrationMs: -40, muted: false, haptics: false, analytics: false });
    // Reset is writing zero, not measuring the inverse of a kept offset.
    saveSettings({ ...loadSettings(storage), calibrationMs: 0 }, storage);
    expect(loadSettings(storage).calibrationMs).toBe(0);
  });
});

describe('the calibration measurement', () => {
  it('refuses a measurement made from too few taps', () => {
    expect(calibrationFrom(0, [])).toBeNull();
    expect(calibrationFrom(0, Array.from({ length: CALIBRATION_TAPS - 1 }, () => 100))).toBeNull();
    expect(calibrationFrom(0, Array.from({ length: CALIBRATION_TAPS }, () => 100))).toBe(100);
  });
  it('takes the median, so one fumbled tap cannot move the offset', () => {
    const steady = [98, 99, 100, 100, 100, 101, 102, 103];
    expect(calibrationFrom(0, steady)).toBe(100);
    // One tap a whole beat out. A mean would move by 50 ms; the median moves by half of one.
    const fumbled = [98, 99, 100, 100, 100, 101, 102, 500];
    const mean = fumbled.reduce((a, b) => a + b, 0) / fumbled.length;
    expect(mean).toBe(150); // a mean would adopt a 50 ms error from one bad tap
    expect(calibrationFrom(0, fumbled)).toBe(100);
    expect(calibrationFrom(0, [...steady].reverse())).toBe(100);
  });
  it('adds to the offset already in force, so a second run refines the first', () => {
    // The samples are residuals measured through the current offset, not absolute lateness.
    expect(calibrationFrom(120, Array.from({ length: CALIBRATION_TAPS }, () => 30))).toBe(150);
    expect(calibrationFrom(150, Array.from({ length: CALIBRATION_TAPS }, () => -8))).toBe(142);
    expect(calibrationFrom(480, Array.from({ length: CALIBRATION_TAPS }, () => 200))).toBe(CALIBRATION_LIMIT_MS);
    expect(calibrationFrom(0, Array.from({ length: CALIBRATION_TAPS }, () => NaN))).toBeNull();
    // After a reset to zero the next run is a fresh measurement, not a refinement of the
    // thrown-away offset.
    expect(calibrationFrom(0, Array.from({ length: CALIBRATION_TAPS }, () => 40))).toBe(40);
  });
});

describe('the offset applies to judged input only', () => {
  /**
   * The sign is the whole point and nothing else pins it: if output is delayed by L the
   * player hears late and taps late, so a positive calibrationMs has to pull the captured
   * timestamp earlier. Getting it backwards would double the error instead of removing it.
   */
  const clockAt = (audioSec: number, performanceMs: number) => {
    const context = { currentTime: audioSec, getOutputTimestamp: undefined } as unknown as AudioContext;
    vi.spyOn(performance, 'now').mockReturnValue(performanceMs);
    const clock = new AudioClock(context);
    clock.refresh();
    return clock;
  };
  it('pulls a consistently late tap back onto the beat', () => {
    const target = 10;
    const lateMs = 90; // hearing the beat 90 ms late, and tapping where it was heard
    const clock = clockAt(target + lateMs / 1000, 1000);
    try {
      expect(clock.calibrationMs).toBe(0);
      // Uncalibrated: outside the 55 ms Perfect window, and it would clip the 130 ms Good
      // window outright on a Bluetooth route.
      expect(judgeTap(createJudge([target]), clock.input(1000)).grade).toBe('Good');
      clock.calibrationMs = lateMs;
      const corrected = judgeTap(createJudge([target]), clock.input(1000));
      expect(corrected.grade).toBe('Perfect');
      expect(corrected.deltaMs).toBeCloseTo(0, 6);
      // The wrong sign would double the error rather than remove it.
      clock.calibrationMs = -lateMs;
      expect(judgeTap(createJudge([target]), clock.input(1000)).deltaMs).toBeCloseTo(2 * lateMs, 6);
    } finally { vi.restoreAllMocks(); }
  });
  it('leaves the scene clock, which drives cues and visuals, untouched', () => {
    const clock = clockAt(10, 1000);
    try {
      clock.calibrationMs = 90;
      // now() is what schedules cues and drives motion. The device does not delay visuals,
      // so shifting them would introduce an error rather than remove one.
      expect(clock.now()).toBeCloseTo(10, 9);
    } finally { vi.restoreAllMocks(); }
  });
});

describe('analytics consent', () => {
  it('treats a save written before the switch existed as unanswered, not as a yes', () => {
    // The opposite of the `haptics` rule above, and deliberately so: a missing preference
    // can be assumed, a missing consent cannot. The fallback is the build's own default.
    const old = fakeStorage(JSON.stringify({ version: 1, calibrationMs: 0, muted: false, haptics: true }));
    expect(loadSettings(old).analytics).toBe(false);
    // And the rest of that save is still read, so this is the field falling back and not
    // the whole parse failing into the defaults.
    expect(loadSettings(old).haptics).toBe(true);
  });

  it('keeps an explicit answer of either kind', () => {
    for (const analytics of [true, false]) {
      const storage = fakeStorage();
      saveSettings({ calibrationMs: 0, muted: false, haptics: true, analytics }, storage);
      expect(loadSettings(storage).analytics).toBe(analytics);
    }
  });

  it('ignores a non-boolean answer rather than coercing it', () => {
    for (const analytics of ['true', 1, {}, null]) {
      const storage = fakeStorage(JSON.stringify({ version: 1, calibrationMs: -20, analytics }));
      expect(loadSettings(storage).analytics).toBe(false);
      // Same guard: the neighbouring field proves the save parsed rather than threw.
      expect(loadSettings(storage).calibrationMs).toBe(-20);
    }
  });
});
