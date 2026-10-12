import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ENDLESS } from '../src/config/endless';
import { LEADERBOARDS } from '../src/config/leaderboards';
import { ENDLESS_EVENTS } from '../src/monetization/analytics';
import { validEventName } from '../src/analytics/eventShape';
import {
  createEndlessLeaderboard, ENDLESS_BOARD_KEY, endlessLeaderboardId, endlessScore, endlessScoreTag, endlessSubmissionCopy, MAX_ENDLESS_SCORE,
  parseEndlessDayBest, pendingEndlessScore, recordEndlessDayBest,
  type EndlessLeaderboardDeps, type EndlessLeaderboardEvent,
} from '../src/playgames/endlessLeaderboard';
import {
  NOT_SUBMITTED, SIGNED_OUT, SNAPSHOT_FAILED, createPlayGames, stubPlayGames,
  type PlayGames, type PlayGamesClient, type PlayGamesStatus, type ScoreSubmission,
} from '../src/playgames/playGames';


vi.mock('phaser', () => ({ default: {} }));

const ID = 'CgkIq4Xk3_8TEAIQAg';
const TODAY = '2026-10-12';
const SIGNED_IN: PlayGamesStatus = { authenticated: true, player: null, reason: 'checked' };
const OK: ScoreSubmission = { submitted: true, newBest: true, reason: 'submitted' };

function memory(initial: Record<string, string> = {}): Storage & { readonly data: Record<string, string> } {
  const data: Record<string, string> = { ...initial };
  return {
    data,
    get length() { return Object.keys(data).length; },
    clear: () => { for (const key of Object.keys(data)) delete data[key]; },
    getItem: key => data[key] ?? null,
    key: i => Object.keys(data)[i] ?? null,
    removeItem: key => { delete data[key]; },
    setItem: (key, value) => { data[key] = String(value); },
  };
}

function client(over: Partial<PlayGamesClient> = {}) {
  const calls = { submit: [] as [string, number, string | null][], show: [] as string[], signIn: 0, refresh: 0 };
  const native: PlayGamesClient = {
    isAuthenticated: async () => { calls.refresh++; return SIGNED_IN; },
    signIn: async () => { calls.signIn++; return SIGNED_IN; },
    getPlayerInfo: async () => SIGNED_IN,
    submitScore: async (id, score, tag) => { calls.submit.push([id, score, tag]); return OK; },
    showLeaderboard: async (_id, span) => { calls.show.push(span); return { shown: true, reason: 'shown' }; },
    unlockAchievement: async () => ({ sent: true, reason: 'sent' }),
    showAchievements: async () => ({ shown: true, reason: 'shown' }),
    readSnapshot: async () => SNAPSHOT_FAILED('signed_out'),
    writeSnapshot: async () => SNAPSHOT_FAILED('signed_out'),
    resolveSnapshot: async () => SNAPSHOT_FAILED('signed_out'),
    ...over,
  };
  return { native, calls };
}

function board(over: Omit<Partial<EndlessLeaderboardDeps>, 'games'> & { games?: PlayGames } = {}) {
  const events: EndlessLeaderboardEvent[] = [];
  const storage = memory();
  const { games, ...rest } = over;
  const leaderboard = createEndlessLeaderboard({
    games: () => games ?? stubPlayGames,
    id: ID,
    rulesVersion: 1,
    storage,
    today: () => TODAY,
    report: e => { events.push(e); },
    native: () => games !== undefined,
    timeoutMs: 50,
    ...rest,
  });
  return { leaderboard, events, storage };
}

async function signedIn(over: Partial<PlayGamesClient> = {}) {
  const c = client(over);
  const games = createPlayGames(c.native);
  await games.refresh();
  c.calls.refresh = 0;
  return { games, calls: c.calls };
}

beforeEach(() => vi.useRealTimers());

