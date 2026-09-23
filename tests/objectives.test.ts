import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calendarDay } from '../src/game/health';
import { levelSpec } from '../src/game/levels';
import {
  DAILY_TEMPO_AVAILABLE, OBJECTIVE_POOL, OBJECTIVES_PER_DAY, allDone, applyReport, daySeed, doneCount, loadObjectives,
  markObjectivesSeen, objectiveContext, objectiveDefinition, objectiveReport, parseObjectives, reachableLevels,
  recordObjectives, redrawToday, resetObjectivesMemory, rollover, selectObjectives, stampWeek, unseenDone,
  type ObjectiveContext, type ObjectiveReport, type ObjectivesState,
} from '../src/game/objectives';
import { PlayAnalytics } from '../src/game/playAnalytics';
import type { Progress } from '../src/game/progress';
import { validName } from '../src/analytics/eventShape';

vi.mock('phaser', () => ({ default: {} }));

const KEY = 'tiny-tempo.objectives.v1';
const EMPTY: Progress = { unlocked: 1, best: {} };
/** A save where every level up to `through` holds exactly `stars` stars. */
function road(through: number, stars: 1 | 2 | 3): Progress {
  const best: Record<number, number> = {};
  for (let level = 1; level <= through; level++) best[level] = levelSpec(level).starAccuracy[stars - 1]!;
  return { unlocked: through + 1, best };
}
const ctx = (progress: Progress, dailyTempo = false): ObjectiveContext => ({ progress, dailyTempo });
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
/** A local instant: the objectives follow the player's own midnight. */
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const DAY = at(2026, 9, 23);
/** A level report with nothing in it, to be filled in per test. */
function report(over: Partial<ObjectiveReport> = {}): ObjectiveReport {
  return {
    level: 12, vignette: 'light', cleared: true, replay: false, stars: 1, starsBefore: 0, starsAfter: 1,
    perfect: 0, flawless: 0, grids: [], finale: false, keepsake: false, ...over,
  };
}
/** Every day of a year from a start date, as local calendar days. */
function days(count: number): string[] {
  return Array.from({ length: count }, (_, i) => calendarDay(at(2026, 1, 1 + i)));
}
/** A state holding exactly these objectives, for driving `applyReport` by hand. */
function stateOf(ids: readonly string[], day = calendarDay(DAY)): ObjectivesState {
  return {
    day, stampedDays: [], stamps: 0, seen: 0,
    objectives: ids.map(id => {
      const d = objectiveDefinition(id)!;
      return { id, target: d.targets.at(-1)!, progress: 0, ...(d.token ? { tokens: [] } : {}) };
    }),
  };
}

beforeEach(resetObjectivesMemory);

describe('the pool', () => {
  it('has ids analytics can carry, targets it trusts, and three families', () => {
    expect(new Set(OBJECTIVE_POOL.map(d => d.id)).size).toBe(OBJECTIVE_POOL.length);
    for (const d of OBJECTIVE_POOL) {
      expect(d.id).toMatch(/^[a-z][a-z-]{1,11}$/);
      expect(d.targets.length).toBeGreaterThan(0);
      expect(d.weight).toBeGreaterThan(0);
      for (const target of d.targets) expect(d.title(target).length).toBeGreaterThan(0);
    }
    expect(new Set(OBJECTIVE_POOL.map(d => d.family))).toEqual(new Set(['play', 'skill', 'mastery']));
    for (const name of ['objective', 'slot', 'progress', 'target', 'completed', 'stamps', 'week']) expect(validName(name, 40)).toBe(true);
  });

  it('never asks for money, an ad or a heart', () => {
    // Nothing a report carries is commercial, so no objective can count a purchase or an ad.
    const fields = Object.keys(report());
    for (const field of fields) expect(field).not.toMatch(/premium|purchase|ad$|ads|watch|heart|refill|coin|currency/i);
    for (const d of OBJECTIVE_POOL) {
      for (const target of d.targets) expect(d.title(target)).not.toMatch(/buy|purchase|premium|watch|\bad\b|heart|refill|coin/i);
    }
  });

  it('can always offer three, even to a brand-new player', () => {
    for (const progress of [EMPTY, road(3, 1), road(40, 2), road(120, 3)]) {
      const eligible = OBJECTIVE_POOL.filter(d => d.eligible(ctx(progress)));
      expect(eligible.length).toBeGreaterThanOrEqual(OBJECTIVES_PER_DAY);
    }
  });
});

