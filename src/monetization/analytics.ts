/**
 * Typed events, no provider attached. A scene, the monetization facade or
 * `game/playAnalytics.ts` calls `track`; sinks can listen in tests, and a real
 * analytics SDK is installed by `analytics/boot.ts` without touching call sites.
 *
 * The bus began as the commerce funnel and still lives beside it, because the provider,
 * the crash-breadcrumb bridge and the shaping rules are one pipe. Gameplay events travel
 * on the same bus rather than a second one, so consent, dedupe and Firebase's limits are
 * each decided once. See `docs/ANALYTICS.md` for the schema.
 */

import type { LevelRole } from '../game/levels';

export const COMMERCE_EVENTS = [
  'health_empty',
  'rewarded_offer_shown',
  'rewarded_started',
  'rewarded_completed',
  'rewarded_failed',
  'purchase_offer_shown',
  'purchase_started',
  'purchase_completed',
  'purchase_cancelled',
  'purchase_failed',
] as const;

export const GAMEPLAY_EVENTS = [
  'tutorial_started',
  'tutorial_completed',
  'tutorial_skipped',
  'level_started',
  'level_retried',
  'level_replayed',
  'level_completed',
  'level_failed',
  'level_abandoned',
  'task_completed',
  'star_improved',
  'star_gate_reached',
  'star_gate_opened',
  'subdivision_intro_shown',
  'subdivision_intro_completed',
  'scrapbook_opened',
  'collectible_unlocked',
  'area_finale_started',
  'area_finale_completed',
  'area_finale_failed',
  'objective_progress',
  'objective_completed',
  'daily_objectives_all_completed',
  // Reserved for a practice mode that does not exist yet: typed and shape-checked now, so
  // the day it ships its events are already in every dashboard's vocabulary.
  'practice_started',
  'practice_completed',
] as const;

/**
 * Play Games services, reported by `playgames/dailyTempo.ts` rather than the gameplay
 * ledger: a leaderboard is an account feature on top of a result, not part of the result.
 */
export const SERVICE_EVENTS = [
  'leaderboard_score_submitted',
  'leaderboard_opened',
  'leaderboard_submit_failed',
] as const;

export const ANALYTICS_EVENTS = [...COMMERCE_EVENTS, ...GAMEPLAY_EVENTS, ...SERVICE_EVENTS] as const;

export type AnalyticsEvent = typeof ANALYTICS_EVENTS[number];
export type GameplayEvent = typeof GAMEPLAY_EVENTS[number];

/** Whether a level's result counted toward progress, or was a finished level played again. */
export type AttemptMode = 'frontier' | 'replay';
/** The finest grid a task (or, on a level event, any of its tasks) asks for. */
export type GridName = 'eighth' | 'triplet' | 'sixteenth';
/** A flag Firebase can count. Booleans are sent as 1/0 anyway; typing them so keeps the payload honest. */
export type Flag = 0 | 1;

/**
 * Type aliases rather than interfaces: the crash-breadcrumb bridge hands a payload to
 * `breadcrumb`, whose data is an index signature, and only an object *type* is assignable
 * to one without a cast.
 *
 * What every level event carries: which level, how hard the curve made it, and how the
 * player came to it. All numbers or closed string sets — nothing here identifies anyone,
 * and nothing is high-cardinality enough to fill a custom dimension with noise.
 */
export type LevelParams = {
  readonly level: number;
  /** 1-based: area 1 is levels 1–10. */
  readonly area: number;
  /** What the level is for inside its area: eight values, from `LevelSpec.role`. */
  readonly role: LevelRole;
  readonly task_count: number;
  /** The level's peak tempo, which its last task reaches. */
  readonly bpm: number;
  /** The highest pattern tier any of its tasks uses. */
  readonly pattern_tier: number;
  readonly grid: GridName;
  readonly clear_accuracy: number;
  readonly mode: AttemptMode;
  /** Stars the level held before this attempt. */
  readonly previous_stars: number;
  /** Failed attempts on this level earlier in this session, with no clear since. */
  readonly retry_count: number;
  /** 1 when this attempt spent a heart. */
  readonly heart_cost: Flag;
};

