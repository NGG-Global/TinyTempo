import type { ConsentRegion } from '@/monetization/consentRegion';

/** The parts of the stored settings the starting answer reads. */
export interface StoredConsent {
  readonly analytics: boolean;
  readonly analyticsChosen: boolean;
}

export interface StartingConsent {
  /** Whether collection runs this session. */
  readonly granted: boolean;
  /**
   * Whether the switch itself should be written off, so Settings shows what is true: a
   * region that asks for consent turns an unchosen *on* into a stored *off*. An unknown
   * region only holds collection for the session and writes nothing, so a player who
   * opened the game offline once is not opted out for good.
   */
  readonly storeOff: boolean;
}

/**
 * Where analytics collection starts this session. Pure, so every rule is tested under node.
 *
 * - **The player's own answer always stands.** Once the switch has been moved, whatever it
 *   says is what runs, in any region.
 * - **Where consent is required, nothing is collected until it is given.** In a regulated
 *   region an answer the player never gave is not a yes, whatever the build defaulted to.
 * - **An unknown region holds collection** for the session: the game cannot show it is
 *   somewhere consent is not required, so it does not collect as if it were.
 * - **Elsewhere the stored value runs**, which starts wherever `VITE_ANALYTICS_CONSENT`
 *   put it and is what the privacy policy describes.
 */
export function startingConsent(stored: StoredConsent, region: ConsentRegion): StartingConsent {
  if (stored.analyticsChosen) return { granted: stored.analytics, storeOff: false };
  if (region === 'regulated') return { granted: false, storeOff: stored.analytics };
  if (region === 'unknown') return { granted: false, storeOff: false };
  return { granted: stored.analytics, storeOff: false };
}
