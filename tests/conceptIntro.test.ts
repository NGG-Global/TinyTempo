import { describe, expect, it, vi } from 'vitest';
import { PROGRESSION } from '../src/config/progression';
import { RHYTHM } from '../src/config/rhythm';
import { difficulty, levelSpec, tightestSpacingMs, type Grid } from '../src/game/levels';
import { loadProgress, markConceptSeen, markDemonstrationSeen, markReplayTipSeen, saveProgress, seenConcepts, seenDemonstration, seenReplayTip, type Progress } from '../src/game/progress';
import { RoundController, type RoundEvents } from '../src/game/RoundController';
import {
  CONCEPT_INTRO, CONCEPTS, ConceptIntroRun, INTRO_PATTERNS, firstEligibleLevel, firstLevelWith, firstLevelWithGrid, gridEligible, introConcept,
  introCopy, taskCarries, type Concept, type SeenConcepts,
} from '../src/game/conceptIntro';
import { TaskSequence } from '../src/game/TaskSequence';
import { createRoundPlan } from '../src/rhythm/RhythmScheduler';
import { windowsFor } from '../src/rhythm/judge';

vi.mock('phaser', () => ({ default: {} }));

const GRIDS: readonly Grid[] = ['triplet', 'sixteenth'];
const NONE: SeenConcepts = { offbeat: false, longPhrase: false, triplet: false, sixteenth: false };
/** The tier concepts already met, so a test about the grids sees only the grids. */
const GRIDS_ONLY: SeenConcepts = { ...NONE, offbeat: true, longPhrase: true };
const FRESH: Progress = { unlocked: 1, best: {} };
/** A save that has cleared every level below `level`. */
const clearedTo = (level: number): Progress => ({
  unlocked: level, best: Object.fromEntries(Array.from({ length: level - 1 }, (_, i) => [i + 1, 90])),
});

/** An in-memory Storage, with a way to see exactly what was written. */
function memory(initial: Record<string, string> = {}): Storage & { readonly data: Record<string, string> } {
  const data: Record<string, string> = { ...initial };
  return {
    data,
    get length() { return Object.keys(data).length; },
    clear: () => { for (const key of Object.keys(data)) delete data[key]; },
    getItem: key => data[key] ?? null,
    key: i => Object.keys(data)[i] ?? null,
    removeItem: key => { delete data[key]; },
    setItem: (key, value) => { data[key] = String(value); },
  };
}
const TEACH = 'small-acts.teach.v1';

describe('where each new kind of rhythm first appears', () => {
  it('is read from the curve’s thresholds, not written down', () => {
    const S = PROGRESSION.subdivision;
    for (const grid of GRIDS) {
      const threshold = grid === 'triplet' ? S.tripletsFrom : S.sixteenthsFrom;
      const first = firstEligibleLevel(grid);
      expect(difficulty(first)).toBeGreaterThanOrEqual(threshold);
      expect(difficulty(first - 1)).toBeLessThan(threshold);
      expect(gridEligible(grid, first)).toBe(true);
      expect(gridEligible(grid, first - 1)).toBe(false);
    }
    expect(firstEligibleLevel('triplet')).toBeLessThan(firstEligibleLevel('sixteenth'));
  });

  it('is where a level first asks for it, and a grid never earlier than the curve allows', () => {
    for (const concept of CONCEPTS) {
      const first = firstLevelWith(concept)!;
      for (let level = 1; level < first; level++) {
        expect(levelSpec(level).tasks.some(t => taskCarries(t, concept)), `${concept} on level ${level}`).toBe(false);
      }
      expect(levelSpec(first).tasks.some(t => taskCarries(t, concept))).toBe(true);
    }
    for (const grid of GRIDS) expect(firstLevelWithGrid(grid)!).toBeGreaterThanOrEqual(firstEligibleLevel(grid));
    // Today's road, recorded so a change to the curve that moves any of them is noticed.
    expect(CONCEPTS.map(c => firstLevelWith(c))).toEqual([6, 18, 43, 59]);
  });

  it('knows what each task asks for: an offbeat is a tier phrase with a tap between beats', () => {
    const quarters = levelSpec(1).tasks[0]!;
    expect(CONCEPTS.filter(c => taskCarries(quarters, c))).toEqual([]);
    const twoBar = levelSpec(18).tasks[1]!;
    expect(twoBar.pattern.lengthBeats).toBe(8);
    expect(taskCarries(twoBar, 'longPhrase')).toBe(true);
    const triplet = levelSpec(43).tasks.find(t => t.grid === 'triplet')!;
    expect(CONCEPTS.filter(c => taskCarries(triplet, c))).toEqual(['triplet']);
  });
});

