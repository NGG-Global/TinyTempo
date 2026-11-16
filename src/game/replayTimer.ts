import { PRODUCT } from '../monetization/types';

/**
 * Replay timers: unlimited restarts for a while, held until the player starts one.
 *
 * Four consumable Play products — thirty minutes, an hour, two hours or a day — and the timers
 * a Daily Tempo run wins. While a timer runs, every restart from the puck is free and asks
 * nothing (`restartKind` reads `timerActive`), the day's restarts are not touched, and the
 * puck's badge shows what is left. Hearts are untouched: a timer pays for restarts, which are
 * the one thing Premium used to make unlimited that a player actually runs out of mid-level.
 *
 * **Buying holds; starting adds.** A purchase lands on the **shelf** as a `HeldTimer` and
 * starts only when the player taps Start — on the store card, the Daily card, or the "No
 * restarts left" sheet, whose *Buy & restart* is the one place a purchase starts at once,
 * so the player never taps twice. Starting adds the item's span to the running expiry from
 * its end, so no minute is lost; with none running it starts now. A **won** timer must be
 * started within an hour (`WON_START_WINDOW_MS`) or it leaves the shelf; a **bought** one
 * keeps until it is started, which is why the shelf is the one owned thing the cloud save
 * carries (`playgames/cloudSave.ts`): a paid timer must survive a reinstall.
 *
 * **A started item stays on the shelf as a tombstone** (`startedAt` set). The cloud merge
 * can only add, so the only way device B learns that device A started the timer is to find
 * the started copy in the union; tombstones are pruned by age, and a won item's with its
 * start window. **A grant is idempotent per claim id**: the ids are persisted beside the
 * shelf, because fulfilment runs grant-then-consume and a crash between the two replays the
 * purchase on the next reconcile. The running expiry and the claims stay with the device.
 */
export interface ReplayTimerOption {
  readonly product: TimerProductId;
  readonly minutes: number;
  /** The row's name: "30 minutes", "1 hour", "2 hours", "1 day". */
  readonly label: string;
  /** The chip's name where the row is short: "30 min", "1 hr", "2 hr", "1 day". */
  readonly short: string;
}

export type TimerProductId =
  | typeof PRODUCT.timer30m | typeof PRODUCT.timer1h | typeof PRODUCT.timer2h | typeof PRODUCT.timer1d;

export const REPLAY_TIMERS: readonly ReplayTimerOption[] = Object.freeze([
  { product: PRODUCT.timer30m, minutes: 30, label: '30 minutes', short: '30 min' },
  { product: PRODUCT.timer1h, minutes: 60, label: '1 hour', short: '1 hr' },
  { product: PRODUCT.timer2h, minutes: 120, label: '2 hours', short: '2 hr' },
  { product: PRODUCT.timer1d, minutes: 24 * 60, label: '1 day', short: '1 day' },
]);

export const REPLAY_TIMER_KEY = 'tiny-tempo.replayTimer.v1';

/**
 * The most a stored expiry may stand ahead of the clock before it is read as damage rather
 * than a purchase: a week, well past the longest stack anyone would buy in one sitting, and
 * nothing like forever. Only the expiry is damaged by it: the claims and the shelf are kept,
 * since a record that lost its claim ids would let a replayed purchase hold twice.
 */
const MAX_AHEAD_MS = 7 * 24 * 60 * 60 * 1000;
/** Claim ids kept: enough that no purchase Play could still replay is forgotten. */
const CLAIMS_KEPT = 64;
/** How long a won timer waits on the shelf before it is gone. */
export const WON_START_WINDOW_MS = 60 * 60_000;
/** The shelf's bound, items and tombstones together: far past what a player holds, small enough for a snapshot. */
export const SHELF_MAX = 32;
/** A started bought item's tombstone outlives any plausible gap between two devices' syncs. */
const TOMBSTONE_KEPT_MS = 30 * 24 * 60 * 60_000;
/** No held item is longer than the longest product. */
const MAX_HELD_MINUTES = 24 * 60;
/** A held item reads as "expiring" under this much of its window. */
const EXPIRING_SOON_MS = 10 * 60_000;
/** A bought item's id is Play's claim id; a won one names its day, and its place among the day's starts. */
const HELD_ID = /^(play|won):[A-Za-z0-9:._-]{1,60}$/;

