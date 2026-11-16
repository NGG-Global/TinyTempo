import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  compactMinutes, extendTimer, formatMinutes, formatStartWithin, formatTimerLeft, holdTimer, isTimerProduct, loadReplayTimer, mergeShelf,
  NO_TIMER, parseHeldTimer, parseReplayTimer, pruneShelf, redeemHeldTimer, REPLAY_TIMER_KEY, REPLAY_TIMERS, replayTimerActive,
  resetReplayTimerSession, saveReplayTimer, SHELF_MAX, shelfView, shortTimerLeft, startHeldTimer, startHeldTimerNow, timerActive,
  timerLeftMs, timerOption, upgradeWonTimer, WON_START_WINDOW_MS, type HeldTimer, type ReplayTimer,
} from '../src/game/replayTimer';
import { encodeCloudSave, localCloudSave } from '../src/playgames/cloudSave';
import { PRODUCT } from '../src/monetization/types';

vi.mock('phaser', () => ({ default: {} }));

const NOW = Date.UTC(2026, 9, 22, 12, 0, 0);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => { map.delete(key); },
    setItem: (key: string, value: string) => { map.set(key, value); },
  };
}

const bought = (id: string, minutes: number, over: Partial<HeldTimer> = {}): HeldTimer => ({ id: `play:${id}`, minutes, source: 'bought', ...over });
const record = (over: Partial<ReplayTimer> = {}): ReplayTimer => ({ ...NO_TIMER, ...over });

beforeEach(() => { resetReplayTimerSession(); });

describe('the four timers', () => {
  it('are thirty minutes, an hour, two hours and a day, each a Play consumable of its own', () => {
    expect(REPLAY_TIMERS.map(t => [t.product, t.minutes])).toEqual([
      [PRODUCT.timer30m, 30], [PRODUCT.timer1h, 60], [PRODUCT.timer2h, 120], [PRODUCT.timer1d, 1440],
    ]);
    expect(REPLAY_TIMERS.map(t => t.product)).toEqual(['replay_timer_30m', 'replay_timer_1h', 'replay_timer_2h', 'replay_timer_1d']);
    for (const timer of REPLAY_TIMERS) expect(isTimerProduct(timer.product)).toBe(true);
    expect(isTimerProduct(PRODUCT.heartRefill)).toBe(false);
    expect(isTimerProduct(PRODUCT.premium)).toBe(false);
    expect(timerOption('replay_timer_2h')?.label).toBe('2 hours');
  });
});

describe('what a running timer holds', () => {
  it('starts from now with none running, and from the end of one that is', () => {
    expect(timerActive(null, NOW)).toBe(false);
    const first = extendTimer(null, PRODUCT.timer30m, NOW);
    expect(first.expiresAt).toBe(NOW + 30 * MIN);
    expect(timerActive(first, NOW)).toBe(true);
    expect(timerActive(first, NOW + 30 * MIN)).toBe(false);
    // Started with ten minutes left: those ten are kept and the hour goes on top.
    const stacked = extendTimer(first, PRODUCT.timer1h, NOW + 20 * MIN);
    expect(stacked.expiresAt).toBe(NOW + 90 * MIN);
    // Started after it ran out: from now, since nothing is left to add to.
    const later = extendTimer(first, PRODUCT.timer1d, NOW + 3 * HOUR);
    expect(later.expiresAt).toBe(NOW + 3 * HOUR + DAY);
  });

  it('reads what is left as whole minutes, rounded up, and never below zero', () => {
    expect(timerLeftMs({ expiresAt: NOW + 5 * MIN }, NOW)).toBe(5 * MIN);
    expect(timerLeftMs({ expiresAt: NOW - MIN }, NOW)).toBe(0);
    expect(timerLeftMs(null, NOW)).toBe(0);
    expect(formatTimerLeft(29.2 * MIN)).toBe('30 min');
    expect(formatTimerLeft(60 * MIN)).toBe('1 hr');
    expect(formatTimerLeft(83 * MIN)).toBe('1 hr 23 min');
    expect(formatTimerLeft(24 * 60 * MIN)).toBe('1 day');
    expect(formatTimerLeft(26 * 60 * MIN)).toBe('1 day 2 hr');
    expect(formatTimerLeft(49 * 60 * MIN)).toBe('2 days 1 hr');
    expect(formatTimerLeft(1)).toBe('1 min');
    expect(shortTimerLeft(29.2 * MIN)).toBe('30m');
    expect(shortTimerLeft(119 * MIN)).toBe('1h');
    expect(shortTimerLeft(23 * 60 * MIN)).toBe('23h');
    expect(shortTimerLeft(49 * 60 * MIN)).toBe('2d');
  });

  it('writes a held length for a token face and a row, and the won item’s deadline', () => {
    expect(compactMinutes(40)).toBe('40m');
    expect(compactMinutes(60)).toBe('1h');
    expect(compactMinutes(90)).toBe('1h 30m');
    expect(compactMinutes(1440)).toBe('1d');
    expect(formatMinutes(40)).toBe('40 min');
    expect(formatMinutes(90)).toBe('1 hr 30 min');
    expect(formatStartWithin(38 * MIN)).toBe('Start within 38 min');
    expect(formatStartWithin(HOUR)).toBe('Start within 1 hr');
  });
});

