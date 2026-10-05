import { clamp01, easeOut } from './motion';
export { clamp01, easeOut } from './motion';
/** Presentation-only curves. They never alter a target, grade or score. */
export const HAMMER_MOTION = {
  anticipationSec: 0.24,
  contactHoldSec: 0.026,
  recoilSec: 0.34,
} as const;


/** Rises above the resting pose, then accelerates into exact contact at t=0. */
export function anticipation(untilImpact: number, recoveredAngle = 0.55): number {
  const p = clamp01(1 - untilImpact / HAMMER_MOTION.anticipationSec);
  const lift = p < 0.42 ? 0.55 + 0.27 * Math.sin(p / 0.42 * Math.PI / 2) : 0.82 * (1 - ((p - 0.42) / 0.58) ** 3);
  // Quick doubles begin their windup while the previous recoil is still moving.
  // Blend from that pose, rather than snapping back to the nominal resting angle.
  return lift + (Math.min(0.55, recoveredAngle) - 0.55) * (1 - p);
}

export function recoil(age: number): number {
  const p = clamp01((age - HAMMER_MOTION.contactHoldSec) / (HAMMER_MOTION.recoilSec - HAMMER_MOTION.contactHoldSec));
  // A tiny contact hold, fast release, then a restrained overshoot and settle.
  // This is a pose curve, never a delay in input or sound delivery.
  return 0.55 * easeOut(p) + 0.13 * Math.sin(p * Math.PI) ** 2;
}

export function nailHeight(depth: number): number {
  // At full depth the top face (height + 10) sits exactly on the wood surface.
  return 213 * (1 - clamp01(depth)) - 10;
}

/**
 * The title screen's hammer is a toy, not a task: a tap anywhere that is not a control
 * lands a blow. The nail gives a little on the first knock and no more on the rest — a
 * screen that judges nothing never drives it home — and, left alone, eases back up.
 */
export const KNOCK = {
  /** How far the first knock sinks the nail: about one scored hit's share on a four-target task. */
  depth: 0.19,
  /** How long the nail stays down after the last knock before it rises. */
  restSec: 2,
  /** How long the rise back takes. A release, not the strike's snap. */
  riseSec: 0.45,
} as const;

/**
 * Where the nail belongs, given how long since the last knock: down while the knocks
 * keep coming, up once they have stopped. `Infinity` is a screen never tapped.
 */
export function knockDepth(sinceLastKnockSec: number): number {
  return sinceLastKnockSec >= 0 && sinceLastKnockSec < KNOCK.restSec ? KNOCK.depth : 0;
}