/** What every area finale event carries. */
export type FinaleParams = {
  readonly level: number;
  /** 1-based: the area this finale closes. */
  readonly area: number;
  /** `FinaleTreatment.id`: 'grass', 'pavement', 'sand', 'snow', 'dusk' or 'default'. */
  readonly treatment: string;
  readonly mode: AttemptMode;
};

export type LevelResultParams = LevelParams & {
  /** Mean task accuracy, rounded, 0–100. */
  readonly accuracy: number;
  readonly duration_ms: number;
  /** Times this attempt went back to its first task: Resume after a pause, or the restart puck. */
  readonly restarts: number;
  /** 1-based index of the task with the lowest accuracy, and that accuracy. */
  readonly weakest_task: number;
  readonly weakest_accuracy: number;
};

export interface AnalyticsPayloads {
  readonly health_empty: { readonly level: number };
  readonly rewarded_offer_shown: { readonly placement: 'map' | 'play' };
  readonly rewarded_started: Record<string, never>;
  readonly rewarded_completed: Record<string, never>;
  readonly rewarded_failed: { readonly reason: 'unavailable' | 'cancelled' | 'failed' };
  readonly purchase_offer_shown: { readonly product: string };
  readonly purchase_started: { readonly product: string };
  readonly purchase_completed: { readonly product: string };
  readonly purchase_cancelled: { readonly product: string };
  readonly purchase_failed: { readonly product: string; readonly reason: 'unavailable' | 'cancelled' | 'failed' | 'pending' };

