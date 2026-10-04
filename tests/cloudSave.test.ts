import { describe, expect, it, vi } from 'vitest';
import { levelSpec } from '../src/game/levels';
import { loadProgress, readTeachFlags, saveProgress, setTeachFlags, type Progress } from '../src/game/progress';
import { completeTutorial, skipTutorial, tutorialState } from '../src/game/TutorialRun';
import { decodeSaveCode, encodeSaveCode } from '../src/game/saveCode';
import { achievementsFrom, hasEarned } from '../src/playgames/achievements';
import {
  CLOUD_SAVE, CLOUD_STORE_KEY, cloudStoreOn, createCloudSync, decodeBinding, decodeCloudSave, emptyCloudSave, encodeBinding, encodeCloudSave, localCloudSave, mergeCloudSaves, ownerTag, planBinding, sameCloudSave, snapshotPayload, switchBinding, type CloudSaveV1, type CloudSyncDeps, type CloudSyncOutcome, cloudBindingDamaged, EMPTY_BINDING,
} from '../src/playgames/cloudSave';
import { repairCloudBinding } from '../src/playgames/cloudSync';
import { base64FromText, textFromBase64, toSnapshotRead, toSnapshotResolution, toSnapshotWrite } from '../src/playgames/native';
import {
  createPlayGames, NOT_SHOWN, NOT_SUBMITTED, NOT_UNLOCKED, SIGNED_OUT, SNAPSHOT_FAILED, stubPlayGames,
  type PlayGames, type PlayGamesClient, type PlayGamesStatus, type SnapshotConflict, type SnapshotPayload, type SnapshotRead, type SnapshotReason,
} from '../src/playgames/playGames';
import { ACHIEVEMENTS } from '../src/config/achievements';

vi.mock('phaser', () => ({ default: {} }));

// ---------------------------------------------------------------------------------------
// Fixtures: a storage, a device, a cloud. Every scenario below is built from these three.

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    getItem: k => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: k => { map.delete(k); },
    clear: () => map.clear(),
    key: () => null,
    get length() { return map.size; },
  } as Storage;
}

/** A storage whose every write fails, the way a full or blocked WebView store does. */
function blockedStorage(initial: Record<string, string> = {}): Storage {
  const inner = memoryStorage(initial);
  return { ...inner, getItem: k => inner.getItem(k), setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } } as Storage;
}

/** A save where every level up to `through` is cleared at one star, plus any given bests. */
function road(through: number, best: Record<number, number> = {}): Progress {
  const cleared: Record<number, number> = {};
  for (let level = 1; level <= through; level++) cleared[level] = levelSpec(level).starAccuracy[0]!;
  return { unlocked: through + 1, best: { ...cleared, ...best } };
}

const save = (progress: Progress, over: Partial<Omit<CloudSaveV1, 'version' | 'progress'>> = {}): CloudSaveV1 =>
  ({ ...emptyCloudSave(), progress, ...over });

const PLAYER_A = { playerId: 'g:1234567890123456789', displayName: 'Ada' };
const PLAYER_B = { playerId: 'g:9876543210987654321', displayName: 'Ben' };

/**
 * Play Games' server for one player, as the bridge would relay it: one snapshot, and a
 * conflict it can be told to report on the next open. `conflictAfterResolve` is the
 * further conflict a resolution can reveal.
 */
class FakeCloud {
  public data: string | null = null;
  public conflict: SnapshotConflict | null = null;
  public conflictsAfterResolve: SnapshotConflict[] = [];
  public fail: Partial<Record<'read' | 'write' | 'resolve', SnapshotReason>> = {};
  public calls = { reads: 0, writes: 0, resolves: 0 };
  public written: SnapshotPayload[] = [];
  public onRead: (() => void) | null = null;

  public client(status: () => PlayGamesStatus): PlayGamesClient {
    return {
      isAuthenticated: async () => status(),
      signIn: async () => status(),
      getPlayerInfo: async () => status(),
      submitScore: async () => NOT_SUBMITTED('signed_out'),
      showLeaderboard: async () => NOT_SHOWN('signed_out'),
      unlockAchievement: async () => NOT_UNLOCKED('signed_out'),
      showAchievements: async () => NOT_SHOWN('signed_out'),
      readSnapshot: async () => {
        this.calls.reads++;
        const result: SnapshotRead = this.fail.read ? SNAPSHOT_FAILED(this.fail.read) : this.conflict ?? { kind: 'data', data: this.data };
        // Whatever happens "while the read is in flight" happens after the answer is fixed.
        this.onRead?.();
        return result;
      },
      writeSnapshot: async (_name, payload) => {
        this.calls.writes++;
        if (this.fail.write) return SNAPSHOT_FAILED(this.fail.write);
        if (this.conflict) return this.conflict;
        this.data = payload.data;
        this.written.push(payload);
        return { kind: 'committed' };
      },
      resolveSnapshot: async (conflictId, payload) => {
        this.calls.resolves++;
        if (this.fail.resolve) return SNAPSHOT_FAILED(this.fail.resolve);
        if (!this.conflict || this.conflict.conflictId !== conflictId) return SNAPSHOT_FAILED('failed');
        this.data = payload.data;
        this.written.push(payload);
        this.conflict = this.conflictsAfterResolve.shift() ?? null;
        return this.conflict ?? { kind: 'resolved' };
      },
    };
  }

  /** What the server now holds, decoded. */
  public get saved(): CloudSaveV1 | null {
    const decoded = decodeCloudSave(this.data);
    return decoded.kind === 'save' ? decoded.save : decoded.kind === 'empty' ? emptyCloudSave() : null;
  }
}

