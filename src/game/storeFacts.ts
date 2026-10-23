import { monetization } from '../monetization';
import { HEALTH, viewHealth, type Health } from './health';
import { loadReplayTimer } from './replayTimer';
import type { StoreFacts } from './store';

/**
 * What the store has to go on now, read once for every surface that shows it — the map's
 * card, Settings' row and the restart sheet — so the badge, the chip and the card never
 * disagree: the entitlement, the hearts, the running timer, the shelf, and whether Play
 * answered at all.
 */
export function readStoreFacts(health: Health, now: number = Date.now()): StoreFacts {
  const timer = loadReplayTimer(undefined, now);
  return {
    premium: monetization().premium(),
    hearts: viewHealth(health, now).hearts,
    heartsMax: HEALTH.max,
    timerExpiresAt: timer?.expiresAt ?? 0,
    held: timer?.shelf ?? [],
    available: monetization().purchasesAvailable(),
    now,
  };
}
