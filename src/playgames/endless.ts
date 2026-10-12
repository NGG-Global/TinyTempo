import { ENDLESS } from '@/config/endless';
import { LEADERBOARDS } from '@/config/leaderboards';
import { track } from '@/monetization/analytics';
import { playGames } from './boot';
import { dailyTempoDay } from './dailyTempo';
import { createEndlessLeaderboard, endlessLeaderboardId, type EndlessLeaderboard, type EndlessLeaderboardEvent } from './endlessLeaderboard';
import { stubPlayGames } from './playGames';

/**
 * The Endless Survival leaderboard, wired to the game: the configured id, the installed
 * Play Games adapter, local storage and the analytics bus. Scenes use this and nothing
 * below it — no scene names a leaderboard id or talks to the plugin.
 *
 * **The mode calls three things.** When a valid run finishes, `recordEndlessScore(ms)`,
 * without awaiting it: the result screen never waits on Play Games. Its leaderboard
 * button calls `openEndlessLeaderboard()`, and is shown only when
 * `endlessLeaderboardOffered()` says it can do something. Boot calls `retry()` once the
 * player is signed in, for a time that could not be sent when it was played.
 *
 * The day is Play Games' own daily clock, the one Daily Tempo reads (`dailyTempoDay`): a
 * pending time is only ever sent on the day it was played, because the board files a
 * submission into the daily and weekly windows current when it arrives.
 */

function report(event: EndlessLeaderboardEvent): void {
  const flag = (value: boolean): 0 | 1 => (value ? 1 : 0);
  switch (event.event) {
    case 'endless_score_posted':
      track('endless_score_posted', { duration_ms: event.durationMs, new_best: flag(event.newBest), retry: flag(event.retry), rules_version: ENDLESS.rulesVersion });
      return;
    case 'endless_score_failed': {
      // `signed_out` never reaches here: the leaderboard does not report the player's choice.
      const reason = event.reason === 'signed_out' ? 'failed' : event.reason;
      track('endless_score_failed', { reason, retry: flag(event.retry) });
      return;
    }
    case 'endless_board_opened':
      track('endless_board_opened', { result: event.result, sign_in: flag(event.signIn) });
  }
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

let instance: EndlessLeaderboard | null = null;

export function endlessLeaderboard(): EndlessLeaderboard {
  instance ??= createEndlessLeaderboard({
    games: playGames,
    id: endlessLeaderboardId(LEADERBOARDS.endless),
    rulesVersion: ENDLESS.rulesVersion,
    storage: safeStorage(),
    today: () => dailyTempoDay(),
    report,
    // The browser keeps the stub; only a native build installs anything else.
    native: () => playGames() !== stubPlayGames,
  });
  return instance;
}

/** Whether the leaderboard button should exist on this build, right now. */
export function endlessLeaderboardOffered(): boolean {
  return ENDLESS.available && endlessLeaderboard().available;
}

/** A finished, valid run. Fire and forget: `void recordEndlessScore(ms)`. */
export function recordEndlessScore(elapsedMs: number, now: number = Date.now()) {
  return endlessLeaderboard().record({ day: dailyTempoDay(now), elapsedMs });
}

export function openEndlessLeaderboard() {
  return endlessLeaderboard().open();
}