describe('which level introduces what', () => {
  it('introduces the offbeat and the long phrase on the level that first asks for them, to a new player', () => {
    expect(introConcept(levelSpec(firstLevelWith('offbeat')!), NONE, clearedTo(6))).toBe('offbeat');
    expect(introConcept(levelSpec(firstLevelWith('longPhrase')!), { ...NONE, offbeat: true }, clearedTo(18))).toBe('longPhrase');
    for (let level = 1; level < 6; level++) expect(introConcept(levelSpec(level), NONE, clearedTo(level))).toBeNull();
  });

  it('never tells a save already past the offbeat or the long phrase what they are', () => {
    // A save from before these introductions, its flags unset: having cleared the level
    // where a rhythm first appears means having played it many times since.
    const veteran = clearedTo(30);
    for (let level = 1; level <= 40; level++) {
      const concept = introConcept(levelSpec(level), NONE, veteran);
      expect(concept === 'offbeat' || concept === 'longPhrase', `level ${level}`).toBe(false);
    }
    // Past the offbeat's level but short of the long phrase's: the long phrase still comes.
    expect(introConcept(levelSpec(18), NONE, clearedTo(18))).toBe('longPhrase');
  });

  it('introduces each grid on the first level that uses it, to a new player', () => {
    for (const grid of GRIDS) {
      const first = firstLevelWithGrid(grid)!;
      const seen = { ...GRIDS_ONLY, triplet: grid === 'sixteenth' };
      expect(introConcept(levelSpec(first), seen, FRESH)).toBe(grid);
      for (let level = 1; level < first; level++) expect(introConcept(levelSpec(level), seen, FRESH) === grid).toBe(false);
    }
  });

  it('never introduces something the level does not ask for', () => {
    for (let level = 1; level <= 300; level++) {
      const spec = levelSpec(level);
      const concept = introConcept(spec, NONE, FRESH);
      if (concept !== null) expect(spec.tasks.some(t => taskCarries(t, concept)), `level ${level}`).toBe(true);
    }
  });

  it('introduces one thing per level start: the one the level reaches first', () => {
    let both = 0;
    for (let level = 1; level <= 300; level++) {
      const spec = levelSpec(level);
      const firstGrid = spec.tasks.find(t => t.grid !== null)?.grid ?? null;
      expect(introConcept(spec, GRIDS_ONLY, FRESH)).toBe(firstGrid);
      if (spec.tasks.some(t => t.grid === 'triplet') && spec.tasks.some(t => t.grid === 'sixteenth')) {
        both++;
        // With the first one met, the same level introduces the other next time.
        expect(introConcept(spec, { ...GRIDS_ONLY, [firstGrid!]: true }, FRESH)).toBe(firstGrid === 'triplet' ? 'sixteenth' : 'triplet');
      }
    }
    expect(both).toBeGreaterThan(0);
  });

  it('once something is seen, no level ever introduces it again', () => {
    for (const concept of CONCEPTS) {
      const seen = { ...NONE, [concept]: true };
      for (let level = 1; level <= 300; level++) expect(introConcept(levelSpec(level), seen, FRESH)).not.toBe(concept);
    }
    const all = { offbeat: true, longPhrase: true, triplet: true, sixteenth: true };
    for (let level = 1; level <= 300; level++) expect(introConcept(levelSpec(level), all, FRESH)).toBeNull();
  });

  it('meets a player already far past the first triplet level on the next level that uses one', () => {
    // A save from before the introductions: levels 1–80 cleared, no grid ever introduced.
    // Nothing happens at launch; the next level they start that uses a grid introduces it.
    const veteran = 81;
    let next = veteran;
    while (introConcept(levelSpec(next), NONE, clearedTo(veteran)) === null) next++;
    expect(next - veteran).toBeLessThan(10);
  });
});

