import { calendarDay, isCleared } from './health';
import { levelSpec, type Grid } from './levels';
import type { Progress } from './progress';
import { keepsakeAt, ownsKeepsake } from './scrapbook';
import { canPlayLevel, levelStars } from './stars';

/**
 * Daily objectives: three small reasons a day to play a different part of the game.
 *
 * Pure apart from one storage key, and no Phaser. **Deterministic**: a day's three are
 * drawn from `OBJECTIVE_POOL` by a generator seeded with the local calendar date
 * (`calendarDay`, the same helper the daily heart uses), filtered by what the save can
 * reach that morning. The set is written down when it is first drawn, so progress made
 * during the day cannot reshuffle it, and a new local day draws a new one.
 *
 * **Nothing here can be bought, watched or skipped past.** No objective counts a purchase,
 * an ad or a heart, and no objective is offered that the player cannot reach: a new level
 * only while the frontier is open to them (hearts refill on their own within a day), a
 * finer grid only once a level that uses it is playable, the Daily Tempo only when it
 * exists — today it does not, so it is never drawn.
 *
 * **There is no currency.** Finishing all three stamps the day on a card. The stamps only
 * ever add up; a missed day is simply an empty square, never a lost streak.
 *
 * Progress is counted once per finished level, from PlayScene's single record step, so a
 * report is one call however many taps it summarises — which is also what keeps
 * `objective_progress` to one event per objective per level rather than one per hit.
 */

export type ObjectiveFamily = 'play' | 'skill' | 'mastery';

/** What a finished level tells the objectives. Built by `objectiveReport`. */
export interface ObjectiveReport {
  readonly level: number;
  readonly vignette: string;
  readonly cleared: boolean;
  /** The level had been cleared before this attempt. */
  readonly replay: boolean;
  /** This run's stars, and the level's saved stars before and after it. */
  readonly stars: 0 | 1 | 2 | 3;
  readonly starsBefore: 0 | 1 | 2 | 3;
  readonly starsAfter: 0 | 1 | 2 | 3;
  /** Perfect hits across the pass that finished, and its tasks answered Perfect throughout. */
  readonly perfect: number;
  readonly flawless: number;
  readonly grids: readonly Grid[];
  readonly finale: boolean;
  readonly keepsake: boolean;
  /** Reserved for a Daily Tempo run, which does not exist yet. */
  readonly dailyTempo?: boolean;
}

/** What the save could reach when the day's set was drawn. */
export interface ObjectiveContext {
  readonly progress: Progress;
  /** Whether a Daily Tempo exists to be played today. It does not yet. */
  readonly dailyTempo: boolean;
}

/**
 * Whether a Daily Tempo exists. It does not yet: the objective is in the pool, typed and
 * tested, and is never drawn while this is false. Flip it where the mode ships.
 */
export const DAILY_TEMPO_AVAILABLE = false;

/** The context every scene builds the same way. */
export function objectiveContext(progress: Progress): ObjectiveContext {
  return { progress, dailyTempo: DAILY_TEMPO_AVAILABLE };
}

export interface ObjectiveDefinition {
  /** Stable, lower-case, at most 12 characters: it is an analytics value. */
  readonly id: string;
  readonly family: ObjectiveFamily;
  /** Relative chance within its family. */
  readonly weight: number;
  /** Every target this objective may carry; a stored target outside it is not trusted. */
  readonly targets: readonly number[];
  readonly target: (ctx: ObjectiveContext) => number;
  readonly title: (target: number) => string;
  readonly eligible: (ctx: ObjectiveContext) => boolean;
  /** How far a finished level moves it. `token` objectives count distinct tokens instead. */
  readonly advance: (report: ObjectiveReport) => number;
  /** For "different acts": what makes two reports count twice rather than once. */
  readonly token?: (report: ObjectiveReport) => string | null;
}

/** Levels a player can play right now, without paying for anything. */
export function reachableLevels(progress: Progress): readonly number[] {
  const out: number[] = [];
  for (let level = 1; level < progress.unlocked; level++) if (isCleared(progress, level)) out.push(level);
  // The frontier, while no star gate stands in front of it. It may cost a heart, and hearts
  // refill on their own, so it is reachable today without an ad or a purchase.
  if (canPlayLevel(progress, progress.unlocked) && !isCleared(progress, progress.unlocked)) out.push(progress.unlocked);
  return out;
}

function reachable(ctx: ObjectiveContext, test: (level: number) => boolean): boolean {
  return reachableLevels(ctx.progress).some(test);
}

