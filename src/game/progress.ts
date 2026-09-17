import { levelSpec, starsFor } from './levels';

export interface Progress {
  /** Highest level the player may start; everything below it has been cleared. */
  readonly unlocked: number;
  /** Best mean accuracy per cleared level. */
  readonly best: Readonly<Record<number, number>>;
}
export interface LevelOutcome {
  readonly cleared: boolean;
  readonly stars: 0 | 1 | 2 | 3;
  readonly bestBefore: number | null;
  readonly progress: Progress;
}

const KEY = 'small-acts.progress.v1';
/** Written but not required on read, so a future migration has something to branch on. */
const VERSION = 1;
/**
 * Far beyond any real run — difficulty saturates near level 18,600 — but it bounds
 * what a corrupt or tampered value can ask the map to allocate.
 */
const MAX_LEVEL = 100_000;
const EMPTY: Progress = Object.freeze({ unlocked: 1, best: Object.freeze({}) });

/**
 * The frontier, from the levels actually cleared. Used when the stored `unlocked` is
 * missing or nonsense: `best` holds the same information, so demoting a player to
 * level 1 while their clears are sitting right there would throw away real progress.
 */
function frontierFrom(best: Record<number, number>): number {
  const levels = Object.keys(best).map(Number).filter(n => Number.isInteger(n) && n >= 1);
  return levels.length ? Math.min(MAX_LEVEL, Math.max(...levels) + 1) : 1;
}

/** Reads may fail in private windows or blocked storage; the game then simply starts at level 1. */
export function loadProgress(storage: Storage | null = safeStorage()): Progress {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return EMPTY;
    const { unlocked, best } = parsed as { unlocked?: unknown; best?: unknown };
    const clean: Record<number, number> = {};
    if (typeof best === 'object' && best !== null) {
      for (const [level, accuracy] of Object.entries(best as Record<string, unknown>)) {
        const n = Number(level);
        if (Number.isInteger(n) && n >= 1 && typeof accuracy === 'number' && Number.isFinite(accuracy)) clean[n] = Math.max(0, Math.min(100, accuracy));
      }
    }
    const stored = Number.isInteger(unlocked) && (unlocked as number) >= 1 ? Math.min(MAX_LEVEL, unlocked as number) : frontierFrom(clean);
    return { unlocked: stored, best: Object.freeze(clean) };
  } catch { return EMPTY; }
}

/** False means nothing was written — blocked storage, a private window, or a full quota. */
export function saveProgress(progress: Progress, storage: Storage | null = safeStorage()): boolean {
  try { storage?.setItem(KEY, JSON.stringify({ version: VERSION, ...progress })); return storage !== null; } catch { return false; }
}

/** Applies one finished level. Clearing the highest unlocked level unlocks the next; replays only raise the best. */
export function recordResult(progress: Progress, level: number, accuracy: number): LevelOutcome {
  const spec = levelSpec(level);
  const stars = starsFor(accuracy, spec);
  const cleared = stars > 0;
  const bestBefore = progress.best[level] ?? null;
  const best = { ...progress.best };
  if (cleared && (bestBefore === null || accuracy > bestBefore)) best[level] = accuracy;
  const unlocked = cleared && level >= progress.unlocked ? level + 1 : progress.unlocked;
  return { cleared, stars, bestBefore, progress: { unlocked, best: Object.freeze(best) } };
}

/**
 * Two saves into one, keeping the better of each.
 *
 * Restoring a save code merges rather than replaces, and the reason is that a player
 * restoring onto a device that already has progress would otherwise lose whichever
 * side was behind — with no undo, and usually without noticing until much later. Taking
 * the higher frontier and the higher accuracy per level means a restore can only ever
 * add, which is what lets it happen on one tap instead of behind a confirmation the
 * player has no way to answer well.
 *
 * Only what was earned merges. Settings and the tutorial flag are preferences and come
 * across whole; hearts, the ledgers and the premium cache are not in a save code at all.
 */
export function mergeProgress(local: Progress, incoming: Progress): Progress {
  const best: Record<number, number> = { ...local.best };
  for (const [level, accuracy] of Object.entries(incoming.best)) {
    const n = Number(level);
    if (!Number.isInteger(n) || n < 1 || !Number.isFinite(accuracy)) continue;
    best[n] = Math.max(best[n] ?? 0, Math.max(0, Math.min(100, accuracy)));
  }
  const unlocked = Math.min(MAX_LEVEL, Math.max(local.unlocked, incoming.unlocked, frontierFrom(best)));
  return { unlocked, best: Object.freeze(best) };
}

/**
 * The escape hatch for a save the player cannot otherwise recover from, and the only
 * place progress is ever destroyed. False means nothing was written.
 */
export function clearProgress(storage: Storage | null = safeStorage()): boolean {
  try { storage?.removeItem(KEY); return storage !== null; } catch { return false; }
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
