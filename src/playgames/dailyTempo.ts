import { DAILY_TEMPO_AVAILABLE } from '@/config/dailyTempo';
import { LEADERBOARDS } from '@/config/leaderboards';
import { dailyTempoDay } from '@/game/dayKey';
import { track } from '@/monetization/analytics';
import { playGames } from './boot';
import { createDailyTempoLeaderboard, leaderboardId, type DailyTempoLeaderboard, type LeaderboardEvent } from './leaderboard';
import { stubPlayGames } from './playGames';

/**
 * The Daily Tempo leaderboard, wired to the game: the configured id, the installed Play
 * Games adapter, local storage and the analytics bus. Scenes use this and nothing below it
 * — no scene names a leaderboard id or talks to the plugin.
 *
 * **The Daily Tempo mode calls two things.** When a run finishes, `recordDailyTempo(...)`,
 * without awaiting it: the result screen never waits on Play Games. Its leaderboard button
 * calls `openDailyTempoLeaderboard()`, and is shown only when
 * `dailyTempoLeaderboardOffered()` says it can do something.
 */

const LEADERBOARD = 'daily_tempo';

/**
 * The day a Daily Tempo result belongs to is `game/dayKey.ts`'s: one function, shared by the
 * mode, the rewards, the best kept for the day and the leaderboard, so none of them can
 * disagree about "today". Re-exported here so the leaderboard's callers keep one import.
 */
export { dailyTempoDay };

function report(event: LeaderboardEvent): void {
  const flag = (value: boolean): 0 | 1 => (value ? 1 : 0);
  switch (event.event) {
    case 'leaderboard_score_submitted':
      track('leaderboard_score_submitted', { leaderboard: LEADERBOARD, accuracy: event.accuracy, new_best: flag(event.newBest), retry: flag(event.retry) });
      return;
    case 'leaderboard_submit_failed': {
      // `signed_out` never reaches here: the leaderboard does not report the player's choice.
      const reason = event.reason === 'signed_out' ? 'failed' : event.reason;
      track('leaderboard_submit_failed', { leaderboard: LEADERBOARD, reason, retry: flag(event.retry) });
      return;
    }
    case 'leaderboard_opened':
      track('leaderboard_opened', { leaderboard: LEADERBOARD, result: event.result, sign_in: flag(event.signIn) });
  }
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

let instance: DailyTempoLeaderboard | null = null;

export function dailyTempoLeaderboard(): DailyTempoLeaderboard {
  instance ??= createDailyTempoLeaderboard({
    games: playGames,
    id: leaderboardId(LEADERBOARDS.dailyTempo),
    storage: safeStorage(),
    today: () => dailyTempoDay(),
    report,
    // The browser keeps the stub; only a native build installs anything else.
    native: () => playGames() !== stubPlayGames,
  });
  return instance;
}

/** Whether the leaderboard button should exist on this build, right now. */
export function dailyTempoLeaderboardOffered(): boolean {
  return DAILY_TEMPO_AVAILABLE && dailyTempoLeaderboard().available;
}

/** A finished Daily Tempo run. Fire and forget: `void recordDailyTempo(...)`. */
export function recordDailyTempo(accuracy: number, now: number = Date.now()) {
  return dailyTempoLeaderboard().record({ day: dailyTempoDay(now), accuracy });
}

export function openDailyTempoLeaderboard() {
  return dailyTempoLeaderboard().open();
}
