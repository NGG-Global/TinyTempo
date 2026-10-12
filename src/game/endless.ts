import { ENDLESS, type EndlessRole } from '../config/endless';
import { PROGRESSION } from '../config/progression';
import { RHYTHM } from '../config/rhythm';
import type { Pattern } from '../rhythm/patterns';
import { ROTATION, VIGNETTES } from '../vignettes/registry';
import { placementAt } from '../vignettes/rotation';
import { gridFits, PATTERN_TIERS, SUBDIVIDED_TIERS, type Grid } from './levels';
import { isCleared } from './health';
import type { Progress } from './progress';

/**
 * Endless Mode, as decisions. Pure — no Phaser, no clock, no storage — so every rule the
 * leaderboard ranks against is tested under node, and `scenes/EndlessScene.ts` only
 * presents what this file decides.
 *
 * Three things this module exists to keep.
 *
 * **One ruleset, one sequence.** A run is a sequence of steps, each one vignette with one
 * rhythm task, and the sequence is a pure function of the ruleset (`ENDLESS`) and the step
 * index: the same act, pattern, tempo and bar at step 37 for every player, on every
 * device, on every day. Nothing about the player — their save, their luck, their
 * performance — reaches the generator. A player who loses a life gets the same step 38
 * as one who did not.
 *
 * **Bounded memory.** A step is generated from the few steps before it (which acts not
 * to repeat, which pattern not to repeat, where the planned clock stands), never from the
 * whole history, so a run that lasts an hour costs what a run of a minute does.
 *
 * **Difficulty is a schedule, not a reaction.** Tempo, threshold and tier follow the
 * *planned* run clock — the seconds the steps before this one were scheduled to take —
 * so a step's difficulty is decided before the run starts and cannot depend on what the
 * player did. The ranked time is the audio clock's, measured on the grid; the planned
 * clock exists only so that the schedule is deterministic.
 */

/** The ruleset a sequence is drawn from. The shipped one is `ENDLESS_RULES`. */
export interface EndlessRules {
  readonly version: number;
  readonly seed: string;
}

export const ENDLESS_RULES: EndlessRules = Object.freeze({ version: ENDLESS.rulesVersion, seed: ENDLESS.seed });

export interface EndlessStep {
  readonly index: number;
  readonly role: EndlessRole;
  /** The act's id in the registry, and its index there. */
  readonly vignette: string;
  readonly actIndex: number;
  /** Which of the act's looks: the act reads `lap % looks.length`. */
  readonly lap: number;
  readonly bpm: number;
  readonly tier: number;
  readonly grid: Grid | null;
  readonly pattern: Pattern;
  /** Accuracy below which this step costs a life. Whole percent. */
  readonly threshold: number;
  /** Planned seconds into the run at this step's demonstration downbeat. */
  readonly plannedStartSec: number;
  /** Planned seconds this step takes: demonstration, response, the act's coda and the interlude after. */
  readonly durationSec: number;
}

/** Whether a save has opened the mode: its unlock level cleared, not merely reached. */
export function endlessUnlocked(progress: Progress, unlockLevel: number = ENDLESS.unlockLevel): boolean {
  return progress.unlocked > unlockLevel || isCleared(progress, unlockLevel);
}

/**
 * The acts a run may draw from: every act the road has introduced by the unlock level,
 * in the order the road introduced them, read from the rotation rather than written
 * down — so an act that joins the registry later (an era past level 100) is never in the
 * pool by accident. `tests/fixtures/endless-rules-v1.json` pins the list, because the
 * pool is part of the ruleset: a change to it is a change to the leaderboard.
 */
export function eligibleActs(throughLevel: number = ENDLESS.unlockLevel): readonly number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (let level = 1; level <= throughLevel; level++) {
    const { index } = placementAt(ROTATION, level);
    if (seen.has(index)) continue;
    seen.add(index);
    out.push(index);
  }
  return out;
}

/** 0 → 1 across [0, span], clamped. */
function ramp(value: number, span: number): number {
  return span <= 0 ? 1 : Math.max(0, Math.min(1, value / span));
}

