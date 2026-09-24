import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FIREBASE_LIMITS, shapeParams, validEventName, validName } from '../src/analytics/eventShape';
import { levelSpec } from '../src/game/levels';
import {
  PlayAnalytics, areaNumber, attemptMode, levelGrid, taskParams, weakestTask, type LevelStart,
} from '../src/game/playAnalytics';
import { recordResult, type Progress } from '../src/game/progress';
import type { RoundResult } from '../src/game/scoring';
import { GAMEPLAY_EVENTS, type AnalyticsEvent } from '../src/monetization/analytics';
import { applyReport, type ObjectivesState } from '../src/game/objectives';

vi.mock('phaser', () => ({ default: {} }));

interface Sent { readonly event: AnalyticsEvent; readonly payload: Readonly<Record<string, unknown>> }

let sent: Sent[] = [];
let clock = 0;
let ledger = new PlayAnalytics();

function fresh(): void {
  sent = [];
  clock = 1_000;
  ledger = new PlayAnalytics((event, payload) => { sent.push({ event, payload }); }, () => clock);
}

const names = (): AnalyticsEvent[] => sent.map(s => s.event);
const only = (event: AnalyticsEvent): Readonly<Record<string, unknown>>[] => sent.filter(s => s.event === event).map(s => s.payload);

/** A save where every level up to `through` was cleared with exactly `stars` stars. */
function road(through: number, stars: 1 | 2 | 3): Progress {
  const best: Record<number, number> = {};
  for (let level = 1; level <= through; level++) best[level] = levelSpec(level).starAccuracy[stars - 1]!;
  return { unlocked: through + 1, best };
}
const EMPTY: Progress = { unlocked: 1, best: {} };

function task(accuracy: number, over: Partial<RoundResult> = {}): RoundResult {
  return { perfect: 3, good: 1, missed: 0, extras: 0, accuracy, meanAbsoluteErrorMs: 31.6, ...over };
}

let ids = 0;
function start(level: number, progress: Progress, over: Partial<LevelStart> = {}): LevelStart {
  return { spec: levelSpec(level), progress, attemptId: `a${++ids}`, heartSpent: false, ...over };
}

/** Play every task at one accuracy and record the result the way PlayScene does. */
function playThrough(level: number, progress: Progress, accuracy: number, over: Partial<LevelStart> = {}) {
  const begin = start(level, progress, over);
  const run = ledger.beginLevel(begin)!;
  begin.spec.tasks.forEach((_, i) => run.task(i, task(accuracy)));
  const outcome = recordResult(progress, level, accuracy);
  run.finish(outcome, accuracy);
  return { run, outcome };
}

beforeEach(fresh);

