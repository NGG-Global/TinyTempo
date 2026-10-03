import {
  adoptLegacy, calibrationFor, offsetFor, suggestCalibration, withoutRouteOffset, withRouteOffset, type AudioRoute,
} from '../game/routeCalibration';
import { clampCalibration, loadSettings, saveSettings } from '../game/settings';

/**
 * The audio output route the device is using right now, and the Tap offset that goes with
 * it. No Phaser and no native code: `audio/routeBoot.ts` feeds it from Android, and a
 * browser simply never does, so the route stays `unknown` and the game behaves as it did
 * with one offset.
 *
 * **A route change never reaches the judge mid-phrase.** Nothing here writes the clock
 * when the route changes; `syncClockCalibration` does, and it is called only where a new
 * plan is placed — a level's next task, a tutorial pass, a calibration run, an engine being
 * made. A phrase in flight is judged to its end on the offset it started with, and the
 * next one picks up the new route's. The platform's own reported lag, which `AudioClock`
 * reads live, is a different matter: that is the device telling the truth about itself.
 */

let route: AudioRoute = 'unknown';
const listeners = new Set<(route: AudioRoute) => void>();
/** Routes the player has dismissed the calibration suggestion for, this session. Never stored. */
const dismissed = new Set<AudioRoute>();

export function currentRoute(): AudioRoute {
  return route;
}

/** Listen for the route changing. Returns the unsubscribe. A listener that throws is skipped. */
export function onRouteChange(listener: (route: AudioRoute) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * The route, as the device reports it. The first real route a device names adopts the
 * legacy offset a version-1 save carried (`adoptLegacy`) and writes it, so the migration
 * happens once and is on disk before anything reads it.
 */
export function setRoute(next: AudioRoute, storage?: Storage | null): void {
  if (next !== 'unknown') {
    const settings = loadSettings(storage);
    const adopted = adoptLegacy(settings.calibration, next);
    if (adopted !== settings.calibration) saveSettings({ ...settings, calibration: adopted }, storage);
  }
  if (next === route) return;
  route = next;
  // A snapshot: a listener that unsubscribes while being told must not skip the next one.
  for (const listener of Array.from(listeners)) {
    try { listener(next); } catch { /* one screen's trouble is not the route's */ }
  }
}

/** The offset the judge should use on the active route: its own measurement, or 0. */
export function activeOffset(storage?: Storage | null): number {
  return offsetFor(loadSettings(storage).calibration, route);
}

/** The active route's own measurement, or null if it has none. For the screens that name it. */
export function activeCalibration(storage?: Storage | null): number | null {
  return calibrationFor(loadSettings(storage).calibration, route);
}

/**
 * Puts the active route's offset on a clock. Only at a boundary: where a plan is placed,
 * never in the middle of one. Returns the value set.
 */
export function syncClockCalibration(clock: { calibrationMs: number }, storage?: Storage | null): number {
  const value = activeOffset(storage);
  clock.calibrationMs = value;
  return value;
}

/** Keeps a measurement for the active route only. False means nothing was written. */
export function saveActiveCalibration(ms: number, storage?: Storage | null): boolean {
  const settings = loadSettings(storage);
  return saveSettings({ ...settings, calibration: withRouteOffset(settings.calibration, route, ms, clampCalibration) }, storage);
}

/** The active route back to uncalibrated; every other route keeps its own. */
export function clearActiveCalibration(storage?: Storage | null): boolean {
  const settings = loadSettings(storage);
  return saveSettings({ ...settings, calibration: withoutRouteOffset(settings.calibration, route) }, storage);
}

/** Whether to show the small "calibrate this route" note: wanted, and not dismissed for this route this session. */
export function routeNoticeWanted(storage?: Storage | null): boolean {
  return !dismissed.has(route) && suggestCalibration(loadSettings(storage).calibration, route);
}

/** The player closed the note: not again for this route until the app starts again. */
export function dismissRouteNotice(): void {
  dismissed.add(route);
}

/** Tests only: back to a browser that has never heard of a route. */
export function resetRouteState(): void {
  route = 'unknown';
  listeners.clear();
  dismissed.clear();
}