describe('the introduction flags', () => {
  it('persist once each, and survive a reload', () => {
    const storage = memory();
    expect(seenConcepts(storage)).toEqual(NONE);
    for (const concept of CONCEPTS) expect(markConceptSeen(concept, storage)).toBe(true);
    expect(seenConcepts(storage).triplet).toBe(true);
    // Read back from what is actually stored, as a fresh boot would.
    expect(seenConcepts(memory(storage.data))).toEqual({ offbeat: true, longPhrase: true, triplet: true, sixteenth: true });
  });

  it('read an old save as never introduced, and keep every flag it already had', () => {
    // The teach object as the game wrote it before the introductions.
    const storage = memory({ [TEACH]: JSON.stringify({ seen: true, replayTip: true }) });
    expect(seenConcepts(storage)).toEqual(NONE);
    expect(seenDemonstration(storage)).toBe(true);
    markConceptSeen('triplet', storage);
    markConceptSeen('offbeat', storage);
    expect(seenDemonstration(storage)).toBe(true);
    expect(seenReplayTip(storage)).toBe(true);
    expect(JSON.parse(storage.data[TEACH]!)).toEqual({ seen: true, replayTip: true, triplet: true, offbeat: true });
  });

  it('are not lost when another teach flag is written', () => {
    const storage = memory();
    markConceptSeen('sixteenth', storage);
    markConceptSeen('longPhrase', storage);
    markDemonstrationSeen(storage);
    markReplayTipSeen(storage);
    expect(seenConcepts(storage)).toEqual({ ...NONE, sixteenth: true, longPhrase: true });
  });

  it('never touch saved progress', () => {
    const storage = memory();
    const progress = { unlocked: 60, best: { 1: 90, 43: 81, 59: 77 } };
    saveProgress(progress, storage);
    const before = storage.data['small-acts.progress.v1'];
    for (const concept of CONCEPTS) markConceptSeen(concept, storage);
    expect(storage.data['small-acts.progress.v1']).toBe(before);
    expect(loadProgress(storage)).toEqual({ unlocked: 60, best: { 1: 90, 43: 81, 59: 77 } });
  });

  it('treat anything but a stored true as unseen, and survive broken or missing storage', () => {
    for (const raw of ['not json', 'null', '[]', '"x"', JSON.stringify({ triplet: 'yes', sixteenth: 1, offbeat: 'true', longPhrase: {} })]) {
      expect(seenConcepts(memory({ [TEACH]: raw })), raw).toEqual(NONE);
    }
    const broken = memory({ [TEACH]: 'not json' });
    expect(markConceptSeen('triplet', broken)).toBe(true);
    expect(seenConcepts(broken).triplet).toBe(true);
    expect(seenConcepts(null)).toEqual(NONE);
    expect(markConceptSeen('triplet', null)).toBe(false);
    const full = { ...memory(), setItem: () => { throw new Error('quota'); } } as unknown as Storage;
    expect(markConceptSeen('offbeat', full)).toBe(false);
  });
});

describe('the introduction itself', () => {
  it('asks for the smallest change: one new thing, on beat three, in a phrase of quarters', () => {
    for (const grid of GRIDS) {
      const pattern = INTRO_PATTERNS[grid];
      const steps = grid === 'triplet' ? 3 : 4;
      expect(pattern.lengthBeats).toBe(RHYTHM.beatsPerBar);
      expect(pattern.grid).toBe(steps);
      const group = Array.from({ length: steps }, (_, i) => 2 + i / steps);
      expect([...pattern.hits]).toEqual([0, 1, ...group, 3]);
    }
    // The offbeat: one "and", after beat three.
    expect(INTRO_PATTERNS.offbeat.lengthBeats).toBe(RHYTHM.beatsPerBar);
    expect([...INTRO_PATTERNS.offbeat.hits]).toEqual([0, 1, 2, 2.5, 3]);
    // The long phrase: nothing off the beat at all; only the length is new.
    expect(INTRO_PATTERNS.longPhrase.lengthBeats).toBe(2 * RHYTHM.beatsPerBar);
    expect([...INTRO_PATTERNS.longPhrase.hits]).toEqual([0, 1, 2, 4, 5, 6]);
    for (const concept of CONCEPTS) expect(INTRO_PATTERNS[concept].hits[0]).toBe(0);
  });

  it('plays at a teaching tempo where the thumb has room, on the ordinary judgement windows', () => {
    for (const concept of CONCEPTS) {
      const bpm = levelSpec(firstLevelWith(concept)!).tasks[0]!.bpm * CONCEPT_INTRO.tempo;
      const pattern = INTRO_PATTERNS[concept];
      expect(tightestSpacingMs(pattern, bpm)).toBeGreaterThanOrEqual(PROGRESSION.subdivision.minSpacingMs);
      // Forgiving means slower, simpler and unscored — never a wider window.
      const windows = windowsFor(pattern.hits.map(hit => hit * 60 / bpm));
      expect(windows.perfectMs).toBe(RHYTHM.perfectMs);
      expect(windows.goodMs).toBe(RHYTHM.goodMs);
    }
  });

  it('is whole bars from the level’s downbeat to its first task, retry or not, for every act’s coda', () => {
    for (const concept of CONCEPTS) for (const hold of [1, 5]) for (const retry of [false, true]) {
      const bpm = 120 * CONCEPT_INTRO.tempo, beat = 60 / bpm, origin = 0;
      const first = createRoundPlan(1, INTRO_PATTERNS[concept], bpm, origin, RHYTHM.leadInBeats);
      let next = new TaskSequence(bpm, origin, 1).ending(first.end, hold).next;
      if (retry) next = new TaskSequence(bpm, next, 1).ending(createRoundPlan(2, INTRO_PATTERNS[concept], bpm, next, 0).end, hold).next;
      const beats = (next - origin) / beat;
      expect(Math.abs(beats - Math.round(beats))).toBeLessThan(1e-9);
      expect(Math.round(beats) % RHYTHM.beatsPerBar).toBe(0);
    }
  });

  it('says two short lines, and "Once more" on the retry', () => {
    expect(introCopy('offbeat', false)).toEqual({ title: 'New rhythm', caption: 'Between the beats' });
    expect(introCopy('longPhrase', false)).toEqual({ title: 'New rhythm', caption: 'Two bars to remember' });
    expect(introCopy('triplet', false)).toEqual({ title: 'New rhythm', caption: '3 inside the beat' });
    expect(introCopy('sixteenth', false)).toEqual({ title: 'New rhythm', caption: '4 inside the beat' });
    expect(introCopy('triplet', true).title).toBe('Once more');
    for (const concept of CONCEPTS) for (const retry of [false, true]) {
      const { title, caption } = introCopy(concept, retry);
      expect(title.length + caption.length).toBeLessThanOrEqual(30);
    }
  });

  it('hands over to the level after a good answer', () => {
    const run = new ConceptIntroRun('offbeat');
    run.begin();
    expect(run.retrying).toBe(false);
    expect(run.complete(80)).toBe('done');
    expect(run).toMatchObject({ step: 'done', tries: 1, best: 80, passed: true });
  });

  it('gives a weak answer one more go, then hands over whatever happened', () => {
    const run = new ConceptIntroRun('sixteenth');
    run.begin();
    expect(run.complete(20)).toBe('retry');
    run.begin();
    expect(run.retrying).toBe(true);
    expect(run.complete(10)).toBe('done');
    expect(run).toMatchObject({ step: 'done', tries: 2, best: 20, passed: false });
    // Nothing after it restarts it.
    run.begin();
    expect(run.complete(100)).toBe('done');
    expect(run.tries).toBe(2);
  });

  it('keeps the better of two answers, and ignores nonsense', () => {
    const run = new ConceptIntroRun('longPhrase');
    run.begin();
    run.complete(Number.NaN);
    expect(run.best).toBe(0);
    run.begin();
    run.complete(140);
    expect(run.best).toBe(100);
  });
});

