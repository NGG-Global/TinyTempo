/**
 * The people whose work is in the game beyond its code.
 *
 * Shown in Settings → Credits, and printed in the footer of every page under `legal/`. The
 * website is published separately and cannot import this, so `tests/credits.test.ts` reads
 * those pages and fails when one of them no longer carries a credit named here.
 */
export interface Credit {
  /** What they made, as the row's note reads it. */
  readonly role: string;
  readonly name: string;
  /** Where a tap on the row leads: a page of the person's own choosing. */
  readonly url: string;
}

export const CREDITS = {
  // Without the share link's tracking parameters: the profile is the same page.
  score: { role: 'Original score', name: 'Alon Attaly', url: 'https://www.linkedin.com/in/alon-attaly-718898287' },
} as const satisfies Record<string, Credit>;