describe('the daily set', () => {
  it('is the same three for the same day and save, on every call', () => {
    const day = calendarDay(DAY);
    const a = selectObjectives(day, ctx(road(30, 2)));
    expect(a).toHaveLength(3);
    expect(selectObjectives(day, ctx(road(30, 2)))).toEqual(a);
    expect(new Set(a.map(o => o.id)).size).toBe(3);
    expect(a.every(o => o.progress === 0)).toBe(true);
    expect(daySeed('2026-09-23')).toBe(daySeed('2026-09-23'));
    expect(daySeed('2026-09-23')).not.toBe(daySeed('2026-09-24'));
  });

  it('asks for something to play, something to play well and something to go back to', () => {
    for (const day of days(120)) {
      const set = selectObjectives(day, ctx(road(30, 2)));
      expect(set.map(o => objectiveDefinition(o.id)!.family), day).toEqual(['play', 'skill', 'mastery']);
    }
  });

  it('changes from day to day, and uses the whole pool over a season', () => {
    const drawn = new Set<string>();
    const sets = new Set<string>();
    for (const day of days(365)) {
      const set = selectObjectives(day, ctx(road(60, 2)));
      sets.add(set.map(o => o.id).join(','));
      for (const o of set) drawn.add(o.id);
    }
    expect(sets.size).toBeGreaterThan(20);
    const eligible = OBJECTIVE_POOL.filter(d => d.eligible(ctx(road(60, 2)))).map(d => d.id);
    expect([...drawn].sort()).toEqual(eligible.sort());
  });

  it('draws a mastery objective every day there is one to draw', () => {
    for (const progress of [road(5, 1), road(30, 3), road(80, 2)]) {
      for (const day of days(60)) {
        expect(selectObjectives(day, ctx(progress)).some(o => objectiveDefinition(o.id)!.family === 'mastery')).toBe(true);
      }
    }
  });
});

describe('what can be drawn', () => {
  const drawnFor = (progress: Progress, dailyTempo = false): Set<string> => {
    const out = new Set<string>();
    for (const day of days(365)) for (const o of selectObjectives(day, ctx(progress, dailyTempo))) out.add(o.id);
    return out;
  };

  it('asks a new player for nothing they cannot reach', () => {
    const drawn = drawnFor(EMPTY);
    for (const id of ['improve', 'replays', 'acts', 'finale', 'triplets', 'sixteenths', 'daily-tempo']) expect(drawn.has(id), id).toBe(false);
    expect(reachableLevels(EMPTY)).toEqual([1]);
  });

  it('keeps finer grids back until a level that uses them is playable', () => {
    // Levels 1–41 cleared: the frontier is 42, and no reachable level uses triplets yet.
    expect(drawnFor(road(41, 3)).has('triplets')).toBe(false);
    // The first triplet level is the frontier: reachable today, so it may be asked for.
    const firstTriplet = Array.from({ length: 80 }, (_, i) => i + 1).find(l => levelSpec(l).tasks.some(t => t.grid === 'triplet'))!;
    const firstSixteenth = Array.from({ length: 80 }, (_, i) => i + 1).find(l => levelSpec(l).tasks.some(t => t.grid === 'sixteenth'))!;
    expect(drawnFor(road(firstTriplet - 1, 3)).has('triplets')).toBe(true);
    expect(drawnFor(road(firstTriplet - 1, 3)).has('sixteenths')).toBe(false);
    expect(drawnFor(road(firstSixteenth - 1, 3)).has('sixteenths')).toBe(true);
  });

  it('does not offer a new level while a star gate holds the frontier', () => {
    // Levels 1–10 at one star each: 10 stars, and the second area wants 12.
    const held = road(10, 1);
    expect(reachableLevels(held)).not.toContain(11);
    expect(drawnFor(held).has('new-level')).toBe(false);
    expect(drawnFor(road(10, 3)).has('new-level')).toBe(true);
  });

  it('never draws the Daily Tempo while it does not exist, and may once it does', () => {
    expect(DAILY_TEMPO_AVAILABLE).toBe(false);
    expect(objectiveContext(road(20, 2)).dailyTempo).toBe(false);
    expect(drawnFor(road(20, 2)).has('daily-tempo')).toBe(false);
    expect(drawnFor(road(20, 2), true).has('daily-tempo')).toBe(true);
  });

  it('only ever draws what the save can reach, on every day of a year, for every kind of save', () => {
    for (const progress of [EMPTY, road(2, 1), road(10, 1), road(24, 3), road(45, 2), road(64, 3)]) {
      for (const day of days(365)) {
        for (const o of selectObjectives(day, ctx(progress))) {
          expect(objectiveDefinition(o.id)!.eligible(ctx(progress)), `${o.id} on ${day}`).toBe(true);
        }
      }
    }
  });
});