describe('a purchase held once', () => {
  it('lands on the shelf without starting, and the same claim never holds twice, in the session or after a reload', () => {
    const storage = memoryStorage();
    const first = redeemHeldTimer(PRODUCT.timer30m, 'play:aaaa', NOW, storage);
    expect(first.held).toBe(true);
    expect(first.timer.expiresAt).toBe(0);
    expect(first.timer.claims).toEqual(['play:aaaa']);
    expect(first.timer.shelf).toEqual([bought('aaaa', 30)]);
    expect(replayTimerActive(NOW, storage)).toBe(false);
    // Play replays the purchase after a crash before the consume: nothing is held again.
    expect(redeemHeldTimer(PRODUCT.timer30m, 'play:aaaa', NOW + MIN, storage).held).toBe(false);
    resetReplayTimerSession();
    expect(redeemHeldTimer(PRODUCT.timer30m, 'play:aaaa', NOW + MIN, storage).held).toBe(false);
    // A different purchase is a second item.
    expect(redeemHeldTimer(PRODUCT.timer2h, 'play:bbbb', NOW + MIN, storage).timer.shelf).toHaveLength(2);
    expect(loadReplayTimer(storage, NOW)?.claims).toEqual(['play:aaaa', 'play:bbbb']);
  });

  it('holds nothing for an empty claim, a product that is not a timer, or an item that is already started', () => {
    expect(redeemHeldTimer(PRODUCT.heartRefill, 'play:cccc', NOW, memoryStorage())).toEqual({ held: false, timer: NO_TIMER });
    expect(redeemHeldTimer(PRODUCT.timer1h, '', NOW, memoryStorage()).held).toBe(false);
    expect(redeemHeldTimer('replay_timer_1w', 'play:dddd', NOW, memoryStorage()).held).toBe(false);
    expect(holdTimer(null, bought('eeee', 30, { startedAt: NOW }), NOW).held).toBe(false);
    expect(holdTimer(null, { id: 'gift:1', minutes: 30, source: 'bought' }, NOW).held).toBe(false);
  });

  it('keeps a bounded list of claims and a bounded shelf, so the record cannot grow without end', () => {
    let timer = NO_TIMER;
    for (let i = 0; i < 100; i++) timer = holdTimer(timer, bought(`${i}`, 30), NOW).timer;
    expect(timer.claims.length).toBeLessThanOrEqual(64);
    expect(timer.claims.at(-1)).toBe('play:99');
    expect(timer.shelf.length).toBeLessThanOrEqual(SHELF_MAX);
  });
});

