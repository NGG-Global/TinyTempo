import { PROGRESSION } from '../config/progression';
import { RHYTHM } from '../config/rhythm';
import { parsePattern, parseSubdivided, tightestGap, type Pattern } from '../rhythm/patterns';
import { VIGNETTES } from '../vignettes/registry';

/** A grid finer than the tiers' eighth note. Null for a task on the tiers. */
export type Grid = 'triplet' | 'sixteenth';

/** What a level is for inside its area, from `PROGRESSION.choreography`. */
export type LevelRole = typeof PROGRESSION.choreography.steps[number]['role'];

export interface LevelTask {
  readonly pattern: Pattern;
  readonly bpm: number;
  readonly tier: number;
  /** Whole beats of lead-in before this task's demonstration. Zero for most tasks. */
  readonly leadBeats: number;
  readonly grid: Grid | null;
}
export interface Area { readonly name: string; readonly sky: number; readonly ground: number; readonly road: number; readonly ink: number; readonly paper: number }
export interface LevelSpec {
  readonly level: number;
  /** The curve's value for this level: the baseline the choreography shifts around. */
  readonly difficulty: number;
  /** What this level is for inside its area. `finale` is the tenth. */
  readonly role: LevelRole;
  /** 1–`areaSize`: where the level sits in its area. */
  readonly areaStep: number;
  /**
   * The area's last level: a reprise of the area's own patterns, presented as its finale.
   * Derived from `PROGRESSION.areaSize`, never from a level number (`isAreaFinale`).
   */
  readonly finale: boolean;
  readonly vignette: string;
  /**
   * How many times the vignette rotation has come round before this level. Acts with
   * more than one look index it, so a second visit to an act does not repeat the first.
   */
  readonly lap: number;
  readonly areaName: string;
  readonly area: Area;
  readonly tasks: readonly LevelTask[];
  readonly peakBpm: number;
  /** Mean task accuracy that clears the level (one star). */
  readonly clearAccuracy: number;
  /** Accuracy for one, two and three stars. */
  readonly starAccuracy: readonly [number, number, number];
}

/** Map areas cycle forever; repeats gain a numeral (GRASS II). */
export const AREAS: readonly Area[] = Object.freeze([
  { name: 'Grass', sky: 0xe7ead5, ground: 0xb0bb91, road: 0xd3b58c, ink: 0x2c4629, paper: 0xf4f0e2 },
  { name: 'Pavement', sky: 0xe8e4de, ground: 0xbdb7ae, road: 0x7a746f, ink: 0x35322f, paper: 0xf5f2ee },
  { name: 'Sand', sky: 0xf5e9cc, ground: 0xe3c88f, road: 0xc48f5b, ink: 0x5a4224, paper: 0xfff7e6 },
  { name: 'Snow', sky: 0xe9eff5, ground: 0xdfe8f0, road: 0x9eb4c6, ink: 0x2d4759, paper: 0xffffff },
  { name: 'Dusk', sky: 0x615475, ground: 0x433856, road: 0xb48d70, ink: 0xf3e7d8, paper: 0x2a2236 },
]);

/**
 * Pattern vocabulary by tier. Steps are half beats; no pattern places two hits closer than
 * half a beat, so at the 150 BPM ceiling the tightest spacing is 200 ms, still wider than
 * the 130 ms Good window. Tier 0 is quarter notes only, tiers 1–2 add offbeats, tiers 3–4
 * are eight-beat phrases of increasing density.
 */
export const PATTERN_TIERS: readonly (readonly Pattern[])[] = Object.freeze([
  ['X X X -', 'X X - X', 'X - X X', 'X X X X'].map((n, i) => parsePattern(`t0-${i}`, n)),
  ['X - X - X - - X', 'X - X - - X X -', 'X - - X X - X -', 'X - X X - - X -'].map((n, i) => parsePattern(`t1-${i}`, n, 0.5)),
  ['X - - X - X X -', 'X X - X - - X -', 'X - X - - X - X', 'X - - X X - - X'].map((n, i) => parsePattern(`t2-${i}`, n, 0.5)),
  ['X - X - - X X - X - X - - X X -', 'X - - X X - X - X - - X X - X -', 'X - X X - X X - X - X X - - X -', 'X - X - X - - X X - X - - X X -'].map((n, i) => parsePattern(`t3-${i}`, n, 0.5)),
  ['X X X - X - X X X - X - - X X -', 'X - X X - X - X X - - X X - X X', 'X X - X X - X - X X - X - X X -', 'X - X X X - - X X - X X X - X -'].map((n, i) => parsePattern(`t4-${i}`, n, 0.5)),
]);

