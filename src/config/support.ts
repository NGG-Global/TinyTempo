/**
 * Where a player writes to, in one place.
 *
 * It is also printed in `legal/privacy/` and `legal/terms/` and will go on the Play
 * listing; those are published separately and cannot import this, so changing the address
 * means changing all of them together.
 */
export const SUPPORT = {
  address: 'dor1612@gmail.com',
  /** Prefixed so a mail rule can file these, and versioned so a reply knows the build. */
  subject: (version: string): string => `Tiny Tempo ${version} — help`,
  /**
   * Where Settings → Help → Feedback goes: a form, when a build names one in
   * `VITE_FEEDBACK_URL` — the closed test's, so every tester's note lands in one place Play's
   * production questions can be answered from — and otherwise a mail to the address above
   * with "feedback" in the subject. Only an https address is taken.
   */
  feedbackUrl: httpsUrl(import.meta.env.VITE_FEEDBACK_URL),
  feedbackSubject: (version: string): string => `Tiny Tempo ${version} — feedback`,
} as const;

function httpsUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'https:' ? url.href : null;
  } catch { return null; }
}