export type HeldSource = 'won' | 'bought';

export interface HeldTimer {
  readonly id: string;
  readonly minutes: number;
  readonly source: HeldSource;
  /** Won only: the wall-clock deadline to start it by. */
  readonly startBy?: number;
  /** Set when started: the tombstone the cloud merge needs. */
  readonly startedAt?: number;
}

export interface ReplayTimer {
  /** When the running timer ends, wall clock ms; at or before now is no timer. */
  readonly expiresAt: number;
  /** The purchases already held, newest last. */
  readonly claims: readonly string[];
  /** Held timers and the tombstones of started ones. */
  readonly shelf: readonly HeldTimer[];
}

export const NO_TIMER: ReplayTimer = Object.freeze({
  expiresAt: 0, claims: Object.freeze([]) as readonly string[], shelf: Object.freeze([]) as readonly HeldTimer[],
});

export function timerOption(product: string): ReplayTimerOption | null {
  return REPLAY_TIMERS.find(option => option.product === product) ?? null;
}

export function isTimerProduct(product: string): product is TimerProductId {
  return timerOption(product) !== null;
}

/** Milliseconds the running timer still has, never negative. */
export function timerLeftMs(timer: { readonly expiresAt: number } | null, now: number): number {
  if (timer === null || !Number.isFinite(timer.expiresAt)) return 0;
  return Math.max(0, timer.expiresAt - now);
}

export function timerActive(timer: { readonly expiresAt: number } | null, now: number): boolean {
  return timerLeftMs(timer, now) > 0;
}

/** The timer with `product`'s span added: from its end while it runs, from now otherwise. */
export function extendTimer(timer: ReplayTimer | null, product: TimerProductId, now: number): ReplayTimer {
  const option = timerOption(product);
  return extendBy(timer ?? NO_TIMER, option?.minutes ?? 0, now);
}

function extendBy(timer: ReplayTimer, minutes: number, now: number): ReplayTimer {
  const from = Math.max(now, timer.expiresAt);
  return { ...timer, expiresAt: from + minutes * 60_000 };
}

/**
 * What is left, for a badge or a row: minutes under an hour, hours and minutes under a day,
 * then days and hours. Rounded up, so a timer never reads 0 while it still runs.
 */
