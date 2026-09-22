import { describe, expect, it } from 'vitest';
import {
  STAR_FLIGHT, flightDone, flightPath, landingAt, starFlightAge, starFlightPose, starsLanded, tallyRing, trailAlpha,
} from '../src/ui/starFlight';

describe('the flight of an earned star', () => {
  const from = { x: 200, y: 400 }, to = { x: 600, y: 900 };

  it('runs from the plate to the tally and rises before it falls', () => {
    expect(flightPath(from, to, 0)).toEqual(from);
    expect(flightPath(from, to, 1)).toEqual(to);
    // Thrown, not dropped: early in the flight the star is above where it started, even
    // on a steep descent to the bench.
    expect(flightPath(from, to, 0.15).y).toBeLessThan(from.y);
    expect(flightPath(from, to, 0.85).y).toBeGreaterThan(from.y);
    expect(flightPath(from, to, -1)).toEqual(from);
    expect(flightPath(from, to, 2)).toEqual(to);
  });

  it('waits its turn, pops off the plate, and lands at the tally’s own size', () => {
    expect(starFlightPose(-0.1).started).toBe(false);
    expect(starFlightPose(-0.1).scale).toBe(STAR_FLIGHT.plate);
    const mid = starFlightPose(STAR_FLIGHT.duration * 0.25);
    expect(mid.started).toBe(true);
    expect(mid.landed).toBe(false);
    expect(mid.scale).toBeGreaterThan(1);
    expect(mid.lift).toBeGreaterThan(0.5);
    const end = starFlightPose(STAR_FLIGHT.duration);
    expect(end.landed).toBe(true);
    expect(end.t).toBe(1);
    expect(end.scale).toBeCloseTo(1, 6);
    expect(end.spin).toBeCloseTo(Math.PI * 2, 6);
    expect(end.lift).toBeCloseTo(0, 6);
  });

  it('staggers the stars so each landing is heard on its own', () => {
    expect(starFlightAge(STAR_FLIGHT.delay, 0)).toBe(0);
    expect(starFlightAge(STAR_FLIGHT.delay, 1)).toBeCloseTo(-STAR_FLIGHT.stagger);
    expect(landingAt(1) - landingAt(0)).toBeCloseTo(STAR_FLIGHT.stagger);
    expect(starsLanded(landingAt(0) - 0.01, 3)).toBe(0);
    expect(starsLanded(landingAt(0), 3)).toBe(1);
    expect(starsLanded(landingAt(2), 3)).toBe(3);
  });

  it('is over only once the last star has landed and settled', () => {
    expect(flightDone(0, 0)).toBe(true);
    expect(flightDone(landingAt(2), 3)).toBe(false);
    expect(flightDone(landingAt(2) + STAR_FLIGHT.settle + 1e-6, 3)).toBe(true);
  });

  it('rings the tally on a landing and is silent for one that has not happened', () => {
    expect(tallyRing(-Infinity)).toEqual({ squash: 0, glow: 0 });
    expect(tallyRing(Infinity)).toEqual({ squash: 0, glow: 0 });
    expect(tallyRing(-0.1)).toEqual({ squash: 0, glow: 0 });
    expect(tallyRing(0.05).squash).toBeGreaterThan(0);
    expect(tallyRing(0.05).glow).toBeGreaterThan(0.5);
    expect(tallyRing(STAR_FLIGHT.ring).glow).toBe(0);
  });

  it('trails fade with distance and vanish at either end of the arc', () => {
    expect(trailAlpha(1, 1)).toBeGreaterThan(trailAlpha(2, 1));
    expect(trailAlpha(2, 1)).toBeGreaterThan(trailAlpha(3, 1));
    expect(trailAlpha(1, 0)).toBe(0);
    expect(trailAlpha(0, 1)).toBe(0);
    expect(trailAlpha(STAR_FLIGHT.trail + 1, 1)).toBe(0);
  });
});
