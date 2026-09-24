import { describe, expect, it, vi } from 'vitest';
import {
  batonAt, batonCrossing, batonTrail, blockGeometry, blockWidth, columnRoom, dropLine, faceHeat, faceLift, glyphFlip,
  landingRipple, landingSquash, restTiles, socketFuse, socketPop, tileGrowth, TRACK,
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

describe('the baton’s travel', () => {
  const geo = blockGeometry(360, 1000, 600, 1);

  it('bows over the columns and arrives at each slot exactly', () => {
    const start = batonAt(geo, 1, 0, 0, false);
    const end = batonAt(geo, 1, 1, 0, false);
    expect(start).toMatchObject({ x: geo.shelfSlot.x, y: geo.shelfSlot.y, arc: 0 });
    expect(end.x).toBeCloseTo(geo.faceSlot.x);
    expect(end.y).toBeCloseTo(geo.faceSlot.y);
    // Mid-crossing it is out over the columns, to the right of the straight line.
    const mid = batonAt(geo, 1, 0.5, 0, false);
    expect(mid.x).toBeGreaterThan((geo.shelfSlot.x + geo.faceSlot.x) / 2 + TRACK.batonBow * 0.9);
    expect(mid.arc).toBeCloseTo(1);
  });

  it('travels straight and unbowed under reduced motion', () => {
    expect(batonAt(geo, 1, 0.5, 0, true).x).toBeCloseTo((geo.shelfSlot.x + geo.faceSlot.x) / 2);
  });

  it('leaves ghosts behind it on the arc, strongest mid-crossing, and none at either slot', () => {
    expect(batonTrail(0, false)).toEqual([]);
    expect(batonTrail(1, false)).toEqual([]);
    const mid = batonTrail(0.5, false);
    expect(mid.length).toBeGreaterThan(0);
    for (const ghost of mid) expect(ghost.t).toBeLessThan(0.5);
    // Fainter the further behind.
    for (let i = 1; i < mid.length; i++) expect(mid[i]!.alpha).toBeLessThan(mid[i - 1]!.alpha);
    expect(mid[0]!.alpha).toBeGreaterThan(batonTrail(0.1, false)[0]!.alpha);
    // Never reaching back past the shelf slot.
    for (const ghost of batonTrail(0.1, false)) expect(ghost.t).toBeGreaterThan(0);
  });

  it('leaves no trail under reduced motion, where there is no travel to show', () => {
    expect(batonTrail(0.5, true)).toEqual([]);
  });

  it('turns over like a coin: the glyph is a sliver at the midpoint and whole at either end', () => {
    expect(glyphFlip(0)).toBeCloseTo(1);
    expect(glyphFlip(1)).toBeCloseTo(1);
    expect(glyphFlip(0.5)).toBeLessThan(0.3);
    expect(glyphFlip(0.5)).toBeGreaterThan(0);
  });
});

describe('the landing', () => {
  it('throws a ring that spreads and fades, and is gone within half a second', () => {
    const early = landingRipple(0.05, false);
    const late = landingRipple(0.3, false);
    expect(early.alpha).toBeGreaterThan(late.alpha);
    expect(late.spread).toBeGreaterThan(early.spread);
    expect(landingRipple(0.5, false).alpha).toBe(0);
    expect(landingRipple(-Infinity, false).alpha).toBe(0);
  });

  it('squashes the baton on impact and lets it back to round', () => {
    expect(landingSquash(0, false)).toBe(0);
    expect(landingSquash(0.15, false)).toBeGreaterThan(0.1);
    expect(landingSquash(0.4, false)).toBe(0);
    expect(landingSquash(-Infinity, false)).toBe(0);
  });

  it('is still under reduced motion', () => {
    expect(landingRipple(0.1, true).alpha).toBe(0);
    expect(landingSquash(0.1, true)).toBe(0);
  });
});

describe('the pattern dropping into the sockets', () => {
  it('pops a socket as the fuse reaches it and leaves it alone once lit', () => {
    expect(socketPop(0)).toBe(0);
    expect(socketPop(0.5)).toBeGreaterThan(0.1);
    expect(socketPop(1)).toBeCloseTo(0);
  });

  it('draws the line down with the fuse, left to right, and thins it once the turn has arrived', () => {
    expect(dropLine(turn(0), 0, false)).toBe(0);
    expect(dropLine(turn(0.3), 0, false)).toBeGreaterThan(dropLine(turn(0.3), 2, false));
    const lit = dropLine(turn(1), 0, false);
    expect(lit).toBeGreaterThan(0);
    expect(dropLine(turn(1, 1), 0, false)).toBeLessThan(lit);
    expect(dropLine(turn(1, 1), 0, false)).toBeGreaterThan(0);
  });
});

describe('the breather on the block', () => {
  it('lays four bar tiles on the face, after the owner slot and inside the edge', () => {
    for (const s of [0.9, 1, 1.113]) {
      for (const width of [TRACK.restWidth * s, 640 * s]) {
        const tiles = restTiles(width, s, 4);
        expect(tiles).toHaveLength(4);
        const slotEdge = (TRACK.ownerInset + TRACK.ownerSlotRadius) * s;
        expect(tiles[0]!.x).toBeGreaterThan(slotEdge);
        expect(tiles.at(-1)!.x + tiles.at(-1)!.width).toBeLessThanOrEqual(width - TRACK.tileInset * s + 1e-9);
        for (let k = 1; k < tiles.length; k++) {
          expect(tiles[k]!.width).toBeCloseTo(tiles[0]!.width, 9);
          expect(tiles[k]!.x - (tiles[k - 1]!.x + tiles[k - 1]!.width)).toBeCloseTo(TRACK.tileGap * s, 9);
        }
        for (const tile of tiles) {
          expect(tile.height).toBeLessThan(TRACK.plateHeight * s);
          // Four dots inside the tile, and the grown ones still clear of each other.
          expect(tile.dots).toHaveLength(4);
          expect(tile.dots[0]! - TRACK.pipRadius * s).toBeGreaterThan(0);
          expect(tile.dots[3]! + TRACK.pipRadius * s).toBeLessThan(tile.width);
          expect(tile.dots[1]! - tile.dots[0]!).toBeGreaterThan(TRACK.pipRadius * s * 2.5);
        }
      }
    }
    expect(restTiles(0, 1, 4)).toEqual([]);
    expect(restTiles(560, 1, 0)).toEqual([]);
  });

  it('grows the last bar\'s dots to pip size, and only the last bar\'s', () => {
    const rest = (bar: number, barAge: number) => ({ bar, beat: 0, bars: 4, pressAge: 0, barAge, returning: 0 });
    expect(tileGrowth(rest(2, 5), false)).toBe(0);
    expect(tileGrowth(rest(3, 0), false)).toBe(0);
    expect(tileGrowth(rest(3, 0.1), false)).toBeGreaterThan(0);
    expect(tileGrowth(rest(3, 1), false)).toBe(1);
    // Under reduced motion there is no growing, only grown.
    expect(tileGrowth(rest(3, 0), true)).toBe(1);
  });
});
