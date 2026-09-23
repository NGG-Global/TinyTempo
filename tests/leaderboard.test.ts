import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LEADERBOARD_SCALE, MAX_LEADERBOARD_SCORE, accuracyFromScore, createDailyTempoLeaderboard, leaderboardId, leaderboardScore,
  parseDailyBest, pendingScore, recordBest, scoreTag, submissionCopy,
  type LeaderboardDeps, type LeaderboardEvent,
} from '../src/playgames/leaderboard';
import {
  NOT_SHOWN, NOT_SUBMITTED, SIGNED_OUT, createPlayGames, stubPlayGames,
  type PlayGames, type PlayGamesClient, type PlayGamesStatus, type ScoreSubmission,
} from '../src/playgames/playGames';
import { LEADERBOARDS, PGS_DAILY_RESET_UTC_OFFSET_HOURS } from '../src/config/leaderboards';
import { DAILY_TEMPO_AVAILABLE } from '../src/config/dailyTempo';
import { ANALYTICS_EVENTS, SERVICE_EVENTS } from '../src/monetization/analytics';
import { validEventName, validName } from '../src/analytics/eventShape';

const ID = 'CgkIq4Xk3_8TEAIQAQ';
const TODAY = '2026-09-23';
const KEY = 'tiny-tempo.daily-tempo-best.v1';
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

/** A native client whose every answer can be scripted, and every call counted. */
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
    ...over,
  };
  return { native, calls };
}

function board(over: Omit<Partial<LeaderboardDeps>, 'games'> & { games?: PlayGames } = {}) {
  const events: LeaderboardEvent[] = [];
  const storage = memory();
  const { games, ...rest } = over;
  const leaderboard = createDailyTempoLeaderboard({
    games: () => games ?? stubPlayGames,
    id: ID,
    storage,
    today: () => TODAY,
    report: e => { events.push(e); },
    native: () => games !== undefined,
    timeoutMs: 50,
    ...rest,
  });
  return { leaderboard, events, storage };
}

/** A signed-in adapter over a scripted client. */
async function signedIn(over: Partial<PlayGamesClient> = {}) {
  const c = client(over);
  const games = createPlayGames(c.native);
  await games.refresh();
  c.calls.refresh = 0;
  return { games, calls: c.calls };
}

beforeEach(() => vi.useRealTimers());

describe('the score', () => {
  it('is the accuracy in thousandths of a percent, a whole number from 0 to 100 000', () => {
    expect(LEADERBOARD_SCALE).toBe(1000);
    expect(leaderboardScore(0)).toBe(0);
    expect(leaderboardScore(100)).toBe(100_000);
    expect(leaderboardScore(98.765)).toBe(98_765);
    expect(leaderboardScore(98.7654)).toBe(98_765);
    expect(leaderboardScore(72.5)).toBe(72_500);
    expect(MAX_LEADERBOARD_SCORE).toBe(100_000);
    for (let i = 0; i <= 1000; i++) expect(Number.isInteger(leaderboardScore(i / 10.3))).toBe(true);
  });

  it('rounds a half up even where binary floating point lands just below it', () => {
    // 0.5005 × 1000 is 500.49999999999994; the score is still 501.
    expect(0.5005 * 1000).toBeLessThan(500.5);
    expect(leaderboardScore(0.5005)).toBe(501);
    expect(leaderboardScore(98.7655)).toBe(98_766);
  });

  it('never orders two accuracies the other way round', () => {
    let previous = -1;
    for (let a = 0; a <= 100; a += 0.0137) {
      const score = leaderboardScore(a)!;
      expect(score).toBeGreaterThanOrEqual(previous);
      previous = score;
    }
  });

  it('clamps to the percentage range and refuses what is not a result', () => {
    expect(leaderboardScore(-4)).toBe(0);
    expect(leaderboardScore(140)).toBe(100_000);
    for (const bad of [Number.NaN, Infinity, -Infinity, '90' as unknown as number]) expect(leaderboardScore(bad)).toBeNull();
    expect(accuracyFromScore(98_765)).toBe(98.765);
  });
});

