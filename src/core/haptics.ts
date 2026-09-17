/**
 * Short vibrations under the player's control.
 *
 * The one web API here beyond Web Audio and pointer events. It earns the exception
 * because the game is a rhythm game played with one thumb: a tap that lands is
 * confirmed by sound the device may be muting and by motion the thumb is covering,
 * and a pulse is the only channel left. Android Chrome and the Capacitor WebView both
 * implement it; everything else is expected to lack it, so every call is feature-detected
 * and failure is silent. `AndroidManifest.xml` carries the matching VIBRATE permission.
 *
 * Never used for anything the player did not just do: no idle buzzing, no attention-getting.
 */

/** Durations in milliseconds. Short, because a long buzz reads as an error on a phone. */
export const HAPTIC = {
  /** A control accepted the touch. */
  tap: 12,
  /** A judged hit landed on the beat. */
  hit: 18,
  /** A medal stamped the plaque, or a purchase completed. */
  stamp: 26,
} as const;

export type HapticStrength = keyof typeof HAPTIC;

let enabled = false;

/** Mirrors the saved setting. Called on boot and whenever the player flips the switch. */
export function setHaptics(on: boolean): void {
  enabled = on;
}

export function hapticsEnabled(): boolean {
  return enabled;
}

/**
 * True where the device can vibrate at all. The switch stays visible either way — a
 * player who turns it on before plugging in a controller should not find it missing —
 * but the scene dims it, so a dead toggle never reads as a broken one.
 */
export function hapticsSupported(): boolean {
  try {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  } catch {
    return false;
  }
}

/** Fire one pulse. A no-op when switched off, unsupported, or refused by the browser. */
export function vibrate(strength: HapticStrength = 'tap'): void {
  if (!enabled || !hapticsSupported()) return;
  try {
    navigator.vibrate(HAPTIC[strength]);
  } catch {
    // A page without a user gesture, or a platform that exposes the method and refuses
    // the call, throws here. The pulse is a garnish; losing it costs the player nothing.
  }
}
