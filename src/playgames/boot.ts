import { Capacitor } from '@capacitor/core';

import { breadcrumb } from '@/core/errors';
import { createPlayGames, stubPlayGames, type PlayGames } from './playGames';

let installed: PlayGames = stubPlayGames;

/** Whatever is installed. The stub until a native build says otherwise. */
export function playGames(): PlayGames {
  return installed;
}

/**
 * Native-only: attach the Play Games adapter and ask whether v2 already signed the
 * player in.
 *
 * `Capacitor.isNativePlatform()` is the whole of the line between a browser and a device,
 * exactly as it is for monetization. The browser keeps the stub, and the stub cannot
 * report anyone as authenticated, so a development mock can never stand in for Play Games
 * in a release.
 *
 * Nothing awaits this and nothing depends on it. Play Games arriving late, failing, or
 * never arriving at all leaves the game precisely as it was.
 */
export async function bootPlayGames(): Promise<void> {
  try {
    if (!Capacitor.isNativePlatform()) return;
    const { nativePlayGamesClient } = await import('./native');
    const adapter = createPlayGames(nativePlayGamesClient());
    installed = adapter;
    // v2 signs in on its own when the SDK initializes, so the first question is only
    // whether that already happened. The player is not asked for anything here.
    const status = await adapter.refresh();
    // The status, never the player id: a breadcrumb rides along on crash reports.
    breadcrumb('play games', { authenticated: status.authenticated, reason: status.reason });
    // A Daily Tempo best that could not be sent earlier — offline, or before sign-in —
    // goes now. Loaded lazily and never awaited by anything: it cannot slow the boot.
    // Its own try: the outer catch puts the stub back, and a leaderboard problem must never
    // cost the player a sign-in that already succeeded.
    if (status.authenticated) {
      try {
        const { dailyTempoLeaderboard } = await import('./dailyTempo');
        void dailyTempoLeaderboard().retry();
      } catch { /* the best stays pending for the next chance */ }
    }
  } catch {
    // Stub stays. A missing plugin must not take the game down.
    installed = stubPlayGames;
  }
}
