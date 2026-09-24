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
