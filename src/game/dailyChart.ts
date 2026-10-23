import { DAILY_CHART, type DailyBand } from '../config/dailyTempo';
import { PROGRESSION } from '../config/progression';
import { RHYTHM } from '../config/rhythm';
import type { Pattern } from '../rhythm/patterns';
import { VIGNETTES } from '../vignettes/registry';
import { daySeed, isDayKey } from './dayKey';
import { baselineShape, breatherTask, dimensionsOf, PATTERN_TIERS, starThresholds, type LevelRole, type LevelTask } from './levels';

/**
 * The day's Daily Tempo chart: one act, one level-shaped run of tasks, drawn fresh each
 * day and the same for everyone (`docs/DAILY_TEMPO.md`). Pure — no clock, no storage, no
 * Phaser — so the chart every player's score is ranked against is tested under node.
 *
 * **A chart is a pure function of `(seed, version, day)`.** The day is `dailyTempoDay`'s
 * key, so the chart turns over with the leaderboard and the rewards; the seed and version
 * are `DAILY_CHART`'s, and a change to anything the draw reads is a new version. One seeded
 * stream, read in a fixed order — the step of an area, the act, the look, then each task's
 * phrase — so a later draw never moves an earlier one.
 *
 * **It is a level by another route.** The step of an area the day draws gives the chart its
 * role, as a level's step does; the role gives its band; the band is a point on the one
 * difficulty curve, whose value sets the tempo, the tier and the star thresholds exactly as
 * it does for a level (`baselineShape`, `dimensionsOf`, `starThresholds`), shifted by the
 * choreography row's tempo and tier offsets at full strength. The phrases come from
 * `PATTERN_TIERS` by the same loop a level's do: a tier rising from the band's floor to its
 * ceiling, no phrase twice in a row, a fresh one while the tier has one, the tempo ramping
 * from the base to the peak, one lead-in bar before the first task and the breather at the
 * midpoint of a long one.
 *
 * **Version 1 keeps to the tiers.** No triplets or sixteenths, no plateau vocabulary, no
 * last-offbeat hold: the daily is open from the title screen to a player on level 3 and one
 * on level 300, and the eighth-note tiers are the vocabulary both have. Each of those is a
 * version-2 question, not a knob.
 */
export interface DailyChart {
  readonly day: string;
  readonly version: number;
  readonly band: DailyBand;
  readonly role: LevelRole;
  /** 1–10: the step of an area the day drew, which chose the role and band. */
  readonly areaStep: number;
  readonly actIndex: number;
  readonly vignette: string;
  readonly lap: number;
  readonly tasks: readonly LevelTask[];
  readonly peakBpm: number;
  readonly maxTier: number;
  /** The curve's value the band reads: the band's own, not a level's. */
  readonly difficulty: number;
  readonly clearAccuracy: number;
  readonly starAccuracy: readonly [number, number, number];
}

/**
 * The band each role of the area's ten steps falls in: the two gentlest steps are light,
 * the two hardest tough, the six between steady — 20 / 60 / 20 with no second weight table,
 * so the draw of a step is the draw of a band.
 */
export const BAND_FOR_ROLE: Readonly<Record<LevelRole, DailyBand>> = Object.freeze({
  opener: 'light', recovery: 'light',
  pattern: 'steady', tempo: 'steady', endurance: 'steady', combination: 'steady',
  challenge: 'tough', finale: 'tough',
});

/** The same generator a level draws from (`game/levels.ts`), kept here so a level's stream is never shared. */
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

export function dailyChart(day: string, rules: { readonly seed: string; readonly version: number } = DAILY_CHART): DailyChart {
  if (!isDayKey(day)) throw new Error(`Not a day key: ${String(day)}.`);
  const P = PROGRESSION;
  const random = seeded(daySeed(`${rules.seed}:${rules.version}:${day}`));
  // 1. The step of an area, which is the role, which is the band.
  const steps = P.choreography.steps;
  const areaStep = 1 + Math.floor(random() * steps.length);
  const row = steps[areaStep - 1]!;
  const band = BAND_FOR_ROLE[row.role];
  const spec = DAILY_CHART.bands[band];
  // 2. The act, from the pool the version was pinned at, and its look.
  const actCount = Math.min(DAILY_CHART.actCount, VIGNETTES.length);
  const actIndex = Math.floor(random() * actCount);
  const lap = Math.floor(random() * DAILY_CHART.laps);
  // 3. The shape: the band's point on the curve, the row's tempo and tier shifts at full
  //    strength, the band's own task count, and its tempo cap.
  const d = spec.difficulty;
  const base = baselineShape(d);
  const dims = dimensionsOf({ tasks: spec.tasks, tempo: base.tempo + row.bpm, tier: base.tier + row.tier });
  const peakBpm = Math.min(spec.bpmCap, dims.peakBpm);
  const maxTier = dims.maxTier;
  const minTier = Math.max(0, maxTier - P.tierSpan);
  const count = spec.tasks;
  // 4. The tasks, as `tierTasks` chooses a level's.
  const breather = breatherTask(count);
  const used = new Set<Pattern>();
  let previous: Pattern | null = null;
  const tasks: LevelTask[] = [];
  for (let i = 0; i < count; i++) {
    const progress = count > 1 ? i / (count - 1) : 0;
    const tier = minTier + Math.round((maxTier - minTier) * progress);
    const allowed = PATTERN_TIERS[tier]!.filter(pattern => pattern !== previous);
    const fresh = allowed.filter(pattern => !used.has(pattern));
    const pool = fresh.length > 0 ? fresh : allowed;
    const pattern = pool[Math.floor(random() * pool.length)]!;
    used.add(pattern);
    previous = pattern;
    const leadBeats = i === 0 ? RHYTHM.leadInBeats : i === breather ? P.breatherBars * RHYTHM.beatsPerBar : 0;
    tasks.push({ pattern, tier, leadBeats, grid: null, bpm: Math.round(P.baseBpm + (peakBpm - P.baseBpm) * progress) });
  }
  const { clearAccuracy, starAccuracy } = starThresholds(d);
  return Object.freeze({
    day, version: rules.version, band, role: row.role, areaStep, actIndex, vignette: VIGNETTES[actIndex]!.id, lap,
    tasks: Object.freeze(tasks), peakBpm, maxTier, difficulty: d, clearAccuracy, starAccuracy,
  });
}

/** The chip's words: "Light chart", "Steady chart", "Tough chart". */
export function bandLabel(band: DailyBand): string {
  return `${band[0]!.toUpperCase()}${band.slice(1)} chart`;
}

/** How many of the chip's three bars are filled for a band. */
export function bandBars(band: DailyBand): 1 | 2 | 3 {
  return band === 'light' ? 1 : band === 'steady' ? 2 : 3;
}
