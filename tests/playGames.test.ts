import { describe, expect, it, vi } from 'vitest';
import {
  createPlayGames, NOT_SHOWN, NOT_SUBMITTED, SIGNED_OUT, stubPlayGames, type PlayGamesClient, type PlayGamesStatus,
} from '../src/playgames/playGames';

const signedIn = (player = { playerId: 'p-1', displayName: 'Ada' }): PlayGamesStatus =>
  ({ authenticated: true, player, reason: 'checked' });

function client(overrides: Partial<PlayGamesClient> = {}): PlayGamesClient {
  return {
    isAuthenticated: async () => SIGNED_OUT,
    signIn: async () => SIGNED_OUT,
    getPlayerInfo: async () => SIGNED_OUT,
    submitScore: async () => NOT_SUBMITTED('signed_out'),
    showLeaderboard: async () => NOT_SHOWN('signed_out'),
    ...overrides,
  };
}

describe('the browser and a build with no plugin', () => {
  it('cannot report anyone as signed in', async () => {
    // The property that stops a development mock standing in for Play Games in a release.
    expect(stubPlayGames.status.authenticated).toBe(false);
    await expect(stubPlayGames.refresh()).resolves.toEqual(SIGNED_OUT);
    await expect(stubPlayGames.signIn()).resolves.toEqual(SIGNED_OUT);
    await expect(stubPlayGames.player()).resolves.toBeNull();
  });
});

describe('asking Play Games whether the player is signed in', () => {
  it('starts signed out and does not ask the platform to find that out', () => {
    const isAuthenticated = vi.fn(async () => signedIn());
    const games = createPlayGames(client({ isAuthenticated }));
    expect(games.status).toEqual(SIGNED_OUT);
    expect(isAuthenticated).not.toHaveBeenCalled();
  });

  it('remembers what the last answer was', async () => {
    const games = createPlayGames(client({ isAuthenticated: async () => signedIn() }));
    await games.refresh();
    expect(games.status.authenticated).toBe(true);
    expect(games.status.player).toEqual({ playerId: 'p-1', displayName: 'Ada' });
  });

  it('treats a call that throws as a player who is not signed in', async () => {
    // Play Games is never required, so a plugin that rejects costs a cloud feature and
    // nothing else — it must not surface as an error the game has to handle.
    const games = createPlayGames(client({
      isAuthenticated: async () => { throw new Error('no plugin'); },
      signIn: async () => { throw new Error('no plugin'); },
      getPlayerInfo: async () => { throw new Error('no plugin'); },
    }));
    await expect(games.refresh()).resolves.toEqual(SIGNED_OUT);
    await expect(games.signIn()).resolves.toEqual(SIGNED_OUT);
    await expect(games.player()).resolves.toBeNull();
    expect(games.status.authenticated).toBe(false);
  });

  it('drops the remembered player when a later answer says signed out', async () => {
    let status = signedIn();
    const games = createPlayGames(client({ isAuthenticated: async () => status }));
    await games.refresh();
    status = { authenticated: false, player: null, reason: 'declined' };
    await games.refresh();
    expect(games.status).toEqual({ authenticated: false, player: null, reason: 'declined' });
  });
});

describe('the manual retry', () => {
  it('is the only thing that asks Play Games to show a player anything', async () => {
    const signIn = vi.fn(async () => signedIn());
    const games = createPlayGames(client({ signIn }));
    await games.refresh();
    expect(signIn).not.toHaveBeenCalled();
    await games.signIn();
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(games.status.authenticated).toBe(true);
  });
});

describe('the player', () => {
  it('is fetched once and then remembered', async () => {
    const getPlayerInfo = vi.fn(async () => signedIn());
    const games = createPlayGames(client({ getPlayerInfo }));
    expect(await games.player()).toEqual({ playerId: 'p-1', displayName: 'Ada' });
    expect(await games.player()).toEqual({ playerId: 'p-1', displayName: 'Ada' });
    expect(getPlayerInfo).toHaveBeenCalledTimes(1);
  });

  it('survives a later status that is authenticated but carries no player', async () => {
    // `isAuthenticated` answers yes without a player; that must not throw away an id a
    // future Saved Games snapshot is keyed on.
    const games = createPlayGames(client({
      getPlayerInfo: async () => signedIn(),
      isAuthenticated: async () => ({ authenticated: true, player: null, reason: 'checked' }),
    }));
    await games.player();
    await games.refresh();
    expect(games.status.player).toEqual({ playerId: 'p-1', displayName: 'Ada' });
  });

  it('is null when nobody is signed in', async () => {
    const games = createPlayGames(client());
    expect(await games.player()).toBeNull();
  });
});

describe('what crosses the bridge', () => {
  it('is validated rather than trusted, and reads as signed out when malformed', async () => {
    const { toStatus } = await import('../src/playgames/native');
    // A malformed answer must fail toward signed out: it costs a cloud feature, never a
    // grant, and the same rule already governs the billing bridge.
    expect(toStatus(null)).toEqual(SIGNED_OUT);
    expect(toStatus('yes')).toEqual(SIGNED_OUT);
    expect(toStatus({})).toEqual({ authenticated: false, player: null, reason: 'unknown' });
    expect(toStatus({ authenticated: 'true' })).toEqual({ authenticated: false, player: null, reason: 'unknown' });
    expect(toStatus({ authenticated: 1, playerId: 'p-1' })).toEqual({ authenticated: false, player: null, reason: 'unknown' });
  });

  it('keeps an authenticated answer even when it carries no player', async () => {
    const { toStatus } = await import('../src/playgames/native');
    expect(toStatus({ authenticated: true, reason: 'checked' }))
      .toEqual({ authenticated: true, player: null, reason: 'checked' });
    expect(toStatus({ authenticated: true, reason: 'player', playerId: 'p-1', displayName: 'Ada' }))
      .toEqual({ authenticated: true, player: { playerId: 'p-1', displayName: 'Ada' }, reason: 'player' });
    // A player with an id but no name is still a player a snapshot can be keyed on.
    expect(toStatus({ authenticated: true, reason: 'player', playerId: 'p-1' }))
      .toEqual({ authenticated: true, player: { playerId: 'p-1', displayName: '' }, reason: 'player' });
  });
});