describe('configuration', () => {
  it('takes a Console leaderboard id and refuses anything else, the project id above all', () => {
    expect(leaderboardId(ID)).toBe(ID);
    expect(leaderboardId(`  ${ID}  `)).toBe(ID);
    for (const bad of ['', '863268283344', 'short', 'has space in it', 'CgkI/slash', 'x'.repeat(65), null, undefined, 42]) {
      expect(leaderboardId(bad), String(bad)).toBeNull();
    }
  });

  it('is configured with a leaderboard of this Games project, and nothing surfaces while Daily Tempo does not exist', async () => {
    expect(leaderboardId(LEADERBOARDS.dailyTempo)).toBe(LEADERBOARDS.dailyTempo);
    // The id is URL-safe base64 of 0x0a <len> 0x08 <project varint> 0x10 0x02 …: it must name
    // project 863268283344 as a leaderboard. The first id supplied was retyped (I/l, O/0, o/0)
    // and named nothing, which only decoding it revealed.
    const bytes = Buffer.from(LEADERBOARDS.dailyTempo.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    expect([bytes[0], bytes[2]]).toEqual([0x0a, 0x08]);
    let project = 0n, shift = 0n, i = 3;
    for (; bytes[i]! & 0x80; i++, shift += 7n) project |= BigInt(bytes[i]! & 0x7f) << shift;
    project |= BigInt(bytes[i]!) << shift;
    expect(project).toBe(863268283344n);
    expect([bytes[i + 1], bytes[i + 2]]).toEqual([0x10, 0x02]);
    // Configured is not shipped: the mode is still off, so no button and no submission.
    expect(DAILY_TEMPO_AVAILABLE).toBe(false);
    const { dailyTempoLeaderboardOffered } = await import('../src/playgames/dailyTempo');
    expect(dailyTempoLeaderboardOffered()).toBe(false);
  });

  it('tags a score with its day, in the characters Play Games allows', () => {
    expect(scoreTag(TODAY)).toBe(TODAY);
    expect(scoreTag('yesterday')).toBeNull();
  });
});

describe('the day’s best', () => {
  it('keeps only a better score, and starts over on a new day', () => {
    let { next, improved } = recordBest(null, TODAY, 80_000);
    expect([next, improved]).toEqual([{ day: TODAY, best: 80_000, submitted: -1 }, true]);
    ({ next, improved } = recordBest(next, TODAY, 70_000));
    expect([next.best, improved]).toEqual([80_000, false]);
    ({ next, improved } = recordBest(next, TODAY, 80_000));
    expect(improved).toBe(false);
    ({ next, improved } = recordBest({ ...next, submitted: 80_000 }, '2026-09-24', 10_000));
    expect([next, improved]).toEqual([{ day: '2026-09-24', best: 10_000, submitted: -1 }, true]);
  });

  it('owes Play Games a score only for today, and only above what it confirmed', () => {
    expect(pendingScore({ day: TODAY, best: 80_000, submitted: -1 }, TODAY)).toBe(80_000);
    expect(pendingScore({ day: TODAY, best: 80_000, submitted: 80_000 }, TODAY)).toBeNull();
    expect(pendingScore({ day: '2026-09-22', best: 80_000, submitted: -1 }, TODAY)).toBeNull();
    // A first score of zero is still a score to send.
    expect(pendingScore({ day: TODAY, best: 0, submitted: -1 }, TODAY)).toBe(0);
  });

  it('recovers from anything in storage', () => {
    for (const raw of ['', 'nope', '[]', '{"day":"x","best":1,"submitted":0}', '{"day":"2026-09-23","best":1.5,"submitted":0}',
      '{"day":"2026-09-23","best":999999,"submitted":0}', '{"day":"2026-09-23","best":-1,"submitted":-1}']) {
      expect(parseDailyBest(raw), raw).toBeNull();
    }
    expect(parseDailyBest('{"day":"2026-09-23","best":500,"submitted":900}')).toEqual({ day: TODAY, best: 500, submitted: 500 });
  });
});

describe('submitting', () => {
  it('sends the first result, then only results that beat it', async () => {
    const { games, calls } = await signedIn();
    const { leaderboard, events } = board({ games });
    await expect(leaderboard.record({ day: TODAY, accuracy: 80 })).resolves.toEqual({ kind: 'submitted', score: 80_000, newBest: true });
    await expect(leaderboard.record({ day: TODAY, accuracy: 70 })).resolves.toEqual({ kind: 'skipped', reason: 'not_better' });
    await expect(leaderboard.record({ day: TODAY, accuracy: 80 })).resolves.toEqual({ kind: 'skipped', reason: 'not_better' });
    await leaderboard.record({ day: TODAY, accuracy: 91.2345 });
    expect(calls.submit).toEqual([[ID, 80_000, TODAY], [ID, 91_235, TODAY]]);
    expect(events).toEqual([
      { event: 'leaderboard_score_submitted', accuracy: 80, newBest: true, retry: false },
      { event: 'leaderboard_score_submitted', accuracy: 91, newBest: true, retry: false },
    ]);
    expect(leaderboard.best()).toEqual({ day: TODAY, best: 91_235, submitted: 91_235 });
  });

  it('lets a signed-out player play: keeps the best, asks nothing of Play Games, never prompts', async () => {
    const c = client({ isAuthenticated: async () => SIGNED_OUT, signIn: async () => { throw new Error('must not prompt'); } });
    const games = createPlayGames(c.native);
    const { leaderboard, events } = board({ games });
    await expect(leaderboard.record({ day: TODAY, accuracy: 88 })).resolves.toEqual({ kind: 'skipped', reason: 'signed_out' });
    expect(c.calls.submit).toEqual([]);
    expect(c.calls.signIn).toBe(0);
    // Signing out is the player's choice, not a failure worth reporting.
    expect(events).toEqual([]);
    expect(leaderboard.best()).toEqual({ day: TODAY, best: 88_000, submitted: -1 });
  });

  it('sends a kept best once the player is signed in, as a retry', async () => {
    let status: PlayGamesStatus = SIGNED_OUT;
    const c = client({ isAuthenticated: async () => status });
    const games = createPlayGames(c.native);
    const { leaderboard, events } = board({ games });
    await leaderboard.record({ day: TODAY, accuracy: 77 });
    status = SIGNED_IN;
    await expect(leaderboard.retry()).resolves.toMatchObject({ kind: 'submitted', score: 77_000 });
    expect(events).toEqual([{ event: 'leaderboard_score_submitted', accuracy: 77, newBest: true, retry: true }]);
    await expect(leaderboard.retry()).resolves.toEqual({ kind: 'skipped', reason: 'nothing_pending' });
  });

  it('keeps a failed submission to send later, and says why it failed', async () => {
    let answer: ScoreSubmission = NOT_SUBMITTED('offline');
    const { games, calls } = await signedIn({ submitScore: async (id, score, tag) => { calls.submit.push([id, score, tag]); return answer; } });
    const { leaderboard, events } = board({ games });
    await expect(leaderboard.record({ day: TODAY, accuracy: 90 })).resolves.toEqual({ kind: 'failed', score: 90_000, reason: 'offline' });
    // A lower retry does not replace the owed best; it carries it.
    answer = NOT_SUBMITTED('failed');
    await expect(leaderboard.record({ day: TODAY, accuracy: 60 })).resolves.toEqual({ kind: 'failed', score: 90_000, reason: 'failed' });
    answer = { submitted: true, newBest: false, reason: 'submitted' };
    await expect(leaderboard.retry()).resolves.toEqual({ kind: 'submitted', score: 90_000, newBest: false });
    expect(calls.submit.map(c => c[1])).toEqual([90_000, 90_000, 90_000]);
    expect(events.map(e => e.event === 'leaderboard_submit_failed' ? `failed:${e.reason}:${e.retry}` : `ok:${e.event === 'leaderboard_score_submitted' && e.retry}`))
      .toEqual(['failed:offline:false', 'failed:failed:false', 'ok:true']);
  });

  it('gives up on a submission that never answers, without holding the result screen', async () => {
    const { games } = await signedIn({ submitScore: () => new Promise(() => undefined) });
    const { leaderboard, events } = board({ games, timeoutMs: 20 });
    const started = Date.now();
    await expect(leaderboard.record({ day: TODAY, accuracy: 95 })).resolves.toEqual({ kind: 'failed', score: 95_000, reason: 'timeout' });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(events).toEqual([{ event: 'leaderboard_submit_failed', reason: 'timeout', retry: false }]);
    expect(leaderboard.best()?.submitted).toBe(-1);
  });

  it('treats a plugin that throws as a failure to retry, never as an error', async () => {
    const { games } = await signedIn({ submitScore: async () => { throw new Error('plugin missing'); } });
    const { leaderboard } = board({ games });
    await expect(leaderboard.record({ day: TODAY, accuracy: 50 })).resolves.toEqual({ kind: 'failed', score: 50_000, reason: 'failed' });
    expect(pendingScore(leaderboard.best(), TODAY)).toBe(50_000);
  });

  it('never sends yesterday’s unsent best onto today’s board', async () => {
    const { games, calls } = await signedIn();
    const storage = memory({ [KEY]: JSON.stringify({ version: 1, day: '2026-09-22', best: 99_000, submitted: -1 }) });
    const { leaderboard } = board({ games, storage });
    await expect(leaderboard.retry()).resolves.toEqual({ kind: 'skipped', reason: 'nothing_pending' });
    expect(calls.submit).toEqual([]);
  });

  it('sends one at a time, so two results in quick succession cannot race', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const sent: number[] = [];
    const { games } = await signedIn({ submitScore: async (_id, score) => { sent.push(score); await gate; return OK; } });
    const { leaderboard } = board({ games, timeoutMs: 5000 });
    const first = leaderboard.record({ day: TODAY, accuracy: 70 });
    const second = leaderboard.record({ day: TODAY, accuracy: 85 });
    await Promise.resolve();
    expect(sent).toEqual([70_000]);
    release();
    await Promise.all([first, second]);
    expect(sent).toEqual([70_000, 85_000]);
    expect(leaderboard.best()).toEqual({ day: TODAY, best: 85_000, submitted: 85_000 });
  });

  it('survives blocked storage and a throwing analytics sink', async () => {
    const blocked: Storage = { length: 0, clear: () => undefined, key: () => null, removeItem: () => undefined,
      getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    const { games } = await signedIn();
    const { leaderboard } = board({ games, storage: blocked, report: () => { throw new Error('sink down'); } });
    await expect(leaderboard.record({ day: TODAY, accuracy: 66 })).resolves.toMatchObject({ kind: 'submitted' });
    await expect(leaderboard.record({ day: TODAY, accuracy: 60 })).resolves.toEqual({ kind: 'skipped', reason: 'not_better' });
  });

  it('refuses what is not a result', async () => {
    const { games, calls } = await signedIn();
    const { leaderboard } = board({ games });
    await expect(leaderboard.record({ day: TODAY, accuracy: Number.NaN })).resolves.toEqual({ kind: 'skipped', reason: 'invalid' });
    await expect(leaderboard.record({ day: 'today', accuracy: 50 })).resolves.toEqual({ kind: 'skipped', reason: 'invalid' });
    expect(calls.submit).toEqual([]);
  });
});

describe('without Play Games', () => {
  it('does nothing in a browser but remember the best', async () => {
    const { leaderboard, events } = board();
    expect(leaderboard.available).toBe(false);
    await expect(leaderboard.record({ day: TODAY, accuracy: 90 })).resolves.toEqual({ kind: 'skipped', reason: 'unavailable' });
    await expect(leaderboard.open()).resolves.toEqual({ result: 'unavailable', signedIn: false });
    expect(events).toEqual([{ event: 'leaderboard_opened', result: 'unavailable', signIn: true }]);
    expect(leaderboard.best()?.best).toBe(90_000);
  });

  it('does nothing at all without a configured leaderboard', async () => {
    const { games, calls } = await signedIn();
    const { leaderboard } = board({ games, id: null });
    expect(leaderboard.available).toBe(false);
    await expect(leaderboard.record({ day: TODAY, accuracy: 90 })).resolves.toEqual({ kind: 'skipped', reason: 'unconfigured' });
    await expect(leaderboard.open()).resolves.toEqual({ result: 'unconfigured', signedIn: false });
    expect(calls.submit).toEqual([]);
    expect(calls.show).toEqual([]);
  });

  it('keeps the stub unable to submit or show anything', async () => {
    await expect(stubPlayGames.submitScore(ID, 1)).resolves.toEqual(NOT_SUBMITTED('unavailable'));
    await expect(stubPlayGames.showLeaderboard(ID)).resolves.toEqual(NOT_SHOWN('unavailable'));
  });
});

describe('opening the leaderboard', () => {
  it('opens on the daily view for a signed-in player, and sends anything owed', async () => {
    const { games, calls } = await signedIn({ submitScore: async () => NOT_SUBMITTED('offline') });
    const { leaderboard, events } = board({ games });
    await leaderboard.record({ day: TODAY, accuracy: 70 });
    await expect(leaderboard.open()).resolves.toEqual({ result: 'shown', signedIn: true });
    expect(calls.show).toEqual(['daily']);
    expect(calls.signIn).toBe(0);
    expect(events.some(e => e.event === 'leaderboard_opened' && e.result === 'shown' && !e.signIn)).toBe(true);
  });

  it('offers sign-in only here, because the player asked', async () => {
    let status: PlayGamesStatus = SIGNED_OUT;
    const c = client({ isAuthenticated: async () => status, signIn: async () => { c.calls.signIn++; status = SIGNED_IN; return SIGNED_IN; } });
    const games = createPlayGames(c.native);
    const { leaderboard, events } = board({ games });
    await expect(leaderboard.open()).resolves.toEqual({ result: 'shown', signedIn: true });
    expect(c.calls.signIn).toBe(1);
    expect(events).toContainEqual({ event: 'leaderboard_opened', result: 'shown', signIn: true });
  });

  it('says so when the player declines sign-in, and shows nothing', async () => {
    const c = client({ isAuthenticated: async () => SIGNED_OUT, signIn: async () => SIGNED_OUT });
    const { leaderboard } = board({ games: createPlayGames(c.native) });
    await expect(leaderboard.open()).resolves.toEqual({ result: 'signed_out', signedIn: false });
    expect(c.calls.show).toEqual([]);
  });

  it('reports a screen that would not open', async () => {
    const { games } = await signedIn({ showLeaderboard: async () => NOT_SHOWN('failed') });
    const { leaderboard, events } = board({ games });
    await expect(leaderboard.open()).resolves.toEqual({ result: 'failed', signedIn: true });
    expect(events).toEqual([{ event: 'leaderboard_opened', result: 'failed', signIn: false }]);
  });
});

describe('the Daily Tempo day', () => {
  it('turns over when Play Games’ daily view does, at midnight UTC−7, for everyone at once', async () => {
    const { dailyTempoDay } = await import('../src/playgames/dailyTempo');
    expect(PGS_DAILY_RESET_UTC_OFFSET_HOURS).toBe(-7);
    expect(dailyTempoDay(Date.UTC(2026, 8, 24, 6, 59))).toBe('2026-09-23');
    expect(dailyTempoDay(Date.UTC(2026, 8, 24, 7, 0))).toBe('2026-09-24');
    // No daylight saving: the same instant in January as in July.
    expect(dailyTempoDay(Date.UTC(2026, 0, 1, 6, 59))).toBe('2025-12-31');
    expect(dailyTempoDay(Date.UTC(2026, 0, 1, 7, 0))).toBe('2026-01-01');
  });
});

describe('the bridge and the words', () => {
  it('reads native answers defensively', async () => {
    const { toSubmission, toView } = await import('../src/playgames/native');
    expect(toSubmission({ submitted: true, newBest: true, reason: 'submitted' })).toEqual(OK);
    expect(toSubmission({ submitted: true })).toEqual({ submitted: true, newBest: false, reason: 'submitted' });
    expect(toSubmission({ submitted: false, reason: 'offline' })).toEqual(NOT_SUBMITTED('offline'));
    for (const junk of [null, 'yes', 7, {}, { submitted: 'true' }, { submitted: false, reason: 'weird' }, { submitted: false, reason: 'submitted' }]) {
      expect(toSubmission(junk)).toEqual(NOT_SUBMITTED('failed'));
    }
    expect(toView({ shown: true })).toEqual({ shown: true, reason: 'shown' });
    expect(toView({ shown: false, reason: 'signed_out' })).toEqual(NOT_SHOWN('signed_out'));
    for (const junk of [null, {}, { shown: 1 }, { shown: false, reason: 'shown' }]) expect(toView(junk)).toEqual(NOT_SHOWN('failed'));
  });

  it('tells a result screen, plainly, what happened to the score', () => {
    expect(submissionCopy({ kind: 'submitted', score: 1, newBest: true })).toBe('Posted to the leaderboard');
    expect(submissionCopy({ kind: 'failed', score: 1, reason: 'offline' })).toBe('Will post when you are back online');
    expect(submissionCopy({ kind: 'failed', score: 1, reason: 'failed' })).toBe('Could not post to the leaderboard');
    expect(submissionCopy({ kind: 'skipped', reason: 'signed_out' })).toBe('Sign in to Play Games to post your score');
    expect(submissionCopy({ kind: 'skipped', reason: 'unavailable' })).toBe('');
  });

  it('names its analytics events the way Firebase keeps them', () => {
    for (const event of SERVICE_EVENTS) {
      expect(validEventName(event), event).toBe(true);
      expect(ANALYTICS_EVENTS).toContain(event);
    }
    for (const name of ['leaderboard', 'accuracy', 'new_best', 'retry', 'reason', 'result', 'sign_in']) expect(validName(name, 40)).toBe(true);
  });
});
