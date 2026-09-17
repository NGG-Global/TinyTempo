import { levelSpec, starsFor } from './levels';
import type { Progress } from './progress';

/**
 * Stamina for challenge attempts. Separate from rhythm scoring: stars still come only
 * from accuracy, and a heart is never a point. Persistence follows `progress.ts` —
 * versioned, every field validated on read, storage optional.
 */
export const HEALTH = {
  max: 5,
  /** One heart returns this many milliseconds after the current refill started. */
  regenMs: 20 * 60 * 1000,
  /** Levels up to this one never cost a heart. */
  protectedThrough: 5,
} as const;

/** Shown when the bar is empty: replays stay free, the frontier still costs a heart. */
export const HEALTH_COPY = {
  restNote: 'Finished levels stay open. Hearts are for the next one.',
  playNote: 'Finished levels stay open on the map.',
} as const;

export interface Health {
  readonly hearts: number;
  /**
   * Epoch ms when the current regen interval started. Null at full health. Spending
   * another heart does not rewrite this; the display countdown is derived from it.
   */
  readonly refillStartedAt: number | null;
  /** Attempt currently holding a spent heart, if any. Used so spend/refund are idempotent. */
  readonly spentAttempt: string | null;
}

export interface HealthView {
  readonly hearts: number;
  readonly maxHearts: number;
  /** Milliseconds until the next heart, or null when already at max. */
  readonly nextHeartInMs: number | null;
}

export interface BeginAttemptResult {
  readonly ok: boolean;
  readonly spent: boolean;
  readonly health: Health;
}

export interface FinishAttemptResult {
  readonly refunded: boolean;
  readonly health: Health;
}

export interface GrantHeartResult {
  readonly granted: boolean;
  readonly health: Health;
}

/** Claim ids already granted this session, so a double Rewarded callback cannot add two hearts. */
const claimedIds = new Set<string>();
/** Transaction ids already filled this session, so a double purchase callback cannot refill twice. */
const filledIds = new Set<string>();

const KEY = 'tiny-tempo.health.v1';
/** Persist refill transaction ids so a replayed purchase after a restart cannot fill twice. */
const FILLS_KEY = 'tiny-tempo.fills.v1';
const FILLS_KEEP = 64;
/** Local calendar day of the last free heart, so a reload cannot claim twice today. */
const DAILY_KEY = 'tiny-tempo.daily-heart.v1';
/** Session days already claimed, so a failed persist cannot grant twice before reload. */
const claimedDays = new Set<string>();
/** Written but not required on read, so a future migration has something to branch on. */
const VERSION = 1;
const FULL: Health = Object.freeze({ hearts: HEALTH.max, refillStartedAt: null, spentAttempt: null });

function freeze(health: Health): Health {
  return Object.freeze({
    hearts: health.hearts,
    refillStartedAt: health.refillStartedAt,
    spentAttempt: health.spentAttempt,
  });
}

function clampHearts(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  return Math.max(0, Math.min(HEALTH.max, value));
}

/**
 * Apply elapsed regeneration. Pure: the stored timestamp only advances by whole
 * intervals, so a UI tick never restarts the refill.
 */
export function reconcile(health: Health, now: number): Health {
  if (health.hearts >= HEALTH.max) {
    return health.refillStartedAt === null ? health : freeze({ ...health, refillStartedAt: null });
  }
  if (!Number.isFinite(now)) return health;
  const started = health.refillStartedAt;
  if (started === null || !Number.isFinite(started) || started > now) {
    return freeze({ ...health, refillStartedAt: now });
  }
  const gained = Math.floor((now - started) / HEALTH.regenMs);
  if (gained <= 0) return health;
  const hearts = Math.min(HEALTH.max, health.hearts + gained);
  return freeze({
    hearts,
    refillStartedAt: hearts >= HEALTH.max ? null : started + gained * HEALTH.regenMs,
    spentAttempt: health.spentAttempt,
  });
}