describe('starting a held timer', () => {
  it('adds its span from now, or from the end of one that runs, and leaves the item as a tombstone', () => {
    const storage = memoryStorage();
    redeemHeldTimer(PRODUCT.timer30m, 'play:aaaa', NOW, storage);
    redeemHeldTimer(PRODUCT.timer1h, 'play:bbbb', NOW, storage);
    const first = startHeldTimerNow('play:aaaa', NOW + MIN, storage);
    expect(first.started).toBe(true);
    expect(first.timer.expiresAt).toBe(NOW + 31 * MIN);
    expect(first.timer.shelf.find(item => item.id === 'play:aaaa')?.startedAt).toBe(NOW + MIN);
    expect(replayTimerActive(NOW + 2 * MIN, storage)).toBe(true);
    const second = startHeldTimerNow('play:bbbb', NOW + 10 * MIN, storage);
    expect(second.timer.expiresAt).toBe(NOW + 91 * MIN);
    // Started once: a second start is refused, and so is an id the shelf never held.
    expect(startHeldTimerNow('play:aaaa', NOW + 12 * MIN, storage)).toMatchObject({ started: false, reason: 'started' });
    expect(startHeldTimerNow('play:zzzz', NOW + 12 * MIN, storage)).toMatchObject({ started: false, reason: 'missing' });
    expect(shelfView(loadReplayTimer(storage, NOW + 12 * MIN), NOW + 12 * MIN).items).toEqual([]);
  });

  it('refuses rather than clamps a start that would stack the running timer past a week', () => {
    const full = record({ expiresAt: NOW + 7 * DAY - 10 * MIN, shelf: [bought('aaaa', 30)] });
    expect(startHeldTimer(full, 'play:aaaa', NOW)).toMatchObject({ started: false, reason: 'full' });
    const nearly = record({ expiresAt: NOW + 7 * DAY - 40 * MIN, shelf: [bought('aaaa', 30)] });
    expect(startHeldTimer(nearly, 'play:aaaa', NOW).started).toBe(true);
  });

  it('refuses a won timer past its window, and the shelf lets it go', () => {
    const won: HeldTimer = { id: 'won:2026-10-22', minutes: 40, source: 'won', startBy: NOW + HOUR };
    const timer = record({ shelf: [won] });
    expect(startHeldTimer(timer, 'won:2026-10-22', NOW + HOUR - 1).started).toBe(true);
    expect(startHeldTimer(timer, 'won:2026-10-22', NOW + HOUR)).toMatchObject({ started: false, reason: 'expired' });
    expect(pruneShelf(timer, NOW + HOUR).shelf).toEqual([]);
    expect(pruneShelf(timer, NOW + HOUR - 1).shelf).toEqual([won]);
    // A started won item's tombstone leaves with its window; a bought one's lasts a month.
    const stones = record({ shelf: [{ ...won, startedAt: NOW }, bought('bbbb', 60, { startedAt: NOW })] });
    expect(pruneShelf(stones, NOW + HOUR).shelf.map(item => item.id)).toEqual(['play:bbbb']);
    expect(pruneShelf(stones, NOW + 31 * DAY).shelf).toEqual([]);
    expect(pruneShelf(stones, NOW + 29 * DAY).shelf.map(item => item.id)).toEqual(['play:bbbb']);
  });
});

describe('the won timer of a day', () => {
  const DAY_KEY = '2026-10-22';
  it('is one item a day: a better run upgrades it and resets its hour; a worse or equal run moves nothing', () => {
    const first = upgradeWonTimer(null, DAY_KEY, 20, NOW);
    expect(first.granted).toBe(20);
    expect(first.timer.shelf).toEqual([{ id: 'won:2026-10-22', minutes: 20, source: 'won', startBy: NOW + WON_START_WINDOW_MS }]);
    const better = upgradeWonTimer(first.timer, DAY_KEY, 40, NOW + 10 * MIN);
    expect(better.granted).toBe(20);
    expect(better.timer.shelf).toEqual([{ id: 'won:2026-10-22', minutes: 40, source: 'won', startBy: NOW + 10 * MIN + WON_START_WINDOW_MS }]);
    expect(upgradeWonTimer(better.timer, DAY_KEY, 40, NOW + 12 * MIN).granted).toBe(0);
    expect(upgradeWonTimer(better.timer, DAY_KEY, 30, NOW + 12 * MIN).timer).toBe(better.timer);
  });

  it('grants the difference as a new item once the day’s timer was started, named for its place among the starts', () => {
    const won = upgradeWonTimer(null, DAY_KEY, 20, NOW).timer;
    const started = startHeldTimer(won, 'won:2026-10-22', NOW + MIN).timer;
    const upgraded = upgradeWonTimer(started, DAY_KEY, 60, NOW + 20 * MIN);
    expect(upgraded.granted).toBe(40);
    expect(upgraded.timer.shelf.map(item => [item.id, item.minutes, item.startedAt !== undefined])).toEqual([
      ['won:2026-10-22', 20, true], ['won:2026-10-22:1', 40, false],
    ]);
    const twice = startHeldTimer(upgraded.timer, 'won:2026-10-22:1', NOW + 21 * MIN).timer;
    expect(upgradeWonTimer(twice, DAY_KEY, 60, NOW + 22 * MIN).granted).toBe(0);
    const third = upgradeWonTimer(twice, DAY_KEY, 90, NOW + 22 * MIN);
    expect(third.granted).toBe(30);
    expect(third.timer.shelf.at(-1)).toMatchObject({ id: 'won:2026-10-22:2', minutes: 30 });
    // Another day is its own item.
    expect(upgradeWonTimer(third.timer, '2026-10-23', 15, NOW + DAY).timer.shelf.at(-1)?.id).toBe('won:2026-10-23');
  });
});

