import { loadProgress, mergeProgress, readTeachFlags, saveProgress, setTeachFlags, type Progress, type TeachFlag } from '../game/progress';
import { completeTutorial, setTutorialState, skipTutorial, tutorialState } from '../game/TutorialRun';
import {
  SNAPSHOT_FAILED, type PlayGames, type SnapshotConflict, type SnapshotFailure, type SnapshotPayload, type SnapshotReason,
} from './playGames';

/**
 * Saved Games, as decisions. Pure — Play Games, local storage and the clock are injected —
 * so every rule here is tested under node; `playgames/cloudSync.ts` wires it to the game.
 *
 * Three things this module exists to keep.
 *
 * **The cloud only ever adds.** A snapshot carries what the player earned — the frontier,
 * the best accuracy per level, and the one-time lessons already seen — and two of them
 * merge the way two save codes do: the higher frontier, the higher accuracy per level, a
 * lesson seen on either side. So there is no "which device wins", not even for a conflict
 * Play Games reports between two devices that wrote while apart: both payloads are read,
 * merged with this device's own, and the merge is the resolution. A timestamp decides
 * nothing. Nothing in a snapshot can take a level away, grant a heart, or restore a
 * purchase, because none of those is in it (`CloudSaveV1`).
 *
 * **The device knows whose progress it holds.** Local storage is device-wide and a Play
 * Games account is not, so a device bound to one player must not hand that player's
 * progress to the next one who signs in. `CloudBinding` keys the device's progression to a
 * hash of the player id: anonymous progress is adopted by the first player it meets; a
 * different player shelves the previous owner's progression and starts from their own
 * shelf or from nothing, then pulls their own cloud; switching back restores the shelf.
 * Nothing is deleted at a switch, and the raw id is stored nowhere.
 *
 * **Nothing here is required to play.** Every path resolves to an outcome, never a throw;
 * signed out, offline, a plugin that fails, a payload that will not decode and a payload
 * from a newer client all leave local progress exactly as it was. A newer schema is never
 * overwritten by this client: it is reported, and left for the client that wrote it.
 */

export const CLOUD_SAVE = {
  /** The schema this client writes. A payload with a higher one is left alone. */
  version: 1,
  /** The one snapshot, forever. The schema version lives inside it, never in its name. */
  snapshotName: 'tiny-tempo-progress',
  /** Levels above this are not carried; difficulty saturates far below it. Bounds the payload. */
  maxLevel: 20_000,
  /** The frontier is bounded as `progress.ts` bounds it, so a tampered payload cannot ask the map for more. */
  maxFrontier: 100_000,
  /** Resolving a conflict can reveal another; this many rounds and the sync gives up until next time. */
  maxConflictRounds: 4,
  /** How many previous owners' progression one device keeps shelved; beyond it the oldest goes. */
  maxShelf: 8,
  /** How long one Play Games call may take before the sync treats it as failed. */
  timeoutMs: 20_000,
} as const;

/** Passed, skipped, or neither — the stronger fact wins a merge. */
export type CloudTutorial = 'complete' | 'skipped' | 'none';
const TUTORIAL_RANK: Readonly<Record<CloudTutorial, number>> = { none: 0, skipped: 1, complete: 2 };

/**
 * The teach flags that travel. The demonstration pass, the two finer-grid introductions
 * and the Scrapbook note are lessons about the game, and a player taught once is taught.
 * `replayTip` stays on the device: it is about the hearts, which never leave it.
 */
export const CLOUD_TEACH = ['seen', 'triplet', 'sixteenth', 'scrapbook'] as const satisfies readonly TeachFlag[];
export type CloudTeach = typeof CLOUD_TEACH[number];

/**
 * The payload. Earned progression and one-time lessons, nothing else — not hearts, not
 * a ledger, not Premium, not consent, not calibration, not a volume. `tests/cloudSave.test.ts`
 * asserts the serialized shape so a later field cannot quietly join it.
 */
export interface CloudSaveV1 {
  readonly version: 1;
  readonly progress: Progress;
  readonly tutorial: CloudTutorial;
  readonly teach: Readonly<Record<CloudTeach, boolean>>;
}

const NO_TEACH: Readonly<Record<CloudTeach, boolean>> = Object.freeze({ seen: false, triplet: false, sixteenth: false, scrapbook: false });
const EMPTY_PROGRESS: Progress = Object.freeze({ unlocked: 1, best: Object.freeze({}) });

