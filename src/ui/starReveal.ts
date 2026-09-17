import { clamp01, easeOut } from '../vignettes/motion';
import { overshoot, settle, spring, squash, stagger } from './spring';

/**
 * Result-star reveal. Pure `f(t)` sampled from the audio clock. Numbers are
 * locked to Remotion `src/motion/starReveal.ts` — change both together.
 */

export const STAR_REVEAL = {
  count: 3,
  /** Seconds after the summary appears before the first star starts. */
  delay: 0.14,
  /** Seconds from the first star's start to the last. */
  spread: 0.5,
  /** Local age at which an earned star stamps the plaque. */
  impact: 0.2,
  /** Drop distance, in the same units as the star's authored radius. */
  drop: 1.65,
  /** Opening spin in radians. */
  spin: 0.48,
} as const;

export interface StarPose {
  readonly alpha: number;
  /** Vertical offset in radius-units. Negative is above rest. */
  readonly drop: number;
  readonly scaleX: number;
  readonly scaleY: number;
  /** Radians. */
  readonly spin: number;
  /** 0 = empty silhouette, 1 = full prize fill. */
  readonly fill: number;
  /** Additive bloom behind the star. */
  readonly glow: number;
  /** Specular flash across the face, 0–1. */
  readonly shine: number;
  /** Idle sparkle after the stamp, 0–1. */
  readonly twinkle: number;
  /** Apparent thickness while in the air, 0 at rest. */
  readonly lift: number;
  /** True once the stamp has hit (or the empty star has arrived). */
  readonly landed: boolean;
}

const HIDDEN: StarPose = {
  alpha: 0,
  drop: 0,
  scaleX: 0,
  scaleY: 0,
  spin: 0,
  fill: 0,
  glow: 0,
  shine: 0,
  twinkle: 0,
  lift: 0,
  landed: false,
};

const SEAT: StarPose = {
  alpha: 1,
  drop: 0,
  scaleX: 1,
  scaleY: 1,
  spin: 0,
  fill: 0,
  glow: 0,
  shine: 0,
  twinkle: 0,
  lift: 0,
  landed: false,
};

/** Seconds since this star stamped, or `-1` before impact. */
export function starImpactAge(age: number, earned: boolean): number {
  if (!earned || age < STAR_REVEAL.impact) return -1;
  return age - STAR_REVEAL.impact;
}

/** Local age of star `index`. Pass `still` for the settled pose. */
export function starAge(summaryAge: number, index: number, still = false): number {
  if (still) return 8;
  return summaryAge - STAR_REVEAL.delay - stagger(index, STAR_REVEAL.count, STAR_REVEAL.spread);
}

/**
 * Pose of one result star. `exaggeration` is the treatment weight
 * (workshop is 1.35).
 */
export function starPose(age: number, earned: boolean, exaggeration = 1.35): StarPose {
  if (age <= 0) {
    // Earned slots keep a recessed seat so the plaque is never an empty hole
    // while the medal is still in the air.
    return earned ? SEAT : HIDDEN;
  }

  if (!earned) {
    const p = clamp01(age / 0.34);
    const pop = overshoot(p, 0.08);
    return {
      alpha: easeOut(clamp01(age / 0.16)),
      drop: 0,
      scaleX: pop,
      scaleY: pop,
      spin: 0,
      fill: 0,
      glow: 0,
      shine: 0,
      twinkle: 0,
      lift: 0,
      landed: p >= 1,
    };
  }

  const fall = clamp01(age / 0.26);
  const drop = (1 - easeOut(fall)) * -STAR_REVEAL.drop + settle(age - STAR_REVEAL.impact, 26, 11) * 0.12;
  const squashAmt = squash(age - STAR_REVEAL.impact, 0.16, 0.16 * exaggeration);
  const size = overshoot(clamp01(age / 0.42), 0.16 * exaggeration);
  const spin = (1 - spring(clamp01(age / 0.5), 5.2, 1.7)) * -STAR_REVEAL.spin;
  const fill = easeOut(clamp01(age / 0.08));
  const sinceImpact = Math.max(0, age - STAR_REVEAL.impact);
  const bloom = Math.exp(-sinceImpact * 3.8) * 1.05;
  const idle = 0.16 + 0.1 * Math.sin(age * 4.4);
  const shine = Math.sin(clamp01((age - 0.22) / 0.3) * Math.PI);
  const twinkle = age > 0.52 ? 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(age * 6.8 + 0.8)) : 0;

  return {
    alpha: easeOut(clamp01(age / 0.07)),
    drop,
    scaleX: size * (1 + squashAmt),
    scaleY: size * (1 - squashAmt * 0.82),
    spin,
    fill,
    glow: (bloom + idle) * fill,
    shine: shine * fill,
    twinkle: twinkle * fill,
    lift: (1 - fall) * 0.85,
    landed: age >= STAR_REVEAL.impact,
  };
}

