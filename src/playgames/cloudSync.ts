import { breadcrumb } from '@/core/errors';
import type { Progress } from '@/game/progress';
import { syncAchievements } from './achievementSync';
import { playGames } from './boot';
import { cloudStoreOn, createCloudSync, localCloudSave, type CloudSync, type CloudSyncOutcome, cloudBindingDamaged, CLOUD_STORE_KEY } from './cloudSave';
import { stubPlayGames } from './playGames';

/**
 * Saved Games, wired to the game: local storage, the installed Play Games adapter and the
 * achievements that follow a save. Scenes call three things and nothing below them.
 *
 * - `reconcileCloud()` after Play Games reports the player signed in, and on every return
 *   to the foreground (throttled), so another device's progress arrives.
 * - `queueCloudSave()` when progression changed — a cleared level, a restored save code.
 *   Debounced: a run of clears is one write, and nothing is ever written per tap or frame.
 * - `cloudStatusLine()` for the support report.
 *
 * In a browser the stub is installed, nothing here schedules anything, and every call
 * answers "unavailable". Nothing awaits any of it, and nothing depends on it.
 */

export const CLOUD_SYNC = {
  /** How long after the last progression change the save goes up, so a burst is one write. */
  debounceMs: 2500,
  /** Returning to the foreground re-syncs at most this often. */
  resumeThrottleMs: 20_000,
} as const;

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

const native = (): boolean => playGames() !== stubPlayGames;

let instance: CloudSync | null = null;

export function cloudSync(): CloudSync {
  instance ??= createCloudSync({
    games: playGames,
    native,
    local: localCloudSave(safeStorage()),
    store: cloudStoreOn(safeStorage()),
    // Achievements are derived from the save: progress that arrived from another device
    // may have cleared a finale this device never saw.
    onImported: (progress: Progress) => { void syncAchievements(progress); },
    onEvent: (event, data) => breadcrumb(event, data),
  });
  return instance;
}

/**
 * Drop a cloud binding that can no longer be read, so the next sync starts from an empty
 * one. Only a damaged binding: a readable one names the device's owner and holds the
 * shelved saves of players who signed in before, and none of that is Reset's to destroy.
 * Returns whether anything was removed.
 */
export function repairCloudBinding(storage: Storage | null = safeStorage()): boolean {
  try {
    if (!cloudBindingDamaged(storage?.getItem(CLOUD_STORE_KEY) ?? null)) return false;
    storage?.removeItem(CLOUD_STORE_KEY);
    return storage !== null;
  } catch { return false; }
}

/** Reconcile now. Never rejects. */
export function reconcileCloud(): Promise<CloudSyncOutcome> {
  return cloudSync().sync();
}

let pending: ReturnType<typeof setTimeout> | null = null;

/** Progression changed: sync soon, once, however many changes arrive before then. */
export function queueCloudSave(): void {
  if (!native()) return;
  if (pending !== null) clearTimeout(pending);
  pending = setTimeout(() => { pending = null; void cloudSync().sync(); }, CLOUD_SYNC.debounceMs);
}

let watching = false;
let lastResumeAt = -Infinity;

/**
 * Re-sync when the game comes back to the foreground, so progress made on another device
 * since arrives without a relaunch. The same document event the updates check uses.
 * Installed once, native only, and throttled: a player flicking between apps is not a
 * reason to hit Play Games every time.
 */
export function watchCloudResume(now: () => number = Date.now): void {
  if (watching || !native()) return;
  try {
    if (typeof document === 'undefined') return;
    watching = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      const at = now();
      if (at - lastResumeAt < CLOUD_SYNC.resumeThrottleMs) return;
      lastResumeAt = at;
      void cloudSync().sync();
    });
  } catch { /* no document, or listeners refused: the boot sync still ran */ }
}

/** One line for the support report. Never an id, never a payload. */
export function cloudStatusLine(): string {
  if (!native()) return 'not on this build';
  const last = instance?.last ?? null;
  if (last === null) return 'not synced yet';
  switch (last.kind) {
    case 'synced': return last.uploaded || last.imported ? 'synced' : 'synced, nothing new';
    case 'skipped': return last.reason === 'signed_out' || last.reason === 'no_player' ? 'signed out' : 'unavailable';
    case 'unsupported': return `cloud save is from a newer version (${last.version}); left as it is`;
    case 'failed': return `last sync failed (${last.step}: ${last.reason})`;
  }
}
