/**
 * Play Games Services, as the game sees it.
 *
 * Pure: no Capacitor import, no native code, so it tests under node like the billing
 * adapter it is modelled on. The native client is injected, which is also what keeps the
 * browser's inert version from ever being mistaken for the real one — the stub is a
 * different object, not a flag on this one.
 *
 * **Play Games is never required to play Tiny Tempo.** Every path here resolves to "not
 * signed in" rather than throwing, because the whole of this module is an enhancement
 * over a game that already works: local progress, purchases and play are untouched by
 * whether a player has Play Games, a network, or an account at all.
 */

/** What the native side can tell us about the signed-in player. */
export interface PlayerInfo {
  readonly playerId: string;
  readonly displayName: string;
}

export interface PlayGamesStatus {
  readonly authenticated: boolean;
  /** The player, when signed in and `getPlayerInfo` has been asked. Never logged. */
  readonly player: PlayerInfo | null;
  /** Why the last answer was what it was. Diagnostic only; never shown to a player. */
  readonly reason: string;
}

/**
 * Why a score did or did not reach Play Games. A closed set, so it can ride on analytics:
 * `offline` is a network failure the game will retry, `signed_out` a player who is not
 * signed in, `invalid` a leaderboard id or score the native side refused to send.
 */
export type SubmitReason = 'submitted' | 'signed_out' | 'offline' | 'timeout' | 'failed' | 'invalid' | 'unavailable';

export interface ScoreSubmission {
  readonly submitted: boolean;
  /** Play Games' own word that this beat the player's best on the daily view. */
  readonly newBest: boolean;
  readonly reason: SubmitReason;
}

export type LeaderboardReason = 'shown' | 'signed_out' | 'failed' | 'invalid' | 'unavailable';

export interface LeaderboardView {
  readonly shown: boolean;
  readonly reason: LeaderboardReason;
}

/**
 * The views Play Games keeps of every leaderboard by itself: one leaderboard is daily,
 * weekly and all-time at once, so the game never needs a second one per timespan.
 */
export type LeaderboardSpan = 'daily' | 'weekly' | 'all_time';

export const NOT_SUBMITTED = (reason: Exclude<SubmitReason, 'submitted'>): ScoreSubmission =>
  Object.freeze({ submitted: false, newBest: false, reason });
export const NOT_SHOWN = (reason: Exclude<LeaderboardReason, 'shown'>): LeaderboardView =>
  Object.freeze({ shown: false, reason });

/** The calls the native plugin answers. Each resolves; none rejects. */
export interface PlayGamesClient {
  isAuthenticated(): Promise<PlayGamesStatus>;
  signIn(): Promise<PlayGamesStatus>;
  getPlayerInfo(): Promise<PlayGamesStatus>;
  /** `tag` is optional metadata stored with the score: at most 64 URI-safe characters. */
  submitScore(leaderboardId: string, score: number, tag: string | null): Promise<ScoreSubmission>;
  showLeaderboard(leaderboardId: string, span: LeaderboardSpan): Promise<LeaderboardView>;
}

export interface PlayGames {
  /** The last known status, without asking the platform again. */
  readonly status: PlayGamesStatus;
  /** Ask whether v2's automatic sign-in has already succeeded. */
  refresh(): Promise<PlayGamesStatus>;
  /** The manual retry, for a player who declined or whose first attempt failed. */
  signIn(): Promise<PlayGamesStatus>;
  /** The player's id and name, fetched once and then remembered. */
  player(): Promise<PlayerInfo | null>;
  /** Send a score. Never prompts, never rejects: a failure is a reason, not an error. */
  submitScore(leaderboardId: string, score: number, tag?: string | null): Promise<ScoreSubmission>;
  /** Open Play Games' own leaderboard screen. Never rejects. */
  showLeaderboard(leaderboardId: string, span?: LeaderboardSpan): Promise<LeaderboardView>;
}

export const SIGNED_OUT: PlayGamesStatus = Object.freeze({
  authenticated: false, player: null, reason: 'unavailable',
});

/**
 * The inert implementation: what a browser gets, and what a native build falls back to
 * when the plugin is missing. It cannot report anyone as signed in, which is the property
 * that stops a development mock standing in for Play Games in a release.
 */
export const stubPlayGames: PlayGames = Object.freeze({
  status: SIGNED_OUT,
  refresh: () => Promise.resolve(SIGNED_OUT),
  signIn: () => Promise.resolve(SIGNED_OUT),
  player: () => Promise.resolve(null),
  submitScore: () => Promise.resolve(NOT_SUBMITTED('unavailable')),
  showLeaderboard: () => Promise.resolve(NOT_SHOWN('unavailable')),
});

export function createPlayGames(client: PlayGamesClient): PlayGames {
  let current: PlayGamesStatus = SIGNED_OUT;

  /** A call that throws is the same answer as a player who is not signed in. */
  const ask = async (call: () => Promise<PlayGamesStatus>): Promise<PlayGamesStatus> => {
    try {
      const next = await call();
      // A status that loses the player it already had would make `player()` re-ask for
      // something the platform has already given us.
      current = next.authenticated && next.player === null && current.player !== null
        ? { ...next, player: current.player }
        : next;
    } catch {
      current = SIGNED_OUT;
    }
    return current;
  };

  return {
    get status() { return current; },
    refresh: () => ask(() => client.isAuthenticated()),
    signIn: () => ask(() => client.signIn()),
    async player() {
      if (current.player) return current.player;
      const status = await ask(() => client.getPlayerInfo());
      return status.player;
    },
    async submitScore(leaderboardId, score, tag = null) {
      try {
        const result = await client.submitScore(leaderboardId, score, tag);
        // Play Games answering "not signed in" is news about the session as well.
        if (result.reason === 'signed_out') current = { ...SIGNED_OUT, reason: 'signed out' };
        return result;
      } catch {
        return NOT_SUBMITTED('failed');
      }
    },
    async showLeaderboard(leaderboardId, span = 'daily') {
      try {
        return await client.showLeaderboard(leaderboardId, span);
      } catch {
        return NOT_SHOWN('failed');
      }
    },
  };
}