/**
 * The finer grids, on top of the tiers: two densities each, one group of the subdivision
 * per bar and then two. Every phrase is one bar and opens on its downbeat, like every
 * tier pattern, so the block, the handover and the task change see nothing new. A phrase
 * ends at least a third of a beat before the bar line: the next task's demonstration
 * begins on the very next downbeat, and a sixteenth owed 100 ms before the hammer plays
 * again is a trap, not a rhythm.
 */
export const SUBDIVIDED_TIERS: Readonly<Record<Grid, readonly (readonly Pattern[])[]>> = Object.freeze({
  triplet: Object.freeze([
    ['X - - X - - X X X X - -', 'X X X X - - X - - X - -', 'X - - X X X X - - X - -', 'X - - X - - X - - X X X'].map((n, i) => parseSubdivided(`tr0-${i}`, n, 3)),
    ['X X X X - - X X X X - -', 'X - - X X X X - - X X X', 'X X X X X X X - - X - -', 'X - - X X X X X X X - -'].map((n, i) => parseSubdivided(`tr1-${i}`, n, 3)),
  ]),
  sixteenth: Object.freeze([
    ['X - - - X - - - X - - X X - - -', 'X - - X X - - - X - - - X - - -', 'X - - - X - - X X - - - X - - -', 'X - - - X - X - X - - X X - - -'].map((n, i) => parseSubdivided(`sx0-${i}`, n, 4)),
    ['X - - - X X X X X - - - X - - -', 'X X X X X - - - X - - - X - - -', 'X - - - X - - - X X X X X - - -', 'X - X - X X X X X - - - X - X -'].map((n, i) => parseSubdivided(`sx1-${i}`, n, 4)),
  ]),
});

/** A second random stream for the second stage, so its draws never move the first's. */
const SUBDIVISION_SEED = 0x51ed;
/** A third, for the finale's reprise, so composing it moves no draw of either stage. */
const REPRISE_SEED = 0xf1a1e;

export function difficulty(level: number): number {
  if (!Number.isInteger(level) || level < 1) throw new Error('Levels start at 1.');
  return 1 - Math.exp(-(level - 1) / PROGRESSION.rampLevels);
}

export function areaOf(level: number): { readonly area: Area; readonly index: number; readonly name: string } {
  const index = Math.floor((level - 1) / PROGRESSION.areaSize);
  const area = AREAS[index % AREAS.length]!;
  const lap = Math.floor(index / AREAS.length);
  return { area, index, name: lap === 0 ? area.name : `${area.name} ${['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][lap - 1] ?? lap + 1}` };
}

/** Whether a level is the last of its area: every `areaSize`-th level, whatever that is. */
export function isAreaFinale(level: number): boolean {
  if (!Number.isInteger(level) || level < 1) throw new Error('Levels start at 1.');
  return level % PROGRESSION.areaSize === 0;
}

/** The first and last level of the area a level sits in; the last is its finale. */
export function areaLevels(level: number): { readonly first: number; readonly finale: number } {
  const index = areaOf(level).index;
  return { first: index * PROGRESSION.areaSize + 1, finale: (index + 1) * PROGRESSION.areaSize };
}

/** Deterministic per level, so a level plays the same on every attempt and can be learned. */
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

/** 0 → 1 across [from, to], clamped. */
function ramp(value: number, from: number, to: number): number {
  return Math.max(0, Math.min(1, (value - from) / (to - from)));
}

/**
 * The continuous values the curve rounds each dimension from: tasks, BPM of headroom
 * above the base tempo, and the fractional tier. Kept continuous so the choreography's
 * shifts are added before rounding, and a small shift fades in rather than jumping.
 */
export interface LevelShape {
  readonly tasks: number;
  readonly tempo: number;
  readonly tier: number;
}

/** The plain curve at a difficulty: what every level was before the choreography. */
export function baselineShape(d: number): LevelShape {
  const P = PROGRESSION;
  return {
    tasks: P.tasksMin + (P.tasksMax - P.tasksMin) * d,
    tempo: P.peakBpmRange * d ** P.tempoExponent,
    tier: P.tierCount * d ** P.tierExponent,
  };
}

