import { describe, expect, it, vi } from 'vitest';
import { AudioClock, mapTimestamp, normalizeTimestamp, stampUsable } from '../src/audio/AudioClock';
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
