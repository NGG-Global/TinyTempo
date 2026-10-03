/**
 * Tap offset, per audio output route. Pure: no storage, no Phaser, no native code.
 *
 * One offset was not enough. The same phone is 20 ms through its speaker and 150–300 ms
 * through Bluetooth earbuds, so an offset measured on one is wrong on the other by most
 * of an eighth note — and a player who calibrated with earbuds in, then played on the
 * speaker, was judged a fifth of a second early on every tap with nothing on screen to
 * say why. Each route now keeps its own measurement, and the active route chooses.
 *
 * **An uncalibrated route is 0, never a neighbour's value.** Zero is what the clock did
 * before calibration existed, and it is already right to within the platform's own
 * reported lag, which `AudioClock` subtracts on every route. Borrowing Bluetooth's 142 ms
 * for the speaker would be wrong by exactly the amount calibration exists to remove.
 *
 * **The offset is device-local.** It is a fact about one phone's audio path, so it is in
 * neither the cloud save nor what a save code restores.
 */

/** The output categories the game distinguishes. `unknown` is a browser, or a native device that has not answered yet. */
export type AudioRoute = 'speaker' | 'wired' | 'bluetooth' | 'unknown';

export const AUDIO_ROUTES: readonly AudioRoute[] = ['speaker', 'wired', 'bluetooth', 'unknown'];

/** How Settings and the calibration screen name a route. */
export const ROUTE_LABELS: Readonly<Record<AudioRoute, string>> = {
  speaker: 'Phone speaker',
  wired: 'Wired audio',
  bluetooth: 'Bluetooth audio',
  unknown: 'This device',
};

/** Validates a route crossing the native bridge or read from storage. Anything else is unknown. */
export function toRoute(value: unknown): AudioRoute {
  return value === 'speaker' || value === 'wired' || value === 'bluetooth' ? value : 'unknown';
}

/**
 * The offsets, one per route, null where that route has never been calibrated. `legacy`
 * is the single offset a save from before routes carried: kept until a route adopts it,
 * so an upgrade never silently discards a calibration.
 */
export interface RouteCalibration {
  readonly speaker: number | null;
  readonly wired: number | null;
  readonly bluetooth: number | null;
  readonly unknown: number | null;
  readonly legacy: number | null;
}

export const NO_CALIBRATION: RouteCalibration = Object.freeze({ speaker: null, wired: null, bluetooth: null, unknown: null, legacy: null });

type Clamp = (ms: number) => number;

const KEYS = ['speaker', 'wired', 'bluetooth', 'unknown', 'legacy'] as const;

/**
 * The stored object, validated field by field: a value that is not a finite number is not
 * a calibration and reads as null; one out of range is clamped, the rule every other
 * setting follows. `legacyMs` is a version-1 save's single `calibrationMs`, used only when
 * the stored object has no legacy slot of its own. A legacy of exactly 0 is "never
 * calibrated" — a version-1 save could not tell the two apart, and adopting a 0 would
 * only hide the prompt to calibrate a route that never was.
 */
export function readRouteCalibration(raw: unknown, legacyMs: unknown, clamp: Clamp): RouteCalibration {
  const stored = typeof raw === 'object' && raw !== null;
  const record = stored ? raw as Record<string, unknown> : {};
  const field = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? clamp(value) : null);
  const out = {} as Record<typeof KEYS[number], number | null>;
  for (const key of KEYS) out[key] = field(record[key]);
  if (!stored) {
    const old = field(legacyMs);
    out.legacy = old === 0 ? null : old;
  }
  if (out.legacy === 0) out.legacy = null;
  return Object.freeze(out);
}

/** What is written: only the slots that hold a value, so an absent route stays absent. */
export function writeRouteCalibration(calibration: RouteCalibration, clamp: Clamp): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of KEYS) {
    const value = calibration[key];
    if (value !== null && Number.isFinite(value)) out[key] = clamp(value);
  }
  return out;
}

/** The route's own measurement, or null if it has none. `unknown` falls back to the legacy value. */
export function calibrationFor(calibration: RouteCalibration, route: AudioRoute): number | null {
  if (route === 'unknown') return calibration.unknown ?? calibration.legacy;
  return calibration[route];
}

/** What the judge subtracts on this route: its own measurement, or 0. */
export function offsetFor(calibration: RouteCalibration, route: AudioRoute): number {
  return calibrationFor(calibration, route) ?? 0;
}

/** Keeps a measurement for one route and touches no other. */
export function withRouteOffset(calibration: RouteCalibration, route: AudioRoute, ms: number, clamp: Clamp): RouteCalibration {
  const next = { ...calibration, [route]: clamp(ms) };
  // A browser's measurement replaces the legacy value it was standing on, rather than
  // leaving that value behind to be adopted by a native route later.
  if (route === 'unknown') next.legacy = null;
  return Object.freeze(next);
}

/** Back to uncalibrated for one route. On `unknown` the legacy value goes too, or it would reappear. */
export function withoutRouteOffset(calibration: RouteCalibration, route: AudioRoute): RouteCalibration {
  const next = { ...calibration, [route]: null };
  if (route === 'unknown') next.legacy = null;
  return Object.freeze(next);
}

/**
 * The migration, run the first time a native device reports a real route: that route
 * adopts the legacy offset if it has none of its own, and the legacy slot empties.
 *
 * The first route is the best guess at where the old value was measured — a player
 * calibrates on the setup they play with, and the update arrives on that same setup — and
 * any other choice either loses the value or copies it to every route. If the guess is
 * wrong it is on screen, named by route, one tap from Tune or Reset. Deterministic: the
 * same calibration and route always give the same result, and a second call is a no-op.
 */
export function adoptLegacy(calibration: RouteCalibration, route: AudioRoute): RouteCalibration {
  if (route === 'unknown' || calibration.legacy === null) return calibration;
  if (calibration[route] !== null) return Object.freeze({ ...calibration, legacy: null });
  return Object.freeze({ ...calibration, [route]: calibration.legacy, legacy: null });
}

/** Whether any route, or the legacy slot, holds a measurement. */
export function anyCalibrated(calibration: RouteCalibration): boolean {
  return KEYS.some(key => calibration[key] !== null);
}

/**
 * Whether to suggest calibrating the active route. Bluetooth always, uncalibrated: it is
 * where the error is a fifth of a second. Another route only once the player has shown
 * they calibrate, by having done it somewhere — a new player on their phone's speaker is
 * the default case, already corrected by the platform's own reported lag, and a prompt on
 * every first launch would be a nag. Never for `unknown`, which cannot be named.
 */
export function suggestCalibration(calibration: RouteCalibration, route: AudioRoute): boolean {
  if (route === 'unknown' || calibrationFor(calibration, route) !== null) return false;
  return route === 'bluetooth' || anyCalibrated(calibration);
}