/**
 * Extra bloom after a perfect three-star finish, once the last star has stamped.
 */
export function chorusGlow(summaryAge: number, earned: number): number {
  if (earned < STAR_REVEAL.count) return 0;
  const t = summaryAge - (STAR_REVEAL.delay + STAR_REVEAL.spread + STAR_REVEAL.impact + 0.06);
  if (t < 0) return 0;
  return Math.exp(-t * 2.8) * Math.sin(Math.min(1, t / 0.18) * Math.PI);
}

/**
 * The plaque itself. It used to be a static plate that the medals happened to land on;
 * the refinement hangs it from the ceiling on two ropes, so it arrives as an object with
 * weight and every stamp visibly costs it something.
 */
export const PLAQUE = {
  /** Seconds for the plaque to swing in, before the first medal is due. */
  swing: 0.7,
  /** Drop height at the start of the swing, in plaque heights. */
  rise: 0.42,
  /** Peak tilt of the swing, in radians. */
  tilt: 0.055,
  /** How far one stamp drives the plaque down, in plaque heights. */
  jolt: 0.05,
} as const;

export interface PlaquePose {
  readonly alpha: number;
  /** Vertical offset in plaque heights. Negative is above rest. */
  readonly drop: number;
  /** Radians about the rope anchor above the plaque. */
  readonly tilt: number;
}

/**
 * Where the plaque hangs `age` seconds after the summary appeared. It falls the last
 * stretch of its ropes and rings out on them, so the medals are already dropping into a
 * plaque that has nearly, but not quite, come to rest.
 */
export function plaquePose(age: number, still = false): PlaquePose {
  if (still) return { alpha: 1, drop: 0, tilt: 0 };
  if (age <= 0) return { alpha: 0, drop: -PLAQUE.rise, tilt: -PLAQUE.tilt };
  const fall = clamp01(age / PLAQUE.swing);
  // The rope stops the fall, so the ringing is in the tilt rather than the height.
  const drop = (1 - overshoot(fall, 0.1)) * -PLAQUE.rise;
  const tilt = -PLAQUE.tilt * (1 - fall) + settle(age - PLAQUE.swing * 0.55, 9.5, 3.4) * PLAQUE.tilt * 0.8;
  return { alpha: easeOut(clamp01(age / (PLAQUE.swing * 0.35))), drop, tilt };
}

/**
 * The plaque's recoil from the medals already stamped, in plaque heights. Summed from
 * the impacts themselves rather than run off a fixed timeline, so a one-star finish
 * knocks it once and a three-star finish knocks it three times, in time with the brass.
 */
export function plaqueJolt(summaryAge: number, earned: number, exaggeration = 1.35): number {
  let total = 0;
  for (let k = 0; k < earned; k++) {
    const age = starAge(summaryAge, k) - STAR_REVEAL.impact;
    if (age < 0) continue;
    total += Math.max(0, settle(age, 22, 9)) * PLAQUE.jolt * exaggeration;
  }
  return total;
}

export interface ChorusBurst {
  /** Radius multiplier for the ray fan behind the plaque. */
  readonly scale: number;
  readonly alpha: number;
  /** Radians, so the fan turns as it opens rather than flashing in place. */
  readonly spin: number;
}

/**
 * The fan of light a three-star finish throws behind the whole plaque, not just behind
 * the third medal. Zero on anything short of three stars: the burst is the reward.
 */
export function chorusBurst(summaryAge: number, earned: number): ChorusBurst {
  const glow = chorusGlow(summaryAge, earned);
  if (glow <= 0) return { scale: 0, alpha: 0, spin: 0 };
  const t = 1 - glow;
  return { scale: 0.62 + t * 0.9, alpha: glow * 0.85, spin: t * 0.34 };
}
