import { describe, expect, it, vi } from 'vitest';
import { finaleMapMark } from '../src/game/finale';
import { firstLevelOfArea } from '../src/game/stars';
import { isAreaFinale, mapLastLevel } from '../src/game/levels';
import { PROGRESSION } from '../src/config/progression';
import { PALETTE, SHELL } from '../src/config/theme';
import { AREAS } from '../src/game/levels';
import { contrastRatio, typeStroke } from '../src/ui/colour';
import { STAR_PRIZE } from '../src/ui/star';
import { stripBounds } from '../src/ui/navigation';
import { pathIndexAt, pathXAt, smoothPath } from '../src/ui/path';
import {
  beyondY, buntingPosts, CREST, crestY, crownHollow, crownSeats, FINALE_STOP, finalePlate, finaleStageBounds, finaleStopLook,
  GATE, gatePlateTop, mapWindow, nodeRises, nodeYs, ROAD, roomAbove, seamBelow, signpostAt, worldHeight,
} from '../src/ui/roadLayout';

vi.mock('phaser', () => ({ default: {} }));

/**
 * Safe frames the map is laid out in: its scale, top inset and width. `s` is
 * `min(width / 720, height / 1150)`, so the width is never under 720 s: a phone is
 * width-anchored, a 4:3 tablet height-anchored and wider.
 */
const FRAMES = [
  { s: 1, top: 0, width: 720 }, { s: 1, top: 36, width: 720 },
  { s: 0.92, top: 24, width: 720 }, { s: 0.92, top: 0, width: 662.4 }, { s: 1.113, top: 0, width: 960 },
] as const;
type Frame = typeof FRAMES[number];
const hudOf = (f: Frame) => f.top + ROAD.hud * f.s;
const LEFT = 0;
/** The scene's own wander, so a placement can be checked against the road it will sit on. */
const nodeX = (level: number, width = 720) => width / 2 + Math.sin(level * 0.9) * width * 0.27;

describe('the road window', () => {
  it('ends at the road\'s own end when centred on the frontier, and says when it does not', () => {
    for (const unlocked of [1, 20, 40, 95, 400]) {
      const w = mapWindow(unlocked, unlocked);
      expect(w.first + w.shown - 1).toBe(mapLastLevel(unlocked));
      expect(w.atEnd).toBe(true);
      expect(w.shown).toBeLessThanOrEqual(ROAD.window);
    }
    // Back from a replay far below the frontier, the window stops short of the end.
    const replay = mapWindow(95, 10);
    expect(replay.first).toBe(1);
    expect(replay.atEnd).toBe(false);
  });

  it('spaces stops a step apart, with a finale\'s room either side of it', () => {
    const rises = nodeRises(1, 30);
    for (let i = 1; i < rises.length; i++) {
      const level = i; // the span from level i up to i + 1
      const span = rises[i]! - rises[i - 1]!;
      expect(span).toBe(ROAD.step + roomAbove(level));
      if (isAreaFinale(level)) expect(span).toBe(ROAD.step + ROAD.finaleRoom.above);
      else if (isAreaFinale(level + 1)) expect(span).toBe(ROAD.step + ROAD.finaleRoom.below);
      else expect(span).toBe(ROAD.step);
    }
  });

  it('keeps every seam between the two stops it separates, and the strips tiling', () => {
    for (const f of FRAMES) {
      for (const [first, shown] of [[1, 23], [16, 48], [75, 48], [5, 1]] as const) {
        const hud = hudOf(f);
        const ys = nodeYs(first, shown, f.s, hud);
        const world = worldHeight(first, shown, f.s, hud);
        for (let i = 1; i < ys.length; i++) {
          const seam = seamBelow(ys[i]!, f.s);
          expect(seam).toBeGreaterThan(ys[i]!);
          expect(seam).toBeLessThan(ys[i - 1]!);
        }
        const strips = stripBounds(shown, 3, world, i => ys[i]!, ROAD.step * f.s);
        expect(strips[0]!.bottom).toBe(world);
        expect(strips.at(-1)!.top).toBe(0);
        for (let j = 1; j < strips.length; j++) expect(strips[j]!.bottom).toBeCloseTo(strips[j - 1]!.top, 6);
        for (const strip of strips) expect(strip.top).toBeLessThan(strip.bottom);
      }
    }
  });
});

