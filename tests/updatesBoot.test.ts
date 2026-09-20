import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: {} }));

const state = vi.hoisted(() => ({
  native: true,
  interrupt: false,
  prompted: 0,
  boots: 0,
  failToImport: false,
}));

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => state.native } }));
vi.mock('@/core/shell', () => ({
  askToApplyUpdate: async () => {
    state.prompted += 1;
    return false;
  },
}));
vi.mock('@/updates/native', () => ({
  nativePlayUpdateClient: () => {
    if (state.failToImport) throw new Error('no plugin');
    return {
      check: async () => {
        state.boots += 1;
        return {
          available: false,
          inProgress: false,
          priority: 0,
          flexibleAllowed: false,
          immediateAllowed: false,
          installStatus: 'unknown',
        };
      },
      start: async () => 'failed' as const,
      complete: async () => { /* unused */ },
      listen: async () => { /* unused */ },
    };
  },
}));

import { bootUpdates } from '../src/updates/boot';

describe('attaching in-app updates', () => {
  beforeEach(() => {
    state.native = true;
    state.interrupt = false;
    state.prompted = 0;
    state.boots = 0;
    state.failToImport = false;
  });

  it('asks Play on a native build', async () => {
    await bootUpdates({ wouldInterrupt: () => state.interrupt });
    expect(state.boots).toBe(1);
  });

  it('does nothing at all in a browser', async () => {
    state.native = false;
    await bootUpdates({ wouldInterrupt: () => state.interrupt });
    expect(state.boots).toBe(0);
  });

  it('leaves the game running when the plugin cannot start', async () => {
    state.failToImport = true;
    await expect(bootUpdates({ wouldInterrupt: () => false })).resolves.toBeUndefined();
    expect(state.boots).toBe(0);
  });
});
