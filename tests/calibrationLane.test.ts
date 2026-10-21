import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { CALIBRATION } from '../src/game/CalibrationRun';
import { CALIBRATION_TAPS } from '../src/game/settings';
import { edgeFlash, LANE, tickAt, tickFresh } from '../src/ui/calibrationLane';

import { formatOffset, resultCopy } from '../src/game/calibrationCopy';

vi.mock('phaser', () => ({ default: { Geom: { Rectangle: class {} } } }));

describe('the calibration lane', () => {
  it('spans the run\'s acceptance window, so every landed tap has a place on it', () => {
    expect(LANE.halfMs).toBe(CALIBRATION.acceptanceRatio * 60_000 / CALIBRATION.bpm);
    expect(tickAt(0)).toBe(0);
    expect(tickAt(-200)).toBe(-0.5);
    expect(tickAt(LANE.halfMs)).toBe(1);
    expect(tickAt(-9_999)).toBe(-1);
    expect(tickAt(NaN)).toBe(0);
  });

  it('settles a new tick and fades a flash, and never goes negative', () => {
    expect(tickFresh(0)).toBe(1);
    expect(tickFresh(LANE.settleSec / 2)).toBeCloseTo(0.5);
    expect(tickFresh(10)).toBe(0);
    expect(edgeFlash(0)).toBe(1);
    expect(edgeFlash(LANE.flashSec)).toBe(0);
    expect(edgeFlash(-1)).toBe(0);
  });

  it('is drawn in every phase, from the scene\'s own update', () => {
    const scene = readFileSync('src/scenes/CalibrateScene.ts', 'utf8');
    expect(scene).toContain('this.drawLane(now);');
    // A tap that fell past the window lights its edge; a repeat or a count-in tap does nothing.
    expect(scene).toContain("if (outcome === 'early' || outcome === 'late') {");
    expect(scene).toContain("if (outcome !== 'landed') return;");
  });
});

describe('the result\'s words', () => {
  it('say the spread and what the offset was, name each failure, and say spot on for a good check', () => {
    expect(resultCopy(null, null, false)).toEqual({ note: 'After eight taps', value: '' });
    expect(resultCopy({ kind: 'few', landed: 5 }, null, false)).toEqual({ note: `Only 5 of ${CALIBRATION_TAPS} taps landed`, value: 'Tap on every beat' });
    expect(resultCopy({ kind: 'uneven', spreadMs: 61.4 }, null, false)).toEqual({ note: 'Taps uneven · ±61 ms', value: 'Try a steadier beat' });
    const measured = { kind: 'measured', offsetMs: 142, residualMs: 22, spreadMs: 8.6 } as const;
    expect(resultCopy(measured, 120, false)).toEqual({ note: 'Taps within ±9 ms · was +120 ms', value: '+142 ms' });
    expect(resultCopy(measured, null, false)).toEqual({ note: 'Taps within ±9 ms · was not set', value: '+142 ms' });
    // A check run against a kept offset: within spotOnMs is spot on, past it is a new number.
    const spotOn = { ...measured, residualMs: CALIBRATION.spotOnMs };
    expect(resultCopy(spotOn, 142, true).note).toBe('Spot on · Taps within ±9 ms');
    expect(resultCopy({ ...measured, residualMs: CALIBRATION.spotOnMs + 1 }, 142, true).note).toBe('Taps within ±9 ms · was +142 ms');
    expect(resultCopy(spotOn, 142, false).note).toBe('Taps within ±9 ms · was +142 ms');
    expect(formatOffset(-30)).toBe('−30 ms');
  });

  it('keeps the player on the screen after Keep, with the next run a check', () => {
    const scene = readFileSync('src/scenes/CalibrateScene.ts', 'utf8');
    const keep = scene.slice(scene.indexOf('  private keep(): void {'), scene.indexOf('  private retry(): void {'));
    expect(keep).not.toContain('this.leave()');
    expect(keep).toContain('this.kept = this.measuredMs;');
    expect(scene).toContain("this.checking = this.kept !== null;");
    expect(scene).toContain("this.kept !== null ? 'Check' : 'Start'");
  });
});
