import { describe, expect, it } from 'vitest';
import { RHYTHM } from '../src/config/rhythm';
import { scoreRound } from '../src/game/scoring';
import { addRound, EMPTY_TIMING, median, TIMING, TIMING_ADVICE, timingReport, type TimingTally } from '../src/game/timingReport';
import { createJudge, expireTargets, judgeTap } from '../src/rhythm/judge';
import { PLATE, TIMING_TRAY } from '../src/ui/resultLayout';

/** A tally from signed errors alone, graded the way the judge grades them. */
function taps(deltasMs: readonly number[], over: Partial<TimingTally> = {}): TimingTally {
  const perfect = deltasMs.filter(d => Math.abs(d) <= RHYTHM.perfectMs).length;
  return { perfect, good: deltasMs.length - perfect, missed: 0, extras: 0, deltasMs, ...over };
}

describe('the scorer keeps the signed errors', () => {
  it('in target order, negative early and positive late, without extras or misses', () => {
    const state = createJudge([1, 2, 3, 4]);
    judgeTap(state, 2.04); // late on the second
    judgeTap(state, 0.97); // early on the first
    judgeTap(state, 1.5); // an extra, nearest to nothing within the window
    expireTargets(state, 10); // the third and fourth go by
    const result = scoreRound(state);
    expect(result.deltasMs).toHaveLength(2);
    expect(result.deltasMs[0]).toBeCloseTo(-30);
    expect(result.deltasMs[1]).toBeCloseTo(40);
    expect(result).toMatchObject({ perfect: 2, good: 0, missed: 2, extras: 1 });
    // The absolute mean is still what analytics reads, unchanged.
    expect(result.meanAbsoluteErrorMs).toBeCloseTo(35);
    expect(scoreRound(createJudge([1])).deltasMs).toEqual([]);
  });

  it('sums a level’s scored tasks, task by task', () => {
    const one = { perfect: 2, good: 1, missed: 1, extras: 0, deltasMs: [-10, 5, 80] };
    const two = { perfect: 1, good: 0, missed: 0, extras: 2, deltasMs: [-20, Number.NaN] };
    expect(addRound(addRound(EMPTY_TIMING, one), two)).toEqual({ perfect: 3, good: 1, missed: 1, extras: 2, deltasMs: [-10, 5, 80, -20] });
    expect(EMPTY_TIMING.deltasMs).toEqual([]);
  });
});

