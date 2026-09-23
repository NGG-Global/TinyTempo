import { describe, expect, it, vi } from 'vitest';
import { ACHIEVEMENTS } from '../src/config/achievements';
import { LEADERBOARDS } from '../src/config/leaderboards';
import { isAreaFinale, levelSpec } from '../src/game/levels';
import { mergeProgress, recordResult, type Progress } from '../src/game/progress';
import { decodeSaveCode, encodeSaveCode } from '../src/game/saveCode';
import {
  achievementsFrom, createAchievementSync, earnedAchievements, hasEarned, newlyEarned,
  type Achievement, type AchievementDeps,
} from '../src/playgames/achievements';
import { playGamesId } from '../src/playgames/ids';
import {
  NOT_SHOWN, NOT_UNLOCKED, SIGNED_OUT, createPlayGames, stubPlayGames,
  type AchievementUnlock, type PlayGames, type PlayGamesClient, type PlayGamesStatus,
} from '../src/playgames/playGames';

vi.mock('phaser', () => ({ default: {} }));

const SIGNED_IN: PlayGamesStatus = { authenticated: true, player: null, reason: 'checked' };
/** Five configured achievements with made-up ids, for driving the sync. */
const FIVE: readonly Achievement[] = [10, 20, 30, 40, 50].map(level => ({ key: `clear-${level}`, clearLevel: level, id: `CgkItest${level}` }));

/** A save where every level up to `through` is cleared at one star. */
function road(through: number): Progress {
  const best: Record<number, number> = {};
  for (let level = 1; level <= through; level++) best[level] = levelSpec(level).starAccuracy[0]!;
  return { unlocked: through + 1, best };
}

function client(over: Partial<PlayGamesClient> = {}) {
  const calls = { unlock: [] as string[], signIn: 0, show: 0 };
  const native: PlayGamesClient = {
    isAuthenticated: async () => SIGNED_IN,
    signIn: async () => { calls.signIn++; return SIGNED_IN; },
    getPlayerInfo: async () => SIGNED_IN,
    submitScore: async () => ({ submitted: true, newBest: false, reason: 'submitted' }),
    showLeaderboard: async () => ({ shown: true, reason: 'shown' }),
    unlockAchievement: async id => { calls.unlock.push(id); return { sent: true, reason: 'sent' }; },
    showAchievements: async () => { calls.show++; return { shown: true, reason: 'shown' }; },
    ...over,
  };
  return { native, calls };
}

function sync(over: Omit<Partial<AchievementDeps>, 'games'> & { games?: PlayGames } = {}) {
  const { games, ...rest } = over;
  return createAchievementSync({
    games: () => games ?? stubPlayGames,
    achievements: FIVE,
    native: () => games !== undefined,
    timeoutMs: 50,
    ...rest,
  });
}