/** One device: a storage, and the sync wired to it exactly as `cloudSync.ts` wires the real one. */
function device(cloud: FakeCloud, options: {
  storage?: Storage;
  player?: { playerId: string; displayName: string } | null;
  signedIn?: boolean;
  native?: boolean;
  onImported?: (progress: Progress) => void;
  games?: PlayGames;
} = {}) {
  const storage = options.storage ?? memoryStorage();
  const signedIn = options.signedIn ?? true;
  const player = options.player === undefined ? PLAYER_A : options.player;
  const status = (): PlayGamesStatus => signedIn ? { authenticated: true, player, reason: 'checked' } : { authenticated: false, player: null, reason: 'declined' };
  const games = options.games ?? createPlayGames(cloud.client(status));
  const events: { event: string; data: Record<string, string | number | boolean> }[] = [];
  const deps: CloudSyncDeps = {
    games: () => games,
    native: () => options.native ?? true,
    local: localCloudSave(storage),
    store: cloudStoreOn(storage),
    onEvent: (event, data) => events.push({ event, data }),
    timeoutMs: 200,
    ...(options.onImported ? { onImported: options.onImported } : {}),
  };
  const cloudSync = createCloudSync(deps);
  return { storage, games, events, sync: cloudSync.sync, last: () => cloudSync.last, local: deps.local };
}

/** Play on a device: the same `recordResult`-shaped write a cleared level makes. */
function play(storage: Storage, progress: Progress): void {
  saveProgress(progress, storage);
}

const synced = (outcome: CloudSyncOutcome) => {
  expect(outcome.kind).toBe('synced');
  return outcome as Extract<CloudSyncOutcome, { kind: 'synced' }>;
};

// ---------------------------------------------------------------------------------------

describe('the payload', () => {
  it('carries exactly earned progression and one-time lessons, and nothing a player owes or owns', () => {
    const storage = memoryStorage({
      'tiny-tempo.health.v1': '{"hearts":2,"regenAt":123}',
      'tiny-tempo.fills.v1': '["claim-1"]',
      'tiny-tempo.daily-heart.v1': '{"claimedOn":"2026-10-03"}',
      'tiny-tempo.premium.v1': '{"entitled":true,"checkedAt":1}',
      'tiny-tempo.settings.v1': '{"calibrationMs":-120,"muted":true,"music":0.4,"sfx":0.7,"haptics":false,"analytics":true}',
      'tiny-tempo.objectives.v1': '{"day":"2026-10-03"}',
    });
    play(storage, road(12, { 3: 91 }));
    completeTutorial(storage);
    setTeachFlags({ seen: true, triplet: true, replayTip: true }, storage);
    const text = encodeCloudSave(localCloudSave(storage).read());
    const parsed = JSON.parse(text);
    expect(Object.keys(parsed).sort()).toEqual(['progress', 'teach', 'tutorial', 'version']);
    expect(Object.keys(parsed.progress).sort()).toEqual(['best', 'unlocked']);
    expect(Object.keys(parsed.teach).sort()).toEqual(['scrapbook', 'seen', 'sixteenth', 'triplet']);
    expect(parsed.version).toBe(CLOUD_SAVE.version);
    expect(parsed.progress.unlocked).toBe(13);
    expect(parsed.progress.best['3']).toBe(91);
    expect(parsed.tutorial).toBe('complete');
    expect(parsed.teach).toEqual({ seen: true, triplet: true, sixteenth: false, scrapbook: false });
    // Hearts, ledgers, Premium, calibration, volumes, consent, objectives: none of it, by name or by value.
    expect(text).not.toMatch(/heart|regen|fill|claim|daily|premium|entitle|purchase|calibrat|offset|latency|mute|music|sfx|volume|haptic|analytics|consent|objective|stamp|replayTip/i);
    expect(text).not.toContain('-120');
    expect(text).not.toContain('0.4');
  });

  it('round-trips, bounds what it carries, and is canonical', () => {
    const original = save({ unlocked: 500, best: { 7: 82.5, 1: 100, 300: 60, 25_000: 90, 0: 50, 2.5: 70 } }, { tutorial: 'skipped', teach: { seen: true, triplet: false, sixteenth: true, scrapbook: false } });
    const decoded = decodeCloudSave(encodeCloudSave(original));
    expect(decoded.kind).toBe('save');
    if (decoded.kind !== 'save') return;
    // Levels above the cap and non-levels are not carried; everything else is exact.
    expect(decoded.save.progress.best).toEqual({ 1: 100, 7: 82.5, 300: 60 });
    expect(decoded.save.progress.unlocked).toBe(500);
    expect(decoded.save.tutorial).toBe('skipped');
    expect(decoded.save.teach).toEqual({ seen: true, triplet: false, sixteenth: true, scrapbook: false });
    // Key order and level order do not change the text, so equality is text equality.
    const shuffled = save({ unlocked: 500, best: { 300: 60, 7: 82.5, 1: 100 } }, { tutorial: 'skipped', teach: { scrapbook: false, sixteenth: true, triplet: false, seen: true } });
    expect(encodeCloudSave(shuffled)).toBe(encodeCloudSave(decoded.save));
    expect(sameCloudSave(shuffled, decoded.save)).toBe(true);
  });

  it('reads nothing, a damaged payload and a newer client’s payload as three different things', () => {
    expect(decodeCloudSave(null)).toEqual({ kind: 'empty' });
    expect(decodeCloudSave('   ')).toEqual({ kind: 'empty' });
    expect(decodeCloudSave('{not json')).toEqual({ kind: 'malformed' });
    expect(decodeCloudSave('[1,2]')).toEqual({ kind: 'malformed' });
    expect(decodeCloudSave('{"progress":{"unlocked":5}}')).toEqual({ kind: 'malformed' });
    expect(decodeCloudSave('{"version":"1"}')).toEqual({ kind: 'malformed' });
    expect(decodeCloudSave('{"version":2,"anything":true}')).toEqual({ kind: 'unsupported', version: 2 });
    expect(decodeCloudSave('{"version":7}')).toEqual({ kind: 'unsupported', version: 7 });
  });

  it('salvages a version-1 payload field by field, the way the device salvages its own storage', () => {
    const decoded = decodeCloudSave('{"version":1,"progress":{"unlocked":"x","best":{"a":1,"2":"no","3":150,"5":40}},"tutorial":"later","teach":{"seen":"yes","triplet":true}}');
    expect(decoded.kind).toBe('save');
    if (decoded.kind !== 'save') return;
    // The frontier is rebuilt from the clears rather than reset to 1; a bad level is dropped, not the save.
    expect(decoded.save.progress).toEqual({ unlocked: 6, best: { 3: 100, 5: 40 } });
    expect(decoded.save.tutorial).toBe('none');
    expect(decoded.save.teach).toEqual({ seen: false, triplet: true, sixteenth: false, scrapbook: false });
  });

  it('bounds a tampered frontier the way the local save does', () => {
    const decoded = decodeCloudSave('{"version":1,"progress":{"unlocked":1e15,"best":{}}}');
    expect(decoded.kind === 'save' && decoded.save.progress.unlocked).toBe(CLOUD_SAVE.maxFrontier);
  });

  it('merges like two save codes: higher frontier, higher accuracy per level, a lesson seen on either side', () => {
    const a = save({ unlocked: 8, best: { 1: 50, 7: 82 } }, { tutorial: 'skipped', teach: { seen: true, triplet: false, sixteenth: false, scrapbook: false } });
    const b = save({ unlocked: 9, best: { 1: 40, 7: 91, 8: 60 } }, { tutorial: 'complete', teach: { seen: false, triplet: true, sixteenth: false, scrapbook: false } });
    const merged = mergeCloudSaves(a, b);
    expect(merged.progress).toEqual({ unlocked: 9, best: { 1: 50, 7: 91, 8: 60 } });
    expect(merged.tutorial).toBe('complete');
    expect(merged.teach).toEqual({ seen: true, triplet: true, sixteenth: false, scrapbook: false });
    expect(mergeCloudSaves(b, a)).toEqual(merged);
    // A skip never demotes a pass, whichever side it is on.
    expect(mergeCloudSaves(save(road(1), { tutorial: 'complete' }), save(road(1), { tutorial: 'skipped' })).tutorial).toBe('complete');
    expect(mergeCloudSaves(save(road(1), { tutorial: 'none' }), save(road(1), { tutorial: 'skipped' })).tutorial).toBe('skipped');
  });

  it('describes a save to Play without an id in it', () => {
    const payload = snapshotPayload(save(road(10, { 3: 91 })));
    expect(payload.description).toBe('Level 11, 10 cleared');
    expect(payload.progress).toBe(11);
    expect(JSON.parse(payload.data).version).toBe(1);
  });
});

