import { REWARD_TIERS, type RewardTier, type Stars } from '../game/dailyRewards';

/**
 * The reward ladder: three rows, one a star tier, each with the glyphs it pays, its label
 * and the accuracy that earns it, and a state that is the same row drawn four ways. On the
 * card before a run a tier is `pending` (its threshold on a chip) or `earlier` (paid by an
 * earlier run today); on the result plaque the tiers this run paid are `paid`, the ones
 * paid before are `earlier`, and the ones not reached are `short` — dashed, with the
 * threshold still on the chip, since it is what the next run is for. Pure, shared by the
 * card and the plaque so the two can never disagree about what a day paid.
 */
export type LadderState = 'pending' | 'paid' | 'earlier' | 'short';

export interface LadderRow extends RewardTier {
  readonly threshold: number;
  readonly state: LadderState;
  /** The chip's words: the threshold, PAID or EARLIER. */
  readonly chip: string;
}

/**
 * `starsThisRun` null is the card before a run; a number is the result of one. `paidBefore`
 * is the day's paid tier before that run (or now, on the card), `paidNow` after it.
 */
export function ladderRows(thresholds: readonly [number, number, number], paidBefore: Stars, paidNow: Stars, starsThisRun: number | null): readonly LadderRow[] {
  return REWARD_TIERS.map((tier): LadderRow => {
    const threshold = thresholds[tier.stars - 1]!;
    let state: LadderState;
    if (tier.stars <= paidBefore) state = 'earlier';
    else if (starsThisRun === null) state = 'pending';
    else if (tier.stars <= paidNow) state = 'paid';
    else state = 'short';
    const chip = state === 'earlier' ? 'EARLIER' : state === 'paid' ? 'PAID' : `${threshold}%`;
    return { ...tier, threshold, state, chip };
  });
}

/** The ladder's header on the card: what the stars will pay, or what the day has paid. */
export function ladderHeading(paid: Stars, afterRun: boolean): { readonly title: string; readonly aside: string | null } {
  if (afterRun) return { title: 'Today’s rewards', aside: `${paid} of 3 paid` };
  return { title: paid >= 3 ? 'Earned today' : 'Stars pay out today', aside: null };
}