describe('what a level attempt reports', () => {
  it('starts, reports each task, and finishes with one completion', () => {
    playThrough(1, EMPTY, 90);
    expect(names()).toEqual(['level_started', 'task_completed', 'task_completed', 'task_completed', 'level_completed']);
  });

  it('carries the level’s own difficulty and nothing about the player', () => {
    const spec = levelSpec(43);
    ledger.beginLevel(start(43, road(42, 2), { heartSpent: true }));
    expect(only('level_started')[0]).toEqual({
      level: 43, area: 5, role: 'pattern', task_count: spec.tasks.length, bpm: spec.peakBpm,
      pattern_tier: Math.max(...spec.tasks.map(t => t.tier)), grid: 'triplet',
      clear_accuracy: spec.clearAccuracy, mode: 'frontier', previous_stars: 0, retry_count: 0, heart_cost: 1,
    });
  });

  it('describes a task by its tempo, tier and grid, and counts rather than lists its taps', () => {
    const spec = levelSpec(59);
    const index = spec.tasks.findIndex(t => t.grid === 'sixteenth');
    expect(index).toBeGreaterThan(0);
    const payload = taskParams(spec, index, task(71.4, { perfect: 5, good: 2, missed: 1, extras: 2, meanAbsoluteErrorMs: 48.4 }), 'frontier');
    expect(payload).toEqual({
      level: 59, area: 6, mode: 'frontier', task_index: index + 1, task_count: spec.tasks.length,
      bpm: spec.tasks[index]!.bpm, pattern_tier: spec.tasks[index]!.tier, grid: 'sixteenth',
      accuracy: 71, perfect: 5, good: 2, miss: 1, extra: 2, flawless: 0, error_ms: 48,
    });
    // Aggregates only: no array, no timestamp, nothing that grows with the pattern.
    for (const value of Object.values(payload)) expect(['number', 'string']).toContain(typeof value);
  });

  it('leaves the timing error out when no tap landed, rather than sending a fake zero', () => {
    const payload = taskParams(levelSpec(1), 0, task(0, { perfect: 0, good: 0, missed: 4, meanAbsoluteErrorMs: null }), 'frontier');
    expect(payload).not.toHaveProperty('error_ms');
    expect(payload.flawless).toBe(0);
  });

  it('marks a task flawless exactly when every beat was Perfect', () => {
    expect(taskParams(levelSpec(1), 0, task(100, { perfect: 4, good: 0 }), 'frontier').flawless).toBe(1);
    expect(taskParams(levelSpec(1), 0, task(100, { perfect: 4, good: 0, extras: 1 }), 'frontier').flawless).toBe(1);
    expect(taskParams(levelSpec(1), 0, task(90, { perfect: 3, good: 1 }), 'frontier').flawless).toBe(0);
  });

  it('names the task that cost a failed level the most', () => {
    const begin = start(10, road(9, 3));
    const run = ledger.beginLevel(begin)!;
    [80, 70, 12, 40, 30].forEach((accuracy, i) => run.task(i, task(accuracy)));
    const accuracy = 46.4;
    run.finish(recordResult(begin.progress, 10, accuracy), accuracy);
    expect(only('level_failed')[0]).toMatchObject({ level: 10, accuracy: 46, weakest_task: 3, weakest_accuracy: 12 });
    expect(only('level_completed')).toEqual([]);
  });

  it('times the attempt from its downbeat', () => {
    const begin = start(1, EMPTY);
    const run = ledger.beginLevel(begin)!;
    clock += 41_250.4;
    run.finish(recordResult(EMPTY, 1, 90), 90);
    expect(only('level_completed')[0]!.duration_ms).toBe(41_250);
  });
});

describe('exactly one result per finished attempt', () => {
  it('ignores a second finish, whichever path reaches it', () => {
    const begin = start(2, road(1, 3));
    const run = ledger.beginLevel(begin)!;
    const outcome = recordResult(begin.progress, 2, 88);
    run.finish(outcome, 88);
    run.finish(outcome, 88);
    run.abandon();
    expect(only('level_completed')).toHaveLength(1);
    expect(only('level_abandoned')).toEqual([]);
  });

  it('treats Resume and the restart puck as the same attempt going round again', () => {
    const begin = start(3, road(2, 3));
    const first = ledger.beginLevel(begin)!;
    first.task(0, task(60));
    // Paused, then resumed: PlayScene begins again with the same heart attempt id.
    const again = ledger.beginLevel(begin)!;
    expect(again).toBe(first);
    begin.spec.tasks.forEach((_, i) => again.task(i, task(85)));
    again.finish(recordResult(begin.progress, 3, 85), 85);
    expect(only('level_started')).toHaveLength(1);
    expect(only('level_completed')).toHaveLength(1);
    expect(only('level_completed')[0]!.restarts).toBe(1);
    // The resumed pass played its tasks again, and each play is one report.
    expect(only('task_completed')).toHaveLength(1 + begin.spec.tasks.length);
  });

  it('reports a task once per pass however often the scene hands it over', () => {
    const run = ledger.beginLevel(start(1, EMPTY))!;
    run.task(0, task(90));
    run.task(0, task(90));
    run.task(99, task(90));
    expect(only('task_completed')).toHaveLength(1);
  });

  it('never reopens a finished attempt, so a stale id cannot start a phantom run', () => {
    const { run } = playThrough(1, EMPTY, 90);
    const before = sent.length;
    expect(ledger.beginLevel({ spec: levelSpec(1), progress: EMPTY, attemptId: run.attemptId, heartSpent: false })).toBeNull();
    const left = ledger.beginLevel(start(2, road(1, 3)))!;
    left.abandon();
    expect(ledger.beginLevel({ spec: levelSpec(2), progress: road(1, 3), attemptId: left.attemptId, heartSpent: false })).toBeNull();
    expect(names().slice(before)).toEqual(['level_started', 'level_abandoned']);
  });

  it('reports a player leaving mid-level once, at the task they left on, and never after a result', () => {
    const begin = start(4, road(3, 3));
    const run = ledger.beginLevel(begin)!;
    run.task(0, task(90));
    run.task(1, task(70));
    run.abandon();
    run.abandon();
    run.finish(recordResult(begin.progress, 4, 80), 80);
    expect(only('level_abandoned')).toHaveLength(1);
    expect(only('level_abandoned')[0]).toMatchObject({ level: 4, task_index: 3, restarts: 0 });
    expect(only('level_completed')).toEqual([]);
  });
});

