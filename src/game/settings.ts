import { ANALYTICS } from '../config/analytics';

/**
 * Persisted player settings. Same defensive shape as `game/progress.ts`: every field is
 * validated on read, storage is optional, and a write reports whether it landed.
 */
export interface Settings {
  /**
   * Milliseconds the device's audio output lags the schedule. Subtracted from every judged
   * tap, and from nothing else — see `AudioClock.input`.
   */
  readonly calibrationMs: number;
  /**
   * Master silence. The speaker puck flips this and nothing else: the two levels below
   * stay where the player left them, and come back when the mute comes off.
   */
  readonly muted: boolean;
  /**
   * Fraction of the measured music mix, 0–1 in whole percent. The title theme and the
   * gameplay loop share it. Absent on a save written when sound was only a switch, and
   * that save was already full volume whenever it was not muted, so the default is 1.
   */
  readonly music: number;
  /** Fraction of the effects mix, on the same scale and with the same default as `music`. */
  readonly sfx: number;
  /**
   * Short vibrations on a judged hit and on a control. Defaults on: the pulse is the
   * only confirmation left to a player who has muted the game, and the one device that
   * cannot do it ignores the setting entirely.
   */
  readonly haptics: boolean;
  /**
   * Whether commerce events may be collected. This is a consent signal, not a preference:
   * it starts wherever the build's `VITE_ANALYTICS_CONSENT` puts it, the player can change
   * it at any time, and it deliberately does **not** travel in a save code — consent is a
   * per-device, per-jurisdiction decision, and restoring a code must not grant it silently
   * on a phone whose owner never answered the question.
   */
  readonly analytics: boolean;
}

const KEY = 'tiny-tempo.settings.v1';
/** Written but not required on read, so a future migration has something to branch on. */
const VERSION = 1;
/**
 * Bluetooth output on Android routinely adds 150-300 ms, which is why calibration exists at
 * all. Past half a second the player is not hearing the beat they are tapping, and the
 * value is far likelier to be a bad measurement than a real device.
 */
export const CALIBRATION_LIMIT_MS = 500;
/** Below this many usable taps a median says more about the sample than the device. */
export const CALIBRATION_TAPS = 8;
const DEFAULTS: Settings = Object.freeze({
  calibrationMs: 0, muted: false, music: 1, sfx: 1, haptics: true, analytics: ANALYTICS.consentGranted,
});

export type VolumeBus = 'music' | 'sfx';

/**
 * A player level, as a fraction of the mix.
 *
 * Whole percent, because that is the step the slider, the stored setting and the save
 * code all share — a finer value would round differently in each of them. Anything that
 * is not a number reads as full: a corrupt field should not silence the game.
 */
export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(100, Math.round(value * 100))) / 100;
}

/**
 * The setting after the player moves one level.
 *
 * A level above zero while muted would not be heard, so moving one takes the mute off.
 * Zeroing a bus leaves the mute as it was: the other bus, and the puck, still mean what
 * they did.
 */
export function withVolume(settings: Settings, bus: VolumeBus, volume: number): Settings {
  const value = clampVolume(volume);
  return Object.freeze({ ...settings, [bus]: value, muted: settings.muted && value === 0 });
}

export function clampCalibration(ms: number): number {
  if (!Number.isFinite(ms)) return 0;
  return Math.max(-CALIBRATION_LIMIT_MS, Math.min(CALIBRATION_LIMIT_MS, Math.round(ms)));
}

/** Reads may fail in private windows or blocked storage; the game then uses the defaults. */
export function loadSettings(storage: Storage | null = safeStorage()): Settings {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULTS;
    const { calibrationMs, muted, music, sfx, haptics, analytics } = parsed as {
      calibrationMs?: unknown; muted?: unknown; music?: unknown; sfx?: unknown;
      haptics?: unknown; analytics?: unknown;
    };
    return Object.freeze({
      calibrationMs: typeof calibrationMs === 'number' ? clampCalibration(calibrationMs) : 0,
      muted: muted === true,
      music: typeof music === 'number' ? clampVolume(music) : 1,
      sfx: typeof sfx === 'number' ? clampVolume(sfx) : 1,
      // Absent in a v1 save written before the switch existed, and the default is on,
      // so only an explicit `false` turns it off.
      haptics: haptics !== false,
      // The opposite rule, because this one is consent: a save written before the switch
      // existed answered nothing, so it falls back to what the build was configured with
      // rather than being read as a yes.
      analytics: typeof analytics === 'boolean' ? analytics : ANALYTICS.consentGranted,
    });
  } catch { return DEFAULTS; }
}

/** False means nothing was written — blocked storage, a private window, or a full quota. */
export function saveSettings(settings: Settings, storage: Storage | null = safeStorage()): boolean {
  try {
    storage?.setItem(KEY, JSON.stringify({
      version: VERSION, ...settings,
      calibrationMs: clampCalibration(settings.calibrationMs),
      music: clampVolume(settings.music),
      sfx: clampVolume(settings.sfx),
    }));
    return storage !== null;
  } catch { return false; }
}

/**
 * The offset to adopt from a calibration run, or null if too few taps landed.
 *
 * Median, not mean: one fumbled tap in eight would drag a mean by an eighth of its own
 * error, and a player calibrating is exactly the player likeliest to fumble one.
 *
 * The samples are residuals against the offset already in force, so the new value is the
 * old one plus the median. A second run therefore refines the first rather than starting
 * over, which is what lets a player converge by repeating it.
 */
export function calibrationFrom(currentMs: number, residualsMs: readonly number[]): number | null {
  const usable = residualsMs.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (usable.length < CALIBRATION_TAPS) return null;
  const middle = usable.length / 2;
  const median = usable.length % 2
    ? usable[Math.floor(middle)]!
    : (usable[middle - 1]! + usable[middle]!) / 2;
  return clampCalibration(currentMs + median);
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