describe('the crest', () => {
  it('stands above the last stop, under the header and the pucks, for any frontier', () => {
    for (const f of FRAMES) {
      const hud = hudOf(f);
      // 38's window ends on a finale (60), whose stage needs the room above it too.
      for (const unlocked of [1, 20, 38, 40, 95]) {
        const w = mapWindow(unlocked, unlocked);
        const ys = nodeYs(w.first, w.shown, f.s, hud);
        const last = ys.at(-1)!;
        const crest = crestY(f.s, hud);
        expect(last - crest, `unlocked ${unlocked}`).toBeGreaterThanOrEqual(CREST.clearance * f.s - 1e-9);
        // At the top of the map, world y is screen y: the crest is in view below the pucks.
        expect(crest - CREST.swell * f.s).toBeGreaterThan(f.top + ROAD.pucks * f.s);
        const lastLevel = w.first + w.shown - 1;
        if (isAreaFinale(lastLevel)) {
          const stage = finaleStageBounds(nodeX(lastLevel, f.width), last, f.s, LEFT, f.width);
          expect(stage.top - crest, `stage under the crest at ${unlocked}`).toBeGreaterThan(CREST.swell * f.s);
        }
        // The road runs on past the crest, so the horizon ends it rather than a cut.
        expect(beyondY(f.s, hud)).toBeLessThan(crest - CREST.swell * f.s);
        expect(beyondY(f.s, hud)).toBeGreaterThan(0);
      }
    }
  });

  it('puts the signpost beside the road, inside the frame, below the pucks', () => {
    for (const f of FRAMES) {
      const hud = hudOf(f);
      const crest = crestY(f.s, hud);
      // The wander's whole reach, and a little past it for the spline's overshoot.
      for (let u = -1.05; u <= 1.05; u += 0.05) {
        const roadX = f.width / 2 + u * f.width * 0.27;
        const sign = signpostAt(roadX, crest, LEFT, f.width, f.s);
        expect(sign.x).toBeGreaterThanOrEqual(LEFT);
        expect(sign.x + sign.width).toBeLessThanOrEqual(f.width);
        expect(sign.y).toBeGreaterThanOrEqual(f.top + ROAD.pucks * f.s);
        expect(sign.footY).toBeGreaterThan(crest + CREST.swell * f.s);
        // Clear of the road's own width, on whichever side it stands.
        const half = 32 * f.s;
        expect(sign.onLeft ? sign.x + sign.width <= roadX - half : sign.x >= roadX + half, `road at ${roadX}`).toBe(true);
      }
    }
  });
});

describe('an area finale\'s stop', () => {
  it('maps each state finaleMapMark gives to one look', () => {
    // Level 20 from below, at and past it.
    const at = (unlocked: number) => finaleStopLook(finaleMapMark(20, unlocked)!.state);
    expect(finaleMapMark(20, 7)!.state).toBe('preview');
    expect(at(7)).toEqual({ lit: false, padlock: true, ringAlpha: 0.5, puck: 'preview' });
    expect(finaleMapMark(20, 12)!.state).toBe('locked');
    expect(at(12)).toEqual({ lit: false, padlock: true, ringAlpha: 0.5, puck: 'locked' });
    expect(at(20)).toEqual({ lit: true, padlock: false, ringAlpha: 1, puck: 'frontier' });
    expect(at(21)).toEqual({ lit: true, padlock: false, ringAlpha: 1, puck: 'cleared' });
    expect(finaleMapMark(21, 40)).toBeNull();
  });

  it('crowns the puck with three seats, the middle one larger and highest, clear of the rings', () => {
    const seats = crownSeats(360, 1000, 1);
    expect(seats).toHaveLength(3);
    expect(seats[1]!.r).toBeGreaterThan(seats[0]!.r);
    expect(seats[1]!.y).toBeLessThan(seats[0]!.y);
    expect(seats[0]!.y).toBeCloseTo(seats[2]!.y, 6);
    expect(seats[0]!.x).toBeLessThan(seats[1]!.x);
    const ring = FINALE_STOP.puck + FINALE_STOP.rings[1]! + 4;
    for (const seat of seats) expect(Math.hypot(seat.x - 360, seat.y - 1000) - seat.r).toBeGreaterThan(ring);
    // Under the bunting's lowest pennant.
    const B = FINALE_STOP.bunting;
    expect(1000 - B.top + B.sag + B.length).toBeLessThan(seats[1]!.y - seats[1]!.r);
    expect(FINALE_STOP.puck / 46).toBeCloseTo(1.45, 1);
  });

  it('keeps its bunting inside the frame wherever the road puts it', () => {
    for (const f of FRAMES) {
      for (let level = 10; level <= 300; level += 10) {
        const x = nodeX(level, f.width);
        const posts = buntingPosts(x, 1000, f.s, LEFT, f.width);
        expect(posts.left).toBeGreaterThanOrEqual(LEFT + 20 * f.s);
        expect(posts.right).toBeLessThanOrEqual(f.width - 20 * f.s);
        expect(posts.right - posts.left).toBeGreaterThan(2 * FINALE_STOP.plaza * 0.9 * f.s);
        const plate = finalePlate(x, 1000, f.s);
        expect(plate.x).toBeGreaterThanOrEqual(LEFT);
        expect(plate.x + plate.width).toBeLessThanOrEqual(f.width);
        expect(x - FINALE_STOP.plaza * f.s).toBeGreaterThanOrEqual(LEFT);
        expect(x + FINALE_STOP.plaza * f.s).toBeLessThanOrEqual(f.width);
      }
    }
  });

  it('stands clear of the stop below it and of the gate above it, whatever the window', () => {
    for (const f of FRAMES) {
      const hud = hudOf(f);
      for (const unlocked of [8, 19, 20, 21, 55, 99, 140]) {
        const w = mapWindow(unlocked, unlocked);
        const ys = nodeYs(w.first, w.shown, f.s, hud);
        for (let i = 0; i < w.shown; i++) {
          const level = w.first + i;
          if (!isAreaFinale(level)) continue;
          const stage = finaleStageBounds(nodeX(level, f.width), ys[i]!, f.s, LEFT, f.width);
          // The frontier stop is the largest (1.1 of 46) and hops 10 above its seat.
          if (i > 0) expect(ys[i - 1]! - (46 * 1.1 + 10) * f.s, `below ${level}`).toBeGreaterThan(stage.bottom);
          if (i + 1 < w.shown) {
            // The next level opens an area, so its gate stands on the seam below it.
            const seam = seamBelow(ys[i + 1]!, f.s);
            const plateBottom = gatePlateTop(seam, f.s) + (GATE.plate.height + 6) * f.s;
            expect(plateBottom, `gate over ${level}`).toBeLessThan(stage.top);
          }
        }
      }
    }
  });
});

