import { PROGRESSION } from '../config/progression';
import { RHYTHM } from '../config/rhythm';
import { parsePattern, type Pattern } from '../rhythm/patterns';
import { VIGNETTES } from '../vignettes/registry';

export interface LevelTask {
  readonly pattern: Pattern;
  readonly bpm: number;
  readonly tier: number;
  /** Whole beats of lead-in before this task's demonstration. Zero for most tasks. */
  readonly leadBeats: number;
}
export interface Area { readonly name: string; readonly sky: number; readonly ground: number; readonly road: number; readonly ink: number; readonly paper: number }
export interface LevelSpec {
  readonly level: number;
  readonly difficulty: number;
  readonly vignette: string;
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

/**
 * Which task carries the level's breather, or -1 for a level short enough not to need one.
 * The midpoint, so the rest falls between two roughly equal halves of work.
 */
export function breatherTask(count: number): number {
  return count >= PROGRESSION.breatherFromTasks ? Math.floor(count / 2) : -1;
}

export function levelSpec(level: number): LevelSpec {
  const d = difficulty(level);
  const P = PROGRESSION;
  const count = Math.round(P.tasksMin + (P.tasksMax - P.tasksMin) * d);
  // Whole 2 BPM steps: a 1 BPM ceiling is inaudible and would only make level 3 differ from level 1 on paper.
  const peakBpm = P.baseBpm + 2 * Math.round(P.peakBpmRange * d ** P.tempoExponent / 2);
  const maxTier = Math.min(P.tierCount - 1, Math.floor(P.tierCount * d ** P.tierExponent));
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
    // One bar to open the level and find the pulse, four bars for the breather, and
    // nothing between any other pair of tasks.
    const leadBeats = i === 0 ? RHYTHM.leadInBeats
      : i === breather ? P.breatherBars * RHYTHM.beatsPerBar : 0;
    tasks.push({ pattern, tier, leadBeats, bpm: Math.round(P.baseBpm + (peakBpm - P.baseBpm) * progress) });
  }
  const clearAccuracy = Math.round(P.clearMin + P.clearRange * d);
  const gap = (100 - clearAccuracy) / 3;
  const { area, name } = areaOf(level);
  return Object.freeze({
    level, difficulty: d, vignette: VIGNETTES[(level - 1) % VIGNETTES.length]!.id, areaName: name, area,
    tasks: Object.freeze(tasks), peakBpm, clearAccuracy,
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
