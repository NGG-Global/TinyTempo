import { hasAttempted, recordAttempt, type ReviewRecord } from './reviewRecord';

/**
 * Google Play In-App Review, as the game needs it.
 *
 * `native.ts` is the only implementation that touches the plugin; tests supply their own.
 * This file imports no native code and no Phaser, which is why the whole of the policy —
 * which clear opens the one opportunity, what a preparation that has not come back is
 * worth, when the opportunity is spent — is tested under node.
 *
 * Two things about the API shape everything here follows from. **Play decides whether a
 * dialog appears.** `launchReviewFlow` completes whether it showed one, quietly declined
 * because of its quota, or was dismissed, and it says nothing about which; the game
 * therefore treats a completed launch as "the flow was attempted" and nothing more — no
 * rating, no submission, no sentiment is known or guessed at. And **the prepared
 * `ReviewInfo` is short-lived**, so it is requested while the result screen is up and
 * spent on Continue, never fetched at boot and held.
 */

export interface ReviewMilestone {
  /** Stable: the stored record names it, so it is never renamed. */
  readonly id: string;
  /** The first level that can open it. Every area finale from here on can, until it has been tried. */
  readonly fromLevel: number;
  /** The stars the finishing run must earn, so the moment is a success on its own terms. */
  readonly minStars: number;
}

/**
 * Append-only. One entry for now: **the first area finale a player finishes with two stars
 * or more** — level 10 for most, a later finale, or a replay of one, for a player who only
 * scraped it. A finale is the first thing a player has *finished*, an area's levels and the
 * presentation that closes them, rather than merely started.
 *
 * Two stars is `HEALTH.keepAtStars` on purpose: a result that keeps its heart, so the
 * moment the review is offered is never one where a heart was just lost, whatever the
 * bar holds (`tests/appReview.test.ts` keeps the two in step). Level 10 is inside
 * `HEALTH.protectedThrough` as well, so on the common path nothing about hearts has
 * touched the session yet. It used to be any clear of level 10, a one-star scrape
 * included, which with hearts spent from level 6 met most players at an empty bar.
 *
 * The id predates the star condition and is kept, so a device that already tried is not
 * asked again. Choosing the moment is Play's own advice ("target the best possible
 * moment"); what the game never does is ask the player anything first or reward a rating.
 * A later milestone is a new entry here, and nothing else changes: not the scene, not the
 * bridge.
 */
export const REVIEW_MILESTONES: readonly ReviewMilestone[] = Object.freeze([
  Object.freeze({ id: 'first-finale', fromLevel: 10, minStars: 2 }),
]);

/** The facts about a finished level that the policy reads, and nothing else. */
export interface LevelClearance {
  readonly level: number;
  /** The level was cleared — one star or more. */
  readonly cleared: boolean;
  /** This run's stars, 0–3: the run's own result, never the level's best. */
  readonly stars: number;
  /** The level is an area finale and this run got its "Area complete" payoff. */
  readonly finale: boolean;
  /** `saveProgress` reported the write landed. A clear the next launch cannot find is not a milestone. */
  readonly saved: boolean;
}

/**
 * The milestone this clear opens, or null: an area finale at or past the milestone's
 * level, cleared with its stars this run, saved, and not already tried on this device.
 * Nothing about Premium, ads, purchases, objectives or hearts.
 */
export function reviewMilestoneFor(
  clear: LevelClearance,
  record: ReviewRecord,
  milestones: readonly ReviewMilestone[] = REVIEW_MILESTONES,
): ReviewMilestone | null {
  if (!clear.cleared || !clear.finale || !clear.saved) return null;
  return milestones.find(m =>
    clear.level >= m.fromLevel && clear.stars >= m.minStars && !hasAttempted(record, m.id)) ?? null;
}

/**
 * The native ReviewManager, as the game needs it. Isolated so this file and its tests
 * never load Capacitor. Both methods may reject; the adapter treats every rejection as
 * "Play will not do this now".
 */
export interface AppReviewClient {
  /** Ask Play for a review flow. Resolves once one is held natively, ready to launch. */
  prepare(): Promise<void>;
  /** Show the prepared flow. Resolves when Play hands control back, whatever it showed. */
  launch(): Promise<void>;
}

export type ReviewLaunch =
  /** Play's task completed. Whether a dialog was shown is not knowable, and not asked. */
  | 'completed'
  /** The launch was tried and Play, the bridge or the clock said no. The opportunity is spent. */
  | 'failed'
  /** Nothing was launched: nothing was offered, the preparation was not ready, or one already ran this session. */
  | 'skipped';

export interface AppReview {
  /**
   * A finished level. When it is an untried milestone, starts preparing Play's flow in
   * the background and returns the milestone; otherwise null. Never awaits anything, so
   * the result screen it is called from keeps every one of its beats.
   */
  offer(clear: LevelClearance): ReviewMilestone | null;
  /**
   * Continue. Launches whatever `offer` prepared, waits for Play to hand control back,
   * and always resolves — the caller goes to the map on every branch.
   */
  launch(): Promise<ReviewLaunch>;
}

