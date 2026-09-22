import { describe, expect, it, vi } from 'vitest';
import { AudioClock, mapTimestamp, normalizeTimestamp, reportedOutputLag, stampUsable, tapVoiceLate } from '../src/audio/AudioClock';
import { RHYTHM } from '../src/config/rhythm';
import { createJudge, expireTargets, judgeTap } from '../src/rhythm/judge';

it('normalizes modern/legacy timestamps and falls back for invalid ones', () => {
  const origin = 1_700_000_000_000;
  expect(normalizeTimestamp(980, 1000, origin)).toBe(980);
  expect(normalizeTimestamp(origin + 980, 1000, origin)).toBe(980);
  expect(normalizeTimestamp(NaN, 1000, origin)).toBe(1000);
  expect(normalizeTimestamp(0, 1000, origin)).toBe(1000);
  expect(normalizeTimestamp(2000, 1000, origin)).toBe(1000);
  // A Bluetooth-sized offset is a different clock, not a late handler.
  expect(normalizeTimestamp(700, 1000, origin)).toBe(1000);
});
it('maps original input to the audio output domain without adding handler delay', () => {
  expect(mapTimestamp(950, 1000, 2)).toBeCloseTo(1.95);
  expect(mapTimestamp(1050, 1000, 2)).toBeCloseTo(2.05);
});

describe('Bluetooth output stamps', () => {
  it('accepts a pair that is late, or slightly in the future, up to a second', () => {
    expect(stampUsable({ contextTime: 8, performanceTime: 600 }, 1000, 10)).toBe(true);
    expect(stampUsable({ contextTime: 9.9, performanceTime: 1100 }, 1000, 10)).toBe(true);
    expect(stampUsable({ contextTime: 8, performanceTime: 1000 - 400 }, 1000, 10)).toBe(true);
    // Older than a Bluetooth buffer, or impossibly ahead of the render clock.
    expect(stampUsable({ contextTime: 8, performanceTime: 1000 - 1200 }, 1000, 10)).toBe(false);
    expect(stampUsable({ contextTime: 11, performanceTime: 1000 }, 1000, 10)).toBe(false);
    expect(stampUsable({ contextTime: 0, performanceTime: 1000 }, 1000, 10)).toBe(false);
    expect(stampUsable(undefined, 1000, 10)).toBe(false);
  });

  const clockAt = (
    currentTime: number,
    nowMs: number,
    stamp?: { contextTime: number; performanceTime: number },
  ): AudioClock => {
    const context = {
      currentTime,
      getOutputTimestamp: stamp ? () => stamp : undefined,
    } as unknown as AudioContext;
    vi.spyOn(performance, 'now').mockReturnValue(nowMs);
    const clock = new AudioClock(context);
    clock.refresh();
    return clock;
  };

  it('keeps the audible timeline after a stale stamp instead of jumping to currentTime', () => {
    try {
      const delayMs = 300;
      const start = 10;
      const audible = start - delayMs / 1000;
      let currentTime = start;
      let stamp: { contextTime: number; performanceTime: number } | null = {
        contextTime: audible, performanceTime: 1000,
      };
      const context = {
        get currentTime() { return currentTime; },
        getOutputTimestamp: () => stamp ?? { contextTime: 0, performanceTime: 0 },
      } as unknown as AudioContext;
      vi.spyOn(performance, 'now').mockReturnValue(1000);
      const clock = new AudioClock(context);
      clock.refresh();
      expect(clock.mode).toBe('output');
      expect(clock.now()).toBeCloseTo(audible, 6);
      stamp = null;
      currentTime = start + 0.02;
      vi.spyOn(performance, 'now').mockReturnValue(1020);
      clock.refresh();
      expect(clock.mode).toBe('output');
      expect(clock.now()).toBeCloseTo(audible + 0.02, 5);
    } finally { vi.restoreAllMocks(); }
  });

  it('does not expire a target before the player can hear it on a delayed route', () => {
    try {
      const target = 5;
      const delayMs = 300;
      const currentTime = target + delayMs / 1000;
      const clock = clockAt(currentTime, 1000, {
        contextTime: target, performanceTime: 1000,
      });
      const judge = createJudge([target]);
      expect(expireTargets(judge, clock.now())).toEqual([]);
      const hit = judgeTap(judge, clock.input(1000));
      expect(hit.grade).toBe('Perfect');
    } finally { vi.restoreAllMocks(); }
  });

  it('still scores a tap whose DOM stamp sits on the Bluetooth audio clock', () => {
    try {
      const target = 5;
      const delayMs = 300;
      const currentTime = target + delayMs / 1000;
      const clock = clockAt(currentTime, 1000, {
        contextTime: target, performanceTime: 1000,
      });
      // Demo/visuals use now() (performance.now), so they stay in sync. The pointer
      // event is stamped 300 ms ago on the device clock — inside the old 1000 ms
      // window, that mapped 300 ms early and missed.
      const hit = judgeTap(createJudge([target]), clock.input(1000 - delayMs));
      expect(hit.grade).toBe('Perfect');
      expect(hit.deltaMs).toBeCloseTo(0, 5);
    } finally { vi.restoreAllMocks(); }
  });
});

