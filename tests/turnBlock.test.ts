import { describe, expect, it, vi } from 'vitest';
import {
  batonCrossing, blockGeometry, blockWidth, columnRoom, faceHeat, faceLift, socketFuse, TRACK,
} from '../src/ui/turnBlock';
import type { Handover } from '../src/game/beatTrack';

// The drawing reaches Phaser; the geometry and the curves are plain numbers. The stub is
// only deep enough for the drawing modules to evaluate — nothing on it is ever called.
vi.mock('phaser', () => ({ default: { Geom: { Rectangle: class {} }, Math: { Vector2: class {} } } }));

const turn = (runway: number, yours = 0): Handover => ({ runway, yours });

describe('where the two rows sit', () => {
  const geo = (width = 600, s = 1) => blockGeometry(360, 1000, width, s);

  it('leaves the answer row exactly where the beat track already was', () => {
    // The thumb zone does not move. The shelf is added above it, not in place of it.
    const g = geo();
    expect(g.faceCentreY).toBe(1000);
    expect(g.face.y + g.face.height / 2).toBe(1000);
    expect(g.face.height).toBe(TRACK.plateHeight);
  });

  it('stacks the shelf above the face with the stated gap, and narrower', () => {
    const g = geo();
    expect(g.face.y - (g.shelf.y + g.shelf.height)).toBeCloseTo(TRACK.rowGap);
    expect(g.shelfCentreY).toBeCloseTo(1000 - 73);
    // Narrower per side, so the face reads as the object in front of the shelf.
    expect(g.shelf.x - g.face.x).toBeCloseTo(TRACK.shelfInset);
    expect(g.face.width - g.shelf.width).toBeCloseTo(TRACK.shelfInset * 2);
  });

  it('centres both rows on the same point', () => {
    const g = geo();
    expect(g.face.centerX).toBeCloseTo(360);
    expect(g.shelf.centerX).toBeCloseTo(360);
  });

  it('puts each slot at its own row’s left end, the shelf’s inset with it', () => {
    const g = geo();
    expect(g.shelfSlot.x - g.faceSlot.x).toBeCloseTo(TRACK.shelfInset);
    expect(g.faceSlot.y).toBe(g.faceCentreY);
    expect(g.shelfSlot.y).toBe(g.shelfCentreY);
  });

  it('scales every length together, so nothing drifts on a taller handset', () => {
    const one = geo(600, 1);
    const half = geo(600, 0.5);
    expect(1000 - half.shelfCentreY).toBeCloseTo((1000 - one.shelfCentreY) / 2);
    expect(half.shelf.height).toBeCloseTo(one.shelf.height / 2);
    expect(half.faceSlot.x - half.face.x).toBeCloseTo((one.faceSlot.x - one.face.x) / 2);
  });

  it('degrades to an empty shelf rather than a negative one on a very narrow row', () => {
    expect(geo(10).shelf.width).toBe(0);
  });

  it('widens the rows enough to keep either owner slot off the first column', () => {
    const beadSpan = 300;
    const g = blockGeometry(360, 1000, blockWidth(beadSpan, 1), 1);
    const firstColumn = 360 - beadSpan / 2;
    // The shelf is inset, so its slot sits closer to the columns and collides first.
    expect(g.shelfSlot.x + TRACK.ownerSlotRadius).toBeLessThanOrEqual(firstColumn);
    expect(g.faceSlot.x + TRACK.ownerSlotRadius).toBeLessThan(g.shelfSlot.x + TRACK.ownerSlotRadius);
  });

  it('gives the columns the room the slots do not need, and no less at any scale', () => {
    // The pitch gives way on the longest patterns, because the row is already at the
    // screen's edges by then; blockWidth and columnRoom have to agree about the cost.
    for (const s of [0.6, 1, 1.4]) {
      const row = 620 * s;
      expect(blockWidth(columnRoom(row, s), s)).toBeCloseTo(row);
    }
    // A row too narrow to pay for the slots still leaves the columns something to use.
    expect(columnRoom(40, 1)).toBeGreaterThan(0);
  });
});

describe('what the handover does to the block', () => {
  it('warms the face before the downbeat and finishes on it', () => {
    expect(faceHeat(turn(0), false)).toBe(0);
    // Partly warm by the time the turn arrives: the cue is already here, not arriving.
    expect(faceHeat(turn(1), false)).toBeCloseTo(0.44);
    expect(faceHeat(turn(1, 1), false)).toBe(1);
  });

  it('carries the baton across the runway and lifts the row into the thumb', () => {
    expect(batonCrossing(turn(0), false)).toBe(0);
    expect(batonCrossing(turn(0.5), false)).toBeCloseTo(0.5);
    expect(batonCrossing(turn(1), false)).toBe(1);
    expect(faceLift(turn(0), false)).toBe(0);
    expect(faceLift(turn(1), false)).toBeCloseTo(TRACK.faceLift * 0.5);
    expect(faceLift(turn(1, 1), false)).toBeCloseTo(TRACK.faceLift);
  });

  it('under reduced motion keeps the information and drops only the travel', () => {
    // Two states and no travel; no lift at all; the heat steps rather than ramps.
    expect(batonCrossing(turn(0.4), true)).toBe(1);
    expect(batonCrossing(turn(0), true)).toBe(0);
    expect(faceLift(turn(1, 1), true)).toBe(0);
    expect(faceHeat(turn(0.4), true)).toBe(0.44);
    expect(faceHeat(turn(1, 0.5), true)).toBe(1);
    // Every socket together, at half and then full, rather than a fuse burning across.
    const half = [0, 1, 2, 3].map(i => socketFuse(turn(0.4), i, true));
    expect(half).toEqual([0.5, 0.5, 0.5, 0.5]);
    expect([0, 1, 2, 3].map(i => socketFuse(turn(1, 1), i, true))).toEqual([1, 1, 1, 1]);
  });

  it('still lights the sockets in order when motion is allowed', () => {
    const lit = [0, 1, 2, 3].map(i => socketFuse(turn(0.35), i, false));
    expect(lit[0]!).toBeGreaterThan(lit[1]!);
    expect(lit[1]!).toBeGreaterThanOrEqual(lit[2]!);
    expect(lit.every(v => v >= 0 && v <= 1)).toBe(true);
  });
});