describe('the score', () => {
  it('is the survival time in whole milliseconds, within the ruleset ceiling', () => {
    expect(endlessScore(66_032)).toBe(66032);
    expect(endlessScore(0)).toBe(0);
    expect(MAX_ENDLESS_SCORE).toBe(ENDLESS.maxRunMs);
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, MAX_ENDLESS_SCORE + 1]) expect(endlessScore(bad)).toBeNull();
  });

  it('is tagged with the ruleset and the Play Games day', () => {
    expect(endlessScoreTag(1, TODAY)).toBe('r1-2026-10-12');
    expect(endlessScoreTag(1, 'today')).toBeNull();
    expect(endlessScoreTag(-1, TODAY)).toBeNull();
    expect(endlessScoreTag(1, TODAY)!.length).toBeLessThanOrEqual(64);
    expect(endlessScoreTag(1, TODAY)).toMatch(/^[A-Za-z0-9_.~-]+$/);
  });

  it('has its own leaderboard, empty until the Console creates it, never Daily Tempo\'s', () => {
    expect(endlessLeaderboardId(LEADERBOARDS.endless)).toBeNull();
    expect(LEADERBOARDS.endless).not.toBe(LEADERBOARDS.dailyTempo);
    expect(endlessLeaderboardId('863268283344')).toBeNull();
    expect(endlessLeaderboardId(ID)).toBe(ID);
  });
});

describe('the day\'s best', () => {
  it('keeps the best of the day, and starts over on a new day', () => {
    const first = recordEndlessDayBest(null, TODAY, 60_000);
    expect(first).toEqual({ next: { day: TODAY, best: 60_000, submitted: -1 }, improved: true });
    expect(recordEndlessDayBest(first.next, TODAY, 50_000)).toEqual({ next: first.next, improved: false });
    expect(recordEndlessDayBest(first.next, TODAY, 60_000).improved).toBe(false);
    expect(recordEndlessDayBest(first.next, TODAY, 61_000).next.best).toBe(61_000);
    const tomorrow = recordEndlessDayBest(first.next, '2026-10-13', 1_000);
    expect(tomorrow.next).toEqual({ day: '2026-10-13', best: 1_000, submitted: -1 });
  });

  it('owes Play Games only today\'s unsent best: yesterday\'s is never posted as today\'s', () => {
    expect(pendingEndlessScore({ day: TODAY, best: 60_000, submitted: -1 }, TODAY)).toBe(60_000);
    expect(pendingEndlessScore({ day: TODAY, best: 60_000, submitted: 60_000 }, TODAY)).toBeNull();
    expect(pendingEndlessScore({ day: '2026-10-11', best: 600_000, submitted: -1 }, TODAY)).toBeNull();
    expect(pendingEndlessScore(null, TODAY)).toBeNull();
  });

  it('is read defensively from its own key', () => {
    expect(ENDLESS_BOARD_KEY).toBe('tiny-tempo.endless-board.v1');
    expect(ENDLESS_BOARD_KEY).not.toBe('tiny-tempo.daily-tempo-best.v1');
    expect(parseEndlessDayBest(JSON.stringify({ version: 1, day: TODAY, best: 5, submitted: 9 }))).toEqual({ day: TODAY, best: 5, submitted: 5 });
    for (const junk of ['', 'x', '[]', JSON.stringify({ day: 'today', best: 1, submitted: -1 }), JSON.stringify({ day: TODAY, best: 1.5, submitted: -1 }),
      JSON.stringify({ day: TODAY, best: MAX_ENDLESS_SCORE + 1, submitted: -1 }), JSON.stringify({ day: TODAY, best: -1, submitted: -1 })]) {
      expect(parseEndlessDayBest(junk)).toBeNull();
    }
  });
});

