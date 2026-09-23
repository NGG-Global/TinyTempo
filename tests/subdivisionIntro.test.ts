import { describe, expect, it, vi } from 'vitest';
import { PROGRESSION } from '../src/config/progression';
import { RHYTHM } from '../src/config/rhythm';
import { difficulty, levelSpec, tightestSpacingMs, type Grid } from '../src/game/levels';
import { loadProgress, markDemonstrationSeen, markReplayTipSeen, markSubdivisionSeen, saveProgress, seenDemonstration, seenReplayTip, seenSubdivision, seenSubdivisions } from '../src/game/progress';
import { RoundController, type RoundEvents } from '../src/game/RoundController';
import {
  INTRO_PATTERNS, SUBDIVISION_INTRO, SubdivisionIntroRun, firstEligibleLevel, firstLevelWithGrid, gridEligible, introCopy, introGrid,
} from '../src/game/subdivisionIntro';
import { TaskSequence } from '../src/game/TaskSequence';
import { createRoundPlan } from '../src/rhythm/RhythmScheduler';
import { windowsFor } from '../src/rhythm/judge';

vi.mock('phaser', () => ({ default: {} }));

const GRIDS: readonly Grid[] = ['triplet', 'sixteenth'];
const NONE = { triplet: false, sixteenth: false } as const;

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

describe('where each finer grid first becomes available', () => {
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

  it('is where a level first uses the grid, never earlier than the curve allows', () => {
    for (const grid of GRIDS) {
      const eligible = firstEligibleLevel(grid);
      const first = firstLevelWithGrid(grid)!;
      expect(first).toBeGreaterThanOrEqual(eligible);
      for (let level = 1; level < first; level++) {
        expect(levelSpec(level).tasks.some(t => t.grid === grid), `level ${level}`).toBe(false);
      }
      expect(levelSpec(first).tasks.some(t => t.grid === grid)).toBe(true);
    }
    // Today's road, recorded so a change to the curve that moves either is noticed.
    expect(firstLevelWithGrid('triplet')).toBe(43);
    expect(firstLevelWithGrid('sixteenth')).toBe(59);
  });
});

describe('which level introduces a grid', () => {
  it('introduces each grid on the first level that uses it, to a new player', () => {
    for (const grid of GRIDS) {
      const first = firstLevelWithGrid(grid)!;
      const seen = { ...NONE, triplet: grid === 'sixteenth' };
      expect(introGrid(levelSpec(first), seen)).toBe(grid);
      // Nothing before it has anything to introduce.
      for (let level = 1; level < first; level++) {
        expect(introGrid(levelSpec(level), seen) === grid).toBe(false);
      }
    }
  });

  it('never introduces a grid the level does not use', () => {
    for (let level = 1; level <= 300; level++) {
      const spec = levelSpec(level);
      const grid = introGrid(spec, NONE);
      if (grid === null) expect(spec.tasks.every(t => t.grid === null)).toBe(true);
      else expect(spec.tasks.some(t => t.grid === grid)).toBe(true);
    }
  });

  it('introduces one grid per level start: the one the level reaches first', () => {
    let both = 0;
    for (let level = 1; level <= 300; level++) {
      const spec = levelSpec(level);
      const firstGrid = spec.tasks.find(t => t.grid !== null)?.grid ?? null;
      expect(introGrid(spec, NONE)).toBe(firstGrid);
      if (spec.tasks.some(t => t.grid === 'triplet') && spec.tasks.some(t => t.grid === 'sixteenth')) {
        both++;
        // With the first one met, the same level introduces the other next time.
        expect(introGrid(spec, { ...NONE, [firstGrid!]: true })).toBe(firstGrid === 'triplet' ? 'sixteenth' : 'triplet');
      }
    }
    expect(both).toBeGreaterThan(0);
  });

  it('once a grid is seen, no level ever introduces it again', () => {
    for (const grid of GRIDS) {
      const seen = { ...NONE, [grid]: true };
      for (let level = 1; level <= 300; level++) expect(introGrid(levelSpec(level), seen)).not.toBe(grid);
    }
    for (let level = 1; level <= 300; level++) expect(introGrid(levelSpec(level), { triplet: true, sixteenth: true })).toBeNull();
  });

  it('meets a player already far past the first triplet level on the next level that uses one', () => {
    // A save from before the introductions: levels 1–80 cleared, no grid ever introduced.
    // Nothing happens at launch; the next level they start that uses a grid introduces it.
    const veteran = 81;
    let next = veteran;
    while (introGrid(levelSpec(next), NONE) === null) next++;
    expect(next - veteran).toBeLessThan(10);
  });
});