export function formatTimerLeft(ms: number): string {
  const minutes = Math.max(0, Math.ceil(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
  const days = Math.floor(hours / 24);
  const hoursLeft = hours % 24;
  return hoursLeft === 0 ? `${days} day${days === 1 ? '' : 's'}` : `${days} day${days === 1 ? '' : 's'} ${hoursLeft} hr`;
}

/** The badge's form: "29m", "1h", "23h", "2d". Three characters at most. */
export function shortTimerLeft(ms: number): string {
  const minutes = Math.max(0, Math.ceil(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** A held item's length on its token: "40m", "1h", "1h 30m", "1d". */
export function compactMinutes(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  if (whole < 60) return `${whole}m`;
  if (whole % (24 * 60) === 0) return `${whole / (24 * 60)}d`;
  const hours = Math.floor(whole / 60), rest = whole % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** A held item's length as words: "40 min", "1 hr 30 min". */
export function formatMinutes(minutes: number): string {
  return formatTimerLeft(Math.max(0, minutes) * 60_000);
}

/** The won token's deadline: "Start within 38 min", "Start within 1 hr". */
export function formatStartWithin(ms: number): string {
  return `Start within ${formatTimerLeft(ms)}`;
}

/** One stored item, read defensively: anything off is dropped, never the record. */
export function parseHeldTimer(item: unknown): HeldTimer | null {
  if (typeof item !== 'object' || item === null) return null;
  const { id, minutes, source, startBy, startedAt } = item as Record<string, unknown>;
  if (typeof id !== 'string' || !HELD_ID.test(id)) return null;
  if (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < 1 || minutes > MAX_HELD_MINUTES) return null;
  if (source !== 'won' && source !== 'bought') return null;
  const time = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined);
  const held: { -readonly [K in keyof HeldTimer]: HeldTimer[K] } = { id, minutes, source };
  if (startBy !== undefined) {
    const by = time(startBy);
    if (by === undefined) return null;
    held.startBy = by;
  }
  if (startedAt !== undefined) {
    const at = time(startedAt);
    if (at === undefined) return null;
    held.startedAt = at;
  }
  return held;
}

function parseShelf(raw: unknown): HeldTimer[] {
  if (!Array.isArray(raw)) return [];
  const shelf: HeldTimer[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const item = parseHeldTimer(entry);
    if (item && !seen.has(item.id)) { seen.add(item.id); shelf.push(item); }
  }
  return shelf.slice(0, SHELF_MAX);
}

/** A stored record, or null for nothing or damage. A version-1 record reads with an empty shelf. */
export function parseReplayTimer(raw: string | null, now: number): ReplayTimer | null {
  if (!raw) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
    const { expiresAt, claims, shelf } = data as { expiresAt?: unknown; claims?: unknown; shelf?: unknown };
    if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt) || expiresAt < 0) return null;
    const ids = Array.isArray(claims) ? claims.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 64) : [];
    return {
      // Ahead of anything a purchase could set: the expiry is damage, the rest of the record is not.
      expiresAt: expiresAt > now + MAX_AHEAD_MS ? 0 : expiresAt,
      claims: ids.slice(-CLAIMS_KEPT),
      shelf: parseShelf(shelf),
    };
  } catch {
    return null;
  }
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export function loadReplayTimer(storage: Storage | null = safeStorage(), now: number = Date.now()): ReplayTimer | null {
  try { return parseReplayTimer(storage?.getItem(REPLAY_TIMER_KEY) ?? null, now); } catch { return null; }
}

/** False means nothing was written. */
export function saveReplayTimer(timer: ReplayTimer, storage: Storage | null = safeStorage()): boolean {
  try {
    storage?.setItem(REPLAY_TIMER_KEY, JSON.stringify({
      version: 2, expiresAt: timer.expiresAt, claims: timer.claims.slice(-CLAIMS_KEPT), shelf: timer.shelf.slice(0, SHELF_MAX),
    }));
    return storage !== null;
  } catch {
    return false;
  }
}

export interface HoldOutcome {
  /** False when the claim was already held, or the item is not one the shelf takes. */
  readonly held: boolean;
  readonly timer: ReplayTimer;
}

/** Session claims, so a persist that failed cannot let the same purchase hold twice before a reload. */
const sessionClaims = new Set<string>();

/**
 * Put one timer on the shelf. The same id never holds twice, in this session or after a
 * reload; a bought item's id is also recorded in `claims`, the ledger a replayed purchase
 * is checked against.
 */
export function holdTimer(timer: ReplayTimer | null, item: HeldTimer, now: number): HoldOutcome {
  const current = timer ?? NO_TIMER;
  const clean = parseHeldTimer(item);
  if (!clean || clean.startedAt !== undefined) return { held: false, timer: current };
  if (sessionClaims.has(clean.id) || current.claims.includes(clean.id) || current.shelf.some(held => held.id === clean.id)) {
    return { held: false, timer: current };
  }
  if (clean.source === 'bought') sessionClaims.add(clean.id);
  const claims = clean.source === 'bought' ? [...current.claims, clean.id].slice(-CLAIMS_KEPT) : current.claims;
  return { held: true, timer: pruneShelf({ ...current, claims, shelf: [...current.shelf, clean] }, now) };
}

/** Load, hold, persist. The billing adapter calls this when Play reports a timer paid for. */
export function redeemHeldTimer(product: string, claimId: string, now: number = Date.now(), storage: Storage | null = safeStorage()): HoldOutcome {
  const option = timerOption(product);
  const current = loadReplayTimer(storage, now) ?? NO_TIMER;
  if (!option || typeof claimId !== 'string' || claimId.length === 0) return { held: false, timer: current };
  const outcome = holdTimer(current, { id: claimId, minutes: option.minutes, source: 'bought' }, now);
  if (outcome.held) saveReplayTimer(outcome.timer, storage);
  return outcome;
}

export type StartRefusal = 'missing' | 'started' | 'expired' | 'full';

export interface StartOutcome {
  readonly started: boolean;
  readonly reason?: StartRefusal;
  readonly timer: ReplayTimer;
}

/**
 * Start a held timer: its span goes onto the running expiry from the end, and the item
 * stays as a tombstone. Refused, never clamped, when the stack would pass the week the
 * record may stand ahead — the shelf exists so that no paid minute is lost.
 */
export function startHeldTimer(timer: ReplayTimer | null, id: string, now: number): StartOutcome {
  const current = timer ?? NO_TIMER;
  const item = current.shelf.find(held => held.id === id);
  if (!item) return { started: false, reason: 'missing', timer: current };
  if (item.startedAt !== undefined) return { started: false, reason: 'started', timer: current };
  if (item.startBy !== undefined && item.startBy <= now) return { started: false, reason: 'expired', timer: current };
  if (Math.max(now, current.expiresAt) + item.minutes * 60_000 > now + MAX_AHEAD_MS) return { started: false, reason: 'full', timer: current };
  const extended = extendBy(current, item.minutes, now);
  const shelf = current.shelf.map(held => (held.id === id ? { ...held, startedAt: now } : held));
  return { started: true, timer: pruneShelf({ ...extended, shelf }, now) };
}

/** Load, start, persist. The scenes' one call. */
export function startHeldTimerNow(id: string, now: number = Date.now(), storage: Storage | null = safeStorage()): StartOutcome {
  const outcome = startHeldTimer(loadReplayTimer(storage, now), id, now);
  if (outcome.started) saveReplayTimer(outcome.timer, storage);
  return outcome;
}

/**
 * What the shelf lets go of: a won item past its window, its tombstone once that window has
 * passed (a held copy arriving later is itself past it), a bought tombstone older than the
 * keep, and then the oldest tombstones if the shelf is still over its bound — never a held
 * item ahead of a tombstone.
 */
export function pruneShelf(timer: ReplayTimer, now: number): ReplayTimer {
  const kept = timer.shelf.filter(item => {
    if (item.startBy !== undefined && item.startBy <= now) return false;
    if (item.startedAt !== undefined && item.source === 'bought' && now - item.startedAt > TOMBSTONE_KEPT_MS) return false;
    return true;
  });
  if (kept.length <= SHELF_MAX) return kept.length === timer.shelf.length ? timer : { ...timer, shelf: kept };
  const tombstones = kept.filter(item => item.startedAt !== undefined).sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));
  const drop = new Set(tombstones.slice(0, kept.length - SHELF_MAX).map(item => item.id));
  const bounded = kept.filter(item => !drop.has(item.id));
  return { ...timer, shelf: bounded.slice(0, SHELF_MAX) };
}

