import { describe, expect, it, vi } from 'vitest';
import { ENDLESS_PLAQUE, planEndlessPlaque, type PlaqueFrame, type PlaqueRows } from '../src/ui/endlessPlaque';

vi.mock('phaser', () => ({ default: { Geom: { Rectangle: class {} } } }));
const { cardStack } = await import('../src/ui/endlessCard');

/** Handsets and a tablet, as `s` and the safe frame the scene would hand in. */
const SCREENS = [
  { name: '20:9 phone', s: 1, safe: { x: 0, y: 0, width: 720, height: 1559 } },
  { name: '16:9 phone', s: 1, safe: { x: 0, y: 0, width: 720, height: 1281 } },
  { name: '4:3 tablet', s: 1280 / 1150, safe: { x: 0, y: 0, width: 960, height: 1280 } },
];

const FULL: PlaqueRows = { eyebrow: 24, title: 54, time: 100, stats: 30, best: 28, note: 56 };
const INTERRUPTED_NO_CLOCK: PlaqueRows = { eyebrow: 24, title: 54, time: 0, stats: 30, best: 0, note: 28 };

const bottom = (f: PlaqueFrame) => f.y + f.height;
const inside = (inner: PlaqueFrame, outer: PlaqueFrame) =>
  inner.x >= outer.x - 0.001 && inner.y >= outer.y - 0.001 && inner.x + inner.width <= outer.x + outer.width + 0.001 && bottom(inner) <= bottom(outer) + 0.001;

describe('the Endless result plaque', () => {
  for (const screen of SCREENS) {
    for (const board of [false, true]) {
      for (const [label, rows] of [['a full run', FULL], ['a run whose clock never started', INTERRUPTED_NO_CLOCK]] as const) {
        it(`stacks ${label} without overlap on a ${screen.name}${board ? ' with the leaderboard' : ''}`, () => {
          const plan = planEndlessPlaque({ s: screen.s, safe: screen.safe, rows, board, controlSize: 88 * screen.s });
          // Rows in order, each below the last one's bottom edge.
          let last = plan.frame.y;
          for (const key of ['eyebrow', 'title', 'time', 'stats', 'best', 'note'] as const) {
            const top = plan.tops[key];
            if (rows[key] === 0) { expect(top).toBeNull(); continue; }
            expect(top).not.toBeNull();
            expect(top!).toBeGreaterThanOrEqual(last);
            last = top! + rows[key];
          }
          // Then the leaderboard, then the two blocks, all inside the plaque, and the plaque on screen.
          const controls = plan.board ? [plan.board, plan.again] : [plan.again];
          for (const control of controls) { expect(control.y).toBeGreaterThan(last); last = bottom(control); }
          expect(plan.exit.y).toBe(plan.again.y);
          expect(plan.exit.x).toBeGreaterThan(plan.again.x + plan.again.width);
          for (const control of [...controls, plan.exit]) expect(inside(control, plan.frame)).toBe(true);
          expect(inside(plan.frame, screen.safe)).toBe(true);
          expect(plan.board !== null).toBe(board);
        });
      }
    }
  }

  it('is as tall as its rows, with no band left over', () => {
    const s = 1, safe = SCREENS[0]!.safe;
    const plan = planEndlessPlaque({ s, safe, rows: FULL, board: false, controlSize: 88 });
    const noteBottom = plan.tops.note! + FULL.note;
    expect(plan.again.y - noteBottom).toBeCloseTo(ENDLESS_PLAQUE.gap.controls * s);
    expect(bottom(plan.frame) - bottom(plan.again)).toBeCloseTo(ENDLESS_PLAQUE.padBottom * s);
    // A row with nothing to say takes no room: the plaque shrinks by it and its gap.
    const shorter = planEndlessPlaque({ s, safe, rows: { ...FULL, best: 0 }, board: false, controlSize: 88 });
    expect(plan.frame.height - shorter.frame.height).toBeCloseTo(FULL.best + ENDLESS_PLAQUE.gap.best * s);
  });

  it('keeps its buttons on screen when the rows outgrow the frame', () => {
    const safe = { x: 0, y: 0, width: 720, height: 600 };
    const plan = planEndlessPlaque({ s: 1, safe, rows: { ...FULL, note: 400 }, board: true, controlSize: 88 });
    expect(bottom(plan.again)).toBeLessThanOrEqual(bottom(safe));
  });

  it('holds the touch floor on its blocks', () => {
    const plan = planEndlessPlaque({ s: 0.5, safe: SCREENS[0]!.safe, rows: FULL, board: true, controlSize: 88 });
    expect(plan.again.height).toBeGreaterThanOrEqual(88);
    expect(plan.exit.height).toBeGreaterThanOrEqual(88);
  });
});

describe('the Endless card', () => {
  it('never lays Close over the leaderboard chip, and leaves no band where an absent chip would be', () => {
    const offered = cardStack(true, true);
    expect(offered.board).not.toBeNull();
    expect(offered.close).toBeGreaterThanOrEqual(offered.board! + 76);
    const absent = cardStack(true, false);
    expect(absent.board).toBeNull();
    expect(absent.height).toBeLessThan(offered.height);
    expect(offered.height - absent.height).toBe(offered.close - absent.close);
    const locked = cardStack(false, true);
    expect(locked.board).toBeNull();
    expect(locked.close + 78).toBeLessThanOrEqual(locked.height);
  });
});