describe('the introduction flags', () => {
  it('persist once each, and survive a reload', () => {
    const storage = memory();
    expect(seenSubdivisions(storage)).toEqual(NONE);
    expect(markSubdivisionSeen('triplet', storage)).toBe(true);
    expect(seenSubdivision('triplet', storage)).toBe(true);
    expect(seenSubdivision('sixteenth', storage)).toBe(false);
    expect(markSubdivisionSeen('sixteenth', storage)).toBe(true);
    // Read back from what is actually stored, as a fresh boot would.
    expect(seenSubdivisions(memory(storage.data))).toEqual({ triplet: true, sixteenth: true });
  });

  it('read an old save as never introduced, and keep every flag it already had', () => {
    // The teach object as the game wrote it before this change.
    const storage = memory({ [TEACH]: JSON.stringify({ seen: true, replayTip: true }) });
    expect(seenSubdivisions(storage)).toEqual(NONE);
    expect(seenDemonstration(storage)).toBe(true);
    markSubdivisionSeen('triplet', storage);
    expect(seenDemonstration(storage)).toBe(true);
    expect(seenReplayTip(storage)).toBe(true);
    expect(JSON.parse(storage.data[TEACH]!)).toEqual({ seen: true, replayTip: true, triplet: true });
  });

  it('are not lost when another teach flag is written', () => {
    const storage = memory();
    markSubdivisionSeen('sixteenth', storage);
    markDemonstrationSeen(storage);
    markReplayTipSeen(storage);
    expect(seenSubdivisions(storage)).toEqual({ triplet: false, sixteenth: true });
  });

  it('never touch saved progress', () => {
    const storage = memory();
    const progress = { unlocked: 60, best: { 1: 90, 43: 81, 59: 77 } };
    saveProgress(progress, storage);
    const before = storage.data['small-acts.progress.v1'];
    markSubdivisionSeen('triplet', storage);
    markSubdivisionSeen('sixteenth', storage);
    expect(storage.data['small-acts.progress.v1']).toBe(before);
    expect(loadProgress(storage)).toEqual({ unlocked: 60, best: { 1: 90, 43: 81, 59: 77 } });
  });

  it('treat anything but a stored true as unseen, and survive broken or missing storage', () => {
    for (const raw of ['not json', 'null', '[]', '"x"', JSON.stringify({ triplet: 'yes', sixteenth: 1 })]) {
      expect(seenSubdivisions(memory({ [TEACH]: raw })), raw).toEqual(NONE);
    }
    const broken = memory({ [TEACH]: 'not json' });
    expect(markSubdivisionSeen('triplet', broken)).toBe(true);
    expect(seenSubdivision('triplet', broken)).toBe(true);
    expect(seenSubdivisions(null)).toEqual(NONE);
    expect(markSubdivisionSeen('triplet', null)).toBe(false);
    const full = { ...memory(), setItem: () => { throw new Error('quota'); } } as unknown as Storage;
    expect(markSubdivisionSeen('triplet', full)).toBe(false);
  });
});

