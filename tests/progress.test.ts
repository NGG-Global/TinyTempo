import { describe, expect, it, vi } from 'vitest';
import { guidedLevel, loadProgress, markDemonstrationSeen, mergeProgress, recordResult, saveProgress, seenDemonstration } from '../src/game/progress';
import { decodeSaveCode, encodeSaveCode } from '../src/game/saveCode';

vi.mock('phaser', () => ({ default: {} }));

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return { getItem: k => map.get(k) ?? null, setItem: (k, v) => { map.set(k, String(v)); }, removeItem: k => { map.delete(k); }, clear: () => map.clear(), key: () => null, length: 0 } as Storage;
}

describe('progress', () => {
  it('starts at level 1 with nothing stored, corrupt storage, or no storage', () => {
    expect(loadProgress(memoryStorage())).toEqual({ unlocked: 1, best: {} });
    expect(loadProgress(memoryStorage({ 'small-acts.progress.v1': '{not json' }))).toEqual({ unlocked: 1, best: {} });
    expect(loadProgress(null)).toEqual({ unlocked: 1, best: {} });
    expect(saveProgress({ unlocked: 2, best: {} }, null)).toBe(false);
  });
  it('rebuilds the frontier from cleared levels rather than demoting to level 1', () => {
    // A corrupt `unlocked` used to send the player back to level 1 while their clears
    // sat in `best` — the same information the frontier is derived from.
    expect(loadProgress(memoryStorage({ 'small-acts.progress.v1': '{"unlocked":"x","best":{"a":1,"2":"no","3":150}}' })))
      .toEqual({ unlocked: 4, best: { 3: 100 } });
    // Nothing cleared and nothing usable stored still starts at the beginning.
    expect(loadProgress(memoryStorage({ 'small-acts.progress.v1': '{"unlocked":-5,"best":{}}' }))).toEqual({ unlocked: 1, best: {} });
  });
  it('bounds a corrupt or tampered frontier so the map cannot be asked to allocate it', () => {
    // MapScene builds one Text per level from this number; 1e15 threw RangeError in
    // build(), and with no reset in the UI the player could not recover.
    const huge = loadProgress(memoryStorage({ 'small-acts.progress.v1': '{"unlocked":1e15,"best":{}}' }));
    expect(huge.unlocked).toBeLessThanOrEqual(100_000);
    expect(Number.isInteger(huge.unlocked)).toBe(true);
    expect(loadProgress(memoryStorage({ 'small-acts.progress.v1': '{"unlocked":250,"best":{}}' })).unlocked).toBe(250);
  });
  it('writes a version alongside the payload without returning it', () => {
    const storage = memoryStorage();
    saveProgress({ unlocked: 3, best: { 1: 80, 2: 90 } }, storage);
    expect(JSON.parse(storage.getItem('small-acts.progress.v1')!).version).toBe(1);
    // The version is storage detail; callers keep seeing the same shape.
    expect(loadProgress(storage)).toEqual({ unlocked: 3, best: { 1: 80, 2: 90 } });
  });
  it('unlocks the next level only when the frontier is cleared and keeps the best accuracy', () => {
    let progress = loadProgress(memoryStorage());
    let outcome = recordResult(progress, 1, 39);
    expect(outcome.cleared).toBe(false); expect(outcome.stars).toBe(0); expect(outcome.progress.unlocked).toBe(1);
    outcome = recordResult(progress, 1, 65);
    expect(outcome.cleared).toBe(true); expect(outcome.stars).toBe(2); expect(outcome.progress.unlocked).toBe(2); expect(outcome.progress.best[1]).toBe(65);
    progress = outcome.progress;
    outcome = recordResult(progress, 1, 50); // replaying an old level never lowers the best or moves the frontier
    expect(outcome.progress.best[1]).toBe(65); expect(outcome.progress.unlocked).toBe(2); expect(outcome.bestBefore).toBe(65);
    outcome = recordResult(progress, 1, 90);
    expect(outcome.progress.best[1]).toBe(90); expect(outcome.stars).toBe(3);
    const storage = memoryStorage();
    expect(saveProgress(outcome.progress, storage)).toBe(true);
    expect(loadProgress(storage)).toEqual(outcome.progress);
  });
});

describe('restoring onto a device that already has progress', () => {
  it('keeps the better of each side rather than overwriting one', () => {
    const local = { unlocked: 30, best: { 1: 50, 2: 99, 40: 70 } };
    const incoming = { unlocked: 12, best: { 1: 88, 3: 61 } };
    const merged = mergeProgress(local, incoming);
    // Level 1 improves, level 2 is left alone, and neither side's exclusive levels are lost.
    expect(merged.best).toEqual({ 1: 88, 2: 99, 3: 61, 40: 70 });
    // The frontier is the highest of the two, and never below what the clears imply.
    expect(merged.unlocked).toBe(41);
  });

  it('cannot lose progress, whichever way round the merge runs', () => {
    const local = { unlocked: 30, best: { 1: 50, 2: 99 } };
    const incoming = { unlocked: 12, best: { 1: 88, 3: 61 } };
    expect(mergeProgress(local, incoming)).toEqual(mergeProgress(incoming, local));
  });

  it('merges a decoded code the same way, round trip included', () => {
    const local = { unlocked: 5, best: { 1: 100, 9: 44 } };
    const result = decodeSaveCode(encodeSaveCode({
      progress: { unlocked: 23, best: { 1: 92, 2: 78, 3: 100, 22: 61 } },
      settings: { calibrationMs: -42, muted: false, haptics: true },
      tutorialComplete: true,
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const merged = mergeProgress(local, result.data.progress);
    expect(merged.best[1]).toBe(100);
    expect(merged.best[9]).toBe(44);
    expect(merged.best[22]).toBe(61);
    expect(merged.unlocked).toBe(23);
  });
});

describe('the first-run teach', () => {
  it('shows the demonstration once, and not again after it has played', () => {
    const storage = memoryStorage();
    expect(seenDemonstration(storage)).toBe(false);
    expect(markDemonstrationSeen(storage)).toBe(true);
    expect(seenDemonstration(storage)).toBe(true);
  });

  it('plays again rather than throwing when storage is blocked or corrupt', () => {
    // A private window is not a reason to fail to start; the pass simply runs once more.
    expect(seenDemonstration(null)).toBe(false);
    expect(markDemonstrationSeen(null)).toBe(false);
    expect(seenDemonstration(memoryStorage({ 'small-acts.teach.v1': '{not json' }))).toBe(false);
    expect(seenDemonstration(memoryStorage({ 'small-acts.teach.v1': 'null' }))).toBe(false);
    expect(seenDemonstration(memoryStorage({ 'small-acts.teach.v1': '{"seen":"yes"}' }))).toBe(false);
  });

  it('guides the first level until it has been cleared, and then stops', () => {
    expect(guidedLevel({ unlocked: 1, best: {} })).toBe(1);
    // Unlocking level 2 without a recorded best cannot happen, but the ring follows the
    // clear rather than the frontier either way: `best` is what a clear writes.
    expect(guidedLevel({ unlocked: 1, best: { 1: 64 } })).toBeNull();
    expect(guidedLevel({ unlocked: 4, best: { 2: 80 } })).toBe(1);
  });

  it('drops the guidance a restored save has already earned past', () => {
    // Derived from `best`, so a save code that carries a cleared level 1 brings the
    // ring's absence with it rather than resetting the training wheels.
    const restored = mergeProgress({ unlocked: 1, best: {} }, { unlocked: 3, best: { 1: 71, 2: 66 } });
    expect(guidedLevel(restored)).toBeNull();
  });
});