describe('the owner tag and the binding', () => {
  it('is a stable hash that is not the id', () => {
    const tag = ownerTag(PLAYER_A.playerId);
    expect(tag).toMatch(/^[0-9a-f]{16}$/);
    expect(ownerTag(PLAYER_A.playerId)).toBe(tag);
    expect(ownerTag(PLAYER_B.playerId)).not.toBe(tag);
    expect(tag).not.toContain('1234567890');
    expect(PLAYER_A.playerId).not.toContain(tag);
  });

  it('plans adopt, same and switch from what the device remembers', () => {
    const a = ownerTag(PLAYER_A.playerId), b = ownerTag(PLAYER_B.playerId);
    expect(planBinding({ version: 1, owner: null, shelf: {} }, a)).toEqual({ kind: 'adopt' });
    expect(planBinding({ version: 1, owner: a, shelf: {} }, a)).toEqual({ kind: 'same' });
    expect(planBinding({ version: 1, owner: a, shelf: {} }, b)).toEqual({ kind: 'switch', from: a, restore: null });
    const shelved = save(road(5));
    expect(planBinding({ version: 1, owner: a, shelf: { [b]: { save: shelved, at: 1 } } }, b)).toEqual({ kind: 'switch', from: a, restore: shelved });
  });

  it('shelves the old owner, unshelves the new one, merges a repeat and evicts only beyond the cap', () => {
    const a = ownerTag(PLAYER_A.playerId), b = ownerTag(PLAYER_B.playerId);
    let binding = switchBinding({ version: 1, owner: a, shelf: { [b]: { save: save(road(3)), at: 1 } } }, a, b, save(road(9)), 2);
    expect(binding.owner).toBe(b);
    expect(binding.shelf[a]?.save.progress.unlocked).toBe(10);
    expect(binding.shelf[b]).toBeUndefined();
    // Shelving A again — an earlier note that failed to write, say — can only grow A's shelf.
    binding = switchBinding({ ...binding, owner: a, shelf: { ...binding.shelf, [a]: { save: save(road(2, { 1: 99 })), at: 1 } } }, a, b, save(road(9)), 3);
    expect(binding.shelf[a]?.save.progress).toEqual(road(9, { 1: 99 }));
    // The cap: the oldest goes, the current owner is never on the shelf.
    let crowded = { version: 1 as const, owner: 'f'.repeat(16), shelf: {} as Record<string, { save: CloudSaveV1; at: number }> };
    for (let i = 0; i < CLOUD_SAVE.maxShelf + 2; i++) {
      const tag = i.toString(16).padStart(16, '0');
      crowded = { ...switchBinding(crowded, crowded.owner, tag, save(road(i + 1)), i), owner: tag };
    }
    expect(Object.keys(crowded.shelf).length).toBeLessThanOrEqual(CLOUD_SAVE.maxShelf);
    expect(crowded.shelf['0'.padStart(16, '0')]).toBeUndefined();
  });

  it('round-trips, and refuses to read a damaged note as "nobody’s"', () => {
    const a = ownerTag(PLAYER_A.playerId);
    const binding = { version: 1 as const, owner: a, shelf: { [ownerTag(PLAYER_B.playerId)]: { save: save(road(4)), at: 7 } } };
    expect(decodeBinding(encodeBinding(binding))).toEqual(binding);
    expect(decodeBinding(null)).toEqual({ version: 1, owner: null, shelf: {} });
    expect(decodeBinding('{not json')).toBeNull();
    expect(decodeBinding('{"version":2,"owner":null}')).toBeNull();
    expect(decodeBinding('{"version":1,"owner":"raw-player-id"}')).toBeNull();
    // A shelf entry that will not decode is dropped; the note is still a note.
    expect(decodeBinding(`{"version":1,"owner":"${a}","shelf":{"${'b'.repeat(16)}":{"save":"{bad","at":1},"zzz":{}}}`)).toEqual({ version: 1, owner: a, shelf: {} });
  });
});

