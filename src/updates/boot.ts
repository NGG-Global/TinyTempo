import { Capacitor } from '@capacitor/core';

import { breadcrumb } from '@/core/errors';
import { askToApplyUpdate } from '@/core/shell';
import { createPlayUpdate } from './playUpdate';
import type { PlayUpdate } from './playUpdate';

export interface BootUpdatesOptions {
  /**
   * True when a Play sheet or a restart would cover a scene that must not be
   * interrupted. The adapter waits; it never starts an update over a level.
   */
  readonly wouldInterrupt: () => boolean;
}

/**
 * Native-only: ask Play whether a newer version is waiting, and follow it.
 *
 * This function is the whole of the line between a development build and one
 * Play can update. The browser never reaches the plugin, a sideload reports
 * nothing available, and neither is an error — in-app updates only exist for
 * an APK Play itself installed. A missing plugin must not take the game down.
 */
export async function bootUpdates(options: BootUpdatesOptions): Promise<void> {
  try {
    // DEV-only overlay check: the real prompt needs a Play-installed build, which
    // this environment is not. `?updatePrompt` is how the sheet is looked at.
    if (import.meta.env.DEV && typeof location !== 'undefined'
        && new URLSearchParams(location.search).has('updatePrompt')) {
      void askToApplyUpdate();
    }
    if (!Capacitor.isNativePlatform()) return;
    const { nativePlayUpdateClient } = await import('./native');
    const updates = createPlayUpdate(nativePlayUpdateClient(), {
      wouldInterrupt: options.wouldInterrupt,
      confirmRestart: askToApplyUpdate,
    });
    await updates.boot();
    watchForResume(updates);
    breadcrumb('updates attached');
  } catch {
    // Sideload, missing Play, missing plugin: the game stays on this version.
  }
}

/**
 * Re-asks Play whenever the game comes back to the foreground.
 *
 * A flexible download can finish while the game is not running, and Play keeps
 * the pack in DOWNLOADED occupying storage until `completeUpdate` runs. This
 * is the same kind of document event the scenes already use for `blur`, not a
 * new capability. Immediate-in-progress is resumed natively from `onResume`.
 */
function watchForResume(updates: PlayUpdate): void {
  try {
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      void updates.reconcile();
    });
  } catch { /* no document, or listeners refused: startup check still ran */ }
}