export function emptyCloudSave(): CloudSaveV1 {
  return { version: 1, progress: EMPTY_PROGRESS, tutorial: 'none', teach: NO_TEACH };
}

const clampAccuracy = (value: number): number => Math.max(0, Math.min(100, value));

/** A progress bounded the way the cloud carries it: valid levels only, the frontier never below the clears. */
function boundProgress(unlocked: unknown, best: unknown): Progress {
  const clean: Record<number, number> = {};
  if (typeof best === 'object' && best !== null) {
    for (const [level, accuracy] of Object.entries(best as Record<string, unknown>)) {
      const n = Number(level);
      if (Number.isInteger(n) && n >= 1 && n <= CLOUD_SAVE.maxLevel && typeof accuracy === 'number' && Number.isFinite(accuracy)) {
        clean[n] = clampAccuracy(accuracy);
      }
    }
  }
  const frontier = typeof unlocked === 'number' && Number.isInteger(unlocked) && unlocked >= 1 ? Math.min(CLOUD_SAVE.maxFrontier, unlocked) : 1;
  // `mergeProgress` with nothing is the normalization: the frontier never sits below the clears.
  return mergeProgress(EMPTY_PROGRESS, { unlocked: frontier, best: clean });
}

/**
 * The canonical text of a save: fixed key order, levels ascending, nothing optional. Two
 * saves are the same save exactly when their texts are equal, which is what lets a sync
 * tell that there is nothing to upload without a second notion of equality.
 */
export function encodeCloudSave(save: CloudSaveV1): string {
  const progress = boundProgress(save.progress.unlocked, save.progress.best);
  const levels = Object.keys(progress.best).map(Number).sort((a, b) => a - b);
  const best: Record<string, number> = {};
  for (const level of levels) best[String(level)] = progress.best[level]!;
  const teach: Record<string, boolean> = {};
  for (const flag of CLOUD_TEACH) teach[flag] = save.teach[flag] === true;
  return JSON.stringify({
    version: CLOUD_SAVE.version,
    progress: { unlocked: progress.unlocked, best },
    tutorial: TUTORIAL_RANK[save.tutorial] === undefined ? 'none' : save.tutorial,
    teach,
  });
}

export type CloudDecode =
  | { readonly kind: 'empty' }
  | { readonly kind: 'save'; readonly save: CloudSaveV1 }
  /** Not this format at all: refused, and never written over, since it may be a read that went wrong. */
  | { readonly kind: 'malformed' }
  /** Written by a newer client. Left alone: this client cannot know what it would be destroying. */
  | { readonly kind: 'unsupported'; readonly version: number };

/**
 * A snapshot's text, read defensively. A version-1 payload is salvaged field by field the
 * way `loadProgress` salvages storage — a bad level is dropped, not the save — because the
 * known-good data in it is the player's. A payload that is not an object with a whole
 * version is malformed, and a version above this client's is unsupported.
 */
export function decodeCloudSave(text: string | null): CloudDecode {
  if (text === null || text.trim() === '') return { kind: 'empty' };
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return { kind: 'malformed' }; }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { kind: 'malformed' };
  const record = parsed as { version?: unknown; progress?: unknown; tutorial?: unknown; teach?: unknown };
  const version = record.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return { kind: 'malformed' };
  if (version > CLOUD_SAVE.version) return { kind: 'unsupported', version };
  const progress = typeof record.progress === 'object' && record.progress !== null
    ? record.progress as { unlocked?: unknown; best?: unknown }
    : {};
  const teach = {} as Record<CloudTeach, boolean>;
  const flags = typeof record.teach === 'object' && record.teach !== null ? record.teach as Record<string, unknown> : {};
  for (const flag of CLOUD_TEACH) teach[flag] = flags[flag] === true;
  return {
    kind: 'save',
    save: {
      version: 1,
      progress: boundProgress(progress.unlocked, progress.best),
      tutorial: record.tutorial === 'complete' || record.tutorial === 'skipped' ? record.tutorial : 'none',
      teach,
    },
  };
}

/** Two saves into one that can only be richer than either: the save code's merge, plus the lessons. */
export function mergeCloudSaves(a: CloudSaveV1, b: CloudSaveV1): CloudSaveV1 {
  const teach = {} as Record<CloudTeach, boolean>;
  for (const flag of CLOUD_TEACH) teach[flag] = a.teach[flag] === true || b.teach[flag] === true;
  return {
    version: 1,
    progress: mergeProgress(a.progress, b.progress),
    tutorial: TUTORIAL_RANK[a.tutorial] >= TUTORIAL_RANK[b.tutorial] ? a.tutorial : b.tutorial,
    teach,
  };
}