describe('progress', () => {
  it('counts a finished level, completes at the target and never runs past it', () => {
    let state = stateOf(['clears', 'perfects', 'replays']);
    let update = applyReport(state, report({ perfect: 12, cleared: true }));
    expect(update.changes.map(c => [c.id, c.after, c.completed])).toEqual([['clears', 1, false], ['perfects', 12, false]]);
    state = update.state;
    update = applyReport(state, report({ perfect: 40, replay: true }));
    expect(update.state.objectives.map(o => o.progress)).toEqual([2, 30, 1]);
    expect(update.changes.find(c => c.id === 'perfects')).toMatchObject({ completed: true, after: 30 });
    // A finished objective does not move again, and says nothing.
    const again = applyReport(update.state, report({ perfect: 20 }));
    expect(again.changes.map(c => c.id)).toEqual(['clears']);
  });

  it('counts different acts once each, and only for levels cleared', () => {
    let state = stateOf(['acts', 'flawless', 'improve']);
    for (const r of [report({ vignette: 'egg' }), report({ vignette: 'egg' }), report({ vignette: 'bell', cleared: false }), report({ vignette: 'bell' })]) {
      state = applyReport(state, r).state;
    }
    expect(state.objectives[0]).toMatchObject({ progress: 2, tokens: ['egg', 'bell'] });
  });

  it('reads replays, improvements and new stars from the save, not from the run', () => {
    const before = road(12, 1);
    const accuracy = levelSpec(4).starAccuracy[2]!;
    const after: Progress = { ...before, best: { ...before.best, 4: accuracy } };
    const r = objectiveReport({ level: 4, before, after, cleared: true, stars: 3, perfect: 9, flawless: 1, keepsake: true });
    expect(r).toMatchObject({ replay: true, starsBefore: 1, starsAfter: 3, stars: 3, vignette: levelSpec(4).vignette });
    const state = applyReport(stateOf(['new-level', 'three-star', 'new-stars']), r).state;
    // Replaying level 4 is not a new level; three stars and two new ones are.
    expect(state.objectives.map(o => o.progress)).toEqual([0, 1, 2]);
    expect(applyReport(stateOf(['finale', 'flawless', 'improve']), r).state.objectives.map(o => o.progress)).toEqual([0, 1, 1]);
  });

  it('stamps the day once, when the third is finished, and never takes a stamp back', () => {
    let state: ObjectivesState = { ...stateOf(['clears', 'flawless', 'three-star']), stamps: 4, stampedDays: ['2026-09-20'] };
    let update = applyReport(state, report({ flawless: 1, stars: 3 }));
    expect(update.allCompleted).toBe(false);
    state = applyReport(update.state, report()).state;
    update = applyReport(state, report());
    expect(update.allCompleted).toBe(true);
    expect(allDone(update.state)).toBe(true);
    expect(update.state).toMatchObject({ stamps: 5, stampedDays: ['2026-09-20', calendarDay(DAY)] });
    // More play after the stamp changes nothing.
    const later = applyReport(update.state, report({ flawless: 2, stars: 3 }));
    expect(later).toMatchObject({ allCompleted: false, changes: [] });
    expect(later.state.stamps).toBe(5);
  });

  it('marks finished objectives seen when the card opens, for the puck’s dot', () => {
    const storage = memory();
    const context = ctx(road(20, 2));
    const first = loadObjectives(DAY, context, storage);
    const id = first.objectives[1]!.id;
    const finishing = report({ perfect: 99, flawless: 5, stars: 3 });
    const update = recordObjectives(finishing, DAY, context, storage)!;
    expect(update.state.objectives.find(o => o.id === id)!.progress).toBeGreaterThan(0);
    const state = loadObjectives(DAY, context, storage);
    expect(unseenDone(state)).toBe(doneCount(state) > 0);
    expect(unseenDone(markObjectivesSeen(DAY, context, storage))).toBe(false);
  });
});

