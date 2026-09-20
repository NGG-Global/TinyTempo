/**
 * Google Play In-App Updates, as the game needs them.
 *
 * `native.ts` is the only implementation that touches the plugin; tests supply
 * their own. This file imports no native code, which is why the whole of the
 * policy — flexible vs immediate, when to ask for a restart, when to stay quiet
 * — is tested under node.
 */

/** Play's 0–5 in-app update priority. 4 and 5 are Google's own "blocking" band. */
export const UPDATE = {
  immediatePriority: 4,
} as const;

export type InstallStatus =
  | 'unknown'
  | 'pending'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'installed'
  | 'failed'
  | 'canceled';

export type UpdateFlow = 'none' | 'flexible' | 'immediate' | 'apply';

export type UpdateStartResult = 'accepted' | 'canceled' | 'failed';

export type UpdateEvent = 'downloaded' | 'failed';

export interface AppUpdateSnapshot {
  readonly available: boolean;
  /** An immediate flow the player already accepted, which native code must resume. */
  readonly inProgress: boolean;
  readonly priority: number;
  readonly flexibleAllowed: boolean;
  readonly immediateAllowed: boolean;
  readonly installStatus: InstallStatus;
}

/**
 * The native AppUpdateManager, as the game needs it. Isolated so this file and
 * its tests never load Capacitor.
 */
export interface PlayUpdateClient {
  check(): Promise<AppUpdateSnapshot>;
  start(flow: 'flexible' | 'immediate'): Promise<UpdateStartResult>;
  complete(): Promise<void>;
  listen(listener: (event: UpdateEvent) => void): Promise<void>;
}

export interface PlayUpdateOptions {
  /**
   * True when a Play sheet or a restart would interrupt something the player is
   * in the middle of — a level, the tutorial, tap-offset, or the boot splash.
   * The adapter waits rather than covering those.
   */
  readonly wouldInterrupt: () => boolean;
  /** The restart prompt. True means call `completeUpdate` and let Play reboot. */
  readonly confirmRestart: () => Promise<boolean>;
  /** How long to wait between idle checks. Tests inject a smaller value. */
  readonly waitMs?: number;
}

export const EMPTY_UPDATE: AppUpdateSnapshot = {
  available: false,
  inProgress: false,
  priority: 0,
  flexibleAllowed: false,
  immediateAllowed: false,
  installStatus: 'unknown',
};

/**
 * Which flow, if any, this snapshot should start.
 *
 * Immediate is Play Console's high-priority band, not a game-side setting: a
 * release that does not set `inAppUpdatePriority` stays at 0 and downloads in
 * the background. A downloaded pack is always "apply", because it already
 * occupies storage until `completeUpdate` runs. An in-progress immediate flow
 * is `none` here on purpose — the Java plugin resumes it from `onResume`,
 * which is the entry point Play actually counts.
 */
export function decideUpdate(info: AppUpdateSnapshot): UpdateFlow {
  if (info.installStatus === 'downloaded') return 'apply';
  if (info.inProgress) return 'none';
  if (
    info.installStatus === 'pending'
    || info.installStatus === 'downloading'
    || info.installStatus === 'installing'
  ) {
    return 'none';
  }
  if (!info.available) return 'none';
  const blocking = info.priority >= UPDATE.immediatePriority;
  if (blocking && info.immediateAllowed) return 'immediate';
  if (info.flexibleAllowed) return 'flexible';
  if (info.immediateAllowed) return 'immediate';
  return 'none';
}

export interface PlayUpdate {
  /** Check Play and follow whatever the snapshot asks. Safe to call repeatedly. */
  boot(): Promise<void>;
  /** Re-checks. Called on resume, when a download may have finished in the background. */
  reconcile(): Promise<void>;
}

/**
 * Direct Google Play In-App Updates.
 *
 * A sideload, a debug APK from Studio, and a browser all look the same from
 * here: `check` reports nothing available, every method is silent, and the
 * game does not care. The only build that ever sees an update is one Play
 * itself installed.
 *
 * Flexible is the default. Immediate is reserved for priority 4+, and even
 * then the Play sheet waits until the player is on a chrome screen — covering
 * a level with a blocking store UI would cost the round. Once they have
 * accepted an immediate update, native `onResume` takes over; this adapter
 * does not start a second one.
 */
export function createPlayUpdate(client: PlayUpdateClient, options: PlayUpdateOptions): PlayUpdate {
  const waitMs = options.waitMs ?? 1000;
  let listening = false;
  let requesting = false;
  let offering = false;
  let startedThisSession = false;
  let declinedThisSession = false;

  async function waitUntilIdle(): Promise<void> {
    if (!options.wouldInterrupt()) return;
    await new Promise<void>(resolve => {
      const tick = (): void => {
        if (!options.wouldInterrupt()) {
          resolve();
          return;
        }
        globalThis.setTimeout(tick, waitMs);
      };
      tick();
    });
  }

  async function offerApply(): Promise<void> {
    if (offering) return;
    offering = true;
    try {
      await waitUntilIdle();
      const accepted = await options.confirmRestart();
      if (!accepted) return;
      await client.complete();
    } catch {
      // A complete that fails is retried on the next resume: Play keeps the
      // pack in DOWNLOADED until something consumes it.
    } finally {
      offering = false;
    }
  }

  async function follow(info: AppUpdateSnapshot): Promise<void> {
    const flow = decideUpdate(info);
    if (flow === 'apply') {
      await offerApply();
      return;
    }
    if (flow === 'none' || declinedThisSession || startedThisSession || requesting) return;
    requesting = true;
    try {
      await waitUntilIdle();
      const result = await client.start(flow);
      if (result === 'accepted') startedThisSession = true;
      if (result === 'canceled') declinedThisSession = true;
    } catch {
      // Play's sheet did not open. The next resume asks again; this session
      // does not latch a decline that the player never made.
    } finally {
      requesting = false;
    }
  }

  async function reconcile(): Promise<void> {
    let info: AppUpdateSnapshot;
    try {
      info = await client.check();
    } catch {
      return;
    }
    await follow(info);
  }

  async function boot(): Promise<void> {
    if (!listening) {
      try {
        await client.listen(event => {
          if (event === 'downloaded') void offerApply();
          if (event === 'failed') startedThisSession = false;
        });
        listening = true;
      } catch {
        // Resume still re-checks, so a missing listener only costs the moment
        // the download finishes while the game is already in the foreground.
      }
    }
    await reconcile();
  }

  return { boot, reconcile };
}
