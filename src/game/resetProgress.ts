import { clearGateRecord } from './areaGates';
import { clearHearts } from './health';
import { clearKeptKeepsakes } from './keepsakeLegacy';
import { redrawToday } from './objectives';
import { clearProgress, clearTeachFlags, resetGeneration, setResetGeneration } from './progress';
import { setTutorialState } from './TutorialRun';

/**
 * Settings → Reset progress, as one decision: everything the road derives from the save,
 * and the device's own notes about that save, go together.
 *
 * Reset used to clear the save and the hearts and nothing else, and it did not hold.
 * Three things brought the old progression back. The teach flags stayed, so a reset player
 * never met the first-run pass or a rhythm's introduction again — the last-beat offbeat's
 * on level 11 among them. The gate record stayed, so every area the old save had opened
 * stood open over a road with no stars. And on a device signed in to Play Games the next
 * sync merged the cloud copy back, since the cloud only adds: the player cleared level 1
 * and watched their old frontier return. The generation stamped here is what the cloud
 * merge reads before it adds (`playgames/cloudSave.ts`), so the reset is the side that wins.
 *
 * What stays: settings and calibration (the device's, not the save's), purchases, the
 * refill ledger, the replay-timer shelf (paid for, or won), consent, the review record, the
 * daily restarts, the objectives' stamps (history, not the road's), the Daily Tempo day's
 * reward record (`tiny-tempo.daily.v1`, so a reset cannot pay the day out twice), and
 * Endless's device record, which is a leaderboard's and not the road's. The day's
 * objectives are drawn again.
 */
export interface ResetOutcome {
  /** Whether the save was removed and the generation stamped. False means storage refused. */
  readonly cleared: boolean;
  /** The generation the device now carries. */
  readonly generation: number;
}

export function resetProgress(storage: Storage | null = safeStorage()): ResetOutcome {
  const generation = resetGeneration(storage) + 1;
  const cleared = clearProgress(storage);
  clearTeachFlags(storage);
  setTutorialState('none', storage);
  clearGateRecord(storage);
  clearKeptKeepsakes(storage);
  clearHearts(storage);
  redrawToday(storage);
  return { cleared: cleared && setResetGeneration(generation, storage), generation };
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