  readonly tutorial_started: { readonly source: 'first_play' | 'menu'; readonly repeat: Flag };
  readonly tutorial_completed: { readonly tries: number; readonly passed: Flag; readonly duration_ms: number; readonly repeat: Flag };
  readonly tutorial_skipped: { readonly step: 'watch' | 'try' | 'done'; readonly tries: number; readonly duration_ms: number; readonly repeat: Flag };
  readonly level_started: LevelParams;
  readonly level_retried: LevelParams;
  readonly level_replayed: LevelParams;
  readonly level_completed: LevelResultParams & { readonly stars: number };
  readonly level_failed: LevelResultParams;
  readonly level_abandoned: LevelParams & {
    /** 1-based index of the task the player left during. */
    readonly task_index: number;
    readonly duration_ms: number;
    readonly restarts: number;
  };
  readonly task_completed: {
    readonly level: number;
    readonly area: number;
    readonly mode: AttemptMode;
    /** 1-based. */
    readonly task_index: number;
    readonly task_count: number;
    readonly bpm: number;
    readonly pattern_tier: number;
    readonly grid: GridName;
    readonly accuracy: number;
    readonly perfect: number;
    readonly good: number;
    readonly miss: number;
    readonly extra: number;
    readonly flawless: Flag;
    /** Mean absolute timing error of the landed taps, rounded ms. Absent when nothing landed. */
    readonly error_ms?: number;
  };
  readonly star_improved: {
    readonly level: number;
    readonly area: number;
    readonly stars: number;
    readonly previous_stars: number;
    readonly accuracy: number;
    /** The collection once this level's new stars are counted. */
    readonly gate_have: number;
  };
  readonly star_gate_reached: {
    /** 1-based area the gate opens, and the level it stands in front of. */
    readonly area: number;
    readonly level: number;
    readonly gate_required: number;
    readonly gate_have: number;
    readonly gate_short: number;
  };
  readonly star_gate_opened: {
    readonly area: number;
    readonly level: number;
    readonly gate_required: number;
    readonly gate_have: number;
  };
  /** The first meeting with a finer grid began, on this level (`game/subdivisionIntro.ts`). */
  readonly subdivision_intro_shown: { readonly grid: 'triplet' | 'sixteenth'; readonly level: number; readonly mode: AttemptMode };
  readonly subdivision_intro_completed: {
    readonly grid: 'triplet' | 'sixteenth';
    readonly level: number;
    /** 1, or 2 when the first answer was weak enough to get one more go. */
    readonly tries: number;
    /** The better answer's accuracy, rounded. It never counts toward the level. */
    readonly accuracy: number;
    readonly passed: Flag;
  };
  /** The Scrapbook was opened, and how full it was (`game/scrapbook.ts`). */
  readonly scrapbook_opened: { readonly source: 'menu' | 'map'; readonly owned: number; readonly total: number };
  /**
   * A finished level earned its keepsake: three stars where it had fewer. Never sent for a
   * keepsake a player already held — including the ones an existing save owned on arrival.
   */
  readonly collectible_unlocked: {
    /** The act's registry id: 25 values. */
    readonly vignette: string;
    /** The keepsake's stable id: one per keepsake, never renamed. */
    readonly collectible: string;
    readonly level: number;
    /** 1 on the player's first keepsake on this device, which gets the longer note. */
    readonly first: Flag;
    /** Keepsakes owned once this one is counted. */
    readonly owned: number;
  };
  /**
   * An area's last level (`game/finale.ts`), beside — never instead of — its level events,
   * so the finale funnel is one filter away and every level report stays complete. The
   * treatment is the finale's dressing: one value per area, from a closed set.
   */
  readonly area_finale_started: FinaleParams & { readonly retry_count: number; readonly heart_cost: Flag };
  readonly area_finale_completed: FinaleParams & { readonly stars: number; readonly accuracy: number };
  readonly area_finale_failed: FinaleParams & { readonly accuracy: number };
  /**
   * A daily objective moved (`game/objectives.ts`). Sent once per objective per finished
   * level, never per hit: a level that lands twenty Perfects is one event, not twenty.
   * An advance that completes the objective sends `objective_completed` instead.
   */
  readonly objective_progress: {
    /** The objective's stable id: one of the pool's, at most 12 characters. */
    readonly objective: string;
    /** 1–3: its place on the day's card. */
    readonly slot: number;
    readonly progress: number;
    readonly target: number;
  };
  readonly objective_completed: {
    readonly objective: string;
    readonly slot: number;
    readonly target: number;
    /** Objectives finished today once this one is counted: 1–3. */
    readonly completed: number;
  };
  /** The day's third objective finished and the day was stamped. Once per local day. */
  readonly daily_objectives_all_completed: {
    /** Every stamp this device holds, this one included. */
    readonly stamps: number;
    /** Stamped days among the last seven. */
    readonly week: number;
  };
  /**
   * Play Games leaderboards (`playgames/leaderboard.ts`). Only attempts are reported: a
   * signed-out player, a browser and an unconfigured build send nothing on submit, because
   * nothing was asked of Play Games. No score in these is identifying and no player id is
   * ever sent — `accuracy` is the rounded percentage, as every level result carries.
   */
  readonly leaderboard_score_submitted: {
    /** Which leaderboard: 'daily_tempo'. */
    readonly leaderboard: string;
    readonly accuracy: number;
    /** Play Games said this beat the player's best on the daily view. */
    readonly new_best: Flag;
    /** 1 when this was a best kept from an earlier failed attempt, sent later. */
    readonly retry: Flag;
  };
  readonly leaderboard_submit_failed: {
    readonly leaderboard: string;
    readonly reason: 'offline' | 'timeout' | 'failed' | 'invalid' | 'unavailable';
    readonly retry: Flag;
  };
  /** The leaderboard button was tapped, and what came of it. */
  readonly leaderboard_opened: {
    readonly leaderboard: string;
    readonly result: 'shown' | 'signed_out' | 'failed' | 'invalid' | 'unavailable' | 'unconfigured';
    /** 1 when the tap had to offer Play Games sign-in first. */
    readonly sign_in: Flag;
  };
  readonly practice_started: { readonly level: number };
  readonly practice_completed: { readonly level: number; readonly accuracy: number; readonly duration_ms: number };
}

export type AnalyticsSink = <K extends AnalyticsEvent>(event: K, payload: AnalyticsPayloads[K]) => void;

let sink: AnalyticsSink = defaultSink;

function defaultSink<K extends AnalyticsEvent>(event: K, payload: AnalyticsPayloads[K]): void {
  if (import.meta.env.DEV) console.debug('[analytics]', event, payload);
}

/** Swap the sink (tests, or a future provider). Returns the previous sink so a test can restore it. */
export function installAnalytics(next: AnalyticsSink): AnalyticsSink {
  const previous = sink;
  sink = next;
  return previous;
}

export function track<K extends AnalyticsEvent>(event: K, payload: AnalyticsPayloads[K]): void {
  try { sink(event, payload); } catch { /* a sink must never take the game down */ }
}
