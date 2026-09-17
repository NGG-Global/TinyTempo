/**
 * The rules Firebase enforces by discarding.
 *
 * An event whose name is too long, or carries a parameter Firebase does not like, is not
 * rejected — it is *accepted and dropped*. Nothing throws, nothing logs, and the funnel
 * simply has a hole in it that nobody finds until somebody asks why a number is low.
 * That silence is the reason this file exists: the shaping happens here, where it can be
 * tested under node without the plugin, instead of being assumed at the call site.
 *
 * The limits below are Google Analytics for Firebase's documented ones. They have been
 * changed by Google before, so `docs/ANALYTICS.md` says to re-check them rather than
 * trusting this comment forever; what does not change is that exceeding one loses data
 * quietly.
 */

export const FIREBASE_LIMITS = {
  /** Characters in an event name. */
  eventName: 40,
  /** Characters in a parameter name. */
  paramName: 40,
  /** Characters in a string parameter value. */
  stringValue: 100,
  /** Parameters carried by one event. */
  params: 25,
} as const;

/**
 * Prefixes Google reserves for itself. An event using one is dropped, and these are easy
 * to walk into: `ga_` in particular is three characters and reads like an abbreviation.
 */
export const RESERVED_PREFIXES = ['firebase_', 'google_', 'ga_'] as const;

const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

/** Whether Firebase will keep an event or parameter of this name. */
export function validName(name: string, limit: number): boolean {
  if (name.length === 0 || name.length > limit) return false;
  if (!NAME_PATTERN.test(name)) return false;
  return !RESERVED_PREFIXES.some(prefix => name.toLowerCase().startsWith(prefix));
}

export function validEventName(name: string): boolean {
  return validName(name, FIREBASE_LIMITS.eventName);
}

export type ShapedValue = string | number;

/**
 * A payload as Firebase will actually store it.
 *
 * Long strings are truncated rather than dropped, because a truncated product id still
 * identifies the funnel step and a missing one does not. A parameter Firebase would
 * refuse outright is left out here instead, so what arrives is exactly what was sent.
 */
export function shapeParams(payload: Readonly<Record<string, unknown>>): Record<string, ShapedValue> {
  const shaped: Record<string, ShapedValue> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (Object.keys(shaped).length >= FIREBASE_LIMITS.params) break;
    if (!validName(key, FIREBASE_LIMITS.paramName)) continue;
    if (typeof value === 'number') {
      // NaN and Infinity survive neither JSON nor the SDK's bridge intact.
      if (Number.isFinite(value)) shaped[key] = value;
      continue;
    }
    if (typeof value === 'boolean') { shaped[key] = value ? 1 : 0; continue; }
    if (typeof value === 'string') {
      if (value !== '') shaped[key] = value.slice(0, FIREBASE_LIMITS.stringValue);
      continue;
    }
    // Objects, arrays, null and undefined have no representation Firebase keeps.
  }
  return shaped;
}