describe('a gate\'s plate', () => {
  it('hangs at its barrier, never under the header, while the camera is at the top', () => {
    for (const f of FRAMES) {
      const hud = hudOf(f);
      for (let unlocked = 1; unlocked <= 160; unlocked++) {
        for (const focus of [unlocked, Math.max(1, unlocked - 30)]) {
          const w = mapWindow(unlocked, focus);
          const ys = nodeYs(w.first, w.shown, f.s, hud);
          for (let i = 0; i < w.shown; i++) {
            const level = w.first + i;
            if (level === 1 || level !== firstLevelOfArea(Math.floor((level - 1) / PROGRESSION.areaSize))) continue;
            const top = gatePlateTop(seamBelow(ys[i]!, f.s), f.s);
            // Scroll 0: world y is screen y.
            expect(top, `gate at ${level}`).toBeGreaterThan(hud);
            expect(top).toBeGreaterThan(f.top + ROAD.pucks * f.s);
            expect(top).toBeGreaterThan(crestY(f.s, hud));
          }
        }
      }
    }
  });
});

describe('the road as a path', () => {
  it('finds x at any y on a climbing road, spacing even or not', () => {
    const ys = nodeYs(1, 24, 1, 144);
    const points = ys.map((y, i) => ({ x: nodeX(i + 1), y }));
    const road = smoothPath(points, 14);
    for (let k = 0; k < road.length; k += 7) expect(pathXAt(road, road[k]!.y)).toBeCloseTo(road[k]!.x, 6);
    expect(pathXAt(road, ys[0]! + 500)).toBe(road[0]!.x);
    expect(pathXAt(road, -10)).toBe(road.at(-1)!.x);
    const index = pathIndexAt(road, ys[10]!);
    expect(road[index]!.y).toBeLessThanOrEqual(ys[10]!);
    expect(road[index - 1]!.y).toBeGreaterThan(ys[10]!);
    // The spline stays monotonic in y across a finale's longer spans.
    for (let k = 1; k < road.length; k++) expect(road[k]!.y).toBeLessThan(road[k - 1]!.y);
  });
});

describe('what the map now writes and seats, on every area', () => {
  it('keeps the gate plate, the signpost and the finale plate legible', () => {
    // The gate plate is cream on every area, Dusk included: ink count, muted goal.
    for (const plate of [SHELL.cream, SHELL.puck]) {
      expect(contrastRatio(PALETTE.ink, plate)).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(PALETTE.muted, plate)).toBeGreaterThanOrEqual(4.5);
      expect(Math.max(contrastRatio(STAR_PRIZE, plate), contrastRatio(0x6b5424, plate))).toBeGreaterThanOrEqual(3);
    }
    // The signpost and the lit finale plate are the timber the header is: cream with its outline.
    const stroke = typeStroke(SHELL.cream)!;
    expect(contrastRatio(stroke, SHELL.wood)).toBeGreaterThan(4.5);
  });

  it('rings an empty crown seat so it reads on every area\'s road', () => {
    for (const area of AREAS) {
      expect(contrastRatio(crownHollow(area.road), area.road), area.name).toBeGreaterThanOrEqual(3);
    }
  });
});