export function sameCloudSave(a: CloudSaveV1, b: CloudSaveV1): boolean {
  return encodeCloudSave(a) === encodeCloudSave(b);
}

/**
 * The device's note of whose progression it holds. The owner is `ownerTag` of the player
 * id — a salted FNV-1a hash, so the id itself is written nowhere — and the shelf holds the
 * progression of players who were signed in here before, each under their own tag, so a
 * switch back finds it. `version` is the store's own, separate from the payload's.
 */
export interface CloudBinding {
  readonly version: 1;
  readonly owner: string | null;
  readonly shelf: Readonly<Record<string, ShelvedSave>>;
}

export interface ShelvedSave {
  readonly save: CloudSaveV1;
  /** When it was shelved, for eviction only. */
  readonly at: number;
}

export const EMPTY_BINDING: CloudBinding = Object.freeze({ version: 1, owner: null, shelf: Object.freeze({}) });

const OWNER_SALT = 'tiny-tempo.cloud';
const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = (1n << 64n) - 1n;

/** A stable tag for a player id that is not the id. Collision-resistant enough to tell two accounts on one device apart. */
export function ownerTag(playerId: string): string {
  let hash = FNV_OFFSET;
  for (const byte of new TextEncoder().encode(`${OWNER_SALT}:${playerId}`)) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash.toString(16).padStart(16, '0');
}

const TAG = /^[0-9a-f]{16}$/;

/**
 * The stored binding, or null when what is stored is not one. Null is deliberately not
 * "empty": a binding that cannot be read may have said this device belongs to someone
 * else, and treating it as unbound would adopt their progress into whoever is signed in.
 * A missing binding is empty; a damaged one stops the sync until it is replaced.
 */
export function decodeBinding(text: string | null): CloudBinding | null {
  if (text === null || text.trim() === '') return EMPTY_BINDING;
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return null; }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const record = parsed as { version?: unknown; owner?: unknown; shelf?: unknown };
  if (record.version !== 1) return null;
  if (record.owner !== null && !(typeof record.owner === 'string' && TAG.test(record.owner))) return null;
  const shelf: Record<string, ShelvedSave> = {};
  if (typeof record.shelf === 'object' && record.shelf !== null) {
    for (const [tag, entry] of Object.entries(record.shelf as Record<string, unknown>)) {
      if (!TAG.test(tag) || typeof entry !== 'object' || entry === null) continue;
      const { save, at } = entry as { save?: unknown; at?: unknown };
      const decoded = decodeCloudSave(typeof save === 'string' ? save : null);
      if (decoded.kind !== 'save') continue;
      shelf[tag] = { save: decoded.save, at: typeof at === 'number' && Number.isFinite(at) ? at : 0 };
    }
  }
  return { version: 1, owner: record.owner as string | null, shelf };
}

export function encodeBinding(binding: CloudBinding): string {
  const shelf: Record<string, { save: string; at: number }> = {};
  for (const tag of Object.keys(binding.shelf).sort()) {
    const entry = binding.shelf[tag]!;
    shelf[tag] = { save: encodeCloudSave(entry.save), at: entry.at };
  }
  return JSON.stringify({ version: 1, owner: binding.owner, shelf });
}

export type BindingPlan =
  /** No owner yet: whatever is on the device becomes this player's. */
  | { readonly kind: 'adopt' }
  | { readonly kind: 'same' }
  /** Another player was here. Their progression is shelved under `from`; this one's comes off the shelf, or starts empty. */
  | { readonly kind: 'switch'; readonly from: string; readonly restore: CloudSaveV1 | null };

export function planBinding(binding: CloudBinding, tag: string): BindingPlan {
  if (binding.owner === null) return { kind: 'adopt' };
  if (binding.owner === tag) return { kind: 'same' };
  return { kind: 'switch', from: binding.owner, restore: binding.shelf[tag]?.save ?? null };
}

/**
 * The binding after a switch: `shelved` goes under `from`, merged with anything already
 * there so a shelf can only grow, `to` becomes the owner and comes off the shelf, and the
 * oldest entries go once there are more than `maxShelf`.
 */
