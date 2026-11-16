import { INTERSTITIAL } from '@/config/ads';

/**
 * When the interstitial plays: on a cleared level's Continue, and only when every rule here
 * agrees. Pure, so each rule is a test rather than a hope; the knobs are `INTERSTITIAL`.
 *
 * Nothing is stored. The clear count is session memory, as is the time the last full-screen ad
 * closed (`Monetization.lastAdClosedAt`), so a fresh launch begins the count again: a player who
 * clears two levels a session sees none, which is the gentle side of the trade and a knob to
 * revisit with analytics rather than a promise. See `docs/INTERSTITIAL.md`.
 */

export interface InterstitialRules {
  readonly fromLevel: number;
  readonly everyClears: number;
  readonly minGapMs: number;
}

/** A level whose clear counts toward the interstitial: past the first area. */
export function countsTowardInterstitial(level: number, rules: InterstitialRules = INTERSTITIAL): boolean {
  return Number.isInteger(level) && level >= rules.fromLevel;
}

/**
 * Whether a save can play a level whose clear counts. The map loads an interstitial only then,
 * so a player still in the first area never has one requested on their behalf.
 */
export function interstitialReachable(unlocked: number, rules: InterstitialRules = INTERSTITIAL): boolean {
  return Number.isInteger(unlocked) && unlocked >= rules.fromLevel;
}

export interface InterstitialMoment {
  /** The level just cleared. */
  readonly level: number;
  /** Counted clears since the last interstitial this session, this one included. */
  readonly clears: number;
  /** The legacy entitlement, which bought no ads. */
  readonly premium: boolean;
  /** A replay timer is running: a player who has just paid is not shown an ad on top. */
  readonly timerRunning: boolean;
  /** This Continue launched the Play review flow, which is one ask already. */
  readonly reviewLaunched: boolean;
  /** Wall-clock ms now, and when the last full-screen ad closed (null: none this session). */
  readonly now: number;
  readonly lastAdClosedAt: number | null;
}

/** `show`, or the first rule that said no — the order is the order they are checked in. */
export type InterstitialVerdict = 'show' | 'level' | 'premium' | 'timer' | 'review' | 'count' | 'gap';

export function interstitialVerdict(moment: InterstitialMoment, rules: InterstitialRules = INTERSTITIAL): InterstitialVerdict {
  if (!countsTowardInterstitial(moment.level, rules)) return 'level';
  if (moment.premium) return 'premium';
  if (moment.timerRunning) return 'timer';
  if (moment.reviewLaunched) return 'review';
  if (moment.clears < rules.everyClears) return 'count';
  // A clock set back reads as no gap at all, which waits rather than shows.
  if (moment.lastAdClosedAt !== null && !(moment.now - moment.lastAdClosedAt >= rules.minGapMs)) return 'gap';
  return 'show';
}

export interface InterstitialPacer {
  /** Counted clears since the last interstitial this session. */
  readonly clears: number;
  /**
   * A cleared result for `level`, counted when the level counts. Called once per result when
   * it opens, so a clear left by the map puck still counts toward the next Continue.
   */
  noteClear(level: number): void;
  /** An interstitial played: the count starts again. */
  noteShown(): void;
}

export function createInterstitialPacer(rules: InterstitialRules = INTERSTITIAL): InterstitialPacer {
  let clears = 0;
  return {
    get clears() { return clears; },
    noteClear(level) {
      if (countsTowardInterstitial(level, rules)) clears += 1;
    },
    noteShown() { clears = 0; },
  };
}

/** The session's pacer. PlayScene is re-entered for every level, so the count lives here. */
export const interstitialPacer: InterstitialPacer = createInterstitialPacer();
