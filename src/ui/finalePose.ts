import { clamp01, easeOut } from '../vignettes/motion';
import { overshoot, settle } from './spring';

/**
 * The finale's poses as pure `f(t)`, sampled from the audio clock like every other pose in
 * a level, so a dropped frame costs the frame and nothing else. No Phaser here: the
 * stage (`ui/finaleStage.ts`) draws what these return, and the tests read them directly.
 */

export const FINALE_POSE = Object.freeze({
  /** The title card's fall onto its ropes, and its climb back out. */
  cardEnter: 0.55,
  cardExit: 0.45,
  /** Card heights above its resting place, where it enters from and leaves to. */
  cardRise: 1.4,
  /** Radians the card leans as it lands, ringing out on its ropes. */
  cardTilt: 0.07,
  /** The payoff ribbon unrolling from its middle. */
  ribbonUnroll: 0.5,
  /** Pennants' idle sway, in radians, and how far a clear lifts it. */
  sway: 0.08,
  cheer: 0.26,
  /** How long the cheer takes to die back to the idle sway. */
  cheerDecay: 1.6,
});

export interface CardPose {
  /** Card heights from its resting place; negative is above it. */
  readonly offset: number;
  readonly tilt: number;
  readonly alpha: number;
}

/**
 * The title card, `age` seconds into a window of `span` seconds: it drops in on its ropes,
 * hangs, and is hauled back up so it is gone by the end of the window — which is the first
 * demonstration's downbeat less a margin, so it never covers the example it introduces. A
 * window too short for both motions shares it between them. Still under reduced motion: it
 * is simply there, and simply gone.
 */
export function titleCardPose(age: number, span: number, still = false): CardPose {
  const P = FINALE_POSE;
  if (!(span > 0) || !Number.isFinite(age) || age < 0 || age >= span) return { offset: -P.cardRise, tilt: 0, alpha: 0 };
  if (still) return { offset: 0, tilt: 0, alpha: 1 };
  const k = Math.min(1, span / (P.cardEnter + P.cardExit + 0.2));
  const enter = P.cardEnter * k, exit = P.cardExit * k;
  if (age < enter) {
    const p = age / enter;
    return {
      offset: -(1 - overshoot(p, 0.12)) * P.cardRise,
      tilt: -P.cardTilt * (1 - p),
      alpha: easeOut(clamp01(p * 2.5)),
    };
  }
  const out = age - (span - exit);
  const ring = settle(age - enter, 8.5, 3.2) * P.cardTilt * 0.7;
  if (out <= 0) return { offset: 0, tilt: ring, alpha: 1 };
  const p = out / exit;
  // Hauled up: slow off the mark, then quickly out of the way.
  return { offset: -(p * p) * P.cardRise, tilt: ring * (1 - p), alpha: 1 - clamp01((p - 0.35) / 0.65) };
}

export interface RibbonPose {
  /** 0 → 1 across the ribbon's width, unrolling from the middle. */
  readonly unroll: number;
  /** Extra scale from the stamp as it lands: 0 at rest. */
  readonly stamp: number;
  readonly alpha: number;
}

/** The "Area complete" ribbon, `age` seconds after it was called for. */
export function ribbonPose(age: number, still = false): RibbonPose {
  // "Not called for" is a start of -Infinity, which makes the age +Infinity: absent, not
  // long since arrived.
  if (!Number.isFinite(age) || age < 0) return { unroll: 0, stamp: 0, alpha: 0 };
  if (still) return { unroll: 1, stamp: 0, alpha: 1 };
  const p = clamp01(age / FINALE_POSE.ribbonUnroll);
  const unroll = Math.min(1.06, overshoot(p, 0.06));
  const landed = age - FINALE_POSE.ribbonUnroll * 0.8;
  return { unroll, stamp: Math.max(0, settle(landed, 20, 7)) * 0.08, alpha: easeOut(clamp01(p * 3)) };
}

/**
 * One pennant's swing, in radians. Each hangs at its own phase so the line ripples rather
 * than rocking as one board, and a clear (`cheerAge` since it) throws them all up before
 * they settle back. Zero under reduced motion.
 */
export function pennantSwing(t: number, index: number, cheerAge: number, still = false): number {
  if (still) return 0;
  const idle = Math.sin(t * 2.1 + index * 0.9) * FINALE_POSE.sway;
  if (!Number.isFinite(cheerAge) || cheerAge < 0) return idle;
  const cheer = Math.sin(cheerAge * 11 + index * 1.3) * FINALE_POSE.cheer * Math.exp(-cheerAge * 3 / FINALE_POSE.cheerDecay);
  return idle + cheer;
}

/**
 * Where the pennants hang along a line strung between two points and sagging by `sag` at
 * its middle: `count` points evenly spaced along it, each with the slope of the line
 * there, so a pennant hangs square to the string it is tied to.
 */
export function buntingPoints(
  left: number, right: number, y: number, sag: number, count: number,
): readonly { readonly x: number; readonly y: number; readonly slope: number }[] {
  if (count <= 0 || !(right > left)) return [];
  const width = right - left;
  return Array.from({ length: count }, (_, i) => {
    const u = (i + 0.5) / count;
    const c = 2 * u - 1;
    return {
      x: left + width * u,
      y: y + sag * (1 - c * c),
      // dy/dx of the parabola, as an angle.
      slope: Math.atan((-4 * sag * c) / width),
    };
  });
}