/** The step of its area a level sits on, and the row of the choreography that step reads. */
export function areaStep(level: number): { readonly step: number; readonly row: typeof PROGRESSION.choreography.steps[number] } {
  const index = (level - 1) % PROGRESSION.areaSize;
  return { step: index + 1, row: PROGRESSION.choreography.steps[index]! };
}

/**
 * A level's shape once its step has shifted it: the baseline plus the row's offsets, at
 * the ramp's strength, and never past what the plain curve gives the level one
 * `lookahead` further on. The ceilings are applied where each value is rounded.
 */
export function choreographedShape(level: number): LevelShape & { readonly subdivision: number } {
  const C = PROGRESSION.choreography;
  const base = baselineShape(difficulty(level));
  const cap = baselineShape(difficulty(level + C.lookahead));
  const { row } = areaStep(level);
  const strength = ramp(level - 1, 0, C.rampLevels);
  return {
    tasks: Math.min(cap.tasks, base.tasks + row.tasks * strength),
    tempo: Math.min(cap.tempo, base.tempo + row.bpm * strength),
    tier: Math.min(cap.tier, base.tier + row.tier * strength),
    // A multiplier on the swap chance, eased in the same way: 1 is the plain curve.
    subdivision: 1 + (row.subdivision - 1) * strength,
  };
}

/**
 * The closest two taps a pattern asks for at a tempo, in milliseconds.
 */
export function tightestSpacingMs(pattern: Pattern, bpm: number): number {
  return tightestGap(pattern) * 60_000 / bpm;
}

/** Whether a grid may be offered for a task at this tempo: its densest pattern must still leave the thumb room. */
export function gridFits(grid: Grid, bpm: number): boolean {
  const patterns = SUBDIVIDED_TIERS[grid].flat();
  return patterns.every(pattern => tightestSpacingMs(pattern, bpm) >= PROGRESSION.subdivision.minSpacingMs);
}

/**
 * The second stage of the curve: swap some of a level's later tasks onto a finer grid.
 *
 * Runs after the tiers have chosen every task and touches nothing below `tripletsFrom`,
 * so the levels players have already learnt keep their tasks to the seed. Within a level
 * the swaps skip the first task, which sets the pulse, and respect the tempo: a grid
 * whose densest pattern would ask for taps closer than `minSpacingMs` at this task's
 * tempo is not offered here, which is what keeps sixteenths off the fastest tasks.
 */
function subdivide(level: number, d: number, tasks: readonly LevelTask[], emphasis: number): readonly LevelTask[] {
  const S = PROGRESSION.subdivision;
  // The threshold reads the plain curve, never the choreography: no step of any area can
  // bring a finer grid in ahead of the level the curve first allows it.
  if (d < S.tripletsFrom || emphasis <= 0) return tasks;
  const random = seeded(level + SUBDIVISION_SEED);
  const share = Math.min(1, S.maxShare * ramp(d, S.tripletsFrom, S.fullAt) * emphasis);
  // The share is a ceiling as well as a chance: a run of lucky draws may not turn a level
  // into a subdivision drill, so no more than that fraction of its tasks ever swap.
  const most = Math.floor(tasks.length * S.maxShare);
  const out = [...tasks];
  let swapped = 0;
  for (let i = 1; i < out.length && swapped < most; i++) {
    if (random() >= share) continue;
    const task = out[i]!;
    const grids: Grid[] = [];
    if (gridFits('triplet', task.bpm)) grids.push('triplet');
    if (d >= S.sixteenthsFrom && gridFits('sixteenth', task.bpm)) grids.push('sixteenth');
    if (grids.length === 0) continue;
    const grid = grids.length === 2 ? grids[Math.floor(random() * 2)]! : grids[0]!;
    const density = ramp(d, grid === 'triplet' ? S.tripletsFrom : S.sixteenthsFrom, S.fullAt) >= 0.5 ? 1 : 0;
    // Neither neighbour repeats: the one before is final, the one after is checked when its
    // own turn comes.
    const pool = SUBDIVIDED_TIERS[grid][density]!.filter(pattern => pattern !== out[i - 1]!.pattern);
    out[i] = { ...task, pattern: pool[Math.floor(random() * pool.length)]!, grid };
    swapped++;
  }
  return out;
}

/**
 * Which task carries the level's breather, or -1 for a level short enough not to need one.
 * The midpoint, so the rest falls between two roughly equal halves of work.
 */
export function breatherTask(count: number): number {
  return count >= PROGRESSION.breatherFromTasks ? Math.floor(count / 2) : -1;
}