describe('syncing one device with its cloud', () => {
  it('1. empty cloud + local progress: local survives and is uploaded', async () => {
    const cloud = new FakeCloud();
    const { storage, sync } = device(cloud);
    play(storage, road(6, { 2: 88 }));
    completeTutorial(storage);
    const outcome = synced(await sync());
    expect(outcome).toMatchObject({ uploaded: true, imported: false, adopted: true, switched: false, conflicts: 0 });
    expect(loadProgress(storage)).toEqual(road(6, { 2: 88 }));
    expect(cloud.saved?.progress).toEqual(road(6, { 2: 88 }));
    expect(cloud.saved?.tutorial).toBe('complete');
    expect(cloud.calls).toEqual({ reads: 1, writes: 1, resolves: 0 });
  });

  it('2. cloud progress + fresh device: the cloud becomes local, and nothing is uploaded', async () => {
    const cloud = new FakeCloud();
    cloud.data = encodeCloudSave(save(road(10, { 4: 95 }), { tutorial: 'complete', teach: { seen: true, triplet: true, sixteenth: false, scrapbook: true } }));
    const imported: Progress[] = [];
    const { storage, sync } = device(cloud, { onImported: p => imported.push(p) });
    const outcome = synced(await sync());
    expect(outcome).toMatchObject({ uploaded: false, imported: true, adopted: true });
    expect(loadProgress(storage)).toEqual(road(10, { 4: 95 }));
    expect(tutorialState(storage)).toBe('complete');
    expect(readTeachFlags(storage)).toMatchObject({ seen: true, triplet: true, sixteenth: false, scrapbook: true, replayTip: false });
    expect(cloud.calls.writes).toBe(0);
    expect(imported).toEqual([road(10, { 4: 95 })]);
  });

  it('3. divergent local and cloud: the highest frontier and the higher accuracy from each side survive, on both ends', async () => {
    const cloud = new FakeCloud();
    cloud.data = encodeCloudSave(save({ unlocked: 12, best: { ...road(11).best, 3: 70, 9: 93 } }));
    const { storage, sync } = device(cloud);
    play(storage, { unlocked: 15, best: { ...road(14).best, 3: 85, 9: 61 } });
    const outcome = synced(await sync());
    expect(outcome).toMatchObject({ uploaded: true, imported: true });
    const expected = { unlocked: 15, best: { ...road(14).best, 3: 85, 9: 93 } };
    expect(loadProgress(storage)).toEqual(expected);
    expect(cloud.saved?.progress).toEqual(expected);
  });

  it('11. a repeated sync is idempotent: nothing new on either side, no write', async () => {
    const cloud = new FakeCloud();
    cloud.data = encodeCloudSave(save(road(3)));
    const { storage, sync } = device(cloud);
    play(storage, road(5));
    synced(await sync());
    const writes = cloud.calls.writes;
    const again = synced(await sync());
    expect(again).toMatchObject({ uploaded: false, imported: false, adopted: false, switched: false });
    expect(cloud.calls.writes).toBe(writes);
    expect(loadProgress(storage)).toEqual(road(5));
    expect(synced(await sync())).toMatchObject({ uploaded: false, imported: false });
  });

  it('12. the same player returning later, on a device bound to them, gets what the cloud gained since', async () => {
    const cloud = new FakeCloud();
    const { storage, sync } = device(cloud);
    play(storage, road(4));
    synced(await sync());
    // Elsewhere, the player clears to 9.
    cloud.data = encodeCloudSave(save(road(9)));
    const outcome = synced(await sync());
    expect(outcome).toMatchObject({ imported: true, uploaded: false, adopted: false, switched: false });
    expect(loadProgress(storage)).toEqual(road(9));
  });

  it('coalesces a burst of requests into the run in flight and one more after it', async () => {
    const cloud = new FakeCloud();
    const { storage, sync } = device(cloud);
    play(storage, road(2));
    const first = sync();
    const second = sync();
    const third = sync();
    expect(third).toBe(second);
    await Promise.all([first, second, third]);
    expect(cloud.calls.reads).toBe(2);
  });

  it('merges with what is in storage at write time, so a level cleared mid-sync is kept', async () => {
    const cloud = new FakeCloud();
    cloud.data = encodeCloudSave(save(road(3, { 1: 99 })));
    const { storage, sync } = device(cloud);
    play(storage, road(5));
    // While the read is in flight the player clears level 6 — the race the local write exists for.
    cloud.onRead = () => play(storage, road(6));
    synced(await sync());
    expect(loadProgress(storage)).toEqual(road(6, { 1: 99 }));
  });
});

