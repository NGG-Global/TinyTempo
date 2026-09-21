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
   * Finer grids than the eighth note, and how late they arrive.
   *
   * The five tiers stop at the eighth. Triplets and sixteenths sit on top of them as a
   * second stage of the same curve: from `tripletsFrom` a level may swap some of its
   * later tasks for a triplet pattern, from `sixteenthsFrom` for a sixteenth one, and the
   * share of tasks that may swap rises to `maxShare` at `fullAt`. Each grid also has two
   * densities of its own — one group per bar, then two — and moves to the second halfway
   * to `fullAt`. The first task of a level never swaps: it is the one that sets the pulse.
   *
   * Everything below `tripletsFrom` is untouched, to the seed: the swap draws from its
   * own random stream, so adding this stage reassigned no existing level's tasks.
   * `tests/levels.test.ts` holds the fingerprint that proves it.
   */
  subdivision: {
    tripletsFrom: 0.8,
    sixteenthsFrom: 0.9,
    fullAt: 0.98,
    maxShare: 0.5,
    /**
     * The closest two taps may be asked of one thumb, in milliseconds. A grid whose
     * tightest pair would land closer than this at the task's tempo is not offered for
     * that task, which is what keeps sixteenths off the fastest tasks of a level: a
     * quarter of a beat is 125 ms at 120 BPM and 100 ms at 150.
     */
    minSpacingMs: 110,
  },
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