export function switchBinding(binding: CloudBinding, from: string, to: string, shelved: CloudSaveV1, at: number): CloudBinding {
  const shelf: Record<string, ShelvedSave> = { ...binding.shelf };
  const existing = shelf[from];
  shelf[from] = { save: existing ? mergeCloudSaves(existing.save, shelved) : shelved, at };
  delete shelf[to];
  const tags = Object.keys(shelf).sort((a, b) => shelf[b]!.at - shelf[a]!.at);
  for (const tag of tags.slice(CLOUD_SAVE.maxShelf)) delete shelf[tag];
  return { version: 1, owner: to, shelf };
}

/** The local progression, as the sync reads and writes it. Storage detail stays in the wiring. */
export interface CloudLocal {
  read(): CloudSaveV1;
  /** Bring the device up to a save that is at least what it has: progress replaced, lessons OR-ed. */
  write(save: CloudSaveV1): boolean;
  /** Make the device hold exactly this save. Only for a change of owner. */
  replace(save: CloudSaveV1): boolean;
}

/** Where the binding is kept, as text. */
export interface CloudStore {
  read(): string | null;
  write(text: string): boolean;
}

/**
 * The progression on a storage, as the sync reads and writes it — the real one, over the
 * same `progress.ts` and `TutorialRun.ts` calls the scenes use, so what a test syncs is
 * what a device syncs.
 *
 * `write` merges with what is in storage *now*, not with what the sync read before its
 * network calls: a level cleared while a sync was in flight would otherwise be written
 * over by the merge of an older reading. `replace` is the one exact write, for the device
 * changing hands, and it leaves `replayTip` alone — that flag is about the hearts, which
 * stay with the device.
 */
export function localCloudSave(storage: Storage | null): CloudLocal {
  const teachOf = (flags: Readonly<Record<string, boolean>>): Readonly<Record<CloudTeach, boolean>> => {
    const teach = {} as Record<CloudTeach, boolean>;
    for (const flag of CLOUD_TEACH) teach[flag] = flags[flag] === true;
    return teach;
  };
  return {
    read: () => ({ version: 1, progress: loadProgress(storage), tutorial: tutorialState(storage), teach: teachOf(readTeachFlags(storage)) }),
    write(save) {
      const stored = saveProgress(mergeProgress(loadProgress(storage), save.progress), storage);
      if (save.tutorial === 'complete') completeTutorial(storage);
      else if (save.tutorial === 'skipped') skipTutorial(storage);
      const seen: Partial<Record<CloudTeach, boolean>> = {};
      for (const flag of CLOUD_TEACH) if (save.teach[flag]) seen[flag] = true;
      if (Object.keys(seen).length > 0) setTeachFlags(seen, storage);
      return stored;
    },
    replace(save) {
      const stored = saveProgress(save.progress, storage);
      const tutorial = setTutorialState(save.tutorial, storage);
      const teach = setTeachFlags({ seen: save.teach.seen, triplet: save.teach.triplet, sixteenth: save.teach.sixteenth, scrapbook: save.teach.scrapbook }, storage);
      return stored && tutorial && teach;
    },
  };
}

/** The device's note of whose progression it holds, and whose it has shelved. Never in a save code. */
export const CLOUD_STORE_KEY = 'tiny-tempo.cloud.v1';

export function cloudStoreOn(storage: Storage | null): CloudStore {
  return {
    read() { try { return storage?.getItem(CLOUD_STORE_KEY) ?? null; } catch { return null; } },
    write(text) { try { storage?.setItem(CLOUD_STORE_KEY, text); return storage !== null; } catch { return false; } },
  };
}

export interface CloudSyncDeps {
  readonly games: () => PlayGames;
  /** Whether a native Play Games is installed at all; false in a browser. */
  readonly native: () => boolean;
  readonly local: CloudLocal;
  readonly store: CloudStore;
  /** Progress arrived from the cloud and is now local: what else follows from a save (achievements). */
  readonly onImported?: (progress: Progress) => void;
  /** A note for a crash report's trail. Never given an id or a payload. */
  readonly onEvent?: (event: string, data: Readonly<Record<string, string | number | boolean>>) => void;
  readonly timeoutMs?: number;
  readonly now?: () => number;
}

export type CloudFailure = 'binding' | 'malformed' | 'conflict_unresolved' | 'local_write' | SnapshotReason;
export type CloudStep = 'binding' | 'switch' | 'read' | 'import' | 'write' | 'resolve' | 'run';