describe('what the details say', () => {
  it('has nothing to report for a level that judged no beat, such as a preview', () => {
    expect(timingReport(EMPTY_TIMING)).toBeNull();
  });

  it('counts the grades the way the user reads them, with extras only when there were any', () => {
    expect(timingReport({ perfect: 24, good: 5, missed: 1, extras: 0, deltasMs: [-30, -34, -36, -40] })?.counts).toBe('24 Perfect · 5 Good · 1 Miss');
    expect(timingReport({ perfect: 3, good: 0, missed: 0, extras: 2, deltasMs: [0, 1, 2] })?.counts).toBe('3 Perfect · 0 Good · 0 Miss · 2 Extra');
  });

  it('turns a steady early lean into a number and a cure', () => {
    const slight = timingReport(taps([-30, -34, -36, -40, -28, -33]))!;
    expect(slight.tendency).toBe('early');
    // The median here is -33.5: an early half rounds to 34, exactly as a late one would.
    expect(slight.offsetMs).toBe(-34);
    expect(slight.lean).toBe('You tended to tap 34 ms early');
    expect(slight.advice).toBe('Slightly early — sit behind the beat.');
    const plain = timingReport(taps([-50, -55, -48, -60, -52]))!;
    expect(plain.lean).toBe('You tended to tap 52 ms early');
    expect(plain.advice).toBe('Early — let the beat arrive, then tap.');
  });

  it('reads an early lean and a late one of the same size as the same number', () => {
    const early = timingReport(taps([-30, -34, -36, -40, -28, -33]))!;
    const late = timingReport(taps([30, 34, 36, 40, 28, 33]))!;
    expect(early.offsetMs).toBe(-(late.offsetMs!));
    expect(early.lean.replace('early', '')).toBe(late.lean.replace('late', ''));
  });

  it('and a late one the other way', () => {
    expect(timingReport(taps([20, 22, 25, 18, 21]))).toMatchObject({ tendency: 'late', lean: 'You tended to tap 21 ms late', advice: 'Slightly late — lean into the beat.' });
    expect(timingReport(taps([45, 50, 40, 48, 44]))!.advice).toBe('Late — tap as the beat lands.');
  });

  it('reads the tap the player makes most, so one flubbed tap cannot flip the lean', () => {
    const deltas = [-22, -20, -25, -18, -21, -24, -19, 125];
    const report = timingReport(taps(deltas))!;
    // The mean of these is about -1: "centred". The median is the habit.
    expect(deltas.reduce((a, b) => a + b, 0) / deltas.length).toBeGreaterThan(-TIMING.centredMs);
    expect(report.tendency).toBe('early');
    expect(report.offsetMs).toBe(-21);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it('praises taps that are centred and steady', () => {
    expect(timingReport(taps([-5, 3, 0, 6, -4, 2]))).toMatchObject({
      tendency: 'centred', lean: 'Your taps were centred on the beat', advice: 'Right on the beat — keep it there.',
    });
  });

  it('calls scattered taps uneven, rather than sending the player chasing a lean that is only noise', () => {
    // Centred on average, but all over the place.
    expect(timingReport(taps([-80, 70, -60, 90, -75, 65, 0]))).toMatchObject({ tendency: 'uneven', advice: 'Uneven — keep one steady pulse going.' });
    // A slight lean inside a wide scatter is still unevenness first.
    const report = timingReport(taps([-100, 60, -90, 70, -20, -85, 80, -15]))!;
    expect(Math.abs(report.offsetMs!)).toBeLessThan(TIMING.clearMs);
    expect(report.spreadMs!).toBeGreaterThan(TIMING.unevenMs);
    expect(report.tendency).toBe('uneven');
    // But a clear lean with some scatter is a lean.
    expect(timingReport(taps([-40, -90, -45, -100, -50, -42, -95, -48]))!.tendency).toBe('early');
  });

  it('points a large, steady lean at the Tap offset, since that is the device more than the player', () => {
    const steady = Array.from({ length: 10 }, (_, i) => -70 + (i % 3) * 4);
    expect(timingReport(taps(steady))!.advice).toBe('Always early? Check your Tap offset.');
    expect(timingReport(taps(steady.map(d => -d)))!.advice).toBe('Always late? Check your Tap offset.');
    // Too few hits to be sure, or too scattered to be lag: the ordinary advice.
    expect(timingReport(taps(steady.slice(0, 5)))!.advice).toBe('Early — let the beat arrive, then tap.');
    const loose = [-70, -20, -120, -65, -110, -30, -75, -125, -68, -15];
    expect(timingReport(taps(loose))!.advice).not.toMatch(/Tap offset/);
  });

  it('says first that most beats went by, when they did', () => {
    const report = timingReport(taps([-30, -32, -31, -29], { missed: 6 }))!;
    expect(report.lean).toBe('You tended to tap 31 ms early');
    expect(report.advice).toBe('Most beats went by — start right on Go!');
  });

  it('names a burst of extra taps as the thing costing points', () => {
    expect(timingReport(taps([-5, 2, 0, 4, -3, 1, 2, -2], { extras: 4 }))!.advice).toBe('One tap per beat — extras cost points.');
    expect(timingReport(taps([-5, 2, 0, 4, -3, 1, 2, -2], { extras: 1 }))!.advice).toBe('Right on the beat — keep it there.');
  });

  it('does not invent a lean from too few taps, or from none', () => {
    expect(timingReport({ perfect: 0, good: 0, missed: 8, extras: 0, deltasMs: [] })).toMatchObject({
      tendency: 'none', lean: 'No taps landed on a beat', advice: 'Listen for the count, then tap on Go!', offsetMs: null, spreadMs: null,
    });
    expect(timingReport(taps([-40, -42], { missed: 6 }))).toMatchObject({
      tendency: 'sparse', lean: 'Only 2 taps landed on a beat', advice: 'Most beats went by — start right on Go!', offsetMs: null,
    });
    expect(timingReport(taps([12], { missed: 0 }))!.lean).toBe('Only 1 tap landed on a beat');
  });

  it('places each hit on the bar as a share of the Good window, and the Perfect band the same way', () => {
    const report = timingReport(taps([-130, -65, 0, 65, 130, 200]))!;
    expect(report.marks).toEqual([-1, -0.5, 0, 0.5, 1, 1]);
    expect(report.perfectBand).toBeCloseTo(RHYTHM.perfectMs / RHYTHM.goodMs);
  });

  it('is identical whatever order the hits arrived in', () => {
    const deltas = [-30, 12, -45, -28, -33, 60, -31];
    const a = timingReport(taps(deltas))!;
    const b = timingReport(taps([...deltas].reverse()))!;
    expect({ ...a, marks: [] }).toEqual({ ...b, marks: [] });
  });
});

describe('the details fit the tray', () => {
  it('keeps every sentence to one line at the tray’s width', () => {
    // Measured on screen, Nunito at the advice size runs about 0.45 of its size per
    // character, and 44 characters already wrapped with one word left over. Half the size
    // per character keeps every line whole; two lines still fit, but an orphaned last
    // word reads as a mistake.
    const room = PLATE.width - 2 * PLATE.tray.inset - 2 * TIMING_TRAY.pad;
    const perLine = Math.floor(room / (TIMING_TRAY.adviceSize * 0.5));
    for (const advice of TIMING_ADVICE) expect(advice.length, advice).toBeLessThanOrEqual(perLine);
    // The longest lean the report can produce stays on one line.
    expect('You tended to tap 130 ms early'.length).toBeLessThanOrEqual(Math.floor(room / (TIMING_TRAY.leanSize * 0.56)));
  });

  it('stacks inside the tray, top to bottom, with the bar clear of its labels', () => {
    const lineHeight = TIMING_TRAY.adviceSize * 1.3;
    expect(TIMING_TRAY.countsY - TIMING_TRAY.countsSize / 2).toBeGreaterThan(0);
    expect(TIMING_TRAY.barY - TIMING_TRAY.bandHeight / 2 - 18).toBeGreaterThan(TIMING_TRAY.countsY + TIMING_TRAY.countsSize / 2);
    expect(TIMING_TRAY.leanY - TIMING_TRAY.leanSize / 2).toBeGreaterThan(TIMING_TRAY.barY + TIMING_TRAY.bandHeight / 2);
    expect(TIMING_TRAY.adviceY).toBeGreaterThan(TIMING_TRAY.leanY + TIMING_TRAY.leanSize / 2);
    expect(TIMING_TRAY.adviceY + 2 * lineHeight).toBeLessThanOrEqual(PLATE.tray.height);
    // "EARLY" and "LATE" sit in the inset the bar leaves at each end.
    expect(TIMING_TRAY.barInset - TIMING_TRAY.pad).toBeGreaterThanOrEqual('EARLY'.length * TIMING_TRAY.labelSize * 0.62);
  });
});