describe('what the introduction leaves alone', () => {
  it('does not change any level: the spec is a function of the level number alone', () => {
    const before = Array.from({ length: 120 }, (_, i) => levelSpec(i + 1));
    const storage = memory();
    for (const concept of CONCEPTS) markConceptSeen(concept as Concept, storage);
    for (let level = 1; level <= 120; level++) expect(levelSpec(level)).toEqual(before[level - 1]);
  });

  it('does not change how the next task is judged or scored', () => {
    // The same subdivided task, answered the same way, by a controller that has just run
    // an introduction and by one that never has: the scores must be identical.
    const spec = levelSpec(firstLevelWithGrid('triplet')!);
    const task = spec.tasks.find(t => t.grid === 'triplet')!;
    const events = (): RoundEvents => ({ phase: vi.fn(), cue: vi.fn(), tap: vi.fn(), judgement: vi.fn(), complete: vi.fn(), interrupted: vi.fn() });
    const sound = { play: vi.fn(), cancelPlan: vi.fn() };
    const play = (controller: RoundController, pattern: typeof task.pattern, bpm: number, origin: number, offsetMs: number) => {
      controller.start(pattern, bpm, origin - 0.2, (origin - 0.2) * 1000, origin, 0);
      const plan = controller.plan!;
      let target = 0;
      for (let now = origin; now <= plan.end + 0.25; now += 0.005) {
        controller.tick(now, now * 1000);
        if (target < plan.targets.length && now >= plan.targets[target]! + offsetMs / 1000) {
          controller.tap(plan.targets[target]! + offsetMs / 1000, now, now * 1000);
          target++;
        }
      }
      return { result: controller.result!, windows: windowsFor(plan.targets) };
    };
    const introduced = new RoundController(sound, events());
    play(introduced, INTRO_PATTERNS.triplet, task.bpm * CONCEPT_INTRO.tempo, 1, 90);
    for (const offset of [0, 30, 70, 110]) {
      const after = play(introduced, task.pattern, task.bpm, 20 + offset, offset);
      const fresh = play(new RoundController(sound, events()), task.pattern, task.bpm, 20 + offset, offset);
      expect(after).toEqual(fresh);
    }
  });
});
