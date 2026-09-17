/**
 * Stands in for `firebase/analytics`, which this project deliberately does not install.
 *
 * `@capacitor-firebase/analytics` declares `firebase` as an **optional** peer and loads
 * its web implementation behind `() => import('./web')`. On Android the plugin talks to
 * the native SDK and that chunk is never fetched; in a browser `analytics/boot.ts`
 * returns before the plugin is touched at all. So the web path is unreachable on both
 * platforms the game runs on — but the bundler still has to resolve it, and resolving it
 * for real would pull the entire Firebase JS SDK into a bundle that would never call it.
 *
 * Aliased in `vite.config.ts`. Each export throws rather than returning a harmless
 * no-op: if this is ever reached, something changed about how the plugin picks its
 * implementation, and a silent no-op would look exactly like analytics working.
 */

function unreachable(name: string): never {
  throw new Error(
    `firebase/analytics is not installed in this build (${name}). The web implementation of `
    + '@capacitor-firebase/analytics is not used — see src/analytics/firebaseWebStub.ts.',
  );
}

export function getAnalytics(): never { return unreachable('getAnalytics'); }
export function logEvent(): never { return unreachable('logEvent'); }
export function setAnalyticsCollectionEnabled(): never { return unreachable('setAnalyticsCollectionEnabled'); }
export function setConsent(): never { return unreachable('setConsent'); }
export function setUserId(): never { return unreachable('setUserId'); }
export function setUserProperties(): never { return unreachable('setUserProperties'); }