describe('two devices', () => {
  it('4. a conflict between device A (level 7) and device B (level 8) resolves to both improvements', async () => {
    const base = save(road(8, { 7: 70, 8: 65 }));
    const cloud = new FakeCloud();
    // Device A improved 7 to 90; device B improved 8 to 88 and cleared 9. Play reports both.
    cloud.conflict = {
      kind: 'conflict', conflictId: 'c-1',
      base: encodeCloudSave(save(road(8, { 7: 90, 8: 65 }))),
      other: encodeCloudSave(save(road(9, { 7: 70, 8: 88 }))),
    };
    const { storage, sync } = device(cloud);
    play(storage, base.progress);
    const outcome = synced(await sync());
    expect(outcome.conflicts).toBe(1);
    const expected = road(9, { 7: 90, 8: 88 });
    expect(cloud.saved?.progress).toEqual(expected);
    expect(loadProgress(storage)).toEqual(expected);
    expect(cloud.calls.resolves).toBe(1);
  });

  it('5. the same level at 82 on one side and 91 on the other ends at 91, both ways round', async () => {
    for (const [left, right] of [[82, 91], [91, 82]] as const) {
      const cloud = new FakeCloud();
      cloud.conflict = { kind: 'conflict', conflictId: 'c', base: encodeCloudSave(save(road(5, { 4: left }))), other: encodeCloudSave(save(road(5, { 4: right }))) };
      const { storage, sync } = device(cloud);
      play(storage, road(5, { 4: 50 }));
      synced(await sync());
      expect(cloud.saved?.progress.best[4]).toBe(91);
      expect(loadProgress(storage).best[4]).toBe(91);
    }
  });

  it('6. a lesson already completed on either side never reverts', async () => {
    const cloud = new FakeCloud();
    cloud.conflict = {
      kind: 'conflict', conflictId: 'c',
      base: encodeCloudSave(save(road(2), { tutorial: 'skipped', teach: { seen: true, triplet: false, sixteenth: false, scrapbook: false } })),
      other: encodeCloudSave(save(road(2), { tutorial: 'none', teach: { seen: false, triplet: true, sixteenth: false, scrapbook: false } })),
    };
    const { storage, sync } = device(cloud);
    play(storage, road(2));
    completeTutorial(storage);
    setTeachFlags({ scrapbook: true }, storage);
    synced(await sync());
    expect(cloud.saved?.tutorial).toBe('complete');
    expect(cloud.saved?.teach).toEqual({ seen: true, triplet: true, sixteenth: false, scrapbook: true });
    expect(tutorialState(storage)).toBe('complete');
    expect(readTeachFlags(storage)).toMatchObject({ seen: true, triplet: true, scrapbook: true });
    // And a plain cloud that is behind on the lesson is brought up, never the device down.
    const behind = new FakeCloud();
    behind.data = encodeCloudSave(save(road(2), { tutorial: 'none' }));
    const d = device(behind);
    play(d.storage, road(2));
    skipTutorial(d.storage);
    synced(await d.sync());
    expect(tutorialState(d.storage)).toBe('skipped');
    expect(behind.saved?.tutorial).toBe('skipped');
  });

  it('resolves a conflict that reveals another, and gives up at the bound without touching local', async () => {
    const cloud = new FakeCloud();
    const conflictAt = (id: string, level: number): SnapshotConflict =>
      ({ kind: 'conflict', conflictId: id, base: encodeCloudSave(save(road(level))), other: encodeCloudSave(save(road(level + 1))) });
    cloud.conflict = conflictAt('c-1', 3);
    cloud.conflictsAfterResolve = [conflictAt('c-2', 6)];
    const { storage, sync } = device(cloud);
    play(storage, road(2));
    const outcome = synced(await sync());
    expect(outcome.conflicts).toBe(2);
    expect(cloud.saved?.progress).toEqual(road(7));
    expect(loadProgress(storage)).toEqual(road(7));

    const endless = new FakeCloud();
    endless.conflict = conflictAt('e-0', 1);
    endless.conflictsAfterResolve = Array.from({ length: 20 }, (_, i) => conflictAt(`e-${i + 1}`, i + 2));
    const d = device(endless);
    play(d.storage, road(4));
    const gaveUp = await d.sync();
    expect(gaveUp).toMatchObject({ kind: 'failed', step: 'resolve', reason: 'conflict_unresolved', imported: false });
    expect(endless.calls.resolves).toBe(CLOUD_SAVE.maxConflictRounds);
    expect(loadProgress(d.storage)).toEqual(road(4));
  });

  it('merges another device’s write that lands between this device’s read and write', async () => {
    const cloud = new FakeCloud();
    cloud.data = encodeCloudSave(save(road(3)));
    const { storage, sync } = device(cloud);
    play(storage, road(5, { 2: 90 }));
    // Between the read and the write, the other device commits level 6: the write reports a conflict.
    cloud.onRead = () => {
      cloud.conflict = { kind: 'conflict', conflictId: 'w-1', base: encodeCloudSave(save(road(3))), other: encodeCloudSave(save(road(6, { 2: 70 }))) };
    };
    const outcome = synced(await sync());
    expect(outcome).toMatchObject({ uploaded: true, imported: true, conflicts: 1 });
    expect(cloud.saved?.progress).toEqual(road(6, { 2: 90 }));
    expect(loadProgress(storage)).toEqual(road(6, { 2: 90 }));
  });

  it('keeps the readable side of a conflict whose other side is damaged, and stops for a newer client’s side', async () => {
    const cloud = new FakeCloud();
    cloud.conflict = { kind: 'conflict', conflictId: 'c', base: '{broken', other: encodeCloudSave(save(road(7))) };
    const { storage, sync } = device(cloud);
    play(storage, road(3, { 1: 100 }));
    synced(await sync());
    expect(cloud.saved?.progress).toEqual(road(7, { 1: 100 }));
    expect(loadProgress(storage)).toEqual(road(7, { 1: 100 }));

    const newer = new FakeCloud();
    newer.conflict = { kind: 'conflict', conflictId: 'c', base: encodeCloudSave(save(road(7))), other: '{"version":3}' };
    const d = device(newer);
    play(d.storage, road(3));
    expect(await d.sync()).toEqual({ kind: 'unsupported', version: 3, imported: false });
    expect(newer.calls.resolves).toBe(0);
    expect(loadProgress(d.storage)).toEqual(road(3));

    const bothBroken = new FakeCloud();
    bothBroken.conflict = { kind: 'conflict', conflictId: 'c', base: '{broken', other: 'also broken' };
    const e = device(bothBroken);
    play(e.storage, road(3));
    expect(await e.sync()).toMatchObject({ kind: 'failed', step: 'resolve', reason: 'malformed' });
    expect(bothBroken.calls.resolves).toBe(0);
    expect(loadProgress(e.storage)).toEqual(road(3));
  });
});

