import { afterEach, describe, expect, it, vi } from 'vitest';
import { followAppLifecycle, type AppLifecyclePlugin } from '../src/audio/appLifecycle';

const state = { native: true };
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => state.native } }));

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

function fakeApp() {
  const listeners = new Map<string, (payload: { isActive: boolean }) => void>();
  const removed: string[] = [];
  const plugin: AppLifecyclePlugin = {
    addListener: (async (event: string, listener: (payload: { isActive: boolean }) => void) => {
      listeners.set(event, listener);
      return { remove: async () => { removed.push(event); listeners.delete(event); } };
    }) as AppLifecyclePlugin['addListener'],
  };
  return {
    plugin, removed,
    fire(event: string, payload = { isActive: true }) { listeners.get(event)?.(payload); },
    get events() { return Array.from(listeners.keys()); },
  };
}

afterEach(() => { state.native = true; });

describe('the activity\'s pause and resume', () => {
  it('relays pause, resume and the app state to the silence', async () => {
    const app = fakeApp();
    const seen: boolean[] = [];
    followAppLifecycle({ setAppActive: active => seen.push(active) }, async () => app.plugin);
    await settle();
    expect(app.events).toEqual(['pause', 'resume', 'appStateChange']);
    app.fire('pause');
    app.fire('appStateChange', { isActive: false });
    app.fire('resume');
    app.fire('appStateChange', { isActive: true });
    expect(seen).toEqual([false, false, true, true]);
  });

  it('loads nothing in the browser, where the page\'s visibility is what there is', async () => {
    state.native = false;
    const load = vi.fn(async () => fakeApp().plugin);
    followAppLifecycle({ setAppActive: () => { throw new Error('never'); } }, load);
    await settle();
    expect(load).not.toHaveBeenCalled();
  });

  it('removes its listeners when released, even those still being made', async () => {
    const app = fakeApp();
    const release = followAppLifecycle({ setAppActive: () => {} }, async () => app.plugin);
    release();
    await settle();
    expect(app.events).toEqual([]);
    expect(app.removed.sort()).toEqual(['appStateChange', 'pause', 'resume']);
    const later = fakeApp();
    const releaseLater = followAppLifecycle({ setAppActive: () => {} }, async () => later.plugin);
    await settle();
    expect(later.events).toHaveLength(3);
    releaseLater();
    await settle();
    expect(later.events).toEqual([]);
  });

  it('keeps the page\'s word when the plugin is missing', async () => {
    const target = { setAppActive: vi.fn() };
    expect(() => followAppLifecycle(target, async () => { throw new Error('no plugin'); })).not.toThrow();
    await settle();
    expect(target.setAppActive).not.toHaveBeenCalled();
  });
});
