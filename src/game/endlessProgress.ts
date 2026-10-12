import { ENDLESS } from '../config/endless';
import { MILESTONES, milestonesFor, rankedMs, type EndlessRunSummary, type Milestone } from './endless';

/**
 * What a device keeps of Endless Mode: the personal best and the badges, per ruleset.
 *
 * Its own key, beside the road's progress rather than inside it: `small-acts.progress.v1`
 * is what a save code and the cloud carry, and a survival time is neither a level nor an
 * accuracy — `mergeProgress` would not know what to do with it, and a save code that grew
 * a field would stop decoding on older builds. So this record is **device-local** in this
 * version: it is not in a save code, not in the cloud snapshot, and Auto Backup carries it
 * only because every key shares one store (`docs/SAVES.md`). `docs/ENDLESS_MODE.md` says
 * what a cross-device version would have to add.
 *
 * **Monotonic and idempotent.** A run can only raise the best and add badges, and a run
 * recorded twice — a duplicate callback, a scene re-entered — is recorded once, by its id.
 * Every field is validated on read, as the road's save is, because storage can be blocked,
 * stale or tampered with; a damaged record reads as empty rather than as a lie.
 *
 * **Per ruleset.** Records are keyed by the rules version they were played under, so a
 * best from an older, incomparable ruleset stays on the device but is never shown as the
 * current one or sent to the current leaderboard.
 */

export const ENDLESS_PROGRESS_KEY = 'tiny-tempo.endless.v1';
const VERSION = 1;
/** Bounds what a tampered record can claim; far past any real run count. */
const MAX_RUNS = 1_000_000;

export interface EndlessRecord {
  /** The longest valid run, in whole milliseconds. 0 until one has finished. */
  readonly bestMs: number;
  /** The most vignettes scored in one valid run. */
  readonly bestVignettes: number;
  /** The highest tempo reached in one valid run. */
  readonly bestBpm: number;
  /** Valid runs finished. The first earns its own achievement. */
  readonly validRuns: number;
  readonly milestones: readonly Milestone[];
  /** The last run recorded, so recording it again is a no-op. */
  readonly lastRunId: string | null;
}

export interface EndlessProgressV1 {
  readonly version: 1;
  readonly records: Readonly<Record<string, EndlessRecord>>;
  /** The map's unlock badge has been seen: the card was opened once since the unlock. */
  readonly seenUnlock: boolean;
}

export const EMPTY_RECORD: EndlessRecord = Object.freeze({
  bestMs: 0, bestVignettes: 0, bestBpm: 0, validRuns: 0, milestones: Object.freeze([]), lastRunId: null,
});

export const EMPTY_ENDLESS_PROGRESS: EndlessProgressV1 = Object.freeze({ version: 1, records: Object.freeze({}), seenUnlock: false });

const MILESTONE_IDS: ReadonlySet<string> = new Set(MILESTONES.map(m => m.id));

/** A whole number inside [0, limit], else null. */
function whole(value: unknown, limit: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= limit ? value : null;
}

/** One record, every field checked; anything malformed is no record. */
export function parseEndlessRecord(raw: unknown): EndlessRecord | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const bestMs = whole(r.bestMs, ENDLESS.maxRunMs);
  const bestVignettes = whole(r.bestVignettes, MAX_RUNS);
  const bestBpm = whole(r.bestBpm, 1000);
  const validRuns = whole(r.validRuns, MAX_RUNS);
  if (bestMs === null || bestVignettes === null || bestBpm === null || validRuns === null) return null;
  const milestones = Array.isArray(r.milestones)
    ? MILESTONES.map(m => m.id).filter(id => (r.milestones as unknown[]).includes(id) && MILESTONE_IDS.has(id))
    : [];
  const lastRunId = typeof r.lastRunId === 'string' && r.lastRunId.length > 0 && r.lastRunId.length <= 64 ? r.lastRunId : null;
  return { bestMs, bestVignettes, bestBpm, validRuns, milestones, lastRunId };
}