describe('the introduction itself', () => {
  it('asks for one simple bar: quarters, and the new group once on beat three', () => {
    for (const grid of GRIDS) {
      const pattern = INTRO_PATTERNS[grid];
      const steps = grid === 'triplet' ? 3 : 4;
      expect(pattern.lengthBeats).toBe(RHYTHM.beatsPerBar);
      expect(pattern.grid).toBe(steps);
      expect(pattern.hits[0]).toBe(0);
      const group = Array.from({ length: steps }, (_, i) => 2 + i / steps);
      expect([...pattern.hits]).toEqual([0, 1, ...group, 3]);
    }
  });

  it('plays at a teaching tempo where the thumb has room, on the ordinary judgement windows', () => {
    for (const grid of GRIDS) {
      const bpm = levelSpec(firstLevelWithGrid(grid)!).tasks[0]!.bpm * SUBDIVISION_INTRO.tempo;
      const pattern = INTRO_PATTERNS[grid];
      expect(tightestSpacingMs(pattern, bpm)).toBeGreaterThanOrEqual(PROGRESSION.subdivision.minSpacingMs);
      // Forgiving means slower, simpler and unscored — never a wider window.
      const windows = windowsFor(pattern.hits.map(h => h * 60 / bpm));
      expect(windows.perfectMs).toBe(RHYTHM.perfectMs);
      expect(windows.goodMs).toBe(RHYTHM.goodMs);
    }
  });

  it('is whole bars from the level’s downbeat to its first task, retry or not, for every act’s coda', () => {
    for (const grid of GRIDS) for (const hold of [1, 5]) for (const retry of [false, true]) {
      const bpm = 120 * SUBDIVISION_INTRO.tempo, beat = 60 / bpm, origin = 0;
      const first = createRoundPlan(1, INTRO_PATTERNS[grid], bpm, origin, RHYTHM.leadInBeats);
      let next = new TaskSequence(bpm, origin, 1).ending(first.end, hold).next;
      if (retry) next = new TaskSequence(bpm, next, 1).ending(createRoundPlan(2, INTRO_PATTERNS[grid], bpm, next, 0).end, hold).next;
      const beats = (next - origin) / beat;
      expect(Math.abs(beats - Math.round(beats))).toBeLessThan(1e-9);
      expect(Math.round(beats) % RHYTHM.beatsPerBar).toBe(0);
    }
  });

  it('says two short lines, and "Once more" on the retry', () => {
    expect(introCopy('triplet', false)).toEqual({ title: 'New rhythm', caption: '3 inside the beat' });
    expect(introCopy('sixteenth', false)).toEqual({ title: 'New rhythm', caption: '4 inside the beat' });
    expect(introCopy('triplet', true).title).toBe('Once more');
    for (const grid of GRIDS) for (const retry of [false, true]) {
      const { title, caption } = introCopy(grid, retry);
      expect(title.length + caption.length).toBeLessThanOrEqual(30);
    }
  });

  it('hands over to the level after a good answer', () => {
    const run = new SubdivisionIntroRun('triplet');
    run.begin();
    expect(run.retrying).toBe(false);
    expect(run.complete(80)).toBe('done');
    expect(run).toMatchObject({ step: 'done', tries: 1, best: 80, passed: true });
  });

  it('gives a weak answer one more go, then hands over whatever happened', () => {
    const run = new SubdivisionIntroRun('sixteenth');
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
    const run = new SubdivisionIntroRun('triplet');
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
    markSubdivisionSeen('triplet', storage);
    markSubdivisionSeen('sixteenth', storage);
    for (let level = 1; level <= 120; level++) expect(levelSpec(level)).toEqual(before[level - 1]);
  });

  it('does not change how the next task is judged or scored', () => {
    // The same subdivided task, answered the same way, by a controller that has just run
    // an introduction and by one that never has: the scores must be identical.
    const spec = levelSpec(firstLevelWithGrid('triplet')!);
    const task = spec.tasks.find(t => t.grid === 'triplet')!;
    const events = (): RoundEvents => ({ phase: vi.fn(), cue: vi.fn(), tap: vi.fn(), judgement: vi.fn(), complete: vi.fn(), interrupted: vi.fn() });
    const sound = { play: vi.fn(), cancel: vi.fn() };
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
    play(introduced, INTRO_PATTERNS.triplet, task.bpm * SUBDIVISION_INTRO.tempo, 1, 90);
    for (const offset of [0, 30, 70, 110]) {
      const after = play(introduced, task.pattern, task.bpm, 20 + offset, offset);
      const fresh = play(new RoundController(sound, events()), task.pattern, task.bpm, 20 + offset, offset);
      expect(after).toEqual(fresh);
    }
  });
});