describe('two shelves into one', () => {
  it('unions by id, lets a started copy beat a held one, and takes the longer span and later window of two held won copies', () => {
    const held = bought('aaaa', 60);
    const stone = bought('aaaa', 60, { startedAt: NOW });
    expect(mergeShelf([held], [stone])).toEqual([stone]);
    expect(mergeShelf([stone], [held])).toEqual([stone]);
    const wonA: HeldTimer = { id: 'won:2026-10-22', minutes: 20, source: 'won', startBy: NOW + HOUR };
    const wonB: HeldTimer = { id: 'won:2026-10-22', minutes: 40, source: 'won', startBy: NOW + 2 * HOUR };
    expect(mergeShelf([wonA], [wonB])).toEqual([{ ...wonB }]);
    expect(mergeShelf([wonB, bought('zzzz', 30)], [bought('bbbb', 120)]).map(item => item.id)).toEqual(['play:bbbb', 'play:zzzz', 'won:2026-10-22']);
    // Two tombstones: the earlier start is the one that happened.
    expect(mergeShelf([bought('aaaa', 60, { startedAt: NOW + MIN })], [bought('aaaa', 60, { startedAt: NOW })])[0]?.startedAt).toBe(NOW);
    const many = Array.from({ length: 40 }, (_, i) => bought(`${i}`, 30));
    expect(mergeShelf(many, []).length).toBe(SHELF_MAX);
  });
});

describe('what the shelf shows', () => {
  it('lists held items only, won first by deadline, with their state, face and deadline words', () => {
    const timer = record({
      expiresAt: NOW + 83 * MIN,
      shelf: [
        bought('aaaa', 60), { id: 'won:2026-10-22', minutes: 40, source: 'won', startBy: NOW + 38 * MIN },
        bought('bbbb', 120, { startedAt: NOW }), { id: 'won:2026-10-21', minutes: 20, source: 'won', startBy: NOW + 5 * MIN },
      ],
    });
    const view = shelfView(timer, NOW);
    expect(view.running).toEqual({ leftMs: 83 * MIN, label: '1 hr 23 min', short: '1h' });
    expect(view.items.map(item => [item.id, item.state, item.compact, item.startWithin])).toEqual([
      ['won:2026-10-21', 'expiring', '20m', 'Start within 5 min'],
      ['won:2026-10-22', 'held', '40m', 'Start within 38 min'],
      ['play:aaaa', 'held', '1h', null],
    ]);
    expect(view.items[1]?.window).toBeCloseTo(38 / 60);
    expect(view.items[2]?.window).toBe(1);
    expect(shelfView(null, NOW)).toEqual({ running: null, items: [] });
    expect(shelfView(record({ shelf: [{ id: 'won:2026-10-22', minutes: 40, source: 'won', startBy: NOW }] }), NOW).items[0]?.state).toBe('expired');
  });
});