describe('days and storage', () => {
  it('keeps progress across a restart on the same day', () => {
    const storage = memory();
    const context = ctx(road(20, 2));
    const morning = loadObjectives(at(2026, 9, 23, 8), context, storage);
    recordObjectives(report({ perfect: 10, cleared: true, replay: true, starsBefore: 1, starsAfter: 2 }), at(2026, 9, 23, 9), context, storage);
    const afterSave = JSON.parse(storage.data[KEY]!) as { objectives: { progress: number }[] };
    resetObjectivesMemory(); // the app was closed
    const evening = loadObjectives(at(2026, 9, 23, 22), context, storage);
    expect(evening.objectives.map(o => o.id)).toEqual(morning.objectives.map(o => o.id));
    expect(evening.objectives.map(o => o.progress)).toEqual(afterSave.objectives.map(o => o.progress));
    expect(evening.objectives.some(o => o.progress > 0)).toBe(true);
  });

  it('does not redraw the day’s set when the save moves on during the day', () => {
    const storage = memory();
    const morning = loadObjectives(at(2026, 9, 23, 8), ctx(EMPTY), storage);
    const later = loadObjectives(at(2026, 9, 23, 20), ctx(road(30, 3)), storage);
    expect(later.objectives).toEqual(morning.objectives);
  });

  it('turns over at local midnight: a new set, from zero, stamps kept', () => {
    const storage = memory();
    const context = ctx(road(20, 2));
    const late = loadObjectives(at(2026, 9, 23, 23, 59), context, storage);
    const stamped: ObjectivesState = {
      ...late, stamps: 3, stampedDays: ['2026-09-21', '2026-09-22', '2026-09-23'], seen: 2,
      objectives: late.objectives.map(o => ({ ...o, progress: o.target })),
    };
    storage.setItem(KEY, JSON.stringify(stamped));
    const early = loadObjectives(at(2026, 9, 24, 0, 1), context, storage);
    expect(early.day).toBe('2026-09-24');
    expect(early.objectives.every(o => o.progress === 0)).toBe(true);
    expect(early.objectives).toEqual(selectObjectives('2026-09-24', context));
    expect(early).toMatchObject({ stamps: 3, seen: 0, stampedDays: ['2026-09-21', '2026-09-22', '2026-09-23'] });
    // A level finished just after midnight counts toward the new day, not the old one.
    const update = recordObjectives(report({ perfect: 5, flawless: 1, stars: 3 }), at(2026, 9, 24, 0, 2), context, storage)!;
    expect(update.state.day).toBe('2026-09-24');
  });

  it('draws a fresh set when the clock has moved backwards, and keeps the stamps', () => {
    const tomorrow: ObjectivesState = { ...stateOf(['clears', 'perfects', 'replays'], '2026-09-25'), stamps: 2, stampedDays: ['2026-09-24'] };
    const today = rollover(tomorrow, '2026-09-23', ctx(road(20, 2)));
    expect(today.day).toBe('2026-09-23');
    expect(today.stamps).toBe(2);
  });

  it('redraws today’s set after a progress reset, keeping the stamps', () => {
    const storage = memory();
    const veteran = ctx(road(60, 2));
    const before = loadObjectives(DAY, veteran, storage);
    storage.setItem(KEY, JSON.stringify({ ...before, stamps: 9, stampedDays: ['2026-09-22'] }));
    redrawToday(storage);
    const after = loadObjectives(DAY, ctx(EMPTY), storage);
    expect(after.objectives).toEqual(selectObjectives(calendarDay(DAY), ctx(EMPTY)));
    expect(after.objectives.every(o => objectiveDefinition(o.id)!.eligible(ctx(EMPTY)))).toBe(true);
    expect(after).toMatchObject({ stamps: 9, stampedDays: ['2026-09-22'] });
  });

  it('shows the last seven local days, today last', () => {
    const state: ObjectivesState = { ...stateOf(['clears', 'perfects', 'replays']), stampedDays: ['2026-09-17', '2026-09-20', '2026-09-23'], stamps: 3 };
    const week = stampWeek(state, DAY);
    expect(week.map(d => d.day)).toEqual(['2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23']);
    expect(week.filter(d => d.stamped).map(d => d.day)).toEqual(['2026-09-17', '2026-09-20', '2026-09-23']);
    // Across a daylight-saving change the seven days are still seven different dates.
    expect(new Set(stampWeek(state, at(2026, 3, 30)).map(d => d.day)).size).toBe(7);
    expect(new Set(stampWeek(state, at(2026, 11, 2)).map(d => d.day)).size).toBe(7);
  });
});