/** Stars still to be earned on reachable levels. */
function starHeadroom(ctx: ObjectiveContext): number {
  return reachableLevels(ctx.progress).reduce((sum, level) => sum + 3 - levelStars(ctx.progress, level), 0);
}

const always = (): boolean => true;
const early = (ctx: ObjectiveContext): boolean => ctx.progress.unlocked <= 10;
const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

/**
 * The curated pool. **Append-only in spirit**: an id is an analytics value and a stored
 * key, so an existing id is never renamed or given a new meaning; retire one by making it
 * ineligible. Titles may be reworded.
 */
export const OBJECTIVE_POOL: readonly ObjectiveDefinition[] = Object.freeze([
  // Play: go and play something.
  {
    id: 'clears', family: 'play', weight: 3, targets: [2, 3],
    target: ctx => (early(ctx) ? 2 : 3), title: n => `Clear ${n} levels`,
    eligible: always, advance: r => (r.cleared ? 1 : 0),
  },
  {
    id: 'new-level', family: 'play', weight: 3, targets: [1],
    target: () => 1, title: () => 'Clear a new level',
    eligible: ctx => canPlayLevel(ctx.progress, ctx.progress.unlocked) && !isCleared(ctx.progress, ctx.progress.unlocked),
    advance: r => (r.cleared && !r.replay ? 1 : 0),
  },
  {
    id: 'acts', family: 'play', weight: 2, targets: [3],
    target: () => 3, title: n => `Clear levels from ${n} different acts`,
    eligible: ctx => new Set(reachableLevels(ctx.progress).map(level => levelSpec(level).vignette)).size >= 3,
    advance: r => (r.cleared ? 1 : 0), token: r => (r.cleared ? r.vignette : null),
  },
  {
    id: 'finale', family: 'play', weight: 1, targets: [1],
    target: () => 1, title: () => 'Clear an area finale',
    eligible: ctx => reachable(ctx, level => levelSpec(level).finale),
    advance: r => (r.cleared && r.finale ? 1 : 0),
  },
  {
    id: 'triplets', family: 'play', weight: 1, targets: [1],
    target: () => 1, title: () => 'Clear a level with triplets',
    eligible: ctx => reachable(ctx, level => levelSpec(level).tasks.some(t => t.grid === 'triplet')),
    advance: r => (r.cleared && r.grids.includes('triplet') ? 1 : 0),
  },
  {
    id: 'sixteenths', family: 'play', weight: 1, targets: [1],
    target: () => 1, title: () => 'Clear a level with sixteenths',
    eligible: ctx => reachable(ctx, level => levelSpec(level).tasks.some(t => t.grid === 'sixteenth')),
    advance: r => (r.cleared && r.grids.includes('sixteenth') ? 1 : 0),
  },
  {
    id: 'daily-tempo', family: 'play', weight: 2, targets: [1],
    target: () => 1, title: () => 'Finish today’s Daily Tempo',
    eligible: ctx => ctx.dailyTempo, advance: r => (r.dailyTempo === true ? 1 : 0),
  },
  // Skill: play it well.
  {
    id: 'perfects', family: 'skill', weight: 3, targets: [15, 30],
    target: ctx => (early(ctx) ? 15 : 30), title: n => `Land ${n} Perfect hits`,
    eligible: always, advance: r => r.perfect,
  },
  {
    id: 'flawless', family: 'skill', weight: 2, targets: [1],
    target: () => 1, title: () => 'Answer a task all Perfect',
    eligible: always, advance: r => r.flawless,
  },
  {
    id: 'three-star', family: 'skill', weight: 2, targets: [1],
    target: () => 1, title: () => 'Finish any level with three stars',
    eligible: always, advance: r => (r.stars === 3 ? 1 : 0),
  },
  // Mastery: go back to something already finished.
  {
    id: 'improve', family: 'mastery', weight: 3, targets: [1],
    target: () => 1, title: () => 'Raise the stars on a finished level',
    eligible: ctx => reachableLevels(ctx.progress).some(level => isCleared(ctx.progress, level) && levelStars(ctx.progress, level) < 3),
    advance: r => (r.replay && r.starsAfter > r.starsBefore ? 1 : 0),
  },
  {
    id: 'replays', family: 'mastery', weight: 3, targets: [2],
    target: () => 2, title: n => `Replay ${n} finished ${plural(n, 'level', 'levels')}`,
    eligible: ctx => reachableLevels(ctx.progress).some(level => isCleared(ctx.progress, level)),
    advance: r => (r.replay ? 1 : 0),
  },
  {
    id: 'new-stars', family: 'mastery', weight: 2, targets: [2, 3],
    target: ctx => (early(ctx) ? 2 : 3), title: n => `Earn ${n} new stars`,
    eligible: ctx => starHeadroom(ctx) >= (early(ctx) ? 2 : 3),
    advance: r => Math.max(0, r.starsAfter - r.starsBefore),
  },
  {
    id: 'keepsake', family: 'mastery', weight: 1, targets: [1],
    target: () => 1, title: () => 'Find a keepsake for the Scrapbook',
    eligible: ctx => reachable(ctx, level => {
      const keepsake = keepsakeAt(level);
      return keepsake !== null && !ownsKeepsake(ctx.progress, keepsake);
    }),
    advance: r => (r.keepsake ? 1 : 0),
  },
] satisfies ObjectiveDefinition[]);

