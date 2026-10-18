import { Capacitor } from '@capacitor/core';

/** What the lifecycle feeds: the engine's background silence. */
export interface AppActivity {
  setAppActive(active: boolean): void;
}

/** The part of `@capacitor/app` this uses, so a test can hand in a fake. */
export interface AppLifecyclePlugin {
  addListener(eventName: 'pause' | 'resume', listenerFunc: () => void): Promise<{ remove(): Promise<void> }>;
  addListener(eventName: 'appStateChange', listenerFunc: (state: { isActive: boolean }) => void): Promise<{ remove(): Promise<void> }>;
}

/**
 * Native-only: tell the silence when the activity is paused and resumed.
 *
 * Capacitor's `BridgeActivity` never calls `WebView.onPause()`, so the page inside it is
 * not told that the activity has gone: `document.hidden` stays false, no `visibilitychange`
 * fires, and the page's timers and its AudioContext run on — behind the launcher after
 * Home, behind a call, and behind every rewarded ad, which is its own activity over this
 * one. `@capacitor/app` reports the activity's `onPause` and `onResume` directly, and
 * `appStateChange` from `onResume` and `onStop`; all three go to one idempotent setter, so
 * whichever arrives first silences and whichever arrives last restores.
 *
 * The browser never leaves the first line and keeps the page's visibility, which is what it
 * has. A missing plugin or a refusal is the same: the page's word stands alone, as before.
 *
 * Returns the function that stops listening; a subscription still being made is removed
 * when it lands.
 */
export function followAppLifecycle(target: AppActivity, load: () => Promise<AppLifecyclePlugin> = loadAppPlugin): () => void {
  let released = false;
  const handles: { remove(): Promise<void> }[] = [];
  const keep = (handle: { remove(): Promise<void> }): void => {
    if (released) void handle.remove().catch(() => { /* already gone */ });
    else handles.push(handle);
  };
  void (async () => {
    try {
      if (!Capacitor.isNativePlatform()) return;
      const app = await load();
      keep(await app.addListener('pause', () => target.setAppActive(false)));
      keep(await app.addListener('resume', () => target.setAppActive(true)));
      keep(await app.addListener('appStateChange', ({ isActive }) => target.setAppActive(isActive)));
    } catch {
      // No plugin: the page's visibility is all there is, as it was before this existed.
    }
  })();
  return () => {
    released = true;
    for (const handle of handles) void handle.remove().catch(() => { /* already gone */ });
    handles.length = 0;
  };
}

async function loadAppPlugin(): Promise<AppLifecyclePlugin> {
  const { App } = await import('@capacitor/app');
  return App;
}
