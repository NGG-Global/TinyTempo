import { INTERSTITIAL } from '@/config/ads';

/**
 * When the interstitial plays: on the way out of a level the player played — cleared, failed
 * or quit — and only when every rule here agrees. Pure, so each rule is a test rather than a
 * hope; the knobs are `INTERSTITIAL`.
 *
 * "Played" means an attempt began in this visit. A player who opened a level and left before
 * one could start (the out-of-hearts screen, a start that found no sound) played nothing, and
 * is not shown an ad for walking through a door.
 *
 * Nothing is stored. The exit count is session memory, as is the time the last full-screen ad
 * closed (`Monetization.lastAdClosedAt`), so a fresh launch begins the count again. See
 * `docs/INTERSTITIAL.md`.
 */

export interface InterstitialRules {
  readonly fromLevel: number;
  readonly everyLevels: number;
  readonly minGapMs: number;
}

/** How the player left the level: its result cleared, its result failed, or before a result. */
export type LevelExit = 'cleared' | 'failed' | 'quit';

/** A level whose exit counts toward the interstitial: past the first few levels. */
export function countsTowardInterstitial(level: number, rules: InterstitialRules = INTERSTITIAL): boolean {
  return Number.isInteger(level) && level >= rules.fromLevel;
}

/**
 * Whether a save can play a level whose exit counts. The map loads an interstitial only then,
 * so a player still in the first levels never has one requested on their behalf.
 */
export function interstitialReachable(unlocked: number, rules: InterstitialRules = INTERSTITIAL): boolean {
  return Number.isInteger(unlocked) && unlocked >= rules.fromLevel;
}

export interface InterstitialMoment {
  /** The level being left. */
  readonly level: number;
  /** An attempt began in this visit to the level. */
  readonly played: boolean;
  /** Counted exits since the last interstitial this session, this one included. */
  readonly exits: number;
  /** The legacy entitlement, which bought no ads. */
  readonly premium: boolean;
  /** This exit launched the Play review flow, which is one ask already. */
  readonly reviewLaunched: boolean;
  /** Wall-clock ms now, and when the last full-screen ad closed (null: none this session). */
  readonly now: number;
  readonly lastAdClosedAt: number | null;
}

/** `show`, or the first rule that said no — the order is the order they are checked in. */
export type InterstitialVerdict = 'show' | 'level' | 'unplayed' | 'premium' | 'review' | 'count' | 'gap';

export function interstitialVerdict(moment: InterstitialMoment, rules: InterstitialRules = INTERSTITIAL): InterstitialVerdict {
  if (!countsTowardInterstitial(moment.level, rules)) return 'level';
  if (!moment.played) return 'unplayed';
  if (moment.premium) return 'premium';
  if (moment.reviewLaunched) return 'review';
  if (moment.exits < rules.everyLevels) return 'count';
  // A clock set back reads as no gap at all, which waits rather than shows.
  if (moment.lastAdClosedAt !== null && !(moment.now - moment.lastAdClosedAt >= rules.minGapMs)) return 'gap';
  return 'show';
}

export interface InterstitialPacer {
  /** Counted exits since the last interstitial this session. */
  readonly exits: number;
  /** The player is leaving `level`; counted when the level counts and was played. */
  noteExit(level: number, played: boolean): void;
  /** An interstitial played: the count starts again. */
  noteShown(): void;
}

export function createInterstitialPacer(rules: InterstitialRules = INTERSTITIAL): InterstitialPacer {
  let exits = 0;
  return {
    get exits() { return exits; },
    noteExit(level, played) {
      if (played && countsTowardInterstitial(level, rules)) exits += 1;
    },
    noteShown() { exits = 0; },
  };
}

/** The session's pacer. PlayScene is re-entered for every level, so the count lives here. */
export const interstitialPacer: InterstitialPacer = createInterstitialPacer();
