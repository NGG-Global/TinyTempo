import { clamp01, easeInOutCubic, easeOut } from '../vignettes/motion';
import { overshoot, squash } from './spring';

/**
 * The stars a finished level earned, flying from its plate on the road into the
 * collection on the bench. Pure `f(t)`, like every other motion in the shell: the map
 * samples it from the frame clock and a dropped frame costs nothing but the frame.
 *
 * The plate and the tally are both real objects already on the screen, so the flight
 * is a transfer between two places the player can see rather than a counter ticking
 * up: each star leaves the socket it was drawn in, arcs up and across, lands on the
 * brass star of the tally, and the count steps once per landing.
 */
export const STAR_FLIGHT = {
  /** Seconds after the map is entered before the first star leaves: the curtain and the sign's drop go first. */
  delay: 0.7,
  /** Seconds between one star leaving and the next. */
  stagger: 0.22,
  /** Seconds a star is in the air. */
  duration: 0.95,
  /** Height of the arc as a share of the straight-line distance. */
  arc: 0.38,
  /** Scale, relative to the tally's star, at the top of the pop that starts the flight. */
  pop: 1.9,
  /** Scale a star leaves the plate at: the plate's star is smaller than the tally's. */
  plate: 0.7,
  /** Seconds the tally rings after a landing. */
  ring: 0.5,
  /** Seconds after the last landing before the flight is over and the gate may lift. */
  settle: 0.3,
  /** Ghost copies drawn behind a star in the air, and how far behind each one trails. */
  trail: 3,
  trailStep: 0.045,
} as const;

export interface Point { readonly x: number; readonly y: number }

export interface FlightPose {
  /** Progress along the path, 0 at the plate and 1 on the tally. */
  readonly t: number;
  /** Size relative to the tally's star. */
  readonly scale: number;
  /** Radians. One full turn over the flight. */
  readonly spin: number;
  /** 1 at the top of the arc, 0 at either end. */
  readonly lift: number;
  readonly started: boolean;
  readonly landed: boolean;
}

/** Local age of star `index`, from the map's own age. Negative before it leaves. */
export function starFlightAge(mapAge: number, index: number): number {
  return mapAge - STAR_FLIGHT.delay - Math.max(0, index) * STAR_FLIGHT.stagger;
}

/**
 * A point on the arc. A quadratic curve whose control point sits above the higher end,
 * so a star tossed downhill still rises first — it is thrown, not dropped.
 */
export function flightPath(from: Point, to: Point, t: number, arc: number = STAR_FLIGHT.arc): Point {
  const p = clamp01(t);
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const control = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - distance * arc };
  const q = 1 - p;
  return {
    x: q * q * from.x + 2 * q * p * control.x + p * p * to.x,
    y: q * q * from.y + 2 * q * p * control.y + p * p * to.y,
  };
}

export function starFlightPose(age: number, exaggeration = 1.35): FlightPose {
  if (age <= 0) return { t: 0, scale: STAR_FLIGHT.plate, spin: 0, lift: 0, started: false, landed: false };
  const p = clamp01(age / STAR_FLIGHT.duration);
  // A pop off the plate for the first third, then a shrink to the tally's size as it lands.
  const popEnd = 0.32;
  const scale = p < popEnd
    ? STAR_FLIGHT.plate + (STAR_FLIGHT.pop - STAR_FLIGHT.plate) * overshoot(p / popEnd, 0.12 * exaggeration)
    : STAR_FLIGHT.pop + (1 - STAR_FLIGHT.pop) * easeInOutCubic((p - popEnd) / (1 - popEnd));
  return {
    t: easeInOutCubic(p),
    scale,
    spin: Math.PI * 2 * easeOut(p),
    lift: Math.sin(Math.PI * p),
    started: true,
    landed: p >= 1,
  };
}

/** How many of `count` stars have landed by this map age. */
export function starsLanded(mapAge: number, count: number): number {
  let landed = 0;
  for (let i = 0; i < count; i++) if (starFlightAge(mapAge, i) >= STAR_FLIGHT.duration) landed++;
  return landed;
}

/** When the last star's landing has settled: the count is final and the gate may lift. */
export function flightDone(mapAge: number, count: number): boolean {
  if (count <= 0) return true;
  return starFlightAge(mapAge, count - 1) >= STAR_FLIGHT.duration + STAR_FLIGHT.settle;
}

/** Seconds at which star `index` lands, from the map's entry. */
export function landingAt(index: number): number {
  return STAR_FLIGHT.delay + Math.max(0, index) * STAR_FLIGHT.stagger + STAR_FLIGHT.duration;
}

/** The tally's answer to a landing: a squash on the brass star and a bloom that fades. */
export function tallyRing(sinceLanded: number, exaggeration = 1.35): { readonly squash: number; readonly glow: number } {
  if (!Number.isFinite(sinceLanded) || sinceLanded < 0 || sinceLanded >= STAR_FLIGHT.ring) return { squash: 0, glow: 0 };
  return {
    squash: squash(sinceLanded, 0.22, 0.22 * exaggeration),
    glow: Math.exp(-sinceLanded * 5) ,
  };
}

/** Alpha of ghost `k` (1 is the nearest) behind a star in the air. */
export function trailAlpha(k: number, lift: number): number {
  if (k < 1 || k > STAR_FLIGHT.trail) return 0;
  return (0.4 - (k - 1) * 0.12) * lift;
}
