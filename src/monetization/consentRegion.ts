/**
 * Whether Google's consent rules apply to this player, as UMP reports it on its first
 * answer at boot.
 *
 * The ads boot already asks UMP (`admob.ts`), and UMP's status is the one signal the game
 * has about the player's jurisdiction without asking them anything: `REQUIRED` or
 * `OBTAINED` where a consent message is shown — the EEA, the UK and Switzerland, for the
 * GDPR message configured in AdMob — and `NOT_REQUIRED` where none is. Analytics reads it
 * to decide where its own switch starts (`analytics/startingConsent.ts`), so the two never
 * disagree about where the player is. It says nothing about *advertising* consent being
 * consent to analytics; that conflation is exactly what the separate switch exists to avoid.
 *
 * Pure, and the singleton is only a promise: nothing here imports the native plugin.
 */

/** `unknown` is a failed or absent answer: no network at boot, no plugin, the browser. */
export type ConsentRegion = 'regulated' | 'open' | 'unknown';

/** UMP's consent status, read as a region. Anything unrecognised is `unknown`, never `open`. */
export function regionFromStatus(status: unknown): ConsentRegion {
  if (status === 'REQUIRED' || status === 'OBTAINED') return 'regulated';
  if (status === 'NOT_REQUIRED') return 'open';
  return 'unknown';
}

export interface ConsentRegionSignal {
  /** The first report wins: the boot's answer is the one the session runs on. */
  report(region: ConsentRegion): void;
  /** The reported region, or `unknown` if none arrives within `waitMs`. */
  wait(waitMs: number): Promise<ConsentRegion>;
}

export function createConsentRegionSignal(
  timer: (run: () => void, ms: number) => void = (run, ms) => { globalThis.setTimeout(run, ms); },
): ConsentRegionSignal {
  let settle: ((region: ConsentRegion) => void) | null = null;
  const answer = new Promise<ConsentRegion>(resolve => { settle = resolve; });
  return {
    report(region) {
      settle?.(region);
      settle = null;
    },
    wait(waitMs) {
      return Promise.race([answer, new Promise<ConsentRegion>(resolve => { timer(() => resolve('unknown'), waitMs); })]);
    },
  };
}

/** The game's one signal: the ads boot reports, the analytics boot waits. */
export const consentRegion = createConsentRegionSignal();
