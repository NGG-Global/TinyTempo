/**
 * One difficulty curve drives every knob. `difficulty(level) = 1 - e^(-(level-1)/rampLevels)`
 * rises quickly through the first areas and saturates, so the game is very easy at first,
 * keeps getting harder for ~60 levels, then holds a hard-but-fair plateau forever while the
 * seeded patterns keep changing. Tempo and pattern density use higher exponents so the first
 * levels stay flat and quarter-note simple while length and clear bar move first.
 */
export const PROGRESSION = {
  rampLevels: 25,
  areaSize: 10,
  /** Level length in tasks: 3 at the start, 8 on the plateau. */
  tasksMin: 3,
  tasksMax: 8,
  /** Every level starts at the music's tempo and ramps toward its peak, task by task. */
  baseBpm: 120,
  peakBpmRange: 30,
  tempoExponent: 1.5,
  /** Highest pattern tier a level may reach, and how many tiers below it a level spans. */
  tierCount: 5,
  tierExponent: 0.8,
  tierSpan: 2,
  /** Mean task accuracy needed to clear: 40% at level 1 rising toward 80%. */
  clearMin: 40,
  clearRange: 40,
  /**
   * A long level gets one rest at its midpoint, because nothing else in a task waits any
   * more: demonstration runs straight into response and one task straight into the next.
   * Four bars, and only from the length at which a level starts to feel relentless.
   */
  breatherBars: 4,
  breatherFromTasks: 6,
  /** Locked levels drawn beyond the frontier, still with per-node padlocks. */
  mapLookahead: 12,
  /** Faded levels past the lock gate, so the road continues instead of cutting off. */
  mapPreview: 10,
} as const;