describe('recording a run', () => {
  it('sends a new best at once, tagged, and keeps the day\'s record', async () => {
    const { games, calls } = await signedIn();
    const { leaderboard, events, storage } = board({ games });
    await expect(leaderboard.record({ day: TODAY, elapsedMs: 66_032 })).resolves.toEqual({ kind: 'submitted', score: 66032, newBest: true });
    expect(calls.submit).toEqual([[ID, 66032, 'r1-2026-10-12']]);
    expect(JSON.parse(storage.data[ENDLESS_BOARD_KEY]!)).toEqual({ version: 1, day: TODAY, best: 66032, submitted: 66032 });
    expect(events).toEqual([{ event: 'endless_score_posted', durationMs: 66032, newBest: true, retry: false }]);
    // A shorter run the same day sends nothing.
    await expect(leaderboard.record({ day: TODAY, elapsedMs: 40_000 })).resolves.toEqual({ kind: 'skipped', reason: 'not_better' });
    expect(calls.submit).toHaveLength(1);
  });

  it('never sends a time that is not a ranked time', async () => {
    const { games, calls } = await signedIn();
    const { leaderboard } = board({ games });
    for (const elapsedMs of [-1, 1.5, Number.NaN, MAX_ENDLESS_SCORE + 1]) {
      await expect(leaderboard.record({ day: TODAY, elapsedMs })).resolves.toEqual({ kind: 'skipped', reason: 'invalid' });
    }
    await expect(leaderboard.record({ day: 'someday', elapsedMs: 1000 })).resolves.toEqual({ kind: 'skipped', reason: 'invalid' });
    expect(calls.submit).toEqual([]);
  });

  it('keeps a best that could not be sent, and sends it on a retry the same day', async () => {
    let online = false;
    const { games, calls } = await signedIn({ submitScore: async (id, score, tag) => { if (!online) return NOT_SUBMITTED('offline'); calls.submit.push([id, score, tag]); return OK; } });
    const { leaderboard, events } = board({ games });
    const first = await leaderboard.record({ day: TODAY, elapsedMs: 90_000 });
    expect(first).toEqual({ kind: 'failed', score: 90000, reason: 'offline' });
    expect(endlessSubmissionCopy(first)).toBe('Will post when you are back online today');
    expect(leaderboard.best()).toEqual({ day: TODAY, best: 90000, submitted: -1 });
    online = true;
    await expect(leaderboard.retry()).resolves.toEqual({ kind: 'submitted', score: 90000, newBest: true });
    expect(calls.submit).toEqual([[ID, 90000, 'r1-2026-10-12']]);
    expect(events.map(e => e.event)).toEqual(['endless_score_failed', 'endless_score_posted']);
    expect(events[1]).toMatchObject({ retry: true });
    await expect(leaderboard.retry()).resolves.toEqual({ kind: 'skipped', reason: 'nothing_pending' });
  });

  it('drops a pending best once the Play Games day has turned, rather than posting it to the wrong day', async () => {
    const { games, calls } = await signedIn({ submitScore: async () => NOT_SUBMITTED('offline') });
    let today = TODAY;
    const { leaderboard } = board({ games, today: () => today });
    await leaderboard.record({ day: TODAY, elapsedMs: 600_000 });
    today = '2026-10-13';
    const later = await signedIn();
    const next = createEndlessLeaderboard({
      games: () => later.games, id: ID, rulesVersion: 1, storage: memory({ [ENDLESS_BOARD_KEY]: JSON.stringify({ version: 1, day: TODAY, best: 600_000, submitted: -1 }) }),
      today: () => today, report: () => undefined, native: () => true, timeoutMs: 50,
    });
    await expect(next.retry()).resolves.toEqual({ kind: 'skipped', reason: 'nothing_pending' });
    expect(later.calls.submit).toEqual([]);
    expect(calls.submit).toEqual([]);
    // A new run on the new day posts as the new day's.
    await expect(next.record({ day: today, elapsedMs: 30_000 })).resolves.toEqual({ kind: 'submitted', score: 30000, newBest: true });
    expect(later.calls.submit).toEqual([[ID, 30000, 'r1-2026-10-13']]);
  });

  it('sends nothing for a signed-out player, and does not prompt', async () => {
    const c = client({ isAuthenticated: async () => SIGNED_OUT, signIn: async () => { throw new Error('must not prompt'); } });
    const { leaderboard, events } = board({ games: createPlayGames(c.native) });
    const outcome = await leaderboard.record({ day: TODAY, elapsedMs: 70_000 });
    expect(outcome).toEqual({ kind: 'skipped', reason: 'signed_out' });
    expect(endlessSubmissionCopy(outcome)).toBe('Sign in to Play Games to post your time');
    expect(c.calls.submit).toEqual([]);
    expect(events).toEqual([]);
    expect(leaderboard.best()).toEqual({ day: TODAY, best: 70000, submitted: -1 });
  });

  it('does nothing in a browser or without an id, and keeps the best locally', async () => {
    const browser = board();
    await expect(browser.leaderboard.record({ day: TODAY, elapsedMs: 70_000 })).resolves.toEqual({ kind: 'skipped', reason: 'unavailable' });
    expect(browser.leaderboard.available).toBe(false);
    expect(browser.leaderboard.best()!.best).toBe(70000);
    const { games } = await signedIn();
    const off = board({ games, id: null });
    await expect(off.leaderboard.record({ day: TODAY, elapsedMs: 70_000 })).resolves.toEqual({ kind: 'skipped', reason: 'unconfigured' });
    expect(off.leaderboard.available).toBe(false);
  });

  it('gives up on a submission that never answers, and keeps it pending', async () => {
    const { games, calls } = await signedIn({ submitScore: () => new Promise(() => undefined) });
    const { leaderboard } = board({ games, timeoutMs: 20 });
    await expect(leaderboard.record({ day: TODAY, elapsedMs: 70_000 })).resolves.toEqual({ kind: 'failed', score: 70000, reason: 'timeout' });
    expect(calls.submit).toEqual([]);
    expect(leaderboard.best()).toEqual({ day: TODAY, best: 70000, submitted: -1 });
  });

  it('runs one submission at a time, and a better run recorded mid-flight stays pending', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const { games, calls } = await signedIn({ submitScore: async (id, score, tag) => { calls.submit.push([id, score, tag]); await gate; return OK; } });
    const { leaderboard } = board({ games, timeoutMs: 5000 });
    const first = leaderboard.record({ day: TODAY, elapsedMs: 50_000 });
    const second = leaderboard.record({ day: TODAY, elapsedMs: 80_000 });
    release();
    await Promise.all([first, second]);
    expect(calls.submit.map(([, score]) => score)).toEqual([50000, 80000]);
    expect(leaderboard.best()).toEqual({ day: TODAY, best: 80000, submitted: 80000 });
  });
});

