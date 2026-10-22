import { PRODUCT } from '../monetization/types';

/**
 * Replay timers: unlimited restarts for a while, bought outright.
 *
 * Four consumable Play products, each adding a span of time to **one** timer on the device:
 * thirty minutes, an hour, two hours or a day. While the timer runs, every restart from the
 * puck is free and asks nothing (`restartKind` reads `timerActive`), the day's two restarts
 * are not touched, and the puck's badge shows what is left. Hearts are untouched: a timer
 * pays for restarts, which are the one thing Premium used to make unlimited that a player
 * actually runs out of mid-level. Premium itself is no longer sold; a Play account that owns
 * it keeps what it paid for (`docs/BILLING.md`).
 *
 * **Buying adds, never replaces.** A timer bought while one runs extends it from its end,
 * so no paid minute is lost; bought with none running, it starts now. The expiry is wall
 * clock, like the daily heart and the daily restarts, and is stored on the device only
 * (`tiny-tempo.replayTimer.v1`): in no save code and no cloud snapshot, because it is paid
 * for and the save carries nothing a player owes or owns.
 *
 * **A grant is idempotent per claim id**, and the ids are persisted beside the expiry, for
 * the same reason the refill's are: fulfilment runs grant-then-consume, so a crash between
 * the two replays the purchase on the next reconcile, and the claim id is what stops the
 * replay adding the time twice.
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
 * nothing like forever. A clock moved back keeps the time it already had.
 */
const MAX_AHEAD_MS = 7 * 24 * 60 * 60 * 1000;
/** Claim ids kept: enough that no purchase Play could still replay is forgotten. */
const CLAIMS_KEPT = 64;

export interface ReplayTimer {
  /** When the timer ends, wall clock ms; at or before now is no timer. */
  readonly expiresAt: number;
  /** The purchases already added, newest last. */
  readonly claims: readonly string[];
}

export const NO_TIMER: ReplayTimer = Object.freeze({ expiresAt: 0, claims: Object.freeze([]) as readonly string[] });

export function timerOption(product: string): ReplayTimerOption | null {
  return REPLAY_TIMERS.find(option => option.product === product) ?? null;
}

export function isTimerProduct(product: string): product is TimerProductId {
  return timerOption(product) !== null;
}

/** Milliseconds the timer still has, never negative. */
export function timerLeftMs(timer: ReplayTimer | null, now: number): number {
  if (timer === null || !Number.isFinite(timer.expiresAt)) return 0;
  return Math.max(0, timer.expiresAt - now);
}

export function timerActive(timer: ReplayTimer | null, now: number): boolean {
  return timerLeftMs(timer, now) > 0;
}

/** The timer with `product`'s span added: from its end while it runs, from now otherwise. */
export function extendTimer(timer: ReplayTimer | null, product: TimerProductId, now: number): ReplayTimer {
  const option = timerOption(product);
  const from = Math.max(now, timer?.expiresAt ?? 0);
  const claims = timer?.claims ?? [];
  return { expiresAt: from + (option?.minutes ?? 0) * 60_000, claims };
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

/** A stored timer, or null for nothing, damage, or an expiry no purchase could have set. */
export function parseReplayTimer(raw: string | null, now: number): ReplayTimer | null {
  if (!raw) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    const { expiresAt, claims } = data as { expiresAt?: unknown; claims?: unknown };
    if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt) || expiresAt < 0) return null;
    if (expiresAt > now + MAX_AHEAD_MS) return null;
    const ids = Array.isArray(claims) ? claims.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 64) : [];
    return { expiresAt, claims: ids.slice(-CLAIMS_KEPT) };
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
    storage?.setItem(REPLAY_TIMER_KEY, JSON.stringify({ version: 1, expiresAt: timer.expiresAt, claims: timer.claims.slice(-CLAIMS_KEPT) }));
    return storage !== null;
  } catch {
    return false;
  }
}

export interface TimerGrant {
  /** False when the claim was already added, or names no timer product. */
  readonly granted: boolean;
  readonly timer: ReplayTimer;
}

/** Session claims, so a persist that failed cannot let the same purchase add twice before a reload. */
const sessionClaims = new Set<string>();

/**
 * Add `product`'s span for one confirmed purchase. The same `claimId` never adds twice, in
 * this session or after a reload.
 */
export function claimTimer(timer: ReplayTimer | null, product: string, claimId: string, now: number): TimerGrant {
  const current = timer ?? NO_TIMER;
  if (!isTimerProduct(product) || typeof claimId !== 'string' || claimId.length === 0) return { granted: false, timer: current };
  if (sessionClaims.has(claimId) || current.claims.includes(claimId)) return { granted: false, timer: current };
  sessionClaims.add(claimId);
  const extended = extendTimer(current, product, now);
  return { granted: true, timer: { expiresAt: extended.expiresAt, claims: [...current.claims, claimId].slice(-CLAIMS_KEPT) } };
}

/** Load, add, persist. The billing adapter calls this when Play reports a timer paid for. */
export function redeemTimer(product: string, claimId: string, now: number = Date.now(), storage: Storage | null = safeStorage()): TimerGrant {
  const grant = claimTimer(loadReplayTimer(storage, now), product, claimId, now);
  if (grant.granted) saveReplayTimer(grant.timer, storage);
  return grant;
}

/** Whether a timer runs on this device now. The one read the restart rules make. */
export function replayTimerActive(now: number = Date.now(), storage: Storage | null = safeStorage()): boolean {
  return timerActive(loadReplayTimer(storage, now), now);
}

/** Tests only: forget the session's claims. */
export function resetReplayTimerSession(): void {
  sessionClaims.clear();
}