export interface WonUpgrade {
  /** Minutes added to the shelf: 0 when the run won nothing new. */
  readonly granted: number;
  readonly timer: ReplayTimer;
}

/**
 * A Daily Tempo run's timer, as the day's total so far. One won timer a day: a better run
 * **upgrades** the unstarted one and resets its hour; if the day's won timer was already
 * started, the difference lands as a new won item named for its place among the day's
 * starts, so two devices applying the same payout derive the same id.
 */
export function upgradeWonTimer(timer: ReplayTimer | null, dayKey: string, totalMinutes: number, now: number): WonUpgrade {
  const current = timer ?? NO_TIMER;
  const prefix = `won:${dayKey}`;
  const ofDay = current.shelf.filter(item => item.source === 'won' && (item.id === prefix || item.id.startsWith(`${prefix}:`)));
  const started = ofDay.filter(item => item.startedAt !== undefined);
  const startedMinutes = started.reduce((sum, item) => sum + item.minutes, 0);
  const remaining = Math.min(MAX_HELD_MINUTES, Math.round(totalMinutes)) - startedMinutes;
  const held = ofDay.find(item => item.startedAt === undefined && (item.startBy === undefined || item.startBy > now));
  const startBy = now + WON_START_WINDOW_MS;
  if (held) {
    if (remaining <= held.minutes) return { granted: 0, timer: current };
    const shelf = current.shelf.map(item => (item.id === held.id ? { ...item, minutes: remaining, startBy } : item));
    return { granted: remaining - held.minutes, timer: pruneShelf({ ...current, shelf }, now) };
  }
  if (remaining <= 0) return { granted: 0, timer: current };
  const id = started.length === 0 ? prefix : `${prefix}:${started.length}`;
  if (current.shelf.some(item => item.id === id)) return { granted: 0, timer: current };
  const item: HeldTimer = { id, minutes: remaining, source: 'won', startBy };
  return { granted: remaining, timer: pruneShelf({ ...current, shelf: [...current.shelf, item] }, now) };
}