/** The three whole numbers a shape rounds to, inside the curve's ceilings. */
export interface LevelDimensions {
  readonly tasks: number;
  readonly peakBpm: number;
  readonly maxTier: number;
}

export function dimensionsOf(shape: LevelShape): LevelDimensions {
  const P = PROGRESSION;
  return {
    tasks: Math.max(P.tasksMin, Math.min(P.tasksMax, Math.round(shape.tasks))),
    // Whole 2 BPM steps: a 1 BPM ceiling is inaudible and would only make level 3 differ from level 1 on paper.
    peakBpm: P.baseBpm + 2 * Math.round(Math.max(0, Math.min(P.peakBpmRange, shape.tempo)) / 2),
    maxTier: Math.max(0, Math.min(P.tierCount - 1, Math.floor(shape.tier))),
  };
}

/**
 * The level's tasks as the tiers choose them, before any is swapped onto a finer grid.
 * Its own function so the second stage's independence can be tested: `subdivide` may
 * replace some of these, and must never move one it leaves.
 */
export function tierTasks(level: number): readonly LevelTask[] {
  const P = PROGRESSION;
  const { tasks: count, peakBpm, maxTier } = dimensionsOf(choreographedShape(level));
  const minTier = Math.max(0, maxTier - P.tierSpan);
  const breather = breatherTask(count);
  const random = seeded(level);
  let previous: Pattern | null = null;
  const tasks: LevelTask[] = [];
  for (let i = 0; i < count; i++) {
    const progress = count > 1 ? i / (count - 1) : 0;
    const tier = minTier + Math.round((maxTier - minTier) * progress);
    const pool = PATTERN_TIERS[tier]!.filter(pattern => pattern !== previous);
    const pattern = pool[Math.floor(random() * pool.length)]!;
    previous = pattern;
    // One bar to open the level and find the pulse — a finale's longer opening carries its
    // title card and the music's build — four bars for the breather, and nothing between
    // any other pair of tasks.
    const leadBeats = i === 0 ? openingBeats(level)
      : i === breather ? P.breatherBars * RHYTHM.beatsPerBar : 0;
    tasks.push({ pattern, tier, leadBeats, grid: null, bpm: Math.round(P.baseBpm + (peakBpm - P.baseBpm) * progress) });
  }
  return tasks;
}

/** Whole beats before a level's first demonstration: one bar, or a finale's opening. */
export function openingBeats(level: number): number {
  return isAreaFinale(level) ? PROGRESSION.finale.openingBars * RHYTHM.beatsPerBar : RHYTHM.leadInBeats;
}

/** A level's tasks from both stages of the curve, before any finale reprise. */
function curveTasks(level: number): readonly LevelTask[] {
  return subdivide(level, difficulty(level), tierTasks(level), choreographedShape(level).subdivision);
}

/**
 * What the area has played before its finale: every distinct pattern its earlier levels
 * use, each with the tier or grid it was used on. The vocabulary a reprise may draw from.
 */
export function areaRepertoire(level: number): readonly LevelTask[] {
  const { first } = areaLevels(level);
  const seen = new Set<Pattern>();
  const out: LevelTask[] = [];
  for (let earlier = first; earlier < level; earlier++) {
    for (const task of curveTasks(earlier)) {
      if (seen.has(task.pattern)) continue;
      seen.add(task.pattern);
      out.push(task);
    }
  }
  return out;
}

/**
 * The finale's tasks: the curve's shape for its step — count, tempo ramp, lead-ins and
 * which tasks sit on a finer grid — with every pattern replaced by one the area has
 * already played. A tier task takes the highest tier of the repertoire at or below its
 * own; a subdivided one a pattern of the same grid, or of the other grid if the area has
 * played that one and it fits the task's tempo, or else a tier pattern. Within the level
 * it prefers patterns it has not used yet, so the reprise walks through the area rather
 * than repeating its favourite, and never repeats the task before it.
 *
 * An area with nothing before its finale (an `areaSize` of one) has nothing to reprise,
 * and plays the curve.
 */
