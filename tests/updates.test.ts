import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPlayUpdate, decideUpdate, EMPTY_UPDATE, UPDATE, type AppUpdateSnapshot, type PlayUpdateClient,
  type UpdateEvent, type UpdateStartResult,
} from '../src/updates/playUpdate';

vi.mock('phaser', () => ({ default: {} }));

function snapshot(overrides: Partial<AppUpdateSnapshot> = {}): AppUpdateSnapshot {
  return { ...EMPTY_UPDATE, ...overrides };
}

interface FakeOptions {
  readonly check?: AppUpdateSnapshot | 'fail';
  readonly start?: UpdateStartResult | 'fail';
  readonly complete?: 'ok' | 'fail';
  readonly listen?: 'ok' | 'fail';
}

interface Fake extends PlayUpdateClient {
  readonly checks: number;
  readonly started: readonly ('flexible' | 'immediate')[];
  readonly completes: number;
  emit(event: UpdateEvent): void;
}

function fakeClient(options: FakeOptions = {}): Fake {
  const listeners: Array<(event: UpdateEvent) => void> = [];
  const started: Array<'flexible' | 'immediate'> = [];
  let checks = 0;
  let completes = 0;

  const client: Fake = {
    get checks() { return checks; },
    get started() { return started; },
    get completes() { return completes; },
    emit(event) { for (const listener of listeners) listener(event); },

    async check() {
      checks += 1;
      if (options.check === 'fail') throw new Error('offline');
      return options.check === undefined ? EMPTY_UPDATE : options.check;
    },

    async start(flow) {
      if (options.start === 'fail') throw new Error('sheet');
      started.push(flow);
      return options.start ?? 'accepted';
    },

    async complete() {
      completes += 1;
      if (options.complete === 'fail') throw new Error('complete');
    },

    async listen(listener) {
      if (options.listen === 'fail') throw new Error('no listener');
      listeners.push(listener);
    },
  };
  return client;
}

describe('which flow a snapshot asks for', () => {
  it('does nothing when Play has no update', () => {
    expect(decideUpdate(EMPTY_UPDATE)).toBe('none');
  });

  it('applies a pack that is already downloaded, even if nothing else is set', () => {
    expect(decideUpdate(snapshot({ installStatus: 'downloaded' }))).toBe('apply');
  });

  it('leaves an in-progress immediate flow to native resume', () => {
    expect(decideUpdate(snapshot({
      available: true,
      inProgress: true,
      priority: 5,
      immediateAllowed: true,
    }))).toBe('none');
  });

  it('does not start a second download while one is moving', () => {
    expect(decideUpdate(snapshot({ available: true, flexibleAllowed: true, installStatus: 'downloading' }))).toBe('none');
    expect(decideUpdate(snapshot({ available: true, flexibleAllowed: true, installStatus: 'pending' }))).toBe('none');
    expect(decideUpdate(snapshot({ available: true, immediateAllowed: true, installStatus: 'installing' }))).toBe('none');
  });

  it('starts immediate at Play Console priority 4 or 5', () => {
    expect(UPDATE.immediatePriority).toBe(4);
    expect(decideUpdate(snapshot({
      available: true, priority: 4, immediateAllowed: true, flexibleAllowed: true,
    }))).toBe('immediate');
    expect(decideUpdate(snapshot({
      available: true, priority: 5, immediateAllowed: true,
    }))).toBe('immediate');
  });

  it('falls back to flexible when a high-priority update cannot be immediate', () => {
    expect(decideUpdate(snapshot({
      available: true, priority: 5, immediateAllowed: false, flexibleAllowed: true,
    }))).toBe('flexible');
  });

  it('starts flexible for an ordinary update', () => {
    expect(decideUpdate(snapshot({
      available: true, priority: 0, flexibleAllowed: true, immediateAllowed: true,
    }))).toBe('flexible');
    expect(decideUpdate(snapshot({
      available: true, priority: 3, flexibleAllowed: true,
    }))).toBe('flexible');
  });

  it('starts immediate when that is the only type Play will allow', () => {
    expect(decideUpdate(snapshot({
      available: true, priority: 0, immediateAllowed: true, flexibleAllowed: false,
    }))).toBe('immediate');
  });

  it('stays quiet when Play reports an update it will not start', () => {
    expect(decideUpdate(snapshot({ available: true, priority: 5 }))).toBe('none');
  });
});