describe('the output lag a platform reports', () => {
  it('adds the two latencies, because they are different parts of the same path', () => {
    // Measured in Chrome: baseLatency 10 ms, outputLatency 32 ms, and getOutputTimestamp
    // put the heard sample 40-43 ms behind currentTime. The sum, not either one alone.
    expect(reportedOutputLag({ baseLatency: 0.01, outputLatency: 0.032 })).toBeCloseTo(0.042, 6);
  });

  it('treats a context that reports neither as reporting nothing', () => {
    // Which is exactly what the clock did before this existed, so no device gets worse.
    expect(reportedOutputLag({} as AudioContext)).toBe(0);
    expect(reportedOutputLag({ baseLatency: 0, outputLatency: 0 } as AudioContext)).toBe(0);
  });

  it('ignores a value that is missing, negative or not a number', () => {
    expect(reportedOutputLag({ baseLatency: 0.01 } as AudioContext)).toBeCloseTo(0.01, 6);
    expect(reportedOutputLag({ baseLatency: -1, outputLatency: 0.02 } as AudioContext)).toBeCloseTo(0.02, 6);
    expect(reportedOutputLag({ baseLatency: Number.NaN, outputLatency: 0.02 } as AudioContext)).toBeCloseTo(0.02, 6);
    expect(reportedOutputLag({ outputLatency: Number.POSITIVE_INFINITY } as AudioContext)).toBe(0);
  });

  it('refuses to believe a lag past the ceiling a measurement is allowed', () => {
    // Past half a second the player is not hearing the beat they are tapping, so a report
    // that large is likelier to be broken than real.
    expect(reportedOutputLag({ baseLatency: 0.1, outputLatency: 9 } as AudioContext)).toBe(0.5);
  });
});

describe('a device whose output stamp cannot be trusted', () => {
  it('maps a tap onto the sample being heard, not the one being written', () => {
    // The Bluetooth case: no usable stamp, so the clock is estimating. Before this, a tap
    // at the moment the player heard the beat was judged a fifth of a second late.
    const lag = 0.2;
    const context = {
      currentTime: 10,
      baseLatency: 0.01,
      outputLatency: lag - 0.01,
      getOutputTimestamp: undefined,
    } as unknown as AudioContext;
    vi.spyOn(performance, 'now').mockReturnValue(5000);
    const clock = new AudioClock(context);
    clock.refresh();
    expect(clock.mode).toBe('estimated');
    // The cue heard at this instant was written `lag` ago.
    expect(clock.now()).toBeCloseTo(10 - lag, 6);
    expect(clock.reportedLagMs).toBe(200);
  });

  it('leaves the manual offset as the correction on top, not instead', () => {
    const context = {
      currentTime: 10, baseLatency: 0, outputLatency: 0.2, getOutputTimestamp: undefined,
    } as unknown as AudioContext;
    vi.spyOn(performance, 'now').mockReturnValue(5000);
    const clock = new AudioClock(context);
    clock.refresh();
    clock.calibrationMs = 50;
    // performance.timeOrigin is subtracted inside `input`, so pass a stamp it will keep.
    const judged = clock.input(5000);
    expect(judged).toBeCloseTo(10 - 0.2 - 0.05, 5);
  });
});

describe('whether the tap can still voice its own beat', () => {
  it('keeps the voice on the tap through a speaker', () => {
    // Chrome's measured 42 ms is heard as the sound of the tap; nothing changes there.
    expect(tapVoiceLate(42, 0)).toBe(false);
  });

  it('moves the voice onto the grid on a Bluetooth route', () => {
    // A2DP's 150-400 ms lands most of an eighth note late at 120 BPM. This is the case
    // where the judge was right and the player still heard their own strike as late.
    expect(tapVoiceLate(180, 0)).toBe(true);
    expect(tapVoiceLate(400, 0)).toBe(true);
  });

  it('counts a positive Tap offset as lag the platform failed to report', () => {
    // A route that admits to 60 ms and was measured 60 ms later still delivers 120 late.
    expect(tapVoiceLate(60, 60)).toBe(true);
    expect(tapVoiceLate(60, 30)).toBe(false);
  });

  it('does not let a negative offset make a route look faster than it reports', () => {
    // Tapping ahead of the beat is a habit, not a headset that plays early.
    expect(tapVoiceLate(150, -200)).toBe(true);
  });

  it('sits under the Good window, so a voice inside the tap\'s own judgement stays on the tap', () => {
    expect(RHYTHM.gridVoiceLagMs).toBeLessThan(RHYTHM.goodMs);
    expect(tapVoiceLate(RHYTHM.gridVoiceLagMs, 0)).toBe(true);
    expect(tapVoiceLate(RHYTHM.gridVoiceLagMs - 1, 0)).toBe(false);
  });

  it('treats a report it cannot read as no lag', () => {
    expect(tapVoiceLate(Number.NaN, 0)).toBe(false);
    expect(tapVoiceLate(0, Number.NaN)).toBe(false);
  });

  it('is what the clock answers from its own context and offset', () => {
    const clock = new AudioClock({ baseLatency: 0.01, outputLatency: 0.2, currentTime: 1 } as AudioContext);
    expect(clock.tapVoiceLate).toBe(true);
    const speaker = new AudioClock({ baseLatency: 0.01, outputLatency: 0.032, currentTime: 1 } as AudioContext);
    expect(speaker.tapVoiceLate).toBe(false);
    speaker.calibrationMs = 90;
    expect(speaker.tapVoiceLate).toBe(true);
  });
});
