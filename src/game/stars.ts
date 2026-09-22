import { PROGRESSION } from '../config/progression';
import { levelSpec, starsFor } from './levels';
import type { Progress } from './progress';

/**
 * The star collection, and the gates it opens.
 *
 * Nothing here is stored. A level's stars are `starsFor(best)` and the collection is
 * their sum, so the save code, Auto Backup and `mergeProgress` all carry the stars
 * without knowing it — a second copy of the count could only ever disagree with the
 * accuracies it was summed from, and a merged save would have had to reconcile two.
 */

/** Stars a level has earned: its best accuracy against its own bars. */
export function levelStars(progress: Progress, level: number): 0 | 1 | 2 | 3 {
  const best = progress.best[level];
  if (typeof best !== 'number' || !Number.isFinite(best)) return 0;
  return starsFor(best, levelSpec(level));
}

/** Every star on the road, wherever it was earned. */
export function totalStars(progress: Progress): number {
  let total = 0;
  for (const level of Object.keys(progress.best)) {
    const n = Number(level);
    if (Number.isInteger(n) && n >= 1) total += levelStars(progress, n);
  }
  return total;
}

/** The area an area index starts at, and the index a level sits in. Areas start at 0. */
export function areaIndexOf(level: number): number {
  return Math.floor((Math.max(1, level) - 1) / PROGRESSION.areaSize);
}
export function firstLevelOfArea(area: number): number {
  return Math.max(0, area) * PROGRESSION.areaSize + 1;
}

/** Stars an area asks for before its first level will start. The first area is free. */
export function starsRequired(area: number): number {
  if (!Number.isInteger(area) || area <= 0) return 0;
  const { firstArea, growth, maxPerArea } = PROGRESSION.starGate;
  let total = 0;
  for (let behind = 0; behind < area; behind++) total += Math.min(maxPerArea, firstArea + growth * behind);
  return total;
}

export function areaOpen(area: number, stars: number): boolean {
  return stars >= starsRequired(area);
}

/** The lowest area still closed for this many stars. Every area below it is open. */
export function firstClosedArea(stars: number): number {
  // Requirements only grow, so the first closed area is a scan, and it ends: each area
  // asks at least one more star than the last.
  let area = 1;
  while (areaOpen(area, stars)) area++;
  return area;
}

/** What a finished level hands the map: the stars it had before and has now. */
export interface EarnedStars { readonly level: number; readonly before: number; readonly after: number }

export interface StarGate {
  /** The area index the gate opens, and the level the barrier stands in front of. */
  readonly area: number;
  readonly level: number;
  readonly required: number;
  readonly have: number;
  /** Stars still to find. Zero means open. */
  readonly short: number;
}

/** The gate the player is working toward: the first one their stars do not open. */
export function nextGate(progress: Progress): StarGate {
  const have = totalStars(progress);
  const area = firstClosedArea(have);
  const required = starsRequired(area);
  return { area, level: firstLevelOfArea(area), required, have, short: Math.max(0, required - have) };
}

/**
 * Whether the star gates hold this level back.
 *
 * A cleared level is never held: replaying what was earned is the very thing the gate
 * asks for, and it never costs a heart. So the gate only ever holds an *uncleared*
 * level in a closed area — in practice the frontier, standing at an area's first stop.
 */
export function gateHolds(progress: Progress, level: number): boolean {
  if (levelStars(progress, level) > 0) return false;
  return !areaOpen(areaIndexOf(level), totalStars(progress));
}

/** Playable from the map: reached, and not held behind a star gate. */
export function canPlayLevel(progress: Progress, level: number): boolean {
  if (!Number.isInteger(level) || level < 1 || level > progress.unlocked) return false;
  return !gateHolds(progress, level);
}

/** The gate standing in front of this level, if one does. */
export function gateFor(progress: Progress, level: number): StarGate | null {
  if (!gateHolds(progress, level)) return null;
  const area = areaIndexOf(level);
  const have = totalStars(progress);
  const required = starsRequired(area);
  return { area, level: firstLevelOfArea(area), required, have, short: Math.max(0, required - have) };
}