function repriseTasks(level: number, curve: readonly LevelTask[]): readonly LevelTask[] {
  const repertoire = areaRepertoire(level);
  const onTier = repertoire.filter(task => task.grid === null);
  if (onTier.length === 0) return curve;
  const random = seeded(level + REPRISE_SEED);
  const used = new Set<Pattern>();
  const out: LevelTask[] = [];
  const pick = (pool: readonly LevelTask[]): LevelTask | null => {
    const previous = out.at(-1)?.pattern;
    const fresh = pool.filter(task => task.pattern !== previous && !used.has(task.pattern));
    const allowed = fresh.length > 0 ? fresh : pool.filter(task => task.pattern !== previous);
    const choice = allowed.length > 0 ? allowed[Math.floor(random() * allowed.length)]! : null;
    if (choice) used.add(choice.pattern);
    return choice;
  };
  for (const task of curve) {
    let chosen: LevelTask | null = null;
    if (task.grid !== null) {
      const other: Grid = task.grid === 'triplet' ? 'sixteenth' : 'triplet';
      const same = repertoire.filter(candidate => candidate.grid === task.grid);
      const swapped = gridFits(other, task.bpm) ? repertoire.filter(candidate => candidate.grid === other) : [];
      chosen = pick(same.length > 0 ? same : swapped);
    }
    if (chosen === null) {
      const below = onTier.filter(candidate => candidate.tier <= task.tier);
      const tier = below.length > 0 ? Math.max(...below.map(candidate => candidate.tier)) : Math.min(...onTier.map(candidate => candidate.tier));
      chosen = pick(onTier.filter(candidate => candidate.tier === tier)) ?? pick(onTier);
    }
    // `pick` returns null only for a pool of one pattern that is also the previous task's;
    // repeating it is then the only honest choice left.
    const source = chosen ?? onTier[0]!;
    // A subdivided task keeps the curve's tier slot, as `subdivide` leaves it: the tier of a
    // grid pattern is where it sits in the ramp, not a property of the pattern.
    out.push({ ...task, pattern: source.pattern, tier: source.grid === null ? source.tier : task.tier, grid: source.grid });
  }
  return out;
}

export function levelSpec(level: number): LevelSpec {
  const d = difficulty(level);
  const P = PROGRESSION;
  const shape = choreographedShape(level);
  const { step, row } = areaStep(level);
  // The bar is the curve's, never the choreography's: see `PROGRESSION.choreography`.
  const clearAccuracy = Math.round(P.clearMin + P.clearRange * d);
  const gap = (100 - clearAccuracy) / 3;
  const { area, name } = areaOf(level);
  const finale = isAreaFinale(level);
  const curve = subdivide(level, d, tierTasks(level), shape.subdivision);
  return Object.freeze({
    level, difficulty: d, role: row.role, areaStep: step, finale, vignette: VIGNETTES[(level - 1) % VIGNETTES.length]!.id,
    lap: Math.floor((level - 1) / VIGNETTES.length), areaName: name, area,
    tasks: Object.freeze(finale ? repriseTasks(level, curve) : curve),
    peakBpm: dimensionsOf(shape).peakBpm, clearAccuracy,
    starAccuracy: [clearAccuracy, Math.round(clearAccuracy + gap), Math.round(clearAccuracy + 2 * gap)] as const,
  });
}

export function starsFor(accuracy: number, spec: LevelSpec): 0 | 1 | 2 | 3 {
  return accuracy >= spec.starAccuracy[2] ? 3 : accuracy >= spec.starAccuracy[1] ? 2 : accuracy >= spec.starAccuracy[0] ? 1 : 0;
}

export function meanAccuracy(results: readonly number[]): number {
  const completed = results.filter(Number.isFinite);
  return completed.length ? completed.reduce((sum, accuracy) => sum + accuracy, 0) / completed.length : 0;
}

/** How a level reads on the map: the gate sits between `locked` and `preview`. */
export type MapLevelState = 'cleared' | 'frontier' | 'locked' | 'preview';

export function mapLevelState(level: number, unlocked: number): MapLevelState {
  if (!Number.isInteger(level) || level < 1) throw new Error('Levels start at 1.');
  if (!Number.isInteger(unlocked) || unlocked < 1) throw new Error('Unlocks start at 1.');
  if (level < unlocked) return 'cleared';
  if (level === unlocked) return 'frontier';
  if (level <= unlocked + PROGRESSION.mapLookahead) return 'locked';
  return 'preview';
}

/** Highest level the map window may include for this frontier. */
export function mapLastLevel(unlocked: number): number {
  if (!Number.isInteger(unlocked) || unlocked < 1) throw new Error('Unlocks start at 1.');
  return unlocked + PROGRESSION.mapLookahead + PROGRESSION.mapPreview;
}