describe('frontier attempts, replays and retries', () => {
  it('calls a level the player has never finished the frontier, and a finished one a replay', () => {
    expect(attemptMode(road(4, 2), 5)).toBe('frontier');
    expect(attemptMode(road(4, 2), 3)).toBe('replay');
    ledger.beginLevel(start(5, road(4, 2)));
    ledger.beginLevel(start(3, road(4, 2)));
    expect(names()).toEqual(['level_started', 'level_started', 'level_replayed']);
    expect(only('level_started').map(p => p.mode)).toEqual(['frontier', 'replay']);
    expect(only('level_replayed')[0]).toMatchObject({ level: 3, previous_stars: 2 });
  });

  it('counts failures on a level until it is cleared, and marks each attempt after one a retry', () => {
    const progress = road(9, 3);
    playThrough(10, progress, 20);
    playThrough(10, progress, 30);
    const { outcome } = playThrough(10, progress, 95);
    expect(outcome.cleared).toBe(true);
    expect(only('level_started').map(p => p.retry_count)).toEqual([0, 1, 2]);
    expect(only('level_retried').map(p => p.retry_count)).toEqual([1, 2]);
    // The clear carries how many failures it took to get there.
    expect(only('level_completed')[0]!.retry_count).toBe(2);
    playThrough(10, outcome.progress, 95);
    expect(only('level_started').at(-1)!.retry_count).toBe(0);
  });

  it('does not count leaving a level as failing it', () => {
    const run = ledger.beginLevel(start(10, road(9, 3)))!;
    run.abandon();
    ledger.beginLevel(start(10, road(9, 3)));
    expect(only('level_retried')).toEqual([]);
  });

  it('keeps each level’s retries apart', () => {
    playThrough(10, road(9, 3), 10);
    ledger.beginLevel(start(9, road(9, 3)));
    expect(only('level_started').at(-1)!.retry_count).toBe(0);
  });

  it('says whether the attempt cost a heart', () => {
    ledger.beginLevel(start(12, road(11, 2), { heartSpent: true }));
    ledger.beginLevel(start(3, road(11, 2), { heartSpent: false }));
    expect(only('level_started').map(p => p.heart_cost)).toEqual([1, 0]);
  });
});

describe('star improvements', () => {
  it('reports a replay that beats its own stars, with the collection it leaves', () => {
    const progress = road(6, 1);
    const accuracy = levelSpec(4).starAccuracy[2]!;
    playThrough(4, progress, accuracy);
    expect(only('star_improved')).toEqual([{ level: 4, area: 1, stars: 3, previous_stars: 1, accuracy: Math.round(accuracy), gate_have: 8 }]);
  });

  it('does not call a first clear an improvement', () => {
    playThrough(7, road(6, 1), 99);
    expect(only('level_completed')[0]).toMatchObject({ mode: 'frontier', previous_stars: 0, stars: 3 });
    expect(only('star_improved')).toEqual([]);
  });

  it('stays quiet for a replay that matches or falls short of its stars', () => {
    playThrough(4, road(6, 2), levelSpec(4).starAccuracy[1]!);
    playThrough(4, road(6, 2), levelSpec(4).starAccuracy[0]!);
    expect(only('star_improved')).toEqual([]);
    expect(only('level_completed')).toHaveLength(2);
  });
});