describe('failing safely', () => {
  it('7. a malformed cloud payload costs nothing local and is not written over', async () => {
    const cloud = new FakeCloud();
    cloud.data = '{"version":1,"progress":';
    const { storage, sync } = device(cloud);
    play(storage, road(5));
    expect(await sync()).toEqual({ kind: 'failed', step: 'read', reason: 'malformed', imported: false });
    expect(loadProgress(storage)).toEqual(road(5));
    expect(cloud.calls.writes).toBe(0);
    expect(cloud.data).toBe('{"version":1,"progress":');
  });

  it('8. a cloud save from a newer client is left exactly as it is, and local is left exactly as it is', async () => {
    const cloud = new FakeCloud();
    const future = '{"version":2,"progress":{"unlocked":40,"best":{}},"newField":[1,2,3]}';
    cloud.data = future;
    const { storage, sync } = device(cloud);
    play(storage, road(5));
    expect(await sync()).toEqual({ kind: 'unsupported', version: 2, imported: false });
    expect(cloud.data).toBe(future);
    expect(cloud.calls.writes).toBe(0);
    expect(loadProgress(storage)).toEqual(road(5));
    // Trying again does not change its mind.
    expect(await sync()).toEqual({ kind: 'unsupported', version: 2, imported: false });
    expect(cloud.data).toBe(future);
  });

  it('9. a signed-out player: no cloud call of any kind, and the game is as it was', async () => {
    const cloud = new FakeCloud();
    const { storage, sync } = device(cloud, { signedIn: false });
    play(storage, road(5));
    expect(await sync()).toEqual({ kind: 'skipped', reason: 'signed_out' });
    expect(cloud.calls).toEqual({ reads: 0, writes: 0, resolves: 0 });
    expect(loadProgress(storage)).toEqual(road(5));
    expect(storage.getItem(CLOUD_STORE_KEY)).toBeNull();
    // Signed in but no player to bind to is the same: nothing is adopted blind.
    const noPlayer = device(cloud, { player: null });
    expect(await noPlayer.sync()).toEqual({ kind: 'skipped', reason: 'no_player' });
    expect(cloud.calls.reads).toBe(0);
  });

  it('a browser, or a build with no plugin, is unavailable and touches nothing', async () => {
    const cloud = new FakeCloud();
    const { storage, sync } = device(cloud, { native: false, games: stubPlayGames });
    play(storage, road(5));
    expect(await sync()).toEqual({ kind: 'skipped', reason: 'unavailable' });
    expect(loadProgress(storage)).toEqual(road(5));
    await expect(stubPlayGames.readSnapshot('x')).resolves.toEqual(SNAPSHOT_FAILED('unavailable'));
    await expect(stubPlayGames.writeSnapshot('x', { data: '{}', description: '', progress: 1 })).resolves.toEqual(SNAPSHOT_FAILED('unavailable'));
    await expect(stubPlayGames.resolveSnapshot('c', { data: '{}', description: '', progress: 1 })).resolves.toEqual(SNAPSHOT_FAILED('unavailable'));
  });

  it('10. network and API failures leave the local save intact and never throw', async () => {
    const cloud = new FakeCloud();
    cloud.fail.read = 'offline';
    const { storage, sync } = device(cloud);
    play(storage, road(5));
    expect(await sync()).toEqual({ kind: 'failed', step: 'read', reason: 'offline', imported: false });
    expect(loadProgress(storage)).toEqual(road(5));
    // The read works but the write does not: what the cloud had still arrives, and what
    // the device had is still there for the next attempt.
    cloud.fail = { write: 'timeout' };
    cloud.data = encodeCloudSave(save(road(5, { 1: 99 })));
    play(storage, road(6));
    expect(await sync()).toEqual({ kind: 'failed', step: 'write', reason: 'timeout', imported: true });
    expect(loadProgress(storage)).toEqual(road(6, { 1: 99 }));
    expect(cloud.saved?.progress).toEqual(road(5, { 1: 99 }));
    cloud.fail = {};
    synced(await sync());
    expect(cloud.saved?.progress).toEqual(road(6, { 1: 99 }));
    // The bridge throwing is a failure too, not a crash.
    const throwing = createPlayGames({
      ...cloud.client(() => ({ authenticated: true, player: PLAYER_A, reason: 'checked' })),
      readSnapshot: async () => { throw new Error('bridge gone'); },
    });
    const d = device(cloud, { games: throwing });
    play(d.storage, road(2));
    expect(await d.sync()).toEqual({ kind: 'failed', step: 'read', reason: 'failed', imported: false });
    expect(loadProgress(d.storage)).toEqual(road(2));
    // And a Play Games call that never answers is a timeout, not a hang.
    const hanging = createPlayGames({
      ...cloud.client(() => ({ authenticated: true, player: PLAYER_A, reason: 'checked' })),
      readSnapshot: () => new Promise(() => { /* never */ }),
    });
    const e = device(cloud, { games: hanging });
    expect(await e.sync()).toEqual({ kind: 'failed', step: 'read', reason: 'timeout', imported: false });
  });

  it('a snapshot call answered "signed out" updates what the adapter believes', async () => {
    const cloud = new FakeCloud();
    cloud.fail.read = 'signed_out';
    const games = createPlayGames(cloud.client(() => ({ authenticated: true, player: PLAYER_A, reason: 'checked' })));
    await games.refresh();
    expect(games.status.authenticated).toBe(true);
    await games.readSnapshot(CLOUD_SAVE.snapshotName);
    expect(games.status.authenticated).toBe(false);
  });

  it('a damaged binding note stops the sync rather than adopting whoever is signed in', async () => {
    const cloud = new FakeCloud();
    const { storage, sync } = device(cloud, { storage: memoryStorage({ [CLOUD_STORE_KEY]: '{"version":1,"owner":' }) });
    play(storage, road(5));
    expect(await sync()).toEqual({ kind: 'failed', step: 'binding', reason: 'binding', imported: false });
    expect(cloud.calls.reads).toBe(0);
    expect(loadProgress(storage)).toEqual(road(5));
  });

  it('a device whose storage refuses writes imports nothing and reports it, rather than half-writing', async () => {
    const cloud = new FakeCloud();
    cloud.data = encodeCloudSave(save(road(9)));
    const blocked = blockedStorage();
    const { sync } = device(cloud, { storage: blocked });
    // The binding cannot even be written, so the sync stops before the cloud is read.
    expect(await sync()).toEqual({ kind: 'failed', step: 'binding', reason: 'local_write', imported: false });
    expect(cloud.calls.writes).toBe(0);
  });

  it('never grants hearts, Premium or a purchase through a restore, because the device’s own keys are untouched', async () => {
    const cloud = new FakeCloud();
    cloud.data = encodeCloudSave(save(road(20)));
    const before = {
      'tiny-tempo.health.v1': '{"hearts":1}',
      'tiny-tempo.fills.v1': '[]',
      'tiny-tempo.daily-heart.v1': '{}',
      'tiny-tempo.premium.v1': '{"entitled":false}',
      'tiny-tempo.settings.v1': '{"calibrationMs":-77,"analytics":false}',
    };
    const { storage, sync } = device(cloud, { storage: memoryStorage(before) });
    synced(await sync());
    for (const [key, value] of Object.entries(before)) expect(storage.getItem(key)).toBe(value);
    expect(loadProgress(storage)).toEqual(road(20));
  });
});

