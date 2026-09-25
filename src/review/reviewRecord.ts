/**
 * Whether the Google Play review flow has been tried on this device, and for which
 * milestone. Same defensive shape as `game/settings.ts`: every field is validated on
 * read, storage is optional, and a write reports whether it landed.
 *
 * This is install state, not progression. It deliberately does **not** travel in a save
 * code and is not merged with one: a review prompt is Play's one question to this
 * device, and restoring a code on a new phone must neither re-ask nor silence it.
 */
export interface ReviewAttempt {
  /** The milestone's stable id (`REVIEW_MILESTONES` in `appReview.ts`). */
  readonly milestone: string;
  /** The level whose clear opened the opportunity. */
  readonly level: number;
  /** Epoch milliseconds when the launch was tried. */
  readonly at: number;
  /** `__APP_VERSION__` at the time, so a future version-based milestone has something to read. */
  readonly appVersion: string;
}

export interface ReviewRecord {
  readonly attempts: readonly ReviewAttempt[];
}

const KEY = 'tiny-tempo.review.v1';
/** Written but not required on read, so a future migration has something to branch on. */
const VERSION = 1;
/** More milestones than the game will ever define, bounding what a tampered value can allocate. */
const MAX_ATTEMPTS = 32;

export const EMPTY_REVIEW_RECORD: ReviewRecord = Object.freeze({ attempts: Object.freeze([]) });

function toAttempt(value: unknown): ReviewAttempt | null {
  if (typeof value !== 'object' || value === null) return null;
  const { milestone, level, at, appVersion } = value as {
    milestone?: unknown; level?: unknown; at?: unknown; appVersion?: unknown;
  };
  if (typeof milestone !== 'string' || milestone === '') return null;
  return Object.freeze({
    milestone,
    level: Number.isInteger(level) && (level as number) >= 1 ? level as number : 0,
    at: typeof at === 'number' && Number.isFinite(at) ? at : 0,
    appVersion: typeof appVersion === 'string' ? appVersion : '',
  });
}

/** Reads may fail in private windows or blocked storage; the game then treats the flow as never tried. */
export function loadReviewRecord(storage: Storage | null = safeStorage()): ReviewRecord {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return EMPTY_REVIEW_RECORD;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_REVIEW_RECORD;
    const { attempts } = parsed as { attempts?: unknown };
    if (!Array.isArray(attempts)) return EMPTY_REVIEW_RECORD;
    const clean: ReviewAttempt[] = [];
    for (const entry of attempts.slice(0, MAX_ATTEMPTS)) {
      const attempt = toAttempt(entry);
      if (attempt && !clean.some(a => a.milestone === attempt.milestone)) clean.push(attempt);
    }
    return Object.freeze({ attempts: Object.freeze(clean) });
  } catch { return EMPTY_REVIEW_RECORD; }
}

/** False means nothing was written — blocked storage, a private window, or a full quota. */
export function saveReviewRecord(record: ReviewRecord, storage: Storage | null = safeStorage()): boolean {
  try {
    storage?.setItem(KEY, JSON.stringify({ version: VERSION, attempts: record.attempts }));
    return storage !== null;
  } catch { return false; }
}

export function hasAttempted(record: ReviewRecord, milestone: string): boolean {
  return record.attempts.some(a => a.milestone === milestone);
}

/** The record with one more attempt. A repeat of a milestone already there changes nothing. */
export function recordAttempt(record: ReviewRecord, attempt: ReviewAttempt): ReviewRecord {
  if (hasAttempted(record, attempt.milestone)) return record;
  return Object.freeze({ attempts: Object.freeze([...record.attempts, Object.freeze({ ...attempt })]) });
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
