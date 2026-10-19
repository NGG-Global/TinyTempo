import { arrive, overshoot, spring } from './spring';

/**
 * A ready star gate, and the unlock a player taps it open with, as pure f(t) — seconds from
 * the tap for the ceremony, from the scene's clock for the ready gate's idle — so the map
 * draws a pose and nothing here owns a timer. `tests/gateCeremony.test.ts` holds its shape.
 *
 * The beats, in order: the plate takes the thumb (a squash), the lock shakes and **pops** —
 * the click, a burst of sparks and the buzz all land on `popAt` — the plate drops away, the
 * bar swings up on a spring and fades, and a banner brings the area's badge down to stamp
 * under its name. The banner holds long enough to read and lifts off; the frontier, freed
 * as the bar clears, is already hopping under it.
 */
export const GATE_CEREMONY = Object.freeze({
  pressSec: 0.16,
  popAt: 0.2,
  /** The plate falls and fades over this, from the pop. */
  plateSec: 0.42,
  liftDelay: 0.24,
  liftSec: 0.9,
  barFadeSec: 0.35,
  bannerAt: 0.5,
  bannerInSec: 0.45,
  /** The badge stamps into the banner this long after it starts arriving. */
  badgeAfter: 0.3,
  badgeSec: 0.5,
  bannerHoldSec: 1.9,
  bannerOutSec: 0.4,
});

/** When the bar has cleared the road, so the frontier behind it can be freed. */
export const GATE_CLEARED_AT = GATE_CEREMONY.liftDelay + GATE_CEREMONY.liftSec + GATE_CEREMONY.barFadeSec;
/** When the whole ceremony is over. */
export const GATE_CEREMONY_SEC = GATE_CEREMONY.bannerAt + GATE_CEREMONY.bannerInSec + GATE_CEREMONY.bannerHoldSec + GATE_CEREMONY.bannerOutSec;

export interface ReadyPose {
  /** The plate's halo, 0–1, breathing. */
  readonly glow: number;
  /** How far the plate bobs, in design units. */
  readonly bob: number;
  /** The lock's wiggle, in radians: a nudge every couple of seconds, still otherwise. */
  readonly wiggle: number;
  /** A ring leaving the plate once a breath, 0–1 through its travel. */
  readonly ring: number;
}

/** A met gate waiting for its tap. Under reduced motion it holds a steady glow. */
export function readyPose(t: number, still: boolean): ReadyPose {
  if (still) return { glow: 0.7, bob: 0, wiggle: 0, ring: 0 };
  const breath = 0.5 - 0.5 * Math.cos((t / 1.2) * Math.PI * 2);
  const cycle = t % 2.4;
  const wiggle = cycle < 0.45 ? Math.sin((cycle / 0.45) * Math.PI * 4) * 0.22 * (1 - cycle / 0.45) : 0;
  const ring = (t % 1.2) / 1.2;
  return { glow: 0.45 + 0.55 * breath, bob: -3 * breath, wiggle, ring };
}

export interface CeremonyPose {
  /** The plate's squash under the thumb, 0–1. */
  readonly press: number;
  /** The lock's hasp, 0 shut to 1 sprung. */
  readonly lockOpen: number;
  readonly lockShake: number;
  readonly plateAlpha: number;
  /** How far the plate has fallen, in design units. */
  readonly plateDrop: number;
  /** The bar's swing, 0 across the road to 1 up (with overshoot), and its opacity. */
  readonly lift: number;
  readonly bar: number;
  readonly banner: { readonly alpha: number; readonly rise: number; readonly scale: number };
  readonly badge: { readonly alpha: number; readonly scale: number; readonly spin: number; readonly ring: number };
  /** Past `GATE_CLEARED_AT`: the road is clear. */
  readonly cleared: boolean;
  readonly done: boolean;
}

/** The unlock at `age` seconds from the tap. Under reduced motion: no squash, shake or swing, only fades. */
export function ceremonyPose(age: number, still: boolean): CeremonyPose {
  const C = GATE_CEREMONY;
  const bannerIn = age - C.bannerAt;
  const bannerOutAt = C.bannerInSec + C.bannerHoldSec;
  const cleared = age >= GATE_CLEARED_AT;
  const done = age >= GATE_CEREMONY_SEC;
  // Exactly gone once done: the sum of the beats need not land on the last one's end in floats.
  const out = done ? 1 : Math.max(0, Math.min(1, (bannerIn - bannerOutAt) / C.bannerOutSec));
  if (still) {
    const inFade = Math.max(0, Math.min(1, bannerIn / 0.25));
    return {
      press: 0, lockOpen: age >= C.popAt ? 1 : 0, lockShake: 0,
      plateAlpha: age >= C.popAt ? 0 : 1, plateDrop: 0,
      lift: age >= C.popAt ? 1 : 0, bar: age >= C.popAt ? 0 : 1,
      banner: { alpha: bannerIn < 0 ? 0 : inFade * (1 - out), rise: 0, scale: 1 },
      badge: { alpha: bannerIn < 0 ? 0 : inFade * (1 - out), scale: 1, spin: 0, ring: 0 },
      cleared, done,
    };
  }
  const press = age < C.popAt ? Math.sin(Math.min(1, age / C.pressSec) * Math.PI / 2) * (age < C.pressSec ? 1 : 1 - (age - C.pressSec) / (C.popAt - C.pressSec)) : 0;
  const lockShake = age < C.popAt ? Math.sin(age * 90) * 0.18 * (age / C.popAt) : 0;
  const lockOpen = age < C.popAt ? 0 : overshoot(Math.min(1, (age - C.popAt) / 0.18), 0.3);
  const fall = Math.max(0, Math.min(1, (age - C.popAt) / C.plateSec));
  const liftAge = age - C.liftDelay;
  const lift = liftAge <= 0 ? 0 : spring(liftAge / C.liftSec, 4.2, 1.6);
  const bar = liftAge <= C.liftSec ? 1 : Math.max(0, 1 - (liftAge - C.liftSec) / C.barFadeSec);
  const entry = bannerIn < 0 ? { rise: 1, alpha: 0 } : arrive(bannerIn, C.bannerInSec);
  const badgeAge = bannerIn - C.badgeAfter;
  const badgeIn = badgeAge < 0 ? 0 : Math.min(1, badgeAge / C.badgeSec);
  return {
    press, lockOpen, lockShake,
    plateAlpha: 1 - fall, plateDrop: fall * fall * 70,
    lift, bar,
    banner: { alpha: entry.alpha * (1 - out), rise: entry.rise * 40 - out * 30, scale: 1 },
    badge: {
      alpha: badgeAge < 0 ? 0 : Math.min(1, badgeIn * 3) * (1 - out),
      // Dropped in large, stamped to size.
      scale: badgeAge < 0 ? 0 : 1 + (1 - overshoot(badgeIn, 0.35)) * 1.4,
      spin: badgeAge < 0 ? 0 : (1 - Math.min(1, badgeIn * 1.4)) * -0.9,
      ring: badgeAge < C.badgeSec * 0.55 ? 0 : Math.min(1, (badgeAge - C.badgeSec * 0.55) / 0.5),
    },
    cleared, done,
  };
}

/** The badge's stamp lands here: the moment for its haptic and its sparkle. */
export const BADGE_STAMP_AT = GATE_CEREMONY.bannerAt + GATE_CEREMONY.badgeAfter + GATE_CEREMONY.badgeSec * 0.55;