describe('the stored record', () => {
  it('round-trips through storage, reads a version-1 record with an empty shelf, and validates every item', () => {
    const storage = memoryStorage();
    const won: HeldTimer = { id: 'won:2026-10-22', minutes: 40, source: 'won', startBy: NOW + HOUR };
    expect(saveReplayTimer(record({ expiresAt: NOW + MIN, claims: ['play:1'], shelf: [bought('1', 30), won] }), storage)).toBe(true);
    expect(JSON.parse(storage.getItem(REPLAY_TIMER_KEY)!)).toEqual({
      version: 2, expiresAt: NOW + MIN, claims: ['play:1'], shelf: [bought('1', 30), won],
    });
    expect(loadReplayTimer(storage, NOW)).toEqual(record({ expiresAt: NOW + MIN, claims: ['play:1'], shelf: [bought('1', 30), won] }));
    expect(parseReplayTimer(JSON.stringify({ version: 1, expiresAt: NOW, claims: ['play:old'] }), NOW)).toEqual(record({ expiresAt: NOW, claims: ['play:old'] }));
    expect(parseReplayTimer(null, NOW)).toBeNull();
    expect(parseReplayTimer('nonsense', NOW)).toBeNull();
    expect(parseReplayTimer('[]', NOW)).toBeNull();
    expect(parseReplayTimer(JSON.stringify({ expiresAt: 'soon' }), NOW)).toBeNull();
    expect(parseReplayTimer(JSON.stringify({ expiresAt: -1 }), NOW)).toBeNull();
    expect(parseReplayTimer(JSON.stringify({ expiresAt: NOW, claims: 'x' }), NOW)).toEqual(record({ expiresAt: NOW }));
    expect(parseReplayTimer(JSON.stringify({ expiresAt: NOW, claims: [1, '', 'ok'] }), NOW)).toEqual(record({ expiresAt: NOW, claims: ['ok'] }));
    // A bad item is dropped, not the shelf: no id, a bad source, minutes past a day, a duplicate.
    const shelf = [bought('1', 30), { minutes: 30, source: 'bought' }, { id: 'play:2', minutes: 30, source: 'gift' }, bought('3', 1441), bought('1', 60), bought('4', 60, { startBy: 'soon' as unknown as number })];
    expect(parseReplayTimer(JSON.stringify({ expiresAt: NOW, shelf }), NOW)?.shelf).toEqual([bought('1', 30)]);
    expect(parseHeldTimer({ id: 'won:2026-10-22:1', minutes: 20, source: 'won', startBy: NOW, startedAt: NOW })).toEqual({ id: 'won:2026-10-22:1', minutes: 20, source: 'won', startBy: NOW, startedAt: NOW });
  });

  it('reads an expiry further ahead than any purchase could set as damage to the expiry alone', () => {
    // A tampered or corrupted expiry is not a licence; a week is well past the longest stack.
    // The claims and the shelf are kept, since losing the ledger would let a replayed purchase hold twice.
    const far = parseReplayTimer(JSON.stringify({ expiresAt: NOW + 8 * DAY, claims: ['play:old'], shelf: [bought('1', 30)] }), NOW);
    expect(far).toEqual(record({ expiresAt: 0, claims: ['play:old'], shelf: [bought('1', 30)] }));
    expect(parseReplayTimer(JSON.stringify({ expiresAt: NOW + 6 * DAY }), NOW)?.expiresAt).toBe(NOW + 6 * DAY);
    // A run-out timer is still a record: its claims are what stops a replayed purchase.
    expect(parseReplayTimer(JSON.stringify({ expiresAt: NOW - DAY, claims: ['play:old'] }), NOW)).toEqual(record({ expiresAt: NOW - DAY, claims: ['play:old'] }));
  });

  it('is never in a save code, and the cloud carries the shelf and nothing else of it', () => {
    // Paid for, so the save code carries nothing of it. The cloud carries the held items —
    // a bought timer must survive a reinstall — and never the running expiry or the ledger.
    expect(readFileSync('src/game/saveCode.ts', 'utf8')).not.toMatch(/replayTimer|REPLAY_TIMER/);
    const storage = memoryStorage();
    saveReplayTimer(record({ expiresAt: NOW + HOUR, claims: ['play:aaaa', 'play:bbbb'], shelf: [bought('bbbb', 60)] }), storage);
    const text = encodeCloudSave(localCloudSave(storage, () => NOW).read());
    expect(JSON.parse(text).held).toEqual([bought('bbbb', 60)]);
    expect(text).not.toMatch(/expires|claims|aaaa/);
  });
});