describe('two players on one device', () => {
  it('13. a second player never receives, uploads or merges the first player’s progression', async () => {
    const cloudA = new FakeCloud();
    const storage = memoryStorage();
    const a = device(cloudA, { storage });
    play(storage, road(50, { 7: 95 }));
    completeTutorial(storage);
    synced(await a.sync());
    expect(cloudA.saved?.progress.unlocked).toBe(51);

    // Android switches the active Play Games profile; the game asks Play Games again.
    const cloudB = new FakeCloud();
    const b = device(cloudB, { storage, player: PLAYER_B });
    const outcome = synced(await b.sync());
    expect(outcome).toMatchObject({ switched: true, adopted: false, uploaded: false, imported: false });
    // Player B's device starts where B is — nowhere — and B's cloud receives nothing of A's.
    expect(loadProgress(storage)).toEqual({ unlocked: 1, best: {} });
    expect(tutorialState(storage)).toBe('none');
    expect(cloudB.calls.writes).toBe(0);
    expect(cloudB.data).toBeNull();
    // A's cloud is exactly what it was.
    expect(cloudA.saved?.progress).toEqual(road(50, { 7: 95 }));
    // B plays; only B's progress goes to B's cloud.
    play(storage, road(2));
    synced(await b.sync());
    expect(cloudB.saved?.progress).toEqual(road(2));
    expect(cloudA.saved?.progress).toEqual(road(50, { 7: 95 }));
  });

  it('14. switching back restores the first player’s progression, merged with their cloud', async () => {
    const cloudA = new FakeCloud();
    const cloudB = new FakeCloud();
    const storage = memoryStorage();
    const a = device(cloudA, { storage });
    play(storage, road(50, { 7: 95 }));
    completeTutorial(storage);
    setTeachFlags({ seen: true, triplet: true, replayTip: true }, storage);
    synced(await a.sync());
    const b = device(cloudB, { storage, player: PLAYER_B });
    synced(await b.sync());
    play(storage, road(3));
    synced(await b.sync());
    // Meanwhile A cleared level 51 on another device.
    cloudA.data = encodeCloudSave(save(road(51, { 7: 95 })));
    const back = device(cloudA, { storage });
    const outcome = synced(await back.sync());
    expect(outcome).toMatchObject({ switched: true, imported: true });
    expect(loadProgress(storage)).toEqual(road(51, { 7: 95 }));
    expect(tutorialState(storage)).toBe('complete');
    expect(readTeachFlags(storage)).toMatchObject({ seen: true, triplet: true });
    // B's cloud never saw A's levels, and B's progression is on the shelf for next time.
    expect(cloudB.saved?.progress).toEqual(road(3));
    const binding = decodeBinding(storage.getItem(CLOUD_STORE_KEY));
    expect(binding?.owner).toBe(ownerTag(PLAYER_A.playerId));
    expect(binding?.shelf[ownerTag(PLAYER_B.playerId)]?.save.progress).toEqual(road(3));
    expect(binding?.shelf[ownerTag(PLAYER_A.playerId)]).toBeUndefined();
  });

  it('a player who had progress here before Play Games existed keeps it: the first account adopts it', async () => {
    const cloud = new FakeCloud();
    const storage = memoryStorage();
    play(storage, road(30));
    const { sync } = device(cloud, { storage });
    const outcome = synced(await sync());
    expect(outcome.adopted).toBe(true);
    expect(cloud.saved?.progress).toEqual(road(30));
    expect(decodeBinding(storage.getItem(CLOUD_STORE_KEY))?.owner).toBe(ownerTag(PLAYER_A.playerId));
  });

  it('signing out after a switch resets nothing: the device keeps the last owner’s progression', async () => {
    const cloudA = new FakeCloud();
    const storage = memoryStorage();
    const a = device(cloudA, { storage });
    play(storage, road(12));
    synced(await a.sync());
    const out = device(cloudA, { storage, signedIn: false });
    expect(await out.sync()).toEqual({ kind: 'skipped', reason: 'signed_out' });
    expect(loadProgress(storage)).toEqual(road(12));
  });

  it('writes the raw player id nowhere: not in storage, not in events', async () => {
    const cloud = new FakeCloud();
    const { storage, sync, events } = device(cloud);
    play(storage, road(3));
    synced(await sync());
    const everything = [storage.getItem(CLOUD_STORE_KEY), storage.getItem('small-acts.progress.v1'), JSON.stringify(events), cloud.data].join('|');
    expect(everything).not.toContain(PLAYER_A.playerId);
    expect(everything).not.toContain('1234567890123456789');
    expect(events.map(e => e.event)).toContain('cloud sync');
    expect(JSON.stringify(events)).not.toMatch(/unlocked|best/);
  });
});

