import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARC_MIN_FULL, ARC_PHASER_POINTS, ARC_TOLERANCE, arcSegments, arcSweep, drawArc, fullCircleSegments, installArcDetail } from '../src/ui/arcDetail';

/**
 * Every arc in the game is drawn through `drawArc`, so these pin that it is the same curve
 * Phaser would draw — the same way round, through the same ends, within a fraction of a
 * pixel — at a fraction of the points.
 */

function trace(...args: Parameters<typeof drawArc> extends [unknown, ...infer Rest] ? Rest : never): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  drawArc({ lineTo: (x, y) => points.push([x, y]) }, ...args);
  return points;
}

describe('the sweep', () => {
  it('runs the way Phaser\'s renderer runs it', () => {
    expect(arcSweep(0, Math.PI / 2, false)).toBeCloseTo(Math.PI / 2);
    // Clockwise past zero wraps forward, anticlockwise wraps back.
    expect(arcSweep(Math.PI, 0.2, false)).toBeCloseTo(Math.PI * 2 + 0.2 - Math.PI);
    expect(arcSweep(Math.PI, 0.2, true)).toBeCloseTo(0.2 - Math.PI);
    expect(arcSweep(0.2, Math.PI, true)).toBeCloseTo(-Math.PI * 2 + (Math.PI - 0.2));
    // A full turn, and more than one, is one turn.
    expect(arcSweep(0, Math.PI * 2, false)).toBeCloseTo(Math.PI * 2);
    expect(arcSweep(0, Math.PI * 5, false)).toBeCloseTo(Math.PI * 2);
    expect(arcSweep(0, -Math.PI * 5, true)).toBeCloseTo(-Math.PI * 2);
  });
});

describe('how many points', () => {
  it('scales with the radius and never passes Phaser\'s hundred', () => {
    expect(fullCircleSegments(0.5)).toBe(ARC_MIN_FULL);
    expect(fullCircleSegments(2)).toBeLessThan(fullCircleSegments(20));
    expect(fullCircleSegments(20)).toBeLessThan(fullCircleSegments(200));
    for (const radius of [0, 0.05, 1, 4, 30, 120, 400, 5000]) {
      for (const sweep of [0.01, Math.PI / 2, Math.PI, Math.PI * 2]) {
        const n = arcSegments(radius, sweep);
        expect(n, `${radius} ${sweep}`).toBeGreaterThanOrEqual(1);
        expect(n, `${radius} ${sweep}`).toBeLessThanOrEqual(ARC_PHASER_POINTS);
      }
    }
    // The cases the acts are made of: a dot, a card's corner, a puck.
    expect(arcSegments(2, Math.PI * 2)).toBeLessThanOrEqual(16);
    expect(arcSegments(12, Math.PI / 2)).toBeLessThanOrEqual(8);
    expect(arcSegments(44, Math.PI * 2)).toBeLessThanOrEqual(48);
  });

  it('keeps every chord within the tolerance of the true circle', () => {
    for (const radius of [1, 3, 8, 25, 60, 150]) {
      const n = fullCircleSegments(radius);
      const sagitta = radius * (1 - Math.cos(Math.PI / n));
      expect(sagitta, `r ${radius}`).toBeLessThanOrEqual(ARC_TOLERANCE + 1e-9);
    }
  });
});

describe('the curve', () => {
  it('starts and ends where Phaser\'s does, and stays on the circle', () => {
    const points = trace(10, 20, 30, 0.3, 2.1, false, 0);
    expect(points[0]![0]).toBeCloseTo(10 + Math.cos(0.3) * 30);
    expect(points[0]![1]).toBeCloseTo(20 + Math.sin(0.3) * 30);
    expect(points.at(-1)![0]).toBeCloseTo(10 + Math.cos(2.1) * 30);
    expect(points.at(-1)![1]).toBeCloseTo(20 + Math.sin(2.1) * 30);
    for (const [x, y] of points) expect(Math.hypot(x - 10, y - 20)).toBeCloseTo(30);
  });

  it('goes the long way round when told to run anticlockwise', () => {
    const points = trace(0, 0, 10, Math.PI, 0.2, true, 0);
    // From π back to 0.2 anticlockwise passes through π/2, the bottom of the screen, and
    // never over the top: clockwise from π would have gone round through −π/2.
    expect(Math.max(...points.map(([, y]) => y))).toBeCloseTo(10, 1);
    expect(Math.min(...points.map(([, y]) => y))).toBeGreaterThan(-1e-6);
  });

  it('closes a full circle on its own start', () => {
    const points = trace(0, 0, 5, 0, Math.PI * 2, false, 0);
    expect(points.at(-1)![0]).toBeCloseTo(points[0]![0]);
    expect(points.at(-1)![1]).toBeCloseTo(points[0]![1]);
  });

  it('runs past the end on an overshoot and comes back to it', () => {
    const points = trace(0, 0, 10, 0, Math.PI / 2, false, 0.5);
    expect(points.at(-1)![0]).toBeCloseTo(0);
    expect(points.at(-1)![1]).toBeCloseTo(10);
    expect(Math.min(...points.map(([x]) => x))).toBeLessThan(-1);
  });
});

describe('installed for the whole game', () => {
  it('replaces arc and returns the Graphics for chaining', () => {
    const lines: number[] = [];
    const proto = { arc: (() => 0) as (...args: never[]) => unknown, lineTo(x: number) { lines.push(x); return this; } };
    installArcDetail(proto);
    const target = Object.create(proto) as typeof proto & { arc: (...args: number[]) => unknown };
    expect(target.arc(0, 0, 4, 0, Math.PI)).toBe(target);
    expect(lines.length).toBeGreaterThan(2);
  });

  it('is in place before the game is constructed', () => {
    const main = readFileSync('src/main.ts', 'utf8');
    expect(main.indexOf('installArcDetail(Phaser.GameObjects.Graphics.prototype);')).toBeGreaterThan(-1);
    expect(main.indexOf('installArcDetail(Phaser.GameObjects.Graphics.prototype);')).toBeLessThan(main.indexOf('new Phaser.Game('));
  });
});
