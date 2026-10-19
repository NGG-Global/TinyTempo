import { areaOf } from './levels';
import type { Progress } from './progress';
import { areaOpen, firstClosedArea, firstLevelOfArea, totalStars } from './stars';

/**
 * Opening an area is something the player does.
 *
 * The stars decide when a gate *may* open (`game/stars.ts`); a gate whose ask is met is
 * **ready**, and stays across the road until the player taps it, which plays the unlock
 * and stamps the area's badge into the Scrapbook. Before this, the bar lifted by itself on
 * the landing star, and an area arrived as a side effect of a result.
 *
 * What is stored is only what the stars cannot say: the highest area this device has
 * opened by its gate (`tiny-tempo.gates.v1`). Everything else is derived. An area is open
 * when it is at or below that record, **or when the player has already gone past its first
 * level** — so a save code, a cloud restore or a merge that carries progress into an area
 * never leaves its gate standing behind the player, and a cleared level is still never
 * held. The record is device-local, like the teach flags, and travels in no save.
 *
 * On a device's first launch of this build the record starts at every gate the save's
 * stars already meet (`recordGateBaseline`): those areas were opened under the old rule,
 * and asking a player to tap open a road they have walked would be a chore, not a reward.
 */
export const GATE_RECORD_KEY = 'tiny-tempo.gates.v1';

export interface GateRecord {
  /** The highest area index opened by its gate. 0 means only the first area. */
  readonly opened: number;
}

export type GateState = 'closed' | 'ready' | 'open';

/** The most areas a record may claim: far past any road, and a bound on a tampered value. */
const MAX_AREA = 10_000;

/** Whether the player has already gone past an area's first level: they are in it. */
export function areaEntered(area: number, progress: Progress): boolean {
  return area <= 0 || progress.unlocked > firstLevelOfArea(area);
}

export function areaOpened(area: number, progress: Progress, record: GateRecord): boolean {
  return area <= record.opened || areaEntered(area, progress);
}

/** Closed while the stars fall short, ready once they meet it, open once tapped (or passed). */
export function gateState(area: number, stars: number, progress: Progress, record: GateRecord): GateState {
  if (area < 1 || areaOpened(area, progress, record)) return 'open';
  return areaOpen(area, stars) ? 'ready' : 'closed';
}

/** The first gate still standing: the one the map draws live. Every area below it is open. */
export function lowestUnopened(progress: Progress, record: GateRecord): number {
  let area = 1;
  while (areaOpened(area, progress, record) && area < MAX_AREA) area++;
  return area;
}

/** The record a device starts from: every gate its stars meet today counts as opened. */
export function baselineRecord(progress: Progress): GateRecord {
  return { opened: Math.max(0, firstClosedArea(totalStars(progress)) - 1) };
}

/** A record opened through `area`, never lowered. */
export function withOpened(record: GateRecord, area: number): GateRecord {
  return { opened: Math.max(record.opened, Math.min(MAX_AREA, Math.max(0, Math.floor(area)))) };
}

/**
 * An area's badge is the player's once they have opened it. The first area's is earned on
 * the first cleared level, so the collection starts with a find rather than a gift.
 */
export function ownsAreaBadge(area: number, progress: Progress, record: GateRecord): boolean {
  if (area === 0) return progress.unlocked > 1;
  return area > 0 && areaOpened(area, progress, record);
}

/**
 * The badges the Scrapbook shows: every area of the first lap of the road, and past that as
 * far as the next area still to open, so the page always has one silhouette to aim at.
 */
export function badgeAreas(progress: Progress, record: GateRecord, firstLap: number): readonly number[] {
  const last = Math.max(firstLap - 1, lowestUnopened(progress, record));
  return Array.from({ length: last + 1 }, (_, i) => i);
}

/** An area's badge name: the area's own, lap numeral included ("Grass II"). */
export function badgeName(area: number): string {
  return areaOf(firstLevelOfArea(area)).name;
}

// ---------------------------------------------------------------- storage

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

/** The stored record, or null when there is none or it is not a record. */
export function loadGateRecord(storage: Storage | null = safeStorage()): GateRecord | null {
  try {
    const raw = storage?.getItem(GATE_RECORD_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const opened = typeof parsed === 'object' && parsed !== null ? (parsed as { opened?: unknown }).opened : undefined;
    return typeof opened === 'number' && Number.isInteger(opened) && opened >= 0 && opened <= MAX_AREA ? { opened } : null;
  } catch { return null; }
}

function saveGateRecord(record: GateRecord, storage: Storage | null): boolean {
  try {
    storage?.setItem(GATE_RECORD_KEY, JSON.stringify({ version: 1, opened: record.opened }));
    return storage !== null;
  } catch { return false; }
}

/**
 * The record, writing the baseline first if this device has none. Run once at boot, before
 * any level can be played, so a gate met under the old rule is never asked for again.
 */
export function recordGateBaseline(progress: Progress, storage: Storage | null = safeStorage()): GateRecord {
  const stored = loadGateRecord(storage);
  if (stored) return stored;
  const baseline = baselineRecord(progress);
  saveGateRecord(baseline, storage);
  return baseline;
}

/** The record as it stands; a device that has none reads as its baseline. */
export function loadGates(progress: Progress, storage: Storage | null = safeStorage()): GateRecord {
  return loadGateRecord(storage) ?? baselineRecord(progress);
}

/**
 * The player tapped a ready gate open. Written before the unlock plays, so an app closed
 * mid-ceremony keeps the area. False means nothing was written; the area is open for the
 * session regardless, since the scene holds the record it returned.
 */
export function openArea(area: number, progress: Progress, storage: Storage | null = safeStorage()): { readonly record: GateRecord; readonly saved: boolean } {
  const record = withOpened(loadGates(progress, storage), area);
  return { record, saved: saveGateRecord(record, storage) };
}