describe('star gates', () => {
  it('reports the gate holding the frontier, how many it asks and how far short the player is', () => {
    // Ten levels at one star: ten stars against the second area's twelve.
    ledger.gateOnMap(road(10, 1));
    expect(only('star_gate_reached')).toEqual([{
      area: 2, level: 11, gate_required: 12, gate_have: 10, gate_short: 2, unlocked: 11,
    }]);
  });

  it('says so once per gate per session, however often the map is entered', () => {
    ledger.gateOnMap(road(10, 1));
    ledger.gateOnMap(road(10, 1));
    ledger.gateOnMap({ ...road(10, 1), best: { ...road(10, 1).best, 3: levelSpec(3).starAccuracy[1]! } });
    expect(only('star_gate_reached')).toHaveLength(1);
  });

  it('is silent while no gate holds the frontier', () => {
    ledger.gateOnMap(EMPTY);
    ledger.gateOnMap(road(9, 1));
    ledger.gateOnMap(road(10, 2));
    expect(only('star_gate_reached')).toEqual([]);
  });

  it('reports the gate opening on the replay that earns the last star it asked for', () => {
    const progress = road(10, 1);
    playThrough(5, progress, levelSpec(5).starAccuracy[1]!);
    expect(only('star_gate_opened')).toEqual([]);
    const after = recordResult(progress, 5, levelSpec(5).starAccuracy[1]!).progress;
    playThrough(6, after, levelSpec(6).starAccuracy[1]!);
    // The gate was not reported closed in this session, so the open does not invent a
    // count of what happened before the ledger was watching.
    expect(only('star_gate_opened')).toEqual([{ area: 2, level: 11, gate_required: 12, gate_have: 12, unlocked: 11 }]);
  });

  it('counts the replays and star gains between the first sight of a gate and its opening', () => {
    const progress = road(10, 1);
    ledger.gateOnMap(progress);
    // A replay that does not raise its stars still happened while the gate was closed.
    playThrough(3, progress, levelSpec(3).starAccuracy[0]!);
    const gained = playThrough(2, progress, levelSpec(2).starAccuracy[1]!);
    expect(only('star_gate_opened')).toEqual([]);
    playThrough(4, gained.outcome.progress, levelSpec(4).starAccuracy[1]!);
    expect(only('star_gate_opened')).toEqual([{
      area: 2, level: 11, gate_required: 12, gate_have: 12, unlocked: 11,
      replays: 3, improvements: 2, stars_gained: 2,
    }]);
  });

  it('records the highest unlocked level when a restored save is held past the area line', () => {
    const best: Record<number, number> = {};
    for (let level = 1; level <= 30; level++) best[level] = levelSpec(level).starAccuracy[0]!;
    ledger.gateOnMap({ unlocked: 31, best });
    expect(only('star_gate_reached')[0]).toMatchObject({ area: 4, level: 31, unlocked: 31, gate_short: 9 });
  });

  it('does not report a gate far up the road that was never holding anyone', () => {
    // Three stars everywhere opens areas ahead of the frontier without ever stopping at one.
    playThrough(3, road(3, 3), 99);
    expect(only('star_gate_opened')).toEqual([]);
  });
});

describe('the tutorial', () => {
  it('reports the visit and how it ended, once', () => {
    const visit = ledger.beginTutorial('first_play', false)!;
    clock += 30_000;
    visit.complete(2, true);
    visit.complete(2, true);
    visit.skip('done', 2);
    expect(sent).toEqual([
      { event: 'tutorial_started', payload: { source: 'first_play', repeat: 0 } },
      { event: 'tutorial_completed', payload: { tries: 2, passed: 1, duration_ms: 30_000, repeat: 0 } },
    ]);
  });

  it('reports a skip with the step it was skipped from', () => {
    const visit = ledger.beginTutorial('menu', true)!;
    visit.skip('watch', 0);
    expect(only('tutorial_skipped')).toEqual([{ step: 'watch', tries: 0, duration_ms: 0, repeat: 1 }]);
    expect(only('tutorial_completed')).toEqual([]);
  });

  it('can say the player went on without passing, when the lesson offered the way on anyway', () => {
    ledger.beginTutorial('first_play', false)!.complete(3, false);
    expect(only('tutorial_completed')[0]).toMatchObject({ tries: 3, passed: 0 });
  });
});

describe('a finer grid’s introduction', () => {
  it('reports that it was shown, and how it went, once', () => {
    const visit = ledger.beginSubdivisionIntro('sixteenth', 59, 'frontier')!;
    visit.complete(2, 38.4, false);
    visit.complete(1, 90, true);
    expect(sent).toEqual([
      { event: 'subdivision_intro_shown', payload: { grid: 'sixteenth', level: 59, mode: 'frontier' } },
      { event: 'subdivision_intro_completed', payload: { grid: 'sixteenth', level: 59, tries: 2, accuracy: 38, passed: 0 } },
    ]);
  });

  it('shows without completing when the player leaves part-way', () => {
    ledger.beginSubdivisionIntro('triplet', 70, 'replay');
    expect(names()).toEqual(['subdivision_intro_shown']);
  });
});

