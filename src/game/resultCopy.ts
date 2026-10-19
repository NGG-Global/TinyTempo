import { areaOf, type LevelSpec } from './levels';
import { areaIndexOf, starsRequired } from './stars';

/**
 * The words the result screen shows around its stars. Pure, so the rules are tested
 * without a scene. Every number is read from the level's own spec or from the star gates,
 * never written down: `tests/fixtures/level-thresholds.json` pins the thresholds, and a
 * second copy here could only ever disagree with them.
 */

/** The chip under each seat: the accuracy that earns that star on this level. */
export function thresholdLabels(spec: Pick<LevelSpec, 'starAccuracy'>): readonly [string, string, string] {
  const [one, two, three] = spec.starAccuracy;
  return [`${one}%`, `${two}%`, `${three}%`];
}

/**
 * The score under the medals, as a whole percent, **rounded down**. Every threshold is a
 * whole percent and `starsFor` compares the unrounded accuracy, so rounding to nearest
 * showed "79%" over an unlit 79% star for a 78.6 — the number said the star was earned and
 * the medal said it was not. Rounded down, the score reaches a chip's number exactly when
 * the star is lit, and only a flawless 100 reads 100%.
 */
export function scoreLabel(accuracy: number): string {
  const shown = Number.isFinite(accuracy) ? Math.max(0, Math.min(100, Math.floor(accuracy))) : 0;
  return `${shown}%`;
}

const ORDINALS = ['First', 'Second', 'Third'] as const;

/**
 * What the next star asks for — "Third star at 85%" — or null once all three are earned.
 * A missed star used to say nothing about what it would take; the thresholds existed and
 * were never shown.
 */
export function nextStarCopy(stars: number, thresholds: readonly [number, number, number]): string | null {
  if (!Number.isInteger(stars) || stars < 0 || stars >= 3) return null;
  return `${ORDINALS[stars]} star at ${thresholds[stars]}%`;
}

/**
 * Whether the result offers a replay of the same level: every clear short of three stars.
 * A failed level already has Try again as its one action, and replaying a finished level
 * never costs a heart, so the offer is never a price.
 */
export function offersReplay(cleared: boolean, stars: number): boolean {
  return cleared && stars < 3;
}

export function replayCopy(level: number): string {
  return `Replay level ${level}`;
}

export interface GateChip {
  readonly text: string;
  readonly open: boolean;
  /** The next area's own colours: its ground behind its ink. */
  readonly ground: number;
  readonly ink: number;
}

/**
 * A cleared finale's word on the area after it: open already, or the collection it asks
 * for. Read against the stars the player now has, so the finale that tips them over the
 * gate says so on the same screen.
 */
export function nextGateChip(level: number, stars: number): GateChip {
  const next = level + 1;
  const { area, name } = areaOf(next);
  const required = starsRequired(areaIndexOf(next));
  const open = stars >= required;
  return { text: open ? `${name} is open` : `${name} opens at ${required}`, open, ground: area.ground, ink: area.ink };
}

/** What a progress line is about, for the glyph drawn beside it. */
export type ProgressKind = 'stars' | 'best' | 'next';

export interface ProgressLine { readonly kind: ProgressKind; readonly text: string }

export interface ResultProgress {
  readonly level: number;
  /** This run's unrounded accuracy. */
  readonly accuracy: number;
  readonly cleared: boolean;
  /** The saved best before this run, or null on a first clear. */
  readonly bestBefore: number | null;
  /** The level's stars before and after this run, from the saved best. */
  readonly starsBefore: number;
  readonly starsAfter: number;
  /** Every star on the road after this run. */
  readonly totalStars: number;
  /** A finale's own card already says what opens next, so it gets no "Up next". */
  readonly finale: boolean;
}

/**
 * What this run changed, at most two lines under the plaque: the stars it added to the
 * collection, a new best over the saved one, and — on a first clear, where Continue does
 * lead on — the next level. Nothing on a run that changed
 * nothing: a replay below its best gets no row rather than a row saying so.
 *
 * Percentages are rounded down, as `scoreLabel` rounds the score above them, so "up from
 * 74%" never names a number the old plaque did not show; and a best that rose by less than
 * a whole percent is not called new, because both numbers would read the same.
 */
export function progressCopy(p: ResultProgress): readonly ProgressLine[] {
  const lines: ProgressLine[] = [];
  const gained = p.starsAfter - p.starsBefore;
  if (p.cleared && gained > 0) lines.push({ kind: 'stars', text: `+${gained} ${gained === 1 ? 'star' : 'stars'} · ${p.totalStars} in all` });
  if (p.cleared && p.bestBefore !== null && Math.floor(p.accuracy) > Math.floor(p.bestBefore)) {
    lines.push({ kind: 'best', text: `New best, up from ${Math.max(0, Math.floor(p.bestBefore))}%` });
  }
  // Only a finale stands before a star gate, and its card already names the gate, so the
  // level after any other first clear is always open.
  if (p.cleared && p.bestBefore === null && !p.finale) lines.push({ kind: 'next', text: `Up next: level ${p.level + 1}` });
  return lines.slice(0, 2);
}
