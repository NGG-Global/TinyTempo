import { describe, expect, it, vi } from 'vitest';
import { LAYOUT } from '../src/config/design';
import { CHROME } from '../src/ui/chrome';
import { DAILY_CARD, planDailyCard } from '../src/ui/dailyCard';
import { DAILY_PLAQUE, planDailyPlaque } from '../src/ui/dailyPlaque';
import { PLATE } from '../src/ui/resultLayout';

vi.mock('phaser', () => ({ default: { Geom: { Rectangle: class {} } } }));

/** The logical frames the scaling model gives three devices, with `s` as every scene derives it. */
const FRAMES = {
  tall: { safe: { x: 0, y: 0, width: 720, height: 1559 } },
  short: { safe: { x: 0, y: 0, width: 720, height: 1281 } },
  tablet: { safe: { x: 0, y: 0, width: 960, height: 1280 } },
} as const;
const sOf = (safe: { width: number; height: number }) => Math.min(safe.width / 720, safe.height / 1150);
const control = (s: number) => Math.max(88 * s, 48);
const inside = (r: { x: number; y: number; width: number; height: number }, f: { x: number; y: number; width: number; height: number }) => {
  expect(r.x).toBeGreaterThanOrEqual(f.x - 1e-6);
  expect(r.y).toBeGreaterThanOrEqual(f.y - 1e-6);
  expect(r.x + r.width).toBeLessThanOrEqual(f.x + f.width + 1e-6);
  expect(r.y + r.height).toBeLessThanOrEqual(f.y + f.height + 1e-6);
};
const bottom = (r: { y: number; height: number }) => r.y + r.height;

describe('the Daily Tempo card', () => {
  it('stacks the tile, the ladder and the last row above Play on every frame, and never below its floor', () => {
    for (const [name, { safe }] of Object.entries(FRAMES)) {
      const s = sOf(safe);
      for (const shelfRow of [false, true]) {
        const plan = planDailyCard({ s, safe, controlSize: control(s), shelfRow });
        expect(plan.k, name).toBeGreaterThanOrEqual(DAILY_CARD.minScale);
        expect(plan.k).toBeLessThanOrEqual(1);
        // Play sits where every screen's block sits, and the footnote under it.
        expect(bottom(plan.play)).toBeCloseTo(safe.y + safe.height - CHROME.block.fromBottom * s);
        expect(plan.play.height).toBeGreaterThanOrEqual(LAYOUT.minTouchTarget * s);
        expect(plan.footnoteY).toBeGreaterThan(bottom(plan.play));
        // Top to bottom, inside the frame, nothing over Play.
        const last = shelfRow ? plan.shelf! : plan.explainer!;
        expect(shelfRow ? plan.explainer : plan.shelf).toBeNull();
        for (const r of [plan.tile, plan.art, plan.ladder, plan.ladderHead, ...plan.ladderRows, last, plan.play]) inside(r, safe);
        expect(plan.art.y).toBeGreaterThanOrEqual(plan.tile.y);
        expect(bottom(plan.art)).toBeLessThan(bottom(plan.tile));
        expect(plan.ladder.y).toBeGreaterThanOrEqual(bottom(plan.tile));
        expect(plan.ladderRows[0]!.y).toBeGreaterThanOrEqual(bottom(plan.ladderHead));
        expect(plan.ladderRows[1]!.y).toBeGreaterThanOrEqual(bottom(plan.ladderRows[0]!));
        expect(plan.ladderRows[2]!.y).toBeGreaterThanOrEqual(bottom(plan.ladderRows[1]!));
        expect(bottom(plan.ladderRows[2]!)).toBeLessThanOrEqual(bottom(plan.ladder));
        expect(last.y).toBeGreaterThanOrEqual(bottom(plan.ladder));
        expect(bottom(last)).toBeLessThanOrEqual(plan.play.y - DAILY_CARD.playGap * s + 1e-6);
        // Every ladder row is a readable row: the touch floor at the stack's scale.
        for (const row of plan.ladderRows) expect(row.height).toBeGreaterThanOrEqual(DAILY_CARD.ladder.row * s * DAILY_CARD.minScale);
      }
    }
  });

  it('gives up its gaps and its picture before it scales the ladder down', () => {
    const tall = planDailyCard({ s: 1, safe: FRAMES.tall.safe, controlSize: 88, shelfRow: false });
    expect(tall.k).toBe(1);
    expect(tall.art.height).toBeCloseTo(DAILY_CARD.tile.art - DAILY_CARD.tile.pad);
    const short = planDailyCard({ s: 1, safe: FRAMES.short.safe, controlSize: 88, shelfRow: false });
    // A 16:9 handset closes the gaps and shrinks the picture, and the ladder keeps its size.
    expect(short.art.height).toBeLessThan(tall.art.height);
    expect(short.ladderRows[0]!.height).toBeCloseTo(DAILY_CARD.ladder.row * short.k);
    expect(short.k).toBeGreaterThanOrEqual(DAILY_CARD.minScale);
  });
});