describe('the Scrapbook', () => {
  it('reports each opening with how full the book was', () => {
    ledger.scrapbookOpened('menu', 0, 32);
    ledger.scrapbookOpened('menu', 5, 32);
    expect(only('scrapbook_opened')).toEqual([{ source: 'menu', owned: 0, total: 32 }, { source: 'menu', owned: 5, total: 32 }]);
  });

  it('reports a keepsake once, by its stable ids, however often the scene reaches it', () => {
    const nail = { id: 'hammer-lucky-nail', vignette: 'hammer', level: 1 };
    ledger.collectibleUnlocked(nail, true, 1);
    ledger.collectibleUnlocked(nail, true, 1);
    ledger.collectibleUnlocked({ id: 'window-squeegee', vignette: 'window', level: 2 }, false, 2);
    expect(only('collectible_unlocked')).toEqual([
      { vignette: 'hammer', collectible: 'hammer-lucky-nail', level: 1, first: 1, owned: 1 },
      { vignette: 'window', collectible: 'window-squeegee', level: 2, first: 0, owned: 2 },
    ]);
  });
});

describe('practice, before practice exists', () => {
  it('reports a start and one completion', () => {
    const run = ledger.beginPractice(43)!;
    clock += 12_000;
    run.complete(77.7);
    run.complete(77.7);
    expect(sent).toEqual([
      { event: 'practice_started', payload: { level: 43 } },
      { event: 'practice_completed', payload: { level: 43, accuracy: 78, duration_ms: 12_000 } },
    ]);
  });
});

describe('analytics can never stop the game', () => {
  it('survives a sink that throws, at every step', () => {
    const angry = new PlayAnalytics(() => { throw new Error('bridge down'); }, () => 0);
    expect(() => {
      const run = angry.beginLevel(start(1, EMPTY))!;
      run.task(0, task(90));
      run.finish(recordResult(EMPTY, 1, 90), 90);
      run.abandon();
      angry.gateOnMap(road(10, 1));
      angry.beginTutorial('menu', false)?.skip('try', 1);
      angry.beginPractice(1)?.complete(50);
    }).not.toThrow();
  });

  it('survives a clock that throws', () => {
    const broken = new PlayAnalytics(() => { /* quiet */ }, () => { throw new Error('no clock'); });
    expect(broken.beginLevel(start(1, EMPTY))).toBeNull();
    expect(broken.beginTutorial('menu', false)).toBeNull();
  });
});

describe('every gameplay event, as the game actually fires it', () => {
  it('is one Firebase keeps whole', () => {
    // A scripted session that reaches every gameplay event, checked against the shaping
    // rules as sent — so a parameter added to a payload cannot go quiet in the dashboard.
    const visit = ledger.beginTutorial('first_play', false)!;
    visit.complete(1, true);
    ledger.beginTutorial('menu', true)!.skip('try', 1);
    playThrough(10, road(9, 3), 10);
    playThrough(10, road(9, 3), 99);
    playThrough(4, road(10, 1), 99);
    ledger.beginLevel(start(59, road(58, 2)))!.abandon();
    ledger.gateOnMap(road(10, 1));
    playThrough(5, road(10, 1), levelSpec(5).starAccuracy[2]!);
    ledger.beginPractice(2)!.complete(60);
    ledger.beginSubdivisionIntro('triplet', 43, 'frontier')!.complete(2, 64.6, true);
    ledger.scrapbookOpened('menu', 3, 32);
    ledger.collectibleUnlocked({ id: 'bug-ladybird', vignette: 'bug', level: 28 }, false, 4);
    // A day of objectives: progress, a completion each, and the stamp.
    let day: ObjectivesState = {
      day: '2026-09-23', stampedDays: [], stamps: 0, seen: 0,
      objectives: [{ id: 'clears', target: 2, progress: 0 }, { id: 'flawless', target: 1, progress: 0 }, { id: 'replays', target: 2, progress: 0 }],
    };
    for (const replay of [true, true]) {
      const update = applyReport(day, {
        level: 4, vignette: 'saw', cleared: true, replay, stars: 3, starsBefore: 1, starsAfter: 3,
        perfect: 12, flawless: 1, grids: [], finale: false, keepsake: false,
      });
      ledger.objectives(update);
      day = update.state;
    }
    expect(new Set(names())).toEqual(new Set(GAMEPLAY_EVENTS));
    for (const { event, payload } of sent) {
      expect(validEventName(event), event).toBe(true);
      const keys = Object.keys(payload);
      expect(keys.length, event).toBeLessThanOrEqual(FIREBASE_LIMITS.params);
      for (const key of keys) expect(validName(key, FIREBASE_LIMITS.paramName), `${event}.${key}`).toBe(true);
      // Nothing is dropped or changed on the way to the SDK.
      expect(shapeParams(payload), event).toEqual(payload);
      for (const value of Object.values(payload)) {
        if (typeof value === 'string') expect(value.length, `${event} string`).toBeLessThanOrEqual(12);
      }
    }
  });
});

