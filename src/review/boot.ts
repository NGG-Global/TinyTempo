import { Capacitor } from '@capacitor/core';

import { breadcrumb } from '@/core/errors';
import { createAppReview, stubAppReview, type AppReview } from './appReview';
import { loadReviewRecord, saveReviewRecord } from './reviewRecord';

let installed: AppReview = stubAppReview;

/** Whatever is installed. The stub until a native build says otherwise. */
export function appReview(): AppReview {
  return installed;
}

/**
 * Native-only: attach the in-app review adapter.
 *
 * `Capacitor.isNativePlatform()` is the whole of the line between a browser and a device,
 * exactly as it is for Play Games and updates. The browser keeps the stub, which offers
 * nothing and calls nothing. Nothing is asked of Play here: the flow is prepared on a
 * milestone's result screen and launched from its Continue, never at boot.
 *
 * Nothing awaits this and nothing depends on it. A missing plugin leaves the stub in
 * place, and the game precisely as it was.
 */
export async function bootAppReview(): Promise<void> {
  try {
    if (!Capacitor.isNativePlatform()) return;
    const { nativeAppReviewClient } = await import('./native');
    installed = createAppReview(nativeAppReviewClient(), {
      load: loadReviewRecord,
      save: saveReviewRecord,
      appVersion: __APP_VERSION__,
    });
    breadcrumb('review attached');
  } catch {
    installed = stubAppReview;
  }
}
