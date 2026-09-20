import { describe, expect, it, vi } from 'vitest';
import { clipQuadToRect } from '../src/ui/sheen';

vi.mock('phaser', () => ({ default: {} }));

const box = { x: 0, y: 0, width: 100, height: 40, right: 100, bottom: 40 };

describe('brass sheen clip', () => {
  it('keeps a quad that already sits on the panel', () => {
    const clipped = clipQuadToRect([10, 4, 40, 4, 30, 36, 0, 36], box);
    expect(clipped.length).toBeGreaterThanOrEqual(8);
    for (let i = 0; i < clipped.length; i += 2) {
      expect(clipped[i]!).toBeGreaterThanOrEqual(-0.001);
      expect(clipped[i]!).toBeLessThanOrEqual(100.001);
      expect(clipped[i + 1]!).toBeGreaterThanOrEqual(-0.001);
      expect(clipped[i + 1]!).toBeLessThanOrEqual(40.001);
    }
  });

  it('drops a band that has not yet reached the panel', () => {
    expect(clipQuadToRect([-80, 0, -40, 0, -50, 40, -90, 40], box)).toEqual([]);
  });

  it('cuts a leaning band that straddles the left edge', () => {
    const clipped = clipQuadToRect([-20, 0, 20, 0, 10, 40, -30, 40], box);
    expect(clipped.length).toBeGreaterThanOrEqual(6);
    for (let i = 0; i < clipped.length; i += 2) {
      expect(clipped[i]!).toBeGreaterThanOrEqual(-0.001);
      expect(clipped[i]!).toBeLessThanOrEqual(100.001);
    }
  });
});