export interface AppReviewOptions {
  readonly load: () => ReviewRecord;
  readonly save: (record: ReviewRecord) => boolean;
  readonly appVersion: string;
  readonly now?: () => number;
  readonly milestones?: readonly ReviewMilestone[];
  /**
   * How long Continue waits for a preparation still in flight. The result screen has
   * usually been up for seconds by then; past this the player is going to the map without
   * a dialog rather than looking at a button that did nothing.
   */
  readonly prepareWaitMs?: number;
  /**
   * How long Continue waits for Play to hand control back. A native task that never
   * completes would otherwise hold the player on the result screen for good; if Play's
   * own sheet is up, it stays up over the map, which is harmless.
   */
  readonly launchWaitMs?: number;
}

/**
 * Every control on the result screen is inert while Continue waits, so the launch's wait
 * is time the game looks frozen. It was 20 s, which on a device where Play never answers
 * is exactly "the game freezes when a level ends"; 3 s is long enough for Play to take the
 * screen when it is going to, and the map loads under its sheet when it is slower.
 */
export const REVIEW_WAIT = {
  prepareMs: 1500,
  launchMs: 3_000,
} as const;

/** Resolves to `fallback` if `promise` has not settled within `ms`. */
function within<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>(resolve => {
    const timer = globalThis.setTimeout(() => { resolve(fallback); }, ms);
    promise.then(
      value => { globalThis.clearTimeout(timer); resolve(value); },
      () => { globalThis.clearTimeout(timer); resolve(fallback); },
    );
  });
}

/**
 * Direct Google Play In-App Review.
 *
 * **The opportunity is spent when a launch is tried, not when one is offered.** A
 * preparation that fails or is still pending on Continue has asked the player nothing,
 * so it costs nothing: the next clear of the same milestone offers again. A launch that
 * is tried is recorded before the call, whether or not Play then completes it, because
 * from that instant the game cannot tell whether a dialog was shown — and Play's own
 * quota already keeps a retried launch from being a second prompt.
 *
 * One launch per session, whatever the record says: a device whose storage refuses the
 * write must still not see two sheets in one sitting.
 */
export function createAppReview(client: AppReviewClient, options: AppReviewOptions): AppReview {
  const now = options.now ?? (() => Date.now());
  const milestones = options.milestones ?? REVIEW_MILESTONES;
  const prepareWaitMs = options.prepareWaitMs ?? REVIEW_WAIT.prepareMs;
  const launchWaitMs = options.launchWaitMs ?? REVIEW_WAIT.launchMs;
  let pending: { readonly milestone: ReviewMilestone; readonly level: number; readonly ready: Promise<boolean> } | null = null;
  let launchedThisSession = false;
  let launching = false;

  function offer(clear: LevelClearance): ReviewMilestone | null {
    if (launchedThisSession || launching) return null;
    const milestone = reviewMilestoneFor(clear, options.load(), milestones);
    if (!milestone) return null;
    // The same summary can open twice on a restarted, re-cleared level; one preparation
    // serves both rather than asking Play again.
    if (pending?.milestone.id === milestone.id) return milestone;
    const ready = client.prepare().then(() => true, () => false);
    pending = { milestone, level: clear.level, ready };
    return milestone;
  }

  async function launch(): Promise<ReviewLaunch> {
    if (launching || launchedThisSession) return 'skipped';
    const offered = pending;
    pending = null;
    if (!offered) return 'skipped';
    launching = true;
    try {
      const ready = await within(offered.ready, prepareWaitMs, false);
      if (!ready) return 'skipped';
      launchedThisSession = true;
      // Recorded before the call: after it the game cannot know what Play showed.
      options.save(recordAttempt(options.load(), {
        milestone: offered.milestone.id, level: offered.level, at: now(), appVersion: options.appVersion,
      }));
      const completed = await within(client.launch().then(() => true), launchWaitMs, false);
      return completed ? 'completed' : 'failed';
    } catch {
      return 'failed';
    } finally {
      launching = false;
    }
  }

  return { offer, launch };
}

/**
 * The browser, and every native build until `bootAppReview` says otherwise. It offers
 * nothing and launches nothing, and it is a different object rather than a flag, so a
 * development mock can never stand in for Play in a release.
 */
export const stubAppReview: AppReview = Object.freeze({
  offer: () => null,
  launch: async () => 'skipped' as const,
});

export interface Continuation {
  /** Launch the review, then leave. Once: a second call while the first is under way does nothing. */
  run(): Promise<void>;
  readonly busy: boolean;
}

/**
 * The cleared result's Continue: the review flow, then the map, in that order and once.
 * `leave` runs on every branch — a review that is unavailable, refused, failed or slow is
 * the map a moment later, never a result screen the player cannot get off. `launch` is
 * not expected to reject, but a bridge that does still reaches `leave`.
 */
export function createContinuation(launch: () => Promise<unknown>, leave: () => void): Continuation {
  let busy = false;
  return {
    get busy() { return busy; },
    async run() {
      if (busy) return;
      busy = true;
      try {
        await launch();
      } catch {
        // Falls through to the map like every other review failure.
      }
      leave();
    },
  };
}