describe('damaged saves', () => {
  const context = ctx(road(20, 2));
  const today = calendarDay(DAY);

  it('recovers from anything in the key, drawing today’s set again', () => {
    for (const raw of ['', 'not json', 'null', '42', '[]', '{"day":5}', '{"objectives":"x"}']) {
      const storage = memory({ [KEY]: raw });
      const state = loadObjectives(DAY, context, storage);
      expect(state.day, raw).toBe(today);
      expect(state.objectives, raw).toEqual(selectObjectives(today, context));
      expect(state.stamps).toBe(0);
    }
  });

  it('does not trust unknown ids, tampered targets, duplicates or a short list', () => {
    const good = selectObjectives(today, context).map(o => ({ ...o }));
    const cases = [
      [{ id: 'free-gems', target: 1, progress: 1 }, good[1], good[2]],
      [{ ...good[0], target: 1_000 }, good[1], good[2]],
      [good[0], good[0], good[1]],
      [good[0], good[1]],
      [{ ...good[0], progress: -3 }, good[1], good[2]],
      [{ ...good[0], progress: 'lots' }, good[1], good[2]],
    ];
    for (const objectives of cases) {
      const state = parseObjectives(JSON.stringify({ day: today, objectives, stamps: 1, stampedDays: ['2026-09-01'] }))!;
      expect(state.objectives).toEqual([]);
      // Stamps survive a damaged set.
      expect(state.stamps).toBe(1);
      expect(rollover(state, today, context).objectives).toEqual(selectObjectives(today, context));
    }
  });

  it('clamps progress to the target and repairs the stamp record', () => {
    const good = selectObjectives(today, context);
    const inflated = good.map(o => ({ ...o, progress: 9_999, ...(o.tokens ? { tokens: ['a', 'a', 'b', 7] } : {}) }));
    const state = parseObjectives(JSON.stringify({
      day: today, objectives: inflated, stamps: -4, seen: 17,
      stampedDays: ['2026-09-02', 'yesterday', '2026-09-02', 3, '2026-09-01'],
    }));
    // A token list with a non-string in it is not trusted either.
    if (good.some(o => o.tokens)) expect(state!.objectives).toEqual([]);
    else expect(state!.objectives.map(o => o.progress)).toEqual(good.map(o => o.target));
    expect(state).toMatchObject({ stamps: 2, seen: 3, stampedDays: ['2026-09-01', '2026-09-02'] });
  });

  it('carries on through blocked storage for the rest of the session', () => {
    const blocked: Storage = {
      length: 0, clear: () => undefined, key: () => null, removeItem: () => undefined,
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    };
    const first = loadObjectives(DAY, context, blocked);
    const update = recordObjectives(report({ perfect: 30, flawless: 1, stars: 3, cleared: true }), DAY, context, blocked);
    expect(update).not.toBeNull();
    const again = loadObjectives(DAY, context, blocked);
    expect(again.objectives.map(o => o.id)).toEqual(first.objectives.map(o => o.id));
    expect(again.objectives).toEqual(update!.state.objectives);
  });
});

describe('analytics', () => {
  it('sends one event per objective per level, a completion instead of progress, and the stamp once', () => {
    const sent: { event: string; payload: Record<string, unknown> }[] = [];
    const ledger = new PlayAnalytics((event, payload) => { sent.push({ event, payload: payload as Record<string, unknown> }); }, () => 0);
    let state = stateOf(['clears', 'perfects', 'three-star']);
    // A level of 25 Perfects is one progress event for them, not 25.
    let update = applyReport(state, report({ perfect: 25 }));
    ledger.objectives(update, DAY);
    state = update.state;
    update = applyReport(state, report({ perfect: 10, stars: 3 }));
    ledger.objectives(update, DAY);
    state = update.state;
    update = applyReport(state, report());
    ledger.objectives(update, DAY);
    ledger.objectives(applyReport(update.state, report()), DAY);
    ledger.objectives(null, DAY);
    expect(sent.map(s => s.event)).toEqual([
      'objective_progress', 'objective_progress',
      'objective_progress', 'objective_completed', 'objective_completed',
      'objective_completed', 'daily_objectives_all_completed',
    ]);
    expect(sent[1]!.payload).toEqual({ objective: 'perfects', slot: 2, progress: 25, target: 30 });
    expect(sent[4]!.payload).toEqual({ objective: 'three-star', slot: 3, target: 1, completed: 2 });
    expect(sent[6]!.payload).toEqual({ stamps: 1, week: 1 });
  });
});