/**
 * Two shelves into one, for the cloud: a union by id where a started copy beats a held one,
 * two held copies of a won item take the longer span and the later window (an upgrade
 * resets the hour), and two held bought copies are the same item. Sorted by id, so the
 * result's text is canonical; pruning is the caller's, since it needs the clock.
 */
export function mergeShelf(a: readonly HeldTimer[], b: readonly HeldTimer[]): HeldTimer[] {
  const byId = new Map<string, HeldTimer>();
  for (const item of [...a, ...b]) {
    const other = byId.get(item.id);
    if (!other) { byId.set(item.id, item); continue; }
    if (item.startedAt !== undefined && other.startedAt === undefined) { byId.set(item.id, item); continue; }
    if (item.startedAt === undefined && other.startedAt !== undefined) continue;
    if (item.startedAt !== undefined && other.startedAt !== undefined) {
      byId.set(item.id, item.startedAt < other.startedAt ? item : other);
      continue;
    }
    const merged: { -readonly [K in keyof HeldTimer]: HeldTimer[K] } = { ...other, minutes: Math.max(item.minutes, other.minutes) };
    const by = Math.max(item.startBy ?? -Infinity, other.startBy ?? -Infinity);
    if (Number.isFinite(by)) merged.startBy = by;
    byId.set(item.id, merged);
  }
  return [...byId.values()].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)).slice(0, SHELF_MAX);
}

export type ShelfItemState = 'held' | 'expiring' | 'expired';

export interface ShelfItemView {
  readonly id: string;
  readonly minutes: number;
  readonly source: HeldSource;
  readonly state: ShelfItemState;
  /** "40m" for the token face. */
  readonly compact: string;
  /** "40 min", "1 hr 30 min" for a row. */
  readonly label: string;
  /** Won only: "Start within 38 min"; null for a bought item. */
  readonly startWithin: string | null;
  /** Won only: how much of its window is left, 1 → 0. */
  readonly window: number;
}

export interface ShelfView {
  readonly running: { readonly leftMs: number; readonly label: string; readonly short: string } | null;
  /** Held items, won first by their deadline, then bought in the order held. Tombstones are not shown. */
  readonly items: readonly ShelfItemView[];
}

export function shelfView(timer: ReplayTimer | null, now: number): ShelfView {
  const current = timer ?? NO_TIMER;
  const leftMs = timerLeftMs(current, now);
  const running = leftMs > 0 ? { leftMs, label: formatTimerLeft(leftMs), short: shortTimerLeft(leftMs) } : null;
  const held = current.shelf.filter(item => item.startedAt === undefined);
  const won = held.filter(item => item.source === 'won').sort((a, b) => (a.startBy ?? 0) - (b.startBy ?? 0));
  const bought = held.filter(item => item.source === 'bought');
  const items = [...won, ...bought].map((item): ShelfItemView => {
    const left = item.startBy === undefined ? Infinity : item.startBy - now;
    const state: ShelfItemState = left <= 0 ? 'expired' : left <= EXPIRING_SOON_MS ? 'expiring' : 'held';
    return {
      id: item.id, minutes: item.minutes, source: item.source, state,
      compact: compactMinutes(item.minutes), label: formatMinutes(item.minutes),
      startWithin: item.startBy === undefined ? null : formatStartWithin(Math.max(0, left)),
      window: item.startBy === undefined ? 1 : Math.max(0, Math.min(1, left / WON_START_WINDOW_MS)),
    };
  });
  return { running, items };
}

/** Whether a timer runs on this device now. The one read the restart rules make. */
export function replayTimerActive(now: number = Date.now(), storage: Storage | null = safeStorage()): boolean {
  return timerActive(loadReplayTimer(storage, now), now);
}

/** Tests only: forget the session's claims. */
export function resetReplayTimerSession(): void {
  sessionClaims.clear();
}
