import { registerPlugin } from '@capacitor/core';

import { EMPTY_UPDATE, type AppUpdateSnapshot, type InstallStatus, type PlayUpdateClient, type UpdateEvent, type UpdateStartResult } from './playUpdate';

interface PlayUpdatePlugin {
  check(): Promise<unknown>;
  start(options: { type: 'flexible' | 'immediate' }): Promise<{ result?: unknown }>;
  complete(): Promise<void>;
  addListener(
    event: 'downloaded' | 'failed',
    listener: () => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

/**
 * The native AppUpdateManager in `android/app/src/main/java/com/tinytempo/app/PlayUpdatePlugin.java`.
 * No web implementation is registered: in a browser this object exists but every call
 * rejects, which is why `boot.ts` never reaches this file off a native platform.
 */
const PlayUpdate = registerPlugin<PlayUpdatePlugin>('PlayUpdate');

function toInstallStatus(value: unknown): InstallStatus {
  switch (value) {
    case 'pending':
    case 'downloading':
    case 'downloaded':
    case 'installing':
    case 'installed':
    case 'failed':
    case 'canceled':
      return value;
    default:
      return 'unknown';
  }
}

/**
 * Anything crossing the bridge is JSON from another process, so it is validated rather
 * than cast. A malformed snapshot is treated as "nothing to do": starting an update
 * from a field that is not there would be the dangerous direction.
 */
function toSnapshot(value: unknown): AppUpdateSnapshot {
  if (typeof value !== 'object' || value === null) return EMPTY_UPDATE;
  const record = value as {
    available?: unknown;
    inProgress?: unknown;
    priority?: unknown;
    flexibleAllowed?: unknown;
    immediateAllowed?: unknown;
    installStatus?: unknown;
  };
  const priority = typeof record.priority === 'number' && Number.isFinite(record.priority) ? record.priority : 0;
  return {
    available: record.available === true,
    inProgress: record.inProgress === true,
    priority,
    flexibleAllowed: record.flexibleAllowed === true,
    immediateAllowed: record.immediateAllowed === true,
    installStatus: toInstallStatus(record.installStatus),
  };
}

function toStartResult(value: unknown): UpdateStartResult {
  return value === 'accepted' || value === 'canceled' ? value : 'failed';
}

/**
 * Thin wrapper around the native plugin. Isolated so the adapter and its tests never
 * import native code, and so Vite leaves this chunk unloaded in the browser.
 */
export function nativePlayUpdateClient(): PlayUpdateClient {
  return {
    async check() {
      return toSnapshot(await PlayUpdate.check());
    },

    async start(flow) {
      const { result } = await PlayUpdate.start({ type: flow });
      return toStartResult(result);
    },

    complete: () => PlayUpdate.complete(),

    async listen(listener) {
      const on = (event: UpdateEvent) => PlayUpdate.addListener(event, () => { listener(event); });
      await on('downloaded');
      await on('failed');
    },
  };
}
