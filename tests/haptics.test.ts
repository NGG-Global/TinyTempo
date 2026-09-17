import { afterEach, describe, expect, it, vi } from 'vitest';
import { HAPTIC, hapticsEnabled, hapticsSupported, setHaptics, vibrate } from '../src/core/haptics';

const withVibrate = (impl: ((pattern: number | number[]) => boolean) | undefined): (() => void) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    value: impl === undefined ? {} : { vibrate: impl },
    configurable: true,
    writable: true,
  });
  return () => {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    else Reflect.deleteProperty(globalThis, 'navigator');
  };
};

afterEach(() => setHaptics(false));

describe('haptics', () => {
  it('stays silent until the setting turns it on', () => {
    const pulses: number[] = [];
    const restore = withVibrate(ms => { pulses.push(ms as number); return true; });
    try {
      setHaptics(false);
      expect(hapticsEnabled()).toBe(false);
      vibrate('hit');
      expect(pulses).toEqual([]);
      setHaptics(true);
      vibrate('hit');
      expect(pulses).toEqual([HAPTIC.hit]);
      // The default is the lightest pulse, since most calls are controls.
      vibrate();
      expect(pulses).toEqual([HAPTIC.hit, HAPTIC.tap]);
    } finally { restore(); }
  });

  it('is a no-op where the platform has no vibrator', () => {
    const restore = withVibrate(undefined);
    try {
      setHaptics(true);
      expect(hapticsSupported()).toBe(false);
      expect(() => vibrate('stamp')).not.toThrow();
    } finally { restore(); }
  });

  it('swallows a browser that exposes the method and then refuses the call', () => {
    const refuse = vi.fn(() => { throw new Error('not allowed without a user gesture'); });
    const restore = withVibrate(refuse as unknown as (pattern: number | number[]) => boolean);
    try {
      setHaptics(true);
      expect(() => vibrate('tap')).not.toThrow();
      expect(refuse).toHaveBeenCalledOnce();
    } finally { restore(); }
  });

  it('keeps every pulse short enough to read as feedback rather than an alarm', () => {
    for (const ms of Object.values(HAPTIC)) {
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeLessThanOrEqual(30);
    }
  });
});
