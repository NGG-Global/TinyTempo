import { describe, expect, it } from 'vitest';
import { resizedScroll, scrollStep, stripBounds, stripInView } from '../src/ui/navigation';

describe('map navigation motion', () => {
  it('preserves the world point at the viewport centre across a resize', () => {
    expect(resizedScroll(600, 1, 2, 100, 200, 1000, 2000)).toBeCloseTo(1200);
    expect(resizedScroll(600, 1, 1, 100, 100, 1000, 1000)).toBeCloseTo(600);
    const next = resizedScroll(600, 1, 0.8, 100, 80, 1000, 1200);
    const oldPoint = (600 + 550 - 100) / 1;
    const newPoint = (next + 640 - 80) / 0.8;
    expect(newPoint).toBeCloseTo(oldPoint);
    expect(resizedScroll(600, 0, 2, 0, 0, 1000, 1000)).toBe(0);
  });

  it('has the same inertia at 30Hz and 60Hz', () => {
    const whole = scrollStep(1000, 1000 / 30, 5);
    const first = scrollStep(1000, 1000 / 60, 5);
    const second = scrollStep(first.velocity, 1000 / 60, 5);
    expect(first.distance + second.distance).toBeCloseTo(whole.distance);
    expect(second.velocity).toBeCloseTo(whole.velocity);
  });

  it('cannot fling across the map after a stalled frame', () => {
    expect(scrollStep(1000, 5000, 5)).toEqual(scrollStep(1000, 64, 5));
    expect(scrollStep(-1000, 16, 5).distance).toBeLessThan(0);
    expect(scrollStep(1000, -16, 5)).toEqual({ distance: 0, velocity: 1000 });
  });
});

describe('the map bake, cut into strips', () => {
  // The scene's own geometry: level 0 at the bottom, the road climbing by one step.
  const world = 10718, step = 202, pad = 660;
  const nodeY = (i: number): number => world - (pad + i * step);
  const bounds = (count: number, levels: number) => stripBounds(count, levels, world, nodeY, step);

  it('tiles the world: no gap, no overlap, both ends covered', () => {
    for (const levels of [1, 2, 3, 4, 7, 48, 100]) {
      const strips = bounds(48, levels);
      expect(strips[0]!.bottom).toBe(world);
      expect(strips.at(-1)!.top).toBe(0);
      for (const strip of strips) expect(strip.top).toBeLessThan(strip.bottom);
      // A gap is a screen-wide band of missing ground; an overlap paints every
      // half-alpha shape in it twice. Neither is visible until one scroll position.
      for (let j = 1; j < strips.length; j++) {
        expect(strips[j]!.bottom).toBeCloseTo(strips[j - 1]!.top, 6);
      }
    }
  });

  it('gives every node to exactly one strip', () => {
    for (const levels of [1, 3, 5]) {
      const owners = new Map<number, number>();
      bounds(48, levels).forEach((strip, j) => {
        for (let i = strip.from; i < strip.to; i++) {
          expect(owners.has(i)).toBe(false);
          owners.set(i, j);
        }
      });
      expect(owners.size).toBe(48);
    }
  });

  it('seams fall between nodes, never on one', () => {
    for (const strip of bounds(48, 3)) {
      for (let i = 0; i < 48; i++) {
        if (strip.top > 0) expect(Math.abs(nodeY(i) - strip.top)).toBeGreaterThan(step / 4);
        if (strip.bottom < world) expect(Math.abs(nodeY(i) - strip.bottom)).toBeGreaterThan(step / 4);
      }
    }
  });

  it('degenerates safely on an empty or impossible window', () => {
    expect(bounds(0, 4)).toEqual([]);
    expect(stripBounds(48, 0, world, nodeY, step)).toEqual([]);
    expect(bounds(1, 4)).toHaveLength(1);
    expect(bounds(1, 4)[0]).toMatchObject({ from: 0, to: 1, top: 0, bottom: world });
  });

  it('draws a strip only where the camera can reach it, margin included', () => {
    const strip = { top: 1000, bottom: 2000 };
    expect(stripInView(strip, 2000, 800, 0)).toBe(false);
    expect(stripInView(strip, 1999, 800, 0)).toBe(true);
    expect(stripInView(strip, 200, 800, 0)).toBe(false);
    expect(stripInView(strip, 201, 800, 0)).toBe(true);
    // The margin is what keeps a prop standing past its strip's edge from popping in.
    expect(stripInView(strip, 2100, 800, 200)).toBe(true);
    expect(stripInView(strip, 100, 800, 200)).toBe(true);
  });

  it('keeps every strip of a scrolled world reachable, and most of them off', () => {
    const strips = bounds(48, 3);
    const height = 1559, margin = 260;
    const seen = new Set<number>();
    let drawn = 0, samples = 0;
    for (let scroll = 0; scroll <= world - height; scroll += 40) {
      const on = strips.filter(s => stripInView(s, scroll, height, margin));
      on.forEach(s => seen.add(s.from));
      drawn += on.length; samples++;
    }
    // Nothing is unreachable — a strip that never draws is a hole in the road.
    expect(seen.size).toBe(strips.length);
    // And the point of the exercise: most of the bake is off on any given frame.
    expect(drawn / samples).toBeLessThan(strips.length * 0.4);
  });
});
