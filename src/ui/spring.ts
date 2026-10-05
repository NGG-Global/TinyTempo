import { clamp01, easeOut } from '../vignettes/motion';

/**
 * Physical motion as pure functions of time.
 *
 * Every curve here is `f(t)`, never integrated state, so a caller can sample it from
 * the audio clock and a dropped frame costs nothing but the frame: the pose on the
 * next one is exactly what it would have been. That is the property the vignettes'
 * strike curves already have and the UI's stylesheet-style motion did not.
 */

/** A damped spring settling to 1: overshoots, rings, comes to rest. */
export function spring(t: number, damping = 4.5, cycles = 2.2): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return 1 - Math.exp(-damping * t) * Math.cos(cycles * Math.PI * t);
}

/**
 * Eases out past 1 and returns — the last part of a throw or a landing. `amount` is the
 * peak excursion past the target (0.25 peaks at 1.25), which is what an author wants to
 * set; the back-ease factor that produces it is solved once per distinct amount, since
 * `4s³ = 27a(s+1)²` has no closed form worth carrying.
 */
export function overshoot(t: number, amount = 0.25): number {
  const p = clamp01(t);
  const s = backFactor(amount);
  return 1 + (s + 1) * (p - 1) ** 3 + s * (p - 1) ** 2;
}

const factors = new Map<number, number>();
function backFactor(amount: number): number {
  if (amount <= 0) return 0;
  const cached = factors.get(amount);
  if (cached !== undefined) return cached;
  // From above: the residual is convex there, so Newton descends monotonically to the root.
  let s = 10 * (1 + amount);
  for (let i = 0; i < 12; i++) {
    const f = 4 * s ** 3 - 27 * amount * (s + 1) ** 2;
    const df = 12 * s ** 2 - 54 * amount * (s + 1);
    s -= f / df;
  }
  factors.set(amount, s);
  return s;
}

/** A compression that is 0 at both ends and peaks at `amount` at the midpoint of `duration`. */
export function squash(age: number, duration: number, amount: number): number {
  if (age < 0 || age >= duration) return 0;
  return Math.sin(age / duration * Math.PI) * amount;
}

/**
 * A struck subject's give: squat by `amount` of its height, a little wider, back within
 * `sec`. The nail, the fruit and the egg take it on contact, about the point where they rest,
 * so the blow reads as landing on something. Callers zero it under reduced motion.
 */
export const CONTACT_GIVE = Object.freeze({ amount: 0.06, sec: 0.1 });
export function contactGive(age: number, strength = 1, exaggeration = 1): number {
  return squash(age, CONTACT_GIVE.sec, CONTACT_GIVE.amount * strength * exaggeration);
}

/** A pull-back before an event: rises to `amount` and returns to 0 exactly at the event. */
export function anticipate(until: number, duration: number, amount: number): number {
  if (until <= 0 || until >= duration) return 0;
  const p = 1 - until / duration;
  return amount * Math.sin(p * Math.PI) ** 1.5;
}

/** A damped oscillation after an impact — the shake, wobble and judder already in use. */
export function settle(age: number, frequency: number, decay: number): number {
  // A caller's "time of the last impact" usually starts at -Infinity, which makes the age
  // +Infinity. The envelope is zero there, but `sin(Infinity)` is NaN, and NaN times zero
  // is still NaN — enough to silently void every coordinate it is added to. Rest is the
  // right answer for an impact that has not happened.
  if (!Number.isFinite(age) || age < 0) return 0;
  return Math.sin(age * frequency) * Math.exp(-age * decay);
}

/** Start offset for item `index` of `count`, spreading arrivals over `spread` seconds. */
export function stagger(index: number, count: number, spread: number): number {
  if (count <= 1) return 0;
  return spread * Math.max(0, Math.min(count - 1, index)) / (count - 1);
}

/** 1 at the tap, ringing back to 0. Shared so every press feels like the same material. */
export function pressAmount(now: number, pressedAt: number, duration = 0.42): number {
  return pressedAt > -Infinity ? Math.max(0, 1 - spring((now - pressedAt) / duration, 5, 2)) : 0;
}

/** An arrival: rises from below with a small overshoot and a fade, in `duration` seconds. */
export function arrive(age: number, duration: number): { readonly rise: number; readonly alpha: number } {
  const p = clamp01(age / duration);
  return { rise: 1 - overshoot(p, 0.12), alpha: easeOut(Math.min(1, p * 1.6)) };
}