describe('the configured achievements', () => {
  it('are the five area finales, in order, with distinct keys', () => {
    expect(ACHIEVEMENTS.map(a => a.clearLevel)).toEqual([10, 20, 30, 40, 50]);
    expect(ACHIEVEMENTS.every(a => isAreaFinale(a.clearLevel))).toBe(true);
    expect(new Set(ACHIEVEMENTS.map(a => a.key)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) expect(a.key).toMatch(/^[a-z][a-z0-9-]{1,23}$/);
  });

  it('carry either no id yet or one the game will use — never a malformed one', () => {
    for (const a of ACHIEVEMENTS) {
      if (a.id === '') continue;
      expect(playGamesId(a.id), a.key).toBe(a.id);
    }
    // An empty id leaves that achievement off rather than failing.
    expect(achievementsFrom([{ key: 'x', clearLevel: 10, id: '' }])[0]!.id).toBeNull();
    expect(achievementsFrom([{ key: 'x', clearLevel: 10, id: '863268283344' }])[0]!.id).toBeNull();
  });

  it('are the five ids the Console gave this Games project, each its own', () => {
    // URL-safe base64 of 0x0a <len> 0x08 <project varint> 0x10 0x02 0x10 <item number>. The
    // leaderboard is item 1 and these were created next, 2 to 6, in level order.
    const decode = (id: string) => {
      const bytes = Buffer.from(id.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
      let project = 0n, shift = 0n, i = 3;
      for (; bytes[i]! & 0x80; i++, shift += 7n) project |= BigInt(bytes[i]! & 0x7f) << shift;
      project |= BigInt(bytes[i]!) << shift;
      return { head: [bytes[0], bytes[2], bytes[i + 1], bytes[i + 3]], project, item: bytes[i + 4] };
    };
    expect(decode(LEADERBOARDS.dailyTempo).item).toBe(1);
    for (const [n, a] of ACHIEVEMENTS.entries()) {
      expect(playGamesId(a.id), a.key).toBe(a.id);
      const { head, project, item } = decode(a.id);
      expect(head, a.key).toEqual([0x0a, 0x08, 0x10, 0x10]);
      expect(project, a.key).toBe(863268283344n);
      expect(item, a.key).toBe(n + 2);
    }
    const all = [LEADERBOARDS.dailyTempo, ...ACHIEVEMENTS.map(a => a.id)];
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('what a save has earned', () => {
  it('is its level cleared — not merely reached', () => {
    const ten = { clearLevel: 10 };
    expect(hasEarned(road(9), ten)).toBe(false); // level 10 is open, not yet cleared
    expect(hasEarned(road(10), ten)).toBe(true);
    // The accuracy alone says so, and so does a frontier past the level.
    expect(hasEarned({ unlocked: 10, best: { 10: 60 } }, ten)).toBe(true);
    expect(hasEarned({ unlocked: 11, best: {} }, ten)).toBe(true);
    expect(earnedAchievements(road(34), FIVE).map(a => a.clearLevel)).toEqual([10, 20, 30]);
  });

  it('is earned by the result that clears the level, and by nothing else', () => {
    const before = road(9);
    const cleared = recordResult(before, 10, levelSpec(10).clearAccuracy);
    expect(newlyEarned(before, cleared.progress, FIVE).map(a => a.key)).toEqual(['clear-10']);
    const failed = recordResult(before, 10, levelSpec(10).clearAccuracy - 1);
    expect(newlyEarned(before, failed.progress, FIVE)).toEqual([]);
    // Replaying a finale already cleared earns nothing new.
    const replay = recordResult(road(12), 10, 100);
    expect(newlyEarned(road(12), replay.progress, FIVE)).toEqual([]);
  });

  it('travels with the save, since it is only ever read from it', () => {
    const phone = road(22);
    const tablet = road(31);
    expect(earnedAchievements(mergeProgress(phone, tablet), FIVE).map(a => a.key)).toEqual(['clear-10', 'clear-20', 'clear-30']);
    const code = encodeSaveCode({ progress: tablet, settings: { calibrationMs: 0, muted: false, haptics: true }, tutorialComplete: true });
    const decoded = decodeSaveCode(code);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(earnedAchievements(decoded.data.progress, FIVE)).toEqual(earnedAchievements(tablet, FIVE));
  });
});

describe('syncing to Play Games', () => {
  it('hands over every earned achievement once a session, and only earned ones', async () => {
    const c = client();
    const games = createPlayGames(c.native);
    await games.refresh();
    const achievements = sync({ games });
    await expect(achievements.sync(road(25))).resolves.toEqual({ kind: 'synced', sent: ['clear-10', 'clear-20'] });
    expect(c.calls.unlock).toEqual(['CgkItest10', 'CgkItest20']);
    // Nothing new: no calls.
    await expect(achievements.sync(road(29))).resolves.toEqual({ kind: 'skipped', reason: 'nothing_new' });
    // The next finale: only it.
    await expect(achievements.sync(road(30))).resolves.toEqual({ kind: 'synced', sent: ['clear-30'] });
    expect(c.calls.unlock).toEqual(['CgkItest10', 'CgkItest20', 'CgkItest30']);
  });

  it('owes a player who already passed the finales all of them, the first time they are signed in', async () => {
    const c = client();
    const achievements = sync({ games: createPlayGames(c.native) });
    await expect(achievements.sync(road(64))).resolves.toEqual({ kind: 'synced', sent: FIVE.map(a => a.key) });
  });

  it('never prompts a signed-out player, and sends everything once they are signed in', async () => {
    let status: PlayGamesStatus = SIGNED_OUT;
    const c = client({ isAuthenticated: async () => status, signIn: async () => { throw new Error('must not prompt'); } });
    const achievements = sync({ games: createPlayGames(c.native) });
    await expect(achievements.sync(road(20))).resolves.toEqual({ kind: 'skipped', reason: 'signed_out' });
    expect(c.calls.unlock).toEqual([]);
    status = SIGNED_IN;
    await expect(achievements.sync(road(20))).resolves.toEqual({ kind: 'synced', sent: ['clear-10', 'clear-20'] });
  });

  it('stops at a sign-out mid-sync, and sends the rest next time', async () => {
    let answer: AchievementUnlock = { sent: true, reason: 'sent' };
    const unlocked: string[] = [];
    const c = client({ unlockAchievement: async id => { const now = answer; unlocked.push(id); answer = NOT_UNLOCKED('signed_out'); return now; } });
    const games = createPlayGames(c.native);
    await games.refresh();
    const achievements = sync({ games });
    await expect(achievements.sync(road(30))).resolves.toEqual({ kind: 'synced', sent: ['clear-10'] });
    expect(unlocked).toEqual(['CgkItest10', 'CgkItest20']);
    answer = { sent: true, reason: 'sent' };
    const again = client();
    const achievements2 = sync({ games: createPlayGames(again.native) });
    await achievements2.sync(road(30));
    expect(again.calls.unlock).toEqual(['CgkItest10', 'CgkItest20', 'CgkItest30']);
  });

  it('treats a plugin that throws or never answers as not sent, and tries again next sync', async () => {
    let fail = true;
    const c = client({ unlockAchievement: async id => { if (fail) throw new Error('plugin'); c.calls.unlock.push(id); return { sent: true, reason: 'sent' }; } });
    const games = createPlayGames(c.native);
    await games.refresh();
    const achievements = sync({ games });
    await expect(achievements.sync(road(10))).resolves.toEqual({ kind: 'synced', sent: [] });
    fail = false;
    await expect(achievements.sync(road(10))).resolves.toEqual({ kind: 'synced', sent: ['clear-10'] });

    const hang = client({ unlockAchievement: () => new Promise(() => undefined) });
    const hung = createPlayGames(hang.native);
    await hung.refresh();
    await expect(sync({ games: hung, timeoutMs: 20 }).sync(road(10))).resolves.toEqual({ kind: 'synced', sent: [] });
  });

  it('runs one sync at a time, so two finished levels cannot both send the same unlock', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const c = client({ unlockAchievement: async id => { c.calls.unlock.push(id); await gate; return { sent: true, reason: 'sent' }; } });
    const games = createPlayGames(c.native);
    await games.refresh();
    const achievements = sync({ games, timeoutMs: 5000 });
    const first = achievements.sync(road(10));
    const second = achievements.sync(road(10));
    release();
    await Promise.all([first, second]);
    expect(c.calls.unlock).toEqual(['CgkItest10']);
  });

  it('does nothing in a browser or with no achievement configured', async () => {
    await expect(sync().sync(road(50))).resolves.toEqual({ kind: 'skipped', reason: 'unavailable' });
    expect(sync().available).toBe(false);
    const c = client();
    const none = sync({ games: createPlayGames(c.native), achievements: achievementsFrom(ACHIEVEMENTS.map(a => ({ ...a, id: '' }))) });
    await expect(none.sync(road(50))).resolves.toEqual({ kind: 'skipped', reason: 'unconfigured' });
    expect(none.available).toBe(false);
    expect(c.calls.unlock).toEqual([]);
    await expect(stubPlayGames.unlockAchievement('CgkItest10')).resolves.toEqual(NOT_UNLOCKED('unavailable'));
    await expect(stubPlayGames.showAchievements()).resolves.toEqual(NOT_SHOWN('unavailable'));
  });
});

describe('the achievements screen', () => {
  it('opens for a signed-in player without a prompt', async () => {
    const c = client();
    const games = createPlayGames(c.native);
    await games.refresh();
    await expect(sync({ games }).open()).resolves.toEqual({ result: 'shown', signedIn: true });
    expect(c.calls.signIn).toBe(0);
    expect(c.calls.show).toBe(1);
  });

  it('offers sign-in only here, and says so if the player declines', async () => {
    let status: PlayGamesStatus = SIGNED_OUT;
    const c = client({ isAuthenticated: async () => status, signIn: async () => { c.calls.signIn++; status = SIGNED_IN; return SIGNED_IN; } });
    await expect(sync({ games: createPlayGames(c.native) }).open()).resolves.toEqual({ result: 'shown', signedIn: true });
    expect(c.calls.signIn).toBe(1);
    const declines = client({ isAuthenticated: async () => SIGNED_OUT, signIn: async () => SIGNED_OUT });
    await expect(sync({ games: createPlayGames(declines.native) }).open()).resolves.toEqual({ result: 'signed_out', signedIn: false });
    expect(declines.calls.show).toBe(0);
  });

  it('reports unavailable in a browser and unconfigured with no ids', async () => {
    await expect(sync().open()).resolves.toEqual({ result: 'unavailable', signedIn: false });
    const c = client();
    await expect(sync({ games: createPlayGames(c.native), achievements: [] }).open()).resolves.toEqual({ result: 'unconfigured', signedIn: false });
  });
});

describe('the bridge', () => {
  it('reads unlock answers defensively', async () => {
    const { toUnlock } = await import('../src/playgames/native');
    expect(toUnlock({ sent: true })).toEqual({ sent: true, reason: 'sent' });
    expect(toUnlock({ sent: false, reason: 'signed_out' })).toEqual(NOT_UNLOCKED('signed_out'));
    for (const junk of [null, 'yes', {}, { sent: 'true' }, { sent: false, reason: 'weird' }, { sent: false, reason: 'sent' }]) {
      expect(toUnlock(junk)).toEqual(NOT_UNLOCKED('failed'));
    }
  });
});
