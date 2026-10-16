/**
 * What a finished task's ending says, and what it does to the mix — read against the bar
 * the task is actually held to.
 *
 * Both used to be fixed numbers: every act's coda succeeded at 70% and a stem joined at 70
 * and left below 40, while the level's clear bar runs from 40% on level 1 to 80% on the
 * plateau. So a level-1 player clearing comfortably at 60% watched the rough ending and
 * lost the drums, and a plateau player could watch eight success codas over a full band
 * and still fail the level — and in Endless a 72% step played the success coda as it
 * cost a life against a 75–90% bar. The ending is the game's answer to "was that good
 * enough?", so it now reads the same bar the result does:
 *
 * - **success** at or above the bar the task is held to — the level's clear bar, or an
 *   Endless step's — so a level whose every task ended well is cleared;
 * - **partial** within `partialBand` under it, for the acts with a middle ending (a binary
 *   act calls it rough), a near miss rather than a failure;
 * - **rough** below that, so a level whose every task ended rough has failed.
 *
 * The music answers the same way with one more step: a stem joins at the heart-keeping
 * star (`strong`, the second star's threshold), and leaves only on a rough task — a player
 * hovering at the bar holds the mix instead of hearing it thin out under them.
 *
 * Pure, and presentation only: nothing here touches a score, a star, a heart or a life.
 */

/** Which coda a resolved task gets. The same decision the headline is chosen from. */
export type FinishOutcome = 'success' | 'partial' | 'rough';

export const VERDICT = {
  /** How far under the bar a task still reads as a near miss, in accuracy points. */
  partialBand: 15,
} as const;

/** The two bars a task's ending and the mix read. */
export interface VerdictBars {
  /** At or above: the success ending. The bar the task is held to. */
  readonly clear: number;
  /** At or above: a stem joins the mix. */
  readonly strong: number;
}

/**
 * A level's bars: its clear bar and its second star, which is also the one that keeps a
 * frontier attempt's heart. Read from the spec, never recomputed.
 */
export function levelBars(spec: { readonly clearAccuracy: number; readonly starAccuracy: readonly [number, number, number] }): VerdictBars {
  return { clear: spec.clearAccuracy, strong: spec.starAccuracy[1] };
}

/**
 * Bars for a run that has only a pass mark — an Endless step's life threshold — shaped as a
 * level's are: the strong bar a third of the way from the pass mark to 100, where a level's
 * second star sits.
 */
export function barsFor(clear: number): VerdictBars {
  return { clear, strong: Math.round(clear + (100 - clear) / 3) };
}

export function finishOutcome(accuracy: number, bars: VerdictBars, threeEndings: boolean): FinishOutcome {
  if (accuracy >= bars.clear) return 'success';
  return threeEndings && accuracy >= bars.clear - VERDICT.partialBand ? 'partial' : 'rough';
}

/** One more stem, one fewer, or as it was. */
export function layerStep(accuracy: number, bars: VerdictBars): -1 | 0 | 1 {
  if (accuracy >= bars.strong) return 1;
  if (accuracy < bars.clear - VERDICT.partialBand) return -1;
  return 0;
}