describe('what follows a save', () => {
  it('15. a restored save code reaches the signed-in player’s cloud on the next sync', async () => {
    const cloud = new FakeCloud();
    const { storage, sync } = device(cloud);
    play(storage, road(4));
    synced(await sync());
    // TransferScene: decode, merge onto the device, save — then queue a cloud save.
    const code = encodeSaveCode({ progress: road(14, { 2: 97 }), settings: { calibrationMs: 33, muted: false, music: 1, sfx: 1, haptics: true }, tutorialComplete: true });
    const decoded = decodeSaveCode(code);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    const { mergeProgress } = await import('../src/game/progress');
    play(storage, mergeProgress(loadProgress(storage), decoded.data.progress));
    completeTutorial(storage);
    synced(await sync());
    expect(cloud.saved?.progress).toEqual(road(14, { 2: 97 }));
    expect(cloud.saved?.tutorial).toBe('complete');
    // The code's calibration went to the device's settings, never to the cloud.
    expect(cloud.data).not.toContain('33');
  });

  it('16. progress that arrives from the cloud is handed to the achievements, which it has earned', async () => {
    const cloud = new FakeCloud();
    cloud.data = encodeCloudSave(save(road(21)));
    const imported: Progress[] = [];
    const { sync } = device(cloud, { onImported: p => imported.push(p) });
    synced(await sync());
    expect(imported).toHaveLength(1);
    const achievements = achievementsFrom(ACHIEVEMENTS);
    expect(achievements.filter(a => hasEarned(imported[0]!, a)).map(a => a.clearLevel)).toEqual([10, 20]);
    // Nothing new from the cloud, nothing handed over.
    synced(await sync());
    expect(imported).toHaveLength(1);
  });
});

describe('the bridge', () => {
  it('carries snapshot text as base64 and reads it back, and reads anything else as absent', () => {
    const text = encodeCloudSave(save(road(3)));
    expect(textFromBase64(base64FromText(text))).toBe(text);
    expect(textFromBase64(base64FromText('été ✓'))).toBe('été ✓');
    expect(textFromBase64(undefined)).toBeNull();
    expect(textFromBase64('')).toBeNull();
    expect(textFromBase64('*not base64*')).toBeNull();
    expect(textFromBase64(42)).toBeNull();
  });

  it('validates every answer rather than trusting it', () => {
    const b64 = base64FromText('{"version":1}');
    expect(toSnapshotRead({ kind: 'data', data: b64 })).toEqual({ kind: 'data', data: '{"version":1}' });
    expect(toSnapshotRead({ kind: 'data' })).toEqual({ kind: 'data', data: null });
    expect(toSnapshotRead({ kind: 'conflict', conflictId: 'c', base: b64 })).toEqual({ kind: 'conflict', conflictId: 'c', base: '{"version":1}', other: null });
    expect(toSnapshotRead({ kind: 'conflict' })).toEqual(SNAPSHOT_FAILED('failed'));
    expect(toSnapshotRead({ kind: 'failed', reason: 'offline' })).toEqual(SNAPSHOT_FAILED('offline'));
    expect(toSnapshotRead({ kind: 'failed', reason: 'bizarre' })).toEqual(SNAPSHOT_FAILED('failed'));
    expect(toSnapshotRead(null)).toEqual(SNAPSHOT_FAILED('failed'));
    expect(toSnapshotWrite({ kind: 'committed' })).toEqual({ kind: 'committed' });
    expect(toSnapshotWrite({ kind: 'conflict', conflictId: 'c', base: b64, other: b64 })).toMatchObject({ kind: 'conflict', conflictId: 'c' });
    expect(toSnapshotWrite({})).toEqual(SNAPSHOT_FAILED('failed'));
    expect(toSnapshotResolution({ kind: 'resolved' })).toEqual({ kind: 'resolved' });
    expect(toSnapshotResolution({ kind: 'failed', reason: 'signed_out' })).toEqual(SNAPSHOT_FAILED('signed_out'));
    expect(toSnapshotResolution('resolved')).toEqual(SNAPSHOT_FAILED('failed'));
  });

  it('the adapter turns a throwing snapshot call into a failure', async () => {
    const games = createPlayGames({
      ...new FakeCloud().client(() => SIGNED_OUT),
      writeSnapshot: async () => { throw new Error('no plugin'); },
      resolveSnapshot: async () => { throw new Error('no plugin'); },
    });
    await expect(games.writeSnapshot('n', { data: '{}', description: '', progress: 1 })).resolves.toEqual(SNAPSHOT_FAILED('failed'));
    await expect(games.resolveSnapshot('c', { data: '{}', description: '', progress: 1 })).resolves.toEqual(SNAPSHOT_FAILED('failed'));
  });
});

describe('a damaged cloud binding', () => {
  const memory = (initial: Record<string, string> = {}): Storage => {
    const map = new Map(Object.entries(initial));
    return {
      getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); },
      removeItem: (k: string) => { map.delete(k); }, clear: () => map.clear(), key: () => null, get length() { return map.size; },
    } as Storage;
  };
  it('is told apart from a missing one and a readable one', () => {
    expect(cloudBindingDamaged(null)).toBe(false);
    expect(cloudBindingDamaged('')).toBe(false);
    expect(cloudBindingDamaged(encodeBinding(EMPTY_BINDING))).toBe(false);
    expect(cloudBindingDamaged(encodeBinding({ version: 1, owner: 'a'.repeat(16), shelf: {} }))).toBe(false);
    expect(cloudBindingDamaged('{"version":1,"owner":')).toBe(true);
    expect(cloudBindingDamaged('{"version":7}')).toBe(true);
  });
  it('is the only binding Reset progress removes', () => {
    const readable = encodeBinding({ version: 1, owner: 'a'.repeat(16), shelf: {} });
    const kept = memory({ 'tiny-tempo.cloud.v1': readable });
    expect(repairCloudBinding(kept)).toBe(false);
    expect(kept.getItem('tiny-tempo.cloud.v1')).toBe(readable);
    const damaged = memory({ 'tiny-tempo.cloud.v1': '{"version":1,"owner":' });
    expect(repairCloudBinding(damaged)).toBe(true);
    expect(damaged.getItem('tiny-tempo.cloud.v1')).toBeNull();
    expect(repairCloudBinding(memory())).toBe(false);
    expect(repairCloudBinding(null)).toBe(false);
  });
});
