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
   * The swap draws from its own random stream after the tiers have chosen, so it never
   * moves a task it leaves alone; `tests/levels.test.ts` checks that against `tierTasks`.
   * The threshold reads the plain curve, so no step of the choreography brings a finer
   * grid in early.
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
  /**
   * The difficulty choreography: where a level sits inside its area decides which of its
   * dimensions lead, so a level stops being longer, faster, denser and stricter all at once.
   *
   * The curve above is still the baseline for every dimension. Each step of an area
   * shifts the *continuous* value a dimension is rounded from — tasks, BPM of headroom
   * above the base tempo, and the fractional tier `tierCount · d^tierExponent` — by the
   * amounts in its row, and scales the chance a task swaps onto a finer grid. The shifts
   * roughly cancel across an area, so the area's average follows the curve. Three rules
   * keep it safe:
   *
   * - **Ramped in.** The shifts grow from nothing at level 1 to full strength over
   *   `rampLevels`, so level 1 is exactly the curve and the first area plays the shape
   *   gently, while nearly every player is still learning what a turn is.
   * - **One area ahead at most.** No dimension may exceed what the plain curve gives the
   *   level `lookahead` levels later. A challenge previews the next area; it never
   *   arrives from three areas away.
   * - **The ceilings still hold.** `tasksMax`, the tempo ceiling, the top tier and the
   *   subdivision spacing floor clamp every result, so on the plateau the choreography can
   *   only lower a dimension: its variety there is recovery, never a new peak.
   *
   * **The clear bar and the star thresholds are not choreographed.** They stay on the
   * curve, for two reasons. A player's stars are not stored — they are recomputed from
   * each level's best accuracy against its thresholds — so moving a threshold would move
   * every saved star total, and a raised one could close a star gate behind a player who
   * had already passed it. And a threshold that rises smoothly with the level number is
   * the one a player can read: an easier level at the same bar is easier to three-star,
   * which is what a recovery level should be.
   */
  choreography: {
    rampLevels: 20,
    lookahead: 10,
    /** One row per step of an area, first to tenth; `areaSize` rows. */
    steps: [
      { role: 'opener', tasks: -1, bpm: -4, tier: -0.5, subdivision: 0.5 },
      { role: 'pattern', tasks: 0, bpm: -4, tier: 1, subdivision: 1.5 },
      { role: 'pattern', tasks: -1, bpm: -4, tier: 1, subdivision: 1.5 },
      { role: 'tempo', tasks: 0, bpm: 8, tier: -1, subdivision: 0 },
      { role: 'endurance', tasks: 2, bpm: -4, tier: -0.5, subdivision: 0.5 },
      { role: 'recovery', tasks: -1, bpm: -6, tier: -1, subdivision: 0.5 },
      { role: 'combination', tasks: 0, bpm: 2, tier: 0.25, subdivision: 1 },
      { role: 'combination', tasks: 0, bpm: 4, tier: 0.5, subdivision: 1 },
      { role: 'challenge', tasks: 1, bpm: 6, tier: 1, subdivision: 1.25 },
      { role: 'finale', tasks: 1, bpm: 8, tier: 1, subdivision: 1.25 },
    ],
  },
  /**
   * The star gates: what a new area asks for before its first level will start.
   *
   * Every area after the first is closed until the player's *total* stars — every star
   * on every level, wherever it was earned — reach the area's requirement. The
   * requirement is a bank rather than a per-area quota, so a strong start carries a
   * player through many areas, and stars earned anywhere count, so the loop it asks for
   * is "go back and do a level better", never "grind this area".
   *
   * Area k (the first is 0) asks for the sum over the k areas behind it of a per-area
   * share: `firstArea` stars for the first area behind, one more (`growth`) for each
   * area after, capped at `maxPerArea`. With 12, 1 and 14 that is 12 stars to enter the
   * second area, 25 the third, 39 the fourth, then 14 more each time — between 40% and
   * 47% of the 30 an area holds. What that buys, and what it protects against: a player
   * averaging 1.4 stars a level is never stopped by any gate, ever; a player who scrapes
   * every level at one star is short by 2 at the first gate and, once through it, by 3
   * and then 4 at each gate after, so the ask at any one barrier is a few levels replayed
   * one star better, never a backlog; and the plateau's clear bar of 80% (two stars at
   * 87%) is where the cap stops the requirement climbing with the difficulty. The first gate is deliberately the softest: levels 1 to 10 are the
   * ones nearly everyone three-stars, and two spare stars out of thirty teaches the
   * mechanic without stopping anyone.
   */
  starGate: { firstArea: 12, growth: 1, maxPerArea: 14 },
  /** Locked levels drawn beyond the frontier, still with per-node padlocks. */
  mapLookahead: 12,
  /** Faded levels past the lock gate, so the road continues instead of cutting off. */
  mapPreview: 10,
} as const;