describe('the Daily Tempo result', () => {
  it('hangs the plaque, the ladder and the toast above Continue, scaled together and never below the plaque’s floor', () => {
    for (const [name, { safe }] of Object.entries(FRAMES)) {
      const s = sOf(safe);
      for (const toast of [false, true]) {
        const plan = planDailyPlaque({ s, safe, controlSize: control(s), toast, interrupted: false });
        expect(plan.k, name).toBeGreaterThanOrEqual(PLATE.minScale);
        expect(plan.k).toBeLessThanOrEqual(1);
        expect(plan.plaque).not.toBeNull();
        expect(plan.rope).toBeCloseTo(plan.plaque!.y - safe.y);
        expect(plan.plaque!.width).toBeLessThanOrEqual(PLATE.width * s * plan.k + 1e-6);
        expect(plan.plaque!.height).toBeCloseTo(PLATE.height * s * plan.k);
        expect(plan.ladder!.y).toBeGreaterThanOrEqual(bottom(plan.plaque!));
        expect(plan.ladderRows).toHaveLength(3);
        for (let i = 1; i < 3; i++) expect(plan.ladderRows[i]!.y).toBeGreaterThanOrEqual(bottom(plan.ladderRows[i - 1]!));
        if (toast) {
          expect(plan.toast!.y).toBeGreaterThanOrEqual(bottom(plan.ladder!));
          expect(bottom(plan.toast!)).toBeLessThanOrEqual(plan.action.y + 1e-6);
        } else {
          expect(plan.toast).toBeNull();
          expect(bottom(plan.ladder!)).toBeLessThanOrEqual(plan.action.y + 1e-6);
        }
        for (const r of [plan.plaque!, plan.ladder!, ...plan.ladderRows, plan.action, ...(plan.toast ? [plan.toast] : [])]) inside(r, safe);
        expect(plan.action.height).toBeGreaterThanOrEqual(LAYOUT.minTouchTarget * s);
        expect(plan.exit).toBeNull();
        expect(plan.noteY).toBeNull();
        // The pill and the headline keep the scene's scale: only the stack shrinks.
        expect(plan.pillY).toBeCloseTo(safe.y + DAILY_PLAQUE.pillY * s);
        expect(plan.headlineY).toBeCloseTo(safe.y + DAILY_PLAQUE.headlineY * s);
      }
    }
    // A tall handset shows everything at full size with Continue where every block sits.
    const tall = planDailyPlaque({ s: 1, safe: FRAMES.tall.safe, controlSize: 88, toast: true, interrupted: false });
    expect(bottom(tall.action)).toBeCloseTo(FRAMES.tall.safe.height - CHROME.block.fromBottom);
  });

  it('shows an interrupted run as words and two blocks, no plaque', () => {
    const plan = planDailyPlaque({ s: 1, safe: FRAMES.short.safe, controlSize: 88, toast: true, interrupted: true });
    expect(plan.plaque).toBeNull();
    expect(plan.ladder).toBeNull();
    expect(plan.toast).toBeNull();
    expect(plan.noteY).not.toBeNull();
    expect(plan.exit).not.toBeNull();
    expect(plan.action.x + plan.action.width).toBeLessThanOrEqual(plan.exit!.x);
    expect(plan.action.y).toBe(plan.exit!.y);
    inside(plan.action, FRAMES.short.safe);
    inside(plan.exit!, FRAMES.short.safe);
  });
});
