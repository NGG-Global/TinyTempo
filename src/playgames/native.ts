import { registerPlugin } from '@capacitor/core';

import { SIGNED_OUT, type PlayGamesClient, type PlayGamesStatus } from './playGames';

interface PlayGamesPlugin {
  isAuthenticated(): Promise<unknown>;
  signIn(): Promise<unknown>;
  getPlayerInfo(): Promise<unknown>;
}

/**
 * The native plugin in `android/app/src/main/java/com/tinytempo/app/PlayGamesPlugin.java`.
 * No web implementation is registered: in a browser this object exists but every call
 * rejects, which is why `boot.ts` never reaches this file off a native platform.
 */
const PlayGamesNative = registerPlugin<PlayGamesPlugin>('PlayGames');

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Anything crossing the bridge is JSON from another process, so it is validated rather
 * than cast — the same rule the billing bridge follows. A malformed answer reads as
 * signed out, which is the safe direction: it costs a cloud feature, never a grant.
 */
export function toStatus(value: unknown): PlayGamesStatus {
  if (typeof value !== 'object' || value === null) return SIGNED_OUT;
  const record = value as { authenticated?: unknown; reason?: unknown; playerId?: unknown; displayName?: unknown };
  const authenticated = record.authenticated === true;
  const reason = asString(record.reason) || 'unknown';
  if (!authenticated) return { authenticated: false, player: null, reason };
  const playerId = asString(record.playerId);
  const displayName = asString(record.displayName);
  return {
    authenticated: true,
    player: playerId.length > 0 ? { playerId, displayName } : null,
    reason,
  };
}

export function nativePlayGamesClient(): PlayGamesClient {
  return {
    isAuthenticated: async () => toStatus(await PlayGamesNative.isAuthenticated()),
    signIn: async () => toStatus(await PlayGamesNative.signIn()),
    getPlayerInfo: async () => toStatus(await PlayGamesNative.getPlayerInfo()),
  };
}