export type CloudSyncOutcome =
  | {
    readonly kind: 'synced';
    readonly uploaded: boolean;
    readonly imported: boolean;
    readonly adopted: boolean;
    readonly switched: boolean;
    readonly conflicts: number;
  }
  | { readonly kind: 'skipped'; readonly reason: 'unavailable' | 'signed_out' | 'no_player' }
  /** The cloud holds a newer schema. Local progress is untouched and the cloud is not written. */
  | { readonly kind: 'unsupported'; readonly version: number; readonly imported: boolean }
  | { readonly kind: 'failed'; readonly step: CloudStep; readonly reason: CloudFailure; readonly imported: boolean };

export interface CloudSync {
  /** Reconcile local and cloud. Never rejects; one at a time, and a request mid-sync runs once more after. */
  sync(): Promise<CloudSyncOutcome>;
  /** The last outcome, for the support report and nothing else. */
  readonly last: CloudSyncOutcome | null;
}

const skipped = (reason: 'unavailable' | 'signed_out' | 'no_player'): CloudSyncOutcome => ({ kind: 'skipped', reason });
const failed = (step: CloudStep, reason: CloudFailure, imported = false): CloudSyncOutcome => ({ kind: 'failed', step, reason, imported });

/** What a write or a resolution tells Play Games about the save, from the save alone. */
export function snapshotPayload(save: CloudSaveV1): SnapshotPayload {
  const cleared = Object.keys(save.progress.best).length;
  return {
    data: encodeCloudSave(save),
    description: `Level ${save.progress.unlocked}, ${cleared} cleared`,
    progress: save.progress.unlocked,
  };
}

