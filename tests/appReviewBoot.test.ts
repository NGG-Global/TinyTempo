import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: {} }));

const state = vi.hoisted(() => ({
  native: true,
  prepares: 0,
  launches: 0,
  failToImport: false,
}));

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => state.native } }));
vi.mock('@/review/native', () => ({
  nativeAppReviewClient: () => {
    if (state.failToImport) throw new Error('no plugin');
    return {
      prepare: async () => { state.prepares += 1; },
      launch: async () => { state.launches += 1; },
    };
  },
}));

import { appReview, bootAppReview } from '../src/review/boot';
import { stubAppReview } from '../src/review/appReview';

const CLEAR = { level: 10, cleared: true, finale: true, saved: true } as const;

describe('attaching in-app review', () => {
  beforeEach(() => {
    state.native = true;
    state.prepares = 0;
    state.launches = 0;
    state.failToImport = false;
    (globalThis as { __APP_VERSION__?: string }).__APP_VERSION__ = '0.1.10';
  });

  it('starts as the stub, before anything has booted', () => {
    expect(appReview()).toBe(stubAppReview);
  });

  it('keeps the stub in a browser: no native review call, ever', async () => {
    state.native = false;
    await bootAppReview();
    expect(appReview()).toBe(stubAppReview);
    expect(appReview().offer(CLEAR)).toBeNull();
    await expect(appReview().launch()).resolves.toBe('skipped');
    expect(state.prepares).toBe(0);
    expect(state.launches).toBe(0);
  });

  it('keeps the stub when the plugin cannot load', async () => {
    state.failToImport = true;
    await expect(bootAppReview()).resolves.toBeUndefined();
    expect(appReview()).toBe(stubAppReview);
    expect(appReview().offer(CLEAR)).toBeNull();
  });

  it('installs the native adapter on a device, and asks Play nothing at boot', async () => {
    await bootAppReview();
    expect(appReview()).not.toBe(stubAppReview);
    expect(state.prepares).toBe(0);
    expect(state.launches).toBe(0);
  });
});