/** FNV-1a over a string, so a seed, a version and an index make one 32-bit stream seed. */
function hashKey(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** The same generator `game/levels.ts` seeds a level with; one stream per step. */
function seeded(seed: number): () => number {
  let state = (seed * 0x9e3779b1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tempo the ramp gives at a planned second, before a role shifts it: even steps, never past the cap. */
export function rampBpm(plannedSec: number): number {
  const T = ENDLESS.tempo;
  const climb = (T.capBpm - T.startBpm) * ramp(plannedSec, T.rampSec);
  return T.startBpm + T.stepBpm * Math.round(climb / T.stepBpm);
}

/** The clear bar at a planned second: a whole percent, rising from `start` to `peak`. */
export function thresholdAt(plannedSec: number): number {
  const B = ENDLESS.threshold;
  return Math.round(B.start + (B.peak - B.start) * ramp(plannedSec, B.rampSec));
}

/** The pattern tier the ramp gives at a planned second, before a role shifts it. */
export function rampTier(plannedSec: number): number {
  return Math.round((PROGRESSION.tierCount - 1) * ramp(plannedSec, ENDLESS.tempo.rampSec));
}

const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));

/** The whole beats a step's demonstration or response takes: the phrase, padded to whole bars. */
function phraseBeats(pattern: Pattern): number {
  return Math.ceil(pattern.lengthBeats / RHYTHM.beatsPerBar) * RHYTHM.beatsPerBar;
}

/**
 * Whole beats from a step's demonstration downbeat to the next step's: the phrase twice,
 * the act's ending — contact, its hold and two slide beats, which complete whole bars
 * (`TaskSequence.ending`) — and the interlude's bars.
 */
export function stepBeats(pattern: Pattern, endingHoldBeats: number): number {
  return phraseBeats(pattern) * 2 + 3 + endingHoldBeats + ENDLESS.interludeBars * RHYTHM.beatsPerBar;
}

/** What the generator carries from one step to the next. Bounded: `recentActs` acts and one pattern. */
interface Carried {
  readonly recent: readonly number[];
  readonly previous: Pattern | null;
  readonly plannedSec: number;
}

const FRESH: Carried = Object.freeze({ recent: Object.freeze([]), previous: null, plannedSec: 0 });

/**
 * One step from what was carried into it. Every random draw is from this step's own
 * stream, in a fixed order — act, lap, pattern, grid — so a change to one choice's rule
 * cannot move another's draw.
 */
function generate(index: number, carried: Carried, pool: readonly number[], rules: EndlessRules): { readonly step: EndlessStep; readonly next: Carried } {
  const random = seeded(hashKey(`${rules.seed}:${rules.version}:${index}`));
  const row = ENDLESS.cycle[index % ENDLESS.cycle.length]!;
  const t = carried.plannedSec;

  // The act: anything in the pool that is not among the last few. The pool is larger than
  // the window, which `tests/endless.test.ts` checks; the fallback only ever covers a
  // pool a later ruleset might shrink.
  const fresh = pool.filter(act => !carried.recent.includes(act));
  const candidates = fresh.length > 0 ? fresh : pool.filter(act => act !== carried.recent.at(-1));
  const actIndex = candidates[Math.floor(random() * candidates.length)]!;
  const definition = VIGNETTES[actIndex]!;
  const lap = Math.floor(random() * ENDLESS.laps);

  const T = ENDLESS.tempo;
  const bpm = clamp(rampBpm(t) + row.bpm, T.startBpm, T.capBpm);
  const tier = clamp(rampTier(t) + row.tier, 0, PROGRESSION.tierCount - 1);
  const tierPool = PATTERN_TIERS[tier]!.filter(pattern => pattern !== carried.previous);
  let pattern = tierPool[Math.floor(random() * tierPool.length)]!;
  let grid: Grid | null = null;

  // A finer grid, where the role allows one, the clock has reached it, and the tempo
  // leaves the thumb room. The chance is drawn whether or not a grid fits, so that a
  // tempo at the edge of fitting does not move the draws of the steps after it.
  const G = ENDLESS.grids;
  if (row.grid && t >= G.tripletFromSec) {
    const roll = random();
    const grids: Grid[] = [];
    if (gridFits('triplet', bpm)) grids.push('triplet');
    if (t >= G.sixteenthFromSec && gridFits('sixteenth', bpm)) grids.push('sixteenth');
    if (roll < G.chance && grids.length > 0) {
      grid = grids.length === 2 ? grids[Math.floor(random() * 2)]! : grids[0]!;
      const density = t >= G.denseFromSec ? 1 : 0;
      const gridPool = SUBDIVIDED_TIERS[grid][density]!.filter(candidate => candidate !== carried.previous);
      pattern = gridPool[Math.floor(random() * gridPool.length)]!;
    }
  }

  const durationSec = stepBeats(pattern, definition.endingHoldBeats ?? 1) * 60 / bpm;
  const step: EndlessStep = Object.freeze({
    index, role: row.role, vignette: definition.id, actIndex, lap, bpm, tier, grid, pattern,
    threshold: thresholdAt(t), plannedStartSec: t, durationSec,
  });
  const recent = [...carried.recent, actIndex].slice(-ENDLESS.recentActs);
  return { step, next: { recent, previous: pattern, plannedSec: t + durationSec } };
}

/** A run's steps, one at a time, in constant memory. What the scene holds. */
export interface EndlessSequence {
  /** The next step. The first call is step 0. */
  next(): EndlessStep;
  /** How many steps have been handed out. */
  readonly count: number;
}

export function createEndlessSequence(rules: EndlessRules = ENDLESS_RULES, pool: readonly number[] = eligibleActs()): EndlessSequence {
  if (pool.length === 0) throw new Error('Endless Mode needs at least one act.');
  let carried = FRESH;
  let count = 0;
  return {
    get count() { return count; },
    next() {
      const { step, next } = generate(count, carried, pool, rules);
      carried = next;
      count++;
      return step;
    },
  };
}

/** The first `count` steps of a run. For tests and audits; the scene uses the sequence. */
export function endlessSteps(count: number, rules: EndlessRules = ENDLESS_RULES, pool: readonly number[] = eligibleActs()): readonly EndlessStep[] {
  const sequence = createEndlessSequence(rules, pool);
  return Array.from({ length: count }, () => sequence.next());
}

/** Step `index` alone. Walks the steps before it, in constant memory. */
export function endlessStep(index: number, rules: EndlessRules = ENDLESS_RULES, pool: readonly number[] = eligibleActs()): EndlessStep {
  if (!Number.isInteger(index) || index < 0) throw new Error('Steps start at 0.');
  const sequence = createEndlessSequence(rules, pool);
  let step = sequence.next();
  while (sequence.count <= index) step = sequence.next();
  return step;
}

/** Groove Lives, and the streak toward getting one back. */
export interface EndlessLives {
  readonly lives: number;
  readonly excellentStreak: number;
}

export const LIVES_START: EndlessLives = Object.freeze({ lives: ENDLESS.lives.start, excellentStreak: 0 });

export type LifeEvent = 'none' | 'lost' | 'recovered';

/**
 * One resolved vignette applied to the lives. Below the bar costs one life and ends the
 * streak; at or above it the streak moves, and the third excellent in a row gives one life
 * back if any is missing — one change per vignette, never both. `over` is the run's end:
 * no lives left, decided here and only here.
 */
export function applyAccuracy(state: EndlessLives, accuracy: number, threshold: number): { readonly next: EndlessLives; readonly event: LifeEvent; readonly over: boolean } {
  if (!Number.isFinite(accuracy)) throw new Error('A vignette result is a finite accuracy.');
  const L = ENDLESS.lives;
  if (accuracy < threshold) {
    const lives = Math.max(0, state.lives - 1);
    return { next: { lives, excellentStreak: 0 }, event: 'lost', over: lives === 0 };
  }
  if (accuracy < L.excellentAccuracy) return { next: { ...state, excellentStreak: 0 }, event: 'none', over: false };
  const streak = state.excellentStreak + 1;
  if (streak < L.recoveryStreak) return { next: { ...state, excellentStreak: streak }, event: 'none', over: false };
  // The streak resets either way: a full set banks nothing.
  if (state.lives >= L.max) return { next: { ...state, excellentStreak: 0 }, event: 'none', over: false };
  return { next: { lives: state.lives + 1, excellentStreak: 0 }, event: 'recovered', over: false };
}

/**
 * The ranked time: from the first demonstration downbeat to the end of the fatal
 * vignette's response bar, both on the audio clock's grid, as whole milliseconds. Every
 * interlude in between counts; the count-in before the first downbeat does not.
 */
export function elapsedMs(startSec: number, endSec: number): number {
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec < startSec) throw new Error('A run ends after it starts.');
  return Math.round((endSec - startSec) * 1000);
}