export function createCloudSync(deps: CloudSyncDeps): CloudSync {
  const timeoutMs = deps.timeoutMs ?? CLOUD_SAVE.timeoutMs;
  const now = deps.now ?? (() => Date.now());
  const note = (event: string, data: Readonly<Record<string, string | number | boolean>> = {}) => { try { deps.onEvent?.(event, data); } catch { /* a trail is never worth a throw */ } };
  let last: CloudSyncOutcome | null = null;
  let inFlight: Promise<CloudSyncOutcome> | null = null;
  let queued: Promise<CloudSyncOutcome> | null = null;

  const timed = <T>(work: Promise<T>, fallback: T): Promise<T> => new Promise(resolve => {
    const timer = setTimeout(() => resolve(fallback), timeoutMs);
    work.then(value => { clearTimeout(timer); resolve(value); }, () => { clearTimeout(timer); resolve(fallback); });
  });

  type Resolved = { readonly ok: true; readonly save: CloudSaveV1 } | { readonly ok: false; readonly outcome: CloudSyncOutcome };

  /**
   * Both payloads of a conflict, merged with what this device carries, written back as the
   * resolution — and again if the resolution reveals another conflict, up to the bound.
   * A side this client cannot read is dropped from the merge, since there is nothing in it
   * to keep; a side from a newer client stops the sync, since there may be.
   */
  const resolveConflicts = async (games: PlayGames, first: SnapshotConflict, carry: CloudSaveV1, imported: boolean, count: { n: number }): Promise<Resolved> => {
    let current = first;
    for (let round = 1; round <= CLOUD_SAVE.maxConflictRounds; round++) {
      count.n++;
      const sides = [decodeCloudSave(current.base), decodeCloudSave(current.other)];
      const newer = sides.flatMap(side => side.kind === 'unsupported' ? [side.version] : []);
      if (newer.length > 0) return { ok: false, outcome: { kind: 'unsupported', version: Math.max(...newer), imported } };
      const readable = sides.flatMap(side => side.kind === 'save' ? [side.save] : side.kind === 'empty' ? [emptyCloudSave()] : []);
      if (readable.length === 0) return { ok: false, outcome: failed('resolve', 'malformed', imported) };
      let merged = carry;
      for (const side of readable) merged = mergeCloudSaves(merged, side);
      const result = await timed(games.resolveSnapshot(current.conflictId, snapshotPayload(merged)), SNAPSHOT_FAILED('timeout') as SnapshotFailure);
      if (result.kind === 'resolved') return { ok: true, save: merged };
      if (result.kind === 'failed') return { ok: false, outcome: failed('resolve', result.reason, imported) };
      current = result;
    }
    return { ok: false, outcome: failed('resolve', 'conflict_unresolved', imported) };
  };

  const run = async (): Promise<CloudSyncOutcome> => {
    if (!deps.native()) return skipped('unavailable');
    const games = deps.games();
    // v2 signs players in by itself at startup; ask whether it has, never prompt.
    const status = games.status.authenticated ? games.status : await timed(games.refresh(), games.status);
    if (!status.authenticated) return skipped('signed_out');
    const player = await timed(games.player(), null);
    if (player === null) return skipped('no_player');
    const tag = ownerTag(player.playerId);

    const binding = decodeBinding(deps.store.read());
    if (binding === null) return failed('binding', 'binding');
    const plan = planBinding(binding, tag);
    let adopted = false;
    let switched = false;
    if (plan.kind === 'adopt') {
      if (!deps.store.write(encodeBinding({ ...binding, owner: tag }))) return failed('binding', 'local_write');
      adopted = true;
    } else if (plan.kind === 'switch') {
      // The device first, then the note: if the note cannot be written the device still
      // holds the new player's progression and the old owner's name, and the next sync
      // shelves again rather than handing the old owner's progress to the new player.
      const shelved = deps.local.read();
      const next = switchBinding(binding, plan.from, tag, shelved, now());
      if (!deps.local.replace(plan.restore ?? emptyCloudSave())) return failed('switch', 'local_write');
      if (!deps.store.write(encodeBinding(next))) return failed('switch', 'local_write');
      switched = true;
      note('cloud owner changed', { restored: plan.restore !== null });
    }

    const localSave = deps.local.read();
    const conflicts = { n: 0 };
    let remote: CloudSaveV1;
    const read = await timed(games.readSnapshot(CLOUD_SAVE.snapshotName), SNAPSHOT_FAILED('timeout') as SnapshotFailure);
    if (read.kind === 'failed') return failed('read', read.reason);
    if (read.kind === 'conflict') {
      const resolved = await resolveConflicts(games, read, localSave, false, conflicts);
      if (!resolved.ok) return resolved.outcome;
      remote = resolved.save;
    } else {
      const decoded = decodeCloudSave(read.data);
      if (decoded.kind === 'malformed') return failed('read', 'malformed');
      if (decoded.kind === 'unsupported') return { kind: 'unsupported', version: decoded.version, imported: false };
      remote = decoded.kind === 'empty' ? emptyCloudSave() : decoded.save;
    }

    // The device first: whatever the cloud adds is the player's now, whether or not the
    // upload that follows gets through.
    let final = mergeCloudSaves(localSave, remote);
    let imported = false;
    if (!sameCloudSave(final, localSave)) {
      if (!deps.local.write(final)) return failed('import', 'local_write');
      imported = true;
      try { deps.onImported?.(final.progress); } catch { /* achievements are re-sent next time anyway */ }
    }
    let uploaded = false;
    if (!sameCloudSave(final, remote)) {
      const write = await timed(games.writeSnapshot(CLOUD_SAVE.snapshotName, snapshotPayload(final)), SNAPSHOT_FAILED('timeout') as SnapshotFailure);
      if (write.kind === 'failed') return failed('write', write.reason, imported);
      if (write.kind === 'conflict') {
        // Another device wrote between the read and the write. Its payload is merged in,
        // and anything it added comes back down.
        const resolved = await resolveConflicts(games, write, final, imported, conflicts);
        if (!resolved.ok) return resolved.outcome;
        if (!sameCloudSave(resolved.save, final)) {
          final = resolved.save;
          if (!deps.local.write(final)) return failed('import', 'local_write', imported);
          imported = true;
          try { deps.onImported?.(final.progress); } catch { /* as above */ }
        }
      }
      uploaded = true;
    }
    return { kind: 'synced', uploaded, imported, adopted, switched, conflicts: conflicts.n };
  };

  const sync = (): Promise<CloudSyncOutcome> => {
    if (inFlight === null) {
      inFlight = run()
        .catch((): CloudSyncOutcome => failed('run', 'failed'))
        .then(outcome => {
          last = outcome;
          note('cloud sync', { outcome: outcome.kind, ...(outcome.kind === 'failed' ? { step: outcome.step, reason: outcome.reason } : {}), ...(outcome.kind === 'skipped' ? { reason: outcome.reason } : {}) });
          inFlight = null;
          return outcome;
        });
      return inFlight;
    }
    // One sync at a time, and at most one more waiting: a burst of requests collapses
    // into the run in flight and a single run after it, which reads the latest state.
    queued ??= inFlight.then(() => { queued = null; return sync(); });
    return queued;
  };

  return { sync, get last() { return last; } };
}
