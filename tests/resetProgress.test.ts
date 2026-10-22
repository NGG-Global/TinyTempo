import { describe, expect, it, vi } from 'vitest';
import { GATE_RECORD_KEY, loadGates, openArea } from '../src/game/areaGates';
import { keptKeepsakes } from '../src/game/keepsakeLegacy';
import { loadObjectives, objectiveContext } from '../src/game/objectives';
import { loadProgress, markDemonstrationSeen, readTeachFlags, resetGeneration, saveProgress, setTeachFlags } from '../src/game/progress';
import { resetProgress } from '../src/game/resetProgress';
import { completeTutorial, tutorialState } from '../src/game/TutorialRun';
import { levelSpec } from '../src/game/levels';
import type { Progress } from '../src/game/progress';

vi.mock('phaser', () => ({ default: {} }));

function memoryStorage(initial: Record<string, string> = {}): Storage & { readonly keys: () => string[] } {
  const map = new Map(Object.entries(initial));
  return {
    getItem: k => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: k => { map.delete(k); },
    clear: () => map.clear(),
    key: () => null,
    get length() { return map.size; },
    keys: () => [...map.keys()],
  } as Storage & { readonly keys: () => string[] };
}

/** Every level to `through` cleared at three stars. */
function road(through: number): Progress {
  const best: Record<number, number> = {};
  for (let level = 1; level <= through; level++) best[level] = levelSpec(level).starAccuracy[2]!;
  return { unlocked: through + 1, best };
}

describe('Reset progress', () => {
  it('clears the save and every note the device kept about it, and stamps a generation', () => {
    const storage = memoryStorage();
    saveProgress(road(40), storage);
    completeTutorial(storage);
    markDemonstrationSeen(storage);
    setTeachFlags({ offbeat: true, lastOffbeat: true, longPhrase: true, triplet: true, hintSettings: true }, storage);
    openArea(3, road(40), storage);
    expect(keptKeepsakes(storage, () => road(40)).size).toBeGreaterThan(0);
    storage.setItem('tiny-tempo.health.v1', '{"hearts":2,"regenAt":123}');
    loadObjectives(1_000, objectiveContext(road(40)), storage);

    const outcome = resetProgress(storage);
    expect(outcome).toEqual({ cleared: true, generation: 1 });
    expect(loadProgress(storage)).toEqual({ unlocked: 1, best: {} });
    expect(tutorialState(storage)).toBe('none');
    // Every teach flag: the first-run pass and the rhythm introductions play again, level 11's included.
    expect(Object.values(readTeachFlags(storage)).every(flag => flag === false)).toBe(true);
    // The gates stand again, over a road with no stars.
    expect(storage.getItem(GATE_RECORD_KEY)).toBeNull();
    expect(storage.getItem('tiny-tempo.health.v1')).toBeNull();
    expect(loadGates(loadProgress(storage), storage)).toEqual({ opened: 0 });
    // The keepsakes kept from the old schedule went with the save that held them.
    expect(keptKeepsakes(storage, () => loadProgress(storage)).size).toBe(0);
    expect(resetGeneration(storage)).toBe(1);
  });

  it('counts up on every reset, so a later reset is always the newer generation', () => {
    const storage = memoryStorage();
    resetProgress(storage);
    saveProgress(road(3), storage);
    expect(resetProgress(storage)).toEqual({ cleared: true, generation: 2 });
    expect(resetProgress(storage).generation).toBe(3);
    expect(loadProgress(storage)).toEqual({ unlocked: 1, best: {} });
  });

  it('reports a storage it cannot write, and leaves no half-stamped generation', () => {
    expect(resetProgress(null)).toEqual({ cleared: false, generation: 1 });
  });
});