describe('following what Play reports', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts a flexible update on boot when Play has one', async () => {
    const client = fakeClient({
      check: snapshot({ available: true, flexibleAllowed: true }),
    });
    const updates = createPlayUpdate(client, {
      wouldInterrupt: () => false,
      confirmRestart: async () => false,
    });
    await updates.boot();
    expect(client.started).toEqual(['flexible']);
  });

  it('starts an immediate update for a high-priority release', async () => {
    const client = fakeClient({
      check: snapshot({ available: true, priority: 4, immediateAllowed: true }),
    });
    const updates = createPlayUpdate(client, {
      wouldInterrupt: () => false,
      confirmRestart: async () => false,
    });
    await updates.boot();
    expect(client.started).toEqual(['immediate']);
  });

  it('does not start while a level is running, then starts once it is not', async () => {
    vi.useFakeTimers();
    let busy = true;
    const client = fakeClient({
      check: snapshot({ available: true, flexibleAllowed: true }),
    });
    const updates = createPlayUpdate(client, {
      wouldInterrupt: () => busy,
      confirmRestart: async () => false,
      waitMs: 25,
    });
    const boot = updates.boot();
    await vi.advanceTimersByTimeAsync(80);
    expect(client.started).toEqual([]);
    busy = false;
    await vi.advanceTimersByTimeAsync(25);
    await boot;
    expect(client.started).toEqual(['flexible']);
  });

  it('asks to restart when a pack is already downloaded, and completes only if accepted', async () => {
    const client = fakeClient({ check: snapshot({ installStatus: 'downloaded' }) });
    const updates = createPlayUpdate(client, {
      wouldInterrupt: () => false,
      confirmRestart: async () => true,
    });
    await updates.boot();
    expect(client.completes).toBe(1);
    expect(client.started).toEqual([]);
  });

  it('leaves a downloaded pack in place when the player taps Later', async () => {
    const client = fakeClient({ check: snapshot({ installStatus: 'downloaded' }) });
    const updates = createPlayUpdate(client, {
      wouldInterrupt: () => false,
      confirmRestart: async () => false,
    });
    await updates.boot();
    expect(client.completes).toBe(0);
  });

  it('does not retry Play\'s consent dialog after a cancel this session', async () => {
    const client = fakeClient({
      check: snapshot({ available: true, flexibleAllowed: true }),
      start: 'canceled',
    });
    const updates = createPlayUpdate(client, {
      wouldInterrupt: () => false,
      confirmRestart: async () => false,
    });
    await updates.boot();
    await updates.reconcile();
    expect(client.started).toEqual(['flexible']);
  });

  it('does not start a second flow after Play accepted one this session', async () => {
    const client = fakeClient({
      check: snapshot({ available: true, flexibleAllowed: true }),
    });
    const updates = createPlayUpdate(client, {
      wouldInterrupt: () => false,
      confirmRestart: async () => false,
    });
    await updates.boot();
    await updates.reconcile();
    expect(client.started).toEqual(['flexible']);
  });

  it('retries this session if a started download then fails', async () => {
    const client = fakeClient({
      check: snapshot({ available: true, flexibleAllowed: true }),
    });
    const updates = createPlayUpdate(client, {
      wouldInterrupt: () => false,
      confirmRestart: async () => false,
    });
    await updates.boot();
    client.emit('failed');
    await updates.reconcile();
    expect(client.started).toEqual(['flexible', 'flexible']);
  });
    const client = fakeClient();
    const updates = createPlayUpdate(client, {
      wouldInterrupt: () => false,
      confirmRestart: async () => true,
    });
    await updates.boot();
    client.emit('downloaded');
    await Promise.resolve();
    expect(client.completes).toBe(1);
  });

  it('waits until the player leaves a level before offering the restart', async () => {
    vi.useFakeTimers();
    let busy = true;
    const client = fakeClient();
    const updates = createPlayUpdate(client, {
      wouldInterrupt: () => busy,
      confirmRestart: async () => true,
      waitMs: 25,
    });
    await updates.boot();
    client.emit('downloaded');
    await vi.advanceTimersByTimeAsync(80);
    expect(client.completes).toBe(0);
    busy = false;
    await vi.advanceTimersByTimeAsync(25);
    expect(client.completes).toBe(1);
  });

  it('stays quiet when check fails, which is what a sideload looks like', async () => {
    const client = fakeClient({ check: 'fail' });
    const updates = createPlayUpdate(client, {
      wouldInterrupt: () => false,
      confirmRestart: async () => true,
    });
    await expect(updates.boot()).resolves.toBeUndefined();
    expect(client.started).toEqual([]);
    expect(client.completes).toBe(0);
  });

  it('still applies on resume if the download listener never attached', async () => {
    const client = fakeClient({
      listen: 'fail',
      check: snapshot({ installStatus: 'downloaded' }),
    });
    const updates = createPlayUpdate(client, {
      wouldInterrupt: () => false,
      confirmRestart: async () => true,
    });
    await updates.boot();
    expect(client.completes).toBe(1);
  });

  it('does not take the game down when complete fails', async () => {
    const client = fakeClient({
      check: snapshot({ installStatus: 'downloaded' }),
      complete: 'fail',
    });
    const updates = createPlayUpdate(client, {
      wouldInterrupt: () => false,
      confirmRestart: async () => true,
    });
    await expect(updates.boot()).resolves.toBeUndefined();
    expect(client.completes).toBe(1);
  });
});