export function viewHealth(health: Health, now: number = Date.now()): HealthView {
  const live = reconcile(health, now);
  if (live.hearts >= HEALTH.max || live.refillStartedAt === null) {
    return { hearts: Math.min(HEALTH.max, live.hearts), maxHearts: HEALTH.max, nextHeartInMs: null };
  }
  return {
    hearts: live.hearts,
    maxHearts: HEALTH.max,
    nextHeartInMs: Math.max(0, live.refillStartedAt + HEALTH.regenMs - now),
  };
}

/**
 * How far the current refill has come, 0-1. The countdown already says when the next
 * heart lands; this is the same fact as a picture, for the bar and the half-filled heart
 * that the refined screens draw. Full hearts read as 0: there is nothing on the way.
 */
export function heartProgress(view: HealthView): number {
  if (view.nextHeartInMs === null) return 0;
  return Math.max(0, Math.min(1, 1 - view.nextHeartInMs / HEALTH.regenMs));
}

/** `m:ss` remaining. Ceil so a leftover millisecond still reads as a second on the clock. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function healthHud(
  view: HealthView,
  options: { readonly premium?: boolean } = {},
): { readonly count: string; readonly wait: string | null } {
  if (options.premium === true) return { count: '∞', wait: null };
  return {
    count: `${view.hearts}/${view.maxHearts}`,
    wait: view.nextHeartInMs === null ? null : formatCountdown(view.nextHeartInMs),
  };
}

/**
 * One id per begun run. `{level}:{request}` reused the same string after a scene
 * rebuild, so a leftover `spentAttempt` could skip the next spend or refund an
 * abandoned heart.
 */