/** A time the leaderboard may take: a whole, non-negative, plausible number of milliseconds. Else null. */
export function rankedMs(ms: unknown): number | null {
  if (typeof ms !== 'number' || !Number.isInteger(ms) || ms < 0 || ms > ENDLESS.maxRunMs) return null;
  return ms;
}

export type Milestone = `${number}s`;

/** The milestones, by the seconds that earn them, in order. */
export const MILESTONES: readonly { readonly id: Milestone; readonly sec: number }[] = Object.freeze(
  ENDLESS.milestonesSec.map(sec => ({ id: `${sec}s` as Milestone, sec })),
);

/** Which milestones a time has reached. */
export function milestonesFor(ms: number): readonly Milestone[] {
  if (!Number.isFinite(ms)) return [];
  return MILESTONES.filter(m => ms >= m.sec * 1000).map(m => m.id);
}

/**
 * A survival time as the HUD and the result show it: minutes, seconds, and a tenth on the
 * HUD (`M:SS.t`) or hundredths on the result (`M:SS.tt`). Truncated, never rounded up, so a
 * run never reads as a milestone it did not reach.
 */
export function formatSurvival(ms: number, precise = false): string {
  const whole = Number.isFinite(ms) ? Math.max(0, Math.floor(ms)) : 0;
  const minutes = Math.floor(whole / 60_000);
  const seconds = Math.floor((whole % 60_000) / 1000);
  const fraction = precise ? Math.floor((whole % 1000) / 10) : Math.floor((whole % 1000) / 100);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${precise ? String(fraction).padStart(2, '0') : String(fraction)}`;
}

/** Everything a finished, valid run hands to the record, the leaderboard and analytics. */
export interface EndlessRunSummary {
  /** Unique per run, so recording it twice records it once. */
  readonly runId: string;
  readonly rulesVersion: number;
  readonly elapsedMs: number;
  /** Vignettes scored, the fatal one included. */
  readonly vignettes: number;
  readonly peakBpm: number;
  readonly perfect: number;
  readonly good: number;
  readonly missed: number;
  readonly extras: number;
}