const BY_ID: ReadonlyMap<string, ObjectiveDefinition> = new Map(OBJECTIVE_POOL.map(d => [d.id, d]));

export function objectiveDefinition(id: string): ObjectiveDefinition | null {
  return BY_ID.get(id) ?? null;
}

/** One of the day's three, and how far it has come. */
export interface DailyObjective {
  readonly id: string;
  readonly target: number;
  readonly progress: number;
  /** Distinct tokens counted so far, for objectives that count distinct things. */
  readonly tokens?: readonly string[];
}

export const OBJECTIVES_PER_DAY = 3;
/** The slots, in the order the card shows them. Each draws from its own family first. */
const SLOTS: readonly ObjectiveFamily[] = ['play', 'skill', 'mastery'];

/** A stable 32-bit seed from the calendar date: FNV-1a over its characters. */
export function daySeed(day: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < day.length; i++) hash = Math.imul(hash ^ day.charCodeAt(i), 0x01000193) >>> 0;
  return hash;
}

function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weighted(pool: readonly ObjectiveDefinition[], random: () => number): ObjectiveDefinition | null {
  const total = pool.reduce((sum, d) => sum + d.weight, 0);
  if (pool.length === 0 || total <= 0) return null;
  let roll = random() * total;
  for (const d of pool) { roll -= d.weight; if (roll < 0) return d; }
  return pool[pool.length - 1]!;
}

/**
 * The day's three. One from each family, so a day always asks for something to play,
 * something to play well and something to go back to; a family with nothing eligible
 * gives its slot to the rest of the pool. The pool is walked in its own order and the
 * weights are fixed, so the same date and the same save always draw the same three.
 */
export function selectObjectives(day: string, ctx: ObjectiveContext): readonly DailyObjective[] {
  const random = generator(daySeed(day));
  const eligible = OBJECTIVE_POOL.filter(d => d.eligible(ctx));
  const chosen: ObjectiveDefinition[] = [];
  for (const family of SLOTS) {
    const pick = weighted(eligible.filter(d => d.family === family && !chosen.includes(d)), random);
    if (pick) chosen.push(pick);
  }
  while (chosen.length < OBJECTIVES_PER_DAY) {
    const pick = weighted(eligible.filter(d => !chosen.includes(d)), random);
    if (!pick) break;
    chosen.push(pick);
  }
  return chosen.map(d => ({ id: d.id, target: d.target(ctx), progress: 0, ...(d.token ? { tokens: [] } : {}) }));
}

export interface ObjectivesState {
  /** The local calendar day this set belongs to, `YYYY-MM-DD`. */
  readonly day: string;
  readonly objectives: readonly DailyObjective[];
  /** Days all three were finished, newest last, the recent ones kept for the card. */
  readonly stampedDays: readonly string[];
  /** Every stamp ever earned. Only ever goes up. */
  readonly stamps: number;
  /** Completed objectives the player has looked at on the card, for the puck's dot. */
  readonly seen: number;
}

export const isDone = (objective: DailyObjective): boolean => objective.progress >= objective.target;
export const doneCount = (state: ObjectivesState): number => state.objectives.filter(isDone).length;
export const allDone = (state: ObjectivesState): boolean =>
  state.objectives.length > 0 && state.objectives.every(isDone);

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const KEY = 'tiny-tempo.objectives.v1';
const VERSION = 1;
/** Stamped days kept for the card's week row; the total is kept separately. */
const STAMP_DAYS_KEEP = 60;

