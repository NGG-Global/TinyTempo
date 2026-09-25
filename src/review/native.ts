import { registerPlugin } from '@capacitor/core';

import type { AppReviewClient } from './appReview';

interface PlayReviewPlugin {
  prepare(): Promise<unknown>;
  launch(): Promise<unknown>;
}

/**
 * The native ReviewManager in `android/app/src/main/java/com/tinytempo/app/PlayReviewPlugin.java`.
 * No web implementation is registered: in a browser this object exists but every call
 * rejects, which is why `boot.ts` never reaches this file off a native platform.
 */
const PlayReview = registerPlugin<PlayReviewPlugin>('PlayReview');

/**
 * Thin wrapper around the native plugin. Isolated so the adapter and its tests never
 * import native code, and so Vite leaves this chunk unloaded in the browser. Nothing
 * crosses the bridge in either direction but "done" or a rejection: Play does not say
 * what it showed, and the adapter does not ask.
 */
export function nativeAppReviewClient(): AppReviewClient {
  return {
    async prepare() { await PlayReview.prepare(); },
    async launch() { await PlayReview.launch(); },
  };
}