describe('area finales', () => {
  it('report beside the level events, once per finished attempt, and never for other levels', () => {
    const { run, outcome } = playThrough(10, road(9, 3), 95);
    // The scene reaches its record step more than once; the finale is still one result.
    run.finish(outcome, 95);
    expect(names().filter(n => n.startsWith('area_finale') || n.startsWith('level_'))).toEqual([
      'level_started', 'area_finale_started', 'level_completed', 'area_finale_completed',
    ]);
    expect(only('area_finale_started')).toEqual([{ level: 10, area: 1, treatment: 'grass', mode: 'frontier', retry_count: 0, heart_cost: 0 }]);
    expect(only('area_finale_completed')).toEqual([{ level: 10, area: 1, treatment: 'grass', mode: 'frontier', stars: 3, accuracy: 95 }]);
    fresh();
    playThrough(9, road(8, 3), 95);
    playThrough(11, road(10, 3), 95);
    expect(names().some(n => n.startsWith('area_finale'))).toBe(false);
  });

  it('fail once, and a restart of the same attempt starts nothing new', () => {
    const begin = start(20, road(19, 2), { heartSpent: true });
    const run = ledger.beginLevel(begin)!;
    // Resume and the restart puck continue the attempt: no second start.
    expect(ledger.beginLevel(begin)).toBe(run);
    const outcome = recordResult(begin.progress, 20, 12);
    run.finish(outcome, 12);
    run.finish(outcome, 12);
    expect(only('area_finale_started')).toEqual([{ level: 20, area: 2, treatment: 'pavement', mode: 'frontier', retry_count: 0, heart_cost: 1 }]);
    expect(only('area_finale_failed')).toEqual([{ level: 20, area: 2, treatment: 'pavement', mode: 'frontier', accuracy: 12 }]);
    expect(only('area_finale_completed')).toEqual([]);
    // The next attempt is a retry, and says so.
    playThrough(20, road(19, 2), 99);
    expect(only('area_finale_started').at(-1)).toMatchObject({ retry_count: 1 });
  });

  it('call a finished finale played again a replay, and an abandoned one neither result', () => {
    playThrough(30, road(30, 1), 99);
    expect(only('area_finale_completed')[0]).toMatchObject({ level: 30, area: 3, treatment: 'sand', mode: 'replay' });
    fresh();
    ledger.beginLevel(start(40, road(39, 2)))!.abandon();
    expect(names().filter(n => n.startsWith('area_finale'))).toEqual(['area_finale_started']);
  });
});

describe('the small derivations', () => {
  it('numbers areas from 1', () => {
    expect([1, 10, 11, 43, 100].map(areaNumber)).toEqual([1, 1, 2, 5, 10]);
  });

  it('names a level by the finest grid in it', () => {
    expect(levelGrid(levelSpec(3))).toBe('eighth');
    expect(levelGrid(levelSpec(43))).toBe('triplet');
    expect(levelGrid(levelSpec(59))).toBe('sixteenth');
  });

  it('picks the earliest of equally weak tasks, and reports none when nothing finished', () => {
    expect(weakestTask([50, 20, 20, 90])).toEqual({ task: 2, accuracy: 20 });
    expect(weakestTask([])).toEqual({ task: 0, accuracy: 0 });
    expect(weakestTask([undefined, 64.6])).toEqual({ task: 2, accuracy: 65 });
  });
});