export function createAttemptId(level: number): string {
  return `${level}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}

export function isProtectedLevel(level: number): boolean {
  return Number.isInteger(level) && level >= 1 && level <= HEALTH.protectedThrough;
}

export function isMastered(progress: Progress, level: number): boolean {
  const best = progress.best[level];
  if (best === undefined) return false;
  return starsFor(best, levelSpec(level)) === 3;
}

/** Cleared at least once: `best` is only written when a run earns a star. */
export function isCleared(progress: Progress, level: number): boolean {
  const best = progress.best[level];
  return typeof best === 'number' && Number.isFinite(best);
}

/**
 * Hearts gate the unfinished frontier. Early levels and any previously cleared
 * level can be played at zero hearts; they never spend one.
 */
export function attemptCostsHeart(progress: Progress, level: number): boolean {
  return !isProtectedLevel(level) && !isCleared(progress, level);
}

export function canBeginAttempt(
  health: Health, progress: Progress, level: number, now: number = Date.now(), premium = false,
): boolean {
  if (premium || !attemptCostsHeart(progress, level)) return true;
  return reconcile(health, now).hearts > 0;
}

/** Local `YYYY-MM-DD`, so a daily heart resets at the player's midnight, not UTC. */
export function calendarDay(now: number): string {
  const date = new Date(now);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function canClaimDailyHeart(
  health: Health, now: number = Date.now(), storage: Storage | null = safeStorage(),
): boolean {
  const live = reconcile(health, now);
  if (live.hearts > 0) return false;
  const day = calendarDay(now);
  if (claimedDays.has(day)) return false;
  return readDailyDay(storage) !== day;
}

/**
 * Called when actual gameplay begins, not when the scene is entered. Initialization
 * that fails before this is reached must not call it. Idempotent per `attemptId`.
 */
export function beginAttempt(
  health: Health, progress: Progress, level: number, attemptId: string, now: number = Date.now(),
  premium = false,
): BeginAttemptResult {
  const live = reconcile(health, now);
  if (premium || !attemptCostsHeart(progress, level)) return { ok: true, spent: false, health: live };
  if (live.spentAttempt === attemptId) return { ok: true, spent: true, health: live };
  if (live.hearts <= 0) return { ok: false, spent: false, health: live };
  return {
    ok: true,
    spent: true,
    health: freeze({
      hearts: live.hearts - 1,
      // Start the clock only when leaving full health; an existing refill keeps its stamp.
      refillStartedAt: live.refillStartedAt ?? now,
      spentAttempt: attemptId,
    }),
  };
}

/**
 * Resolves a finished attempt. Three stars refunds the heart this attempt spent;
 * 0–2 stars leaves it spent. Duplicate calls with the same id do not refund twice.
 */
export function finishAttempt(
  health: Health, attemptId: string, stars: 0 | 1 | 2 | 3, now: number = Date.now(),
): FinishAttemptResult {
  const live = reconcile(health, now);
  if (live.spentAttempt !== attemptId) return { refunded: false, health: live };
  if (stars === 3) {
    const hearts = Math.min(HEALTH.max, live.hearts + 1);
    return {
      refunded: true,
      health: freeze({
        hearts,
        refillStartedAt: hearts >= HEALTH.max ? null : (live.refillStartedAt ?? now),
        spentAttempt: null,
      }),
    };
  }
  return { refunded: false, health: freeze({ ...live, spentAttempt: null }) };
}

/** Leaving a run that already began: the heart stays spent. Idempotent per `attemptId`. */
export function abandonAttempt(health: Health, attemptId: string, now: number = Date.now()): Health {
  const live = reconcile(health, now);
  if (live.spentAttempt !== attemptId) return live;
  return freeze({ ...live, spentAttempt: null });
}

/**
 * Adds exactly one heart, never above `HEALTH.max`. A grant at max is a no-op.
 * An existing refill stamp is kept until the bar fills, matching a 3-star refund.
 */
export function grantHeart(health: Health, now: number = Date.now()): GrantHeartResult {
  const live = reconcile(health, now);
  if (live.hearts >= HEALTH.max) return { granted: false, health: live };
  const hearts = Math.min(HEALTH.max, live.hearts + 1);
  return {
    granted: true,
    health: freeze({
      hearts,
      refillStartedAt: hearts >= HEALTH.max ? null : (live.refillStartedAt ?? now),
      spentAttempt: live.spentAttempt,
    }),
  };
}

/**
 * One free heart per local calendar day, and only while the bar is empty.
 * The day is recorded even if persist fails, so a double tap cannot grant two.
 */
export function claimDailyHeart(
  health: Health, now: number = Date.now(), storage: Storage | null = safeStorage(),
): GrantHeartResult {
  const live = reconcile(health, now);
  if (!canClaimDailyHeart(live, now, storage)) return { granted: false, health: live };
  const result = grantHeart(live, now);
  if (!result.granted) return result;
  const day = calendarDay(now);
  claimedDays.add(day);
  writeDailyDay(storage, day);
  return result;
}

/** Load, claim today's heart, persist. Scenes call this from the empty-heart sheet. */
export function redeemDailyHeart(now: number = Date.now()): GrantHeartResult {
  const storage = safeStorage();
  const result = claimDailyHeart(loadHealth(storage, now), now, storage);
  if (result.granted) saveHealth(result.health, storage);
  return result;
}

/**
 * Grants one heart for a rewarded-ad completion. The same `claimId` never grants
 * twice, even if the SDK fires Rewarded and the show promise together.
 */
export function claimHeart(health: Health, claimId: string, now: number = Date.now()): GrantHeartResult {
  const live = reconcile(health, now);
  if (typeof claimId !== 'string' || claimId.length === 0 || claimedIds.has(claimId)) {
    return { granted: false, health: live };
  }
  claimedIds.add(claimId);
  return grantHeart(live, now);
}

/** Load, claim, persist. Scenes call this after a rewarded ad reports completion. */
export function redeemHeart(claimId: string, now: number = Date.now()): GrantHeartResult {
  const result = claimHeart(loadHealth(undefined, now), claimId, now);
  if (result.granted) saveHealth(result.health);
  return result;
}

/**
 * Restores the bar to `HEALTH.max` and clears the regen clock. Already-full health is a no-op.
 * A spent attempt is left alone so a 3-star refund still has an id to match.
 */
export function fillHearts(health: Health, now: number = Date.now()): GrantHeartResult {
  const live = reconcile(health, now);
  if (live.hearts >= HEALTH.max) return { granted: false, health: live };
  return {
    granted: true,
    health: freeze({
      hearts: HEALTH.max,
      refillStartedAt: null,
      spentAttempt: live.spentAttempt,
    }),
  };
}

/**
 * Fills the bar for a confirmed heart-refill purchase. The same `claimId` never fills twice.
 */
export function claimFill(
  health: Health, claimId: string, now: number = Date.now(), storage: Storage | null = safeStorage(),
): GrantHeartResult {
  const live = reconcile(health, now);
  if (typeof claimId !== 'string' || claimId.length === 0) {
    return { granted: false, health: live };
  }
  const persisted = readFillIds(storage);
  if (filledIds.has(claimId) || persisted.has(claimId)) {
    return { granted: false, health: live };
  }
  filledIds.add(claimId);
  persisted.add(claimId);
  writeFillIds(storage, persisted);
  return fillHearts(live, now);
}

/** Load, fill, persist. Scenes call this after a purchase reports success. */
export function redeemFill(claimId: string, now: number = Date.now()): GrantHeartResult {
  const result = claimFill(loadHealth(undefined, now), claimId, now);
  if (result.granted) saveHealth(result.health);
  return result;
}

/** Reads may fail in private windows or blocked storage; the game then starts at full health. */
export function loadHealth(storage: Storage | null = safeStorage(), now: number = Date.now()): Health {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return FULL;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return FULL;
    const { hearts, refillStartedAt, spentAttempt } = parsed as {
      hearts?: unknown; refillStartedAt?: unknown; spentAttempt?: unknown;
    };
    const cleanHearts = clampHearts(hearts);
    if (cleanHearts === null) return FULL;
    let started: number | null = null;
    if (typeof refillStartedAt === 'number' && Number.isFinite(refillStartedAt)) started = refillStartedAt;
    const attempt = typeof spentAttempt === 'string' && spentAttempt.length > 0 ? spentAttempt : null;
    return reconcile(freeze({
      hearts: cleanHearts,
      refillStartedAt: cleanHearts >= HEALTH.max ? null : started,
      spentAttempt: attempt,
    }), now);
  } catch {
    return FULL;
  }
}

/** False means nothing was written — blocked storage, a private window, or a full quota. */
export function saveHealth(health: Health, storage: Storage | null = safeStorage()): boolean {
  try {
    storage?.setItem(KEY, JSON.stringify({ version: VERSION, ...health }));
    return storage !== null;
  } catch {
    return false;
  }
}

/** Settings reset. False means nothing was written. */
export function clearHealth(storage: Storage | null = safeStorage()): boolean {
  claimedIds.clear();
  filledIds.clear();
  claimedDays.clear();
  try {
    storage?.removeItem(KEY);
    storage?.removeItem(FILLS_KEY);
    storage?.removeItem(DAILY_KEY);
    return storage !== null;
  } catch {
    return false;
  }
}

function readFillIds(storage: Storage | null): Set<string> {
  if (!storage) return new Set();
  try {
    const raw = storage.getItem(FILLS_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    const ids = new Set<string>();
    for (const item of parsed) {
      if (typeof item === 'string' && item.length > 0) ids.add(item);
    }
    return ids;
  } catch {
    return new Set();
  }
}

function writeFillIds(storage: Storage | null, ids: Set<string>): void {
  if (!storage) return;
  try {
    storage.setItem(FILLS_KEY, JSON.stringify([...ids].slice(-FILLS_KEEP)));
  } catch { /* private windows, blocked storage */ }
}

function readDailyDay(storage: Storage | null): string | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(DAILY_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const claimedOn = (parsed as { claimedOn?: unknown }).claimedOn;
    return typeof claimedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(claimedOn) ? claimedOn : null;
  } catch {
    return null;
  }
}

function writeDailyDay(storage: Storage | null, day: string): void {
  if (!storage) return;
  try {
    storage.setItem(DAILY_KEY, JSON.stringify({ version: VERSION, claimedOn: day }));
  } catch { /* private windows, blocked storage */ }
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
