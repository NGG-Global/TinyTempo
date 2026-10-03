import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

import { toRoute, type AudioRoute } from '../game/routeCalibration';

interface AudioRoutePlugin {
  getRoute(): Promise<unknown>;
  addListener(event: 'routeChange', listener: (value: unknown) => void): Promise<PluginListenerHandle>;
}

/**
 * The native plugin in `android/app/src/main/java/com/tinytempo/app/AudioRoutePlugin.java`.
 * No web implementation is registered, so `routeBoot.ts` never reaches this file off a
 * native platform.
 */
const AudioRouteNative = registerPlugin<AudioRoutePlugin>('AudioRoute');

/** A route answer from the bridge, validated. Anything malformed is `unknown`, which is the old behaviour. */
export function routeFrom(value: unknown): AudioRoute {
  return typeof value === 'object' && value !== null ? toRoute((value as { route?: unknown }).route) : 'unknown';
}

/** Asks once, then follows every change. Resolves with the first answer. */
export async function watchNativeRoute(onRoute: (route: AudioRoute) => void): Promise<AudioRoute> {
  await AudioRouteNative.addListener('routeChange', value => onRoute(routeFrom(value)));
  const first = routeFrom(await AudioRouteNative.getRoute());
  onRoute(first);
  return first;
}