function validObjective(value: unknown): DailyObjective | null {
  if (typeof value !== 'object' || value === null) return null;
  const { id, target, progress, tokens } = value as Record<string, unknown>;
  if (typeof id !== 'string') return null;
  const definition = objectiveDefinition(id);
  if (!definition || typeof target !== 'number' || !definition.targets.includes(target)) return null;
  if (typeof progress !== 'number' || !Number.isInteger(progress) || progress < 0) return null;
  if (definition.token) {
    if (!Array.isArray(tokens) || tokens.some(t => typeof t !== 'string' || t.length === 0 || t.length > 40)) return null;
    const distinct = [...new Set(tokens as string[])].slice(0, target);
    return { id, target, progress: distinct.length, tokens: distinct };
  }
  return { id, target, progress: Math.min(progress, target) };
}

/**
 * The stored state, every field checked. A set that is not exactly three known,
 * distinct objectives with trusted targets is discarded whole — the day's set is then
 * drawn again from its seed — while stamps are recovered separately, so a damaged set
 * never costs a player the stamps they already hold.
 */
export function parseObjectives(raw: string | null): ObjectivesState | null {
  if (!raw) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const data = parsed as Record<string, unknown>;
  const stampedDays = Array.isArray(data.stampedDays)
    ? [...new Set(data.stampedDays.filter((d): d is string => typeof d === 'string' && DAY.test(d)))].sort().slice(-STAMP_DAYS_KEEP)
    : [];
  const stored = typeof data.stamps === 'number' && Number.isInteger(data.stamps) && data.stamps >= 0 ? data.stamps : 0;
  const stamps = Math.max(stored, stampedDays.length);
  const day = typeof data.day === 'string' && DAY.test(data.day) ? data.day : '';
  const list = Array.isArray(data.objectives) ? data.objectives.map(validObjective) : [];
  const objectives = list.length === OBJECTIVES_PER_DAY && list.every(Boolean)
    && new Set(list.map(o => o!.id)).size === OBJECTIVES_PER_DAY ? list as DailyObjective[] : [];
  const seen = typeof data.seen === 'number' && Number.isInteger(data.seen) ? Math.max(0, Math.min(OBJECTIVES_PER_DAY, data.seen)) : 0;
  return { day: objectives.length > 0 ? day : '', objectives, stampedDays, stamps, seen };
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

/**
 * The last state this session saw, for a device whose storage is blocked: the day's set
 * and its progress then last until the app closes, rather than being redrawn from zero
 * every time the map opens.
 */
let memory: ObjectivesState | null = null;

function read(storage: Storage | null): ObjectivesState | null {
  let raw: string | null = null;
  try { raw = storage?.getItem(KEY) ?? null; } catch { raw = null; }
  return parseObjectives(raw) ?? memory;
}

function write(state: ObjectivesState, storage: Storage | null): boolean {
  memory = state;
  try {
    storage?.setItem(KEY, JSON.stringify({ version: VERSION, ...state }));
    return storage !== null;
  } catch {
    return false;
  }
}

/** Today's state: the stored one if it is today's, else a new set drawn for today. */
export function rollover(state: ObjectivesState | null, day: string, ctx: ObjectiveContext): ObjectivesState {
  if (state && state.day === day && state.objectives.length === OBJECTIVES_PER_DAY) return state;
  return {
    day,
    objectives: selectObjectives(day, ctx),
    stampedDays: state?.stampedDays ?? [],
    stamps: state?.stamps ?? 0,
    seen: 0,
  };
}

/** Today's objectives, drawing and saving them if this is the first look today. */
export function loadObjectives(now: number, ctx: ObjectiveContext, storage: Storage | null = safeStorage()): ObjectivesState {
  const stored = read(storage);
  const today = rollover(stored, calendarDay(now), ctx);
  if (today !== stored) write(today, storage);
  return today;
}

/** What one finished level did to the day's set. */
export interface ObjectiveChange {
  readonly id: string;
  /** 1-based position on the card. */
  readonly slot: number;
  readonly before: number;
  readonly after: number;
  readonly target: number;
  readonly completed: boolean;
}

export interface ObjectivesUpdate {
  readonly state: ObjectivesState;
  readonly changes: readonly ObjectiveChange[];
  /** This report finished the last of the three, and stamped the day. */
  readonly allCompleted: boolean;
}

/** Apply a report to a state. Pure; a finished objective never moves again. */
export function applyReport(state: ObjectivesState, report: ObjectiveReport): ObjectivesUpdate {
  const changes: ObjectiveChange[] = [];
  const wasAll = allDone(state);
  const objectives = state.objectives.map((objective, index) => {
    const definition = objectiveDefinition(objective.id);
    if (!definition || isDone(objective)) return objective;
    let next: DailyObjective = objective;
    if (definition.token) {
      const token = definition.token(report);
      const tokens = objective.tokens ?? [];
      if (token !== null && !tokens.includes(token)) {
        const grown = [...tokens, token].slice(0, objective.target);
        next = { ...objective, tokens: grown, progress: grown.length };
      }
    } else {
      const step = Math.max(0, Math.floor(definition.advance(report)));
      if (step > 0) next = { ...objective, progress: Math.min(objective.target, objective.progress + step) };
    }
    if (next.progress !== objective.progress) {
      changes.push({
        id: objective.id, slot: index + 1, before: objective.progress, after: next.progress,
        target: objective.target, completed: isDone(next),
      });
    }
    return next;
  });
  let result: ObjectivesState = { ...state, objectives };
  const allCompleted = !wasAll && allDone(result);
  if (allCompleted && !result.stampedDays.includes(state.day)) {
    result = { ...result, stampedDays: [...result.stampedDays, state.day].slice(-STAMP_DAYS_KEEP), stamps: result.stamps + 1 };
  }
  return { state: result, changes, allCompleted };
}

/**
 * The one entry point a finished level uses: today's set (drawn now if the day turned
 * over mid-session, from the save as it stood before the level), the report applied, and
 * the result saved. Never throws: an objective is never worth a level.
 */
export function recordObjectives(
  report: ObjectiveReport, now: number, ctx: ObjectiveContext, storage: Storage | null = safeStorage(),
): ObjectivesUpdate | null {
  try {
    const update = applyReport(loadObjectives(now, ctx, storage), report);
    if (update.changes.length > 0) write(update.state, storage);
    return update;
  } catch {
    return null;
  }
}

/** The card was opened: every objective finished so far has been seen. */
export function markObjectivesSeen(now: number, ctx: ObjectiveContext, storage: Storage | null = safeStorage()): ObjectivesState {
  const state = loadObjectives(now, ctx, storage);
  const done = doneCount(state);
  if (state.seen === done) return state;
  const next = { ...state, seen: done };
  write(next, storage);
  return next;
}

/** Finished objectives the card has not shown yet: the puck's coral dot. */
export const unseenDone = (state: ObjectivesState): boolean => doneCount(state) > state.seen;

/** The last seven local days, oldest first, and whether each was stamped. */
export function stampWeek(state: ObjectivesState, now: number): readonly { readonly day: string; readonly stamped: boolean }[] {
  const days: { day: string; stamped: boolean }[] = [];
  const noon = new Date(now);
  // Noon, so a daylight-saving change can never make one step land on the same date twice.
  noon.setHours(12, 0, 0, 0);
  for (let back = 6; back >= 0; back--) {
    const at = new Date(noon);
    at.setDate(noon.getDate() - back);
    const day = calendarDay(at.getTime());
    days.push({ day, stamped: state.stampedDays.includes(day) });
  }
  return days;
}

/** The report a finished level makes, from what PlayScene already holds at its record step. */
export function objectiveReport(input: {
  readonly level: number;
  readonly before: Progress;
  readonly after: Progress;
  readonly cleared: boolean;
  readonly stars: 0 | 1 | 2 | 3;
  readonly perfect: number;
  readonly flawless: number;
  readonly keepsake: boolean;
}): ObjectiveReport {
  const spec = levelSpec(input.level);
  const grids = [...new Set(spec.tasks.map(t => t.grid).filter((g): g is Grid => g !== null))];
  return {
    level: input.level, vignette: spec.vignette, cleared: input.cleared,
    replay: isCleared(input.before, input.level),
    stars: input.stars,
    starsBefore: levelStars(input.before, input.level),
    starsAfter: levelStars(input.after, input.level),
    perfect: Math.max(0, Math.floor(input.perfect)),
    flawless: Math.max(0, Math.floor(input.flawless)),
    grids, finale: spec.finale, keepsake: input.keepsake,
  };
}

/**
 * Settings' progress reset: today's set is dropped and drawn again for the empty save, so
 * it cannot go on asking to replay levels that no longer exist. The stamps are history,
 * not progress, and stay.
 */
export function redrawToday(storage: Storage | null = safeStorage()): void {
  const state = read(storage);
  write({ day: '', objectives: [], stampedDays: state?.stampedDays ?? [], stamps: state?.stamps ?? 0, seen: 0 }, storage);
}

/** Reset for tests: forget the in-memory fallback. */
export function resetObjectivesMemory(): void {
  memory = null;
}
