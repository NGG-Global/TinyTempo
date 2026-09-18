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
} as const;
