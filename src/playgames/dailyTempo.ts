import { DAILY_TEMPO_AVAILABLE } from '@/config/dailyTempo';
import { LEADERBOARDS, PGS_DAILY_RESET_UTC_OFFSET_HOURS } from '@/config/leaderboards';
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
 * The day a Daily Tempo result belongs to. **One function**, shared by the mode, the best
 * kept for the day and the leaderboard, so none of them can disagree about "today".
 *
 * It is the date on Play Games' own daily clock, UTC−7 all year, not the player's local
 * date. A daily leaderboard is one board for everyone: keyed to local midnight, a player
 * in Tokyo and one in London would be posting different days' charts onto the same daily
 * view, and a best kept until local midnight would be sent after Play Games had already
 * started the next day's board. On this clock the chart, the local best and the board all
 * turn over together. (The daily heart and the daily objectives stay on local time: they
 * are the player's own day, not a shared one.)
 */
export function dailyTempoDay(now: number = Date.now()): string {
  const shifted = new Date(now + PGS_DAILY_RESET_UTC_OFFSET_HOURS * 3_600_000);
  const y = shifted.getUTCFullYear(), m = shifted.getUTCMonth() + 1, d = shifted.getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

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
