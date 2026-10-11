import { describe, expect, it } from 'vitest';
import { RHYTHM } from '../src/config/rhythm';
import { resultDue, suspendedTooLong } from '../src/game/RoundController';
import { FLOOR_STEP, floorSpan } from '../src/vignettes/floorSpan';
import { REVIEW_WAIT } from '../src/review/appReview';

/**
 * The end of a level must never wait on something that may not come. Reported on an Android
 * tablet as "it freezes when a level ends"; see docs/TABLETS.md.
 */
describe('the end of a level', () => {
  it('opens the result when the heard clock reaches the coda end, as it always did', () => {
    expect(resultDue(10, 10, 0, 5000)).toBe(true);
    expect(resultDue(9.99, 10, 0, 5000)).toBe(false);
  });

  it('opens it from the wall clock when the heard clock stops short', () => {
    // A finished, saved level whose audio clock has stopped at 9 s.
    expect(resultDue(9, 10, 5000 + RHYTHM.resultGraceMs - 1, 5000)).toBe(false);
    expect(resultDue(9, 10, 5000 + RHYTHM.resultGraceMs, 5000)).toBe(true);
    // No coda has started: nothing is due, however long the wall clock runs.
    expect(resultDue(9, Infinity, 1e9, Infinity)).toBe(false);
  });

  it('waits out a rebuffer, and pauses on a suspension that would never end', () => {
    expect(suspendedTooLong(null, 1e9)).toBe(false);
    expect(suspendedTooLong(1000, 1000 + RHYTHM.suspendedPauseMs - 1)).toBe(false);
    expect(suspendedTooLong(1000, 1000 + RHYTHM.suspendedPauseMs)).toBe(true);
    // Longer than a dropped frame or two, shorter than anything a player would read as a freeze.
    expect(RHYTHM.suspendedPauseMs).toBeGreaterThan(250);
    expect(RHYTHM.suspendedPauseMs).toBeLessThanOrEqual(1000);
  });

  it('never holds Continue on Play for long enough to look frozen', () => {
    expect(REVIEW_WAIT.prepareMs + REVIEW_WAIT.launchMs).toBeLessThanOrEqual(5000);
  });
});

describe('an open-table act\'s floor', () => {
  const phone = { left: 0, right: 720, bottom: 1559 };
  const tablet = { left: 0, right: 2048, bottom: 1280 };

  it('covers the frame and one frame either side, for the between-task slide', () => {
    for (const [frame, x, y, scale] of [[phone, 25, 1060, 1.1], [tablet, 674, 870, 1.28], [phone, 10, 1000, 0.4]] as const) {
      const span = floorSpan(frame, x, y, scale);
      const width = (frame.right - frame.left) / scale;
      expect(span.x).toBeLessThanOrEqual((frame.left - x) / scale - width);
      expect(span.x + span.width).toBeGreaterThanOrEqual((frame.right - x) / scale + width);
      expect(span.height).toBeGreaterThanOrEqual((frame.bottom - y) / scale);
      expect(Math.abs(span.x % FLOOR_STEP)).toBe(0);
      expect(span.width % FLOOR_STEP).toBe(0);
      expect(span.height % FLOOR_STEP).toBe(0);
    }
  });

  it('is a fraction of the fixed 5700 x 2500 the bench used to be', () => {
    const span = floorSpan(phone, 25, 1060, 1.1);
    expect(span.width * span.height).toBeLessThan((5700 * 2500) / 8);
  });

  it('does not move while a URL bar collapses a few units at a time', () => {
    const a = floorSpan({ left: 0, right: 720, bottom: 1500 }, 25, 1020, 1.1);
    const b = floorSpan({ left: 0, right: 720, bottom: 1506 }, 25, 1024, 1.1);
    expect(b).toEqual(a);
  });

  it('survives a degenerate scale rather than producing NaN', () => {
    const span = floorSpan(phone, 0, 0, 0);
    expect(Number.isFinite(span.x) && Number.isFinite(span.width) && Number.isFinite(span.height)).toBe(true);
  });
});