describe('opening the board', () => {
  it('opens the weekly view for a signed-in player without a prompt, and sends anything owed', async () => {
    const { games, calls } = await signedIn();
    const { leaderboard, events, storage } = board({ games });
    storage.setItem(ENDLESS_BOARD_KEY, JSON.stringify({ version: 1, day: TODAY, best: 90_000, submitted: -1 }));
    await expect(leaderboard.open()).resolves.toEqual({ result: 'shown', signedIn: true });
    expect(calls.show).toEqual(['weekly']);
    expect(calls.signIn).toBe(0);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(calls.submit).toEqual([[ID, 90000, 'r1-2026-10-12']]);
    expect(events[0]).toEqual({ event: 'endless_board_opened', result: 'shown', signIn: false });
  });

  it('offers sign-in only here, and reports a decline', async () => {
    let status: PlayGamesStatus = SIGNED_OUT;
    const c = client({ isAuthenticated: async () => status, signIn: async () => { c.calls.signIn++; status = SIGNED_IN; return SIGNED_IN; } });
    const { leaderboard } = board({ games: createPlayGames(c.native) });
    await expect(leaderboard.open()).resolves.toEqual({ result: 'shown', signedIn: true });
    expect(c.calls.signIn).toBe(1);
    const declines = client({ isAuthenticated: async () => SIGNED_OUT, signIn: async () => SIGNED_OUT });
    const d = board({ games: createPlayGames(declines.native) });
    await expect(d.leaderboard.open()).resolves.toEqual({ result: 'signed_out', signedIn: false });
    expect(d.events).toEqual([{ event: 'endless_board_opened', result: 'signed_out', signIn: true }]);
  });

  it('is unconfigured without an id and unavailable in a browser', async () => {
    const { games } = await signedIn();
    await expect(board({ games, id: null }).leaderboard.open()).resolves.toEqual({ result: 'unconfigured', signedIn: false });
    await expect(board().leaderboard.open()).resolves.toEqual({ result: 'unavailable', signedIn: false });
  });
});

describe('the analytics it reports', () => {
  it('are names Firebase will keep, beside Daily Tempo\'s', () => {
    for (const event of ENDLESS_EVENTS) expect(validEventName(event), event).toBe(true);
    expect(ENDLESS_EVENTS).toContain('endless_score_posted');
    expect(ENDLESS_EVENTS).toContain('endless_board_opened');
  });
});
