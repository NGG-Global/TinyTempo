import { Capacitor } from '@capacitor/core';

import { breadcrumb } from '@/core/errors';
import { setRoute } from './audioRoute';

/**
 * Native-only: follow the device's audio output route. The browser never leaves this
 * function's first line, so its route stays `unknown` and its one offset is the one it
 * always had. A missing plugin, a refusal or a throw is the same answer.
 *
 * Nothing awaits this. A level started before the first answer arrives — which takes
 * milliseconds against the seconds it takes to reach one — uses the `unknown` slot, which
 * holds an upgraded save's old offset until a route adopts it.
 */
export async function bootAudioRoute(): Promise<void> {
  try {
    if (!Capacitor.isNativePlatform()) return;
    const { watchNativeRoute } = await import('./routeNative');
    const first = await watchNativeRoute(route => {
      // The route, never a device name: a breadcrumb rides along on crash reports.
      breadcrumb('audio route', { route });
      setRoute(route);
    });
    breadcrumb('audio route watched', { route: first });
  } catch {
    // Unknown stays unknown: the game keeps the offset it had.
  }
}