/** The stored progress, or empty. A damaged record is dropped on its own; the rest survive. */
export function parseEndlessProgress(raw: string | null): EndlessProgressV1 {
  if (!raw) return EMPTY_ENDLESS_PROGRESS;
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return EMPTY_ENDLESS_PROGRESS; }
  if (typeof data !== 'object' || data === null) return EMPTY_ENDLESS_PROGRESS;
  const { records, seenUnlock } = data as { records?: unknown; seenUnlock?: unknown };
  const clean: Record<string, EndlessRecord> = {};
  if (typeof records === 'object' && records !== null) {
    for (const [key, value] of Object.entries(records as Record<string, unknown>)) {
      if (!/^\d{1,6}$/.test(key)) continue;
      const record = parseEndlessRecord(value);
      if (record) clean[key] = record;
    }
  }
  return { version: 1, records: clean, seenUnlock: seenUnlock === true };
}

export function loadEndlessProgress(storage: Storage | null = safeStorage()): EndlessProgressV1 {
  try { return parseEndlessProgress(storage?.getItem(ENDLESS_PROGRESS_KEY) ?? null); } catch { return EMPTY_ENDLESS_PROGRESS; }
}

/** False means nothing was written: blocked storage, a private window, a full quota. */
export function saveEndlessProgress(progress: EndlessProgressV1, storage: Storage | null = safeStorage()): boolean {
  try { storage?.setItem(ENDLESS_PROGRESS_KEY, JSON.stringify({ ...progress, version: VERSION })); return storage !== null; } catch { return false; }
}

/** The record for a ruleset; empty until a run under it has finished. */
export function endlessRecord(progress: EndlessProgressV1, rulesVersion: number = ENDLESS.rulesVersion): EndlessRecord {
  return progress.records[String(rulesVersion)] ?? EMPTY_RECORD;
}

export interface RunRecorded {
  readonly next: EndlessProgressV1;
  readonly record: EndlessRecord;
  /** This run beat the ruleset's best. The first valid run is a new best. */
  readonly newBest: boolean;
  /** Badges this run earned for the first time. */
  readonly newMilestones: readonly Milestone[];
  /** This run is the ruleset's first. */
  readonly firstRun: boolean;
  /** This run was already recorded; nothing changed. */
  readonly duplicate: boolean;
}

/**
 * A finished, valid run applied to the record. Only a finished run reaches here — never an
 * interrupted or abandoned one — and only once: a second call with the same id changes
 * nothing. A time the leaderboard would refuse (`rankedMs`) is refused here too.
 */
export function recordEndlessRun(progress: EndlessProgressV1, run: EndlessRunSummary): RunRecorded {
  const key = String(run.rulesVersion);
  const current = endlessRecord(progress, run.rulesVersion);
  const unchanged: RunRecorded = { next: progress, record: current, newBest: false, newMilestones: [], firstRun: false, duplicate: false };
  const ms = rankedMs(run.elapsedMs);
  if (ms === null || typeof run.runId !== 'string' || run.runId === '') return unchanged;
  if (current.lastRunId === run.runId) return { ...unchanged, duplicate: true };
  const earned = milestonesFor(ms);
  const newMilestones = earned.filter(id => !current.milestones.includes(id));
  const firstRun = current.validRuns === 0;
  const newBest = firstRun || ms > current.bestMs;
  const record: EndlessRecord = {
    bestMs: Math.max(current.bestMs, ms),
    bestVignettes: Math.max(current.bestVignettes, whole(run.vignettes, MAX_RUNS) ?? 0),
    bestBpm: Math.max(current.bestBpm, whole(run.peakBpm, 1000) ?? 0),
    validRuns: Math.min(MAX_RUNS, current.validRuns + 1),
    milestones: MILESTONES.map(m => m.id).filter(id => current.milestones.includes(id) || earned.includes(id)),
    lastRunId: run.runId,
  };
  return {
    next: { ...progress, records: { ...progress.records, [key]: record } },
    record, newBest, newMilestones, firstRun, duplicate: false,
  };
}

export function markEndlessUnlockSeen(progress: EndlessProgressV1): EndlessProgressV1 {
  return progress.seenUnlock ? progress : { ...progress, seenUnlock: true };
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
