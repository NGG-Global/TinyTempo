import { PROGRESSION } from '../config/progression';

/**
 * The star-gate curve, as data a balancing change can be read against.
 *
 * Production still asks whatever `PROGRESSION.starGate` says — today 12, then 13, then
 * 14 and the cap. This module is how a different ask is *looked at*: pass other knobs
 * and the same checks that guard the shipped curve say whether the preview still
 * climbs, still respects the cap, and can still be earned. Nothing here is loaded at
 * runtime from anywhere but the progression constant.
 */

/** The three knobs. `firstArea` is the second area's ask; later areas add `growth`, up to `maxPerArea`. */
export interface StarGateKnobs {
  readonly firstArea: number;
  readonly growth: number;
  readonly maxPerArea: number;
}

/** One area on the curve. `area` is 1-based: area 1 is levels 1–10 and is free. */
export interface GateStep {
  readonly area: number;
  /** First level of the area. The barrier, when there is one, stands in front of it. */
  readonly level: number;
  /** Stars required to enter. Zero for the first area. */
  readonly required: number;
  /** Stars this area adds over the previous requirement. */
  readonly added: number;
  /** Stars the levels behind this area can hold, at three a level. */
  readonly behindStars: number;
  /** `required` as a percentage of `behindStars`, rounded. Zero when nothing is behind. */
  readonly share: number;
  /** The per-area share was cut down to `maxPerArea`. */
  readonly capped: boolean;
}

const SHIPPED: StarGateKnobs = PROGRESSION.starGate;

/** Stars one area behind a gate contributes: `firstArea`, then `growth` more, never past the cap. */
export function areaShare(behind: number, knobs: StarGateKnobs = SHIPPED): number {
  if (!Number.isInteger(behind) || behind < 0) return 0;
  return Math.min(knobs.maxPerArea, knobs.firstArea + knobs.growth * behind);
}

/**
 * Stars an area asks for before its first level will start.
 * Area 0 (and anything that is not a positive integer) is free.
 */
export function starsRequiredFor(area: number, knobs: StarGateKnobs = SHIPPED): number {
  if (!Number.isInteger(area) || area <= 0) return 0;
  let total = 0;
  for (let behind = 0; behind < area; behind++) total += areaShare(behind, knobs);
  return total;
}

/** The first `areas` areas, area 1 first. */
export function gateCurve(
  areas: number,
  knobs: StarGateKnobs = SHIPPED,
  areaSize: number = PROGRESSION.areaSize,
): readonly GateStep[] {
  const count = Number.isInteger(areas) && areas > 0 ? areas : 0;
  const steps: GateStep[] = [];
  for (let area = 1; area <= count; area++) {
    const index = area - 1;
    const required = starsRequiredFor(index, knobs);
    const previous = area === 1 ? 0 : starsRequiredFor(index - 1, knobs);
    const behindStars = 3 * areaSize * index;
    const uncapped = area === 1 ? 0 : knobs.firstArea + knobs.growth * (index - 1);
    steps.push({
      area,
      level: index * areaSize + 1,
      required,
      added: required - previous,
      behindStars,
      share: behindStars === 0 ? 0 : Math.round((100 * required) / behindStars),
      capped: area > 1 && uncapped > knobs.maxPerArea,
    });
  }
  return steps;
}

/**
 * Whether a generated curve is safe to ship.
 *
 * Safe means: the first area is free, every later ask is higher than the last, no area
 * adds more than `maxPerArea`, each step is exactly the knobs, and no gate asks for more
 * stars than the levels behind it can hold — a gate past that can never open, which
 * locks the campaign.
 */
export function validateGateCurve(
  steps: readonly GateStep[],
  knobs: StarGateKnobs = SHIPPED,
  areaSize: number = PROGRESSION.areaSize,
): readonly string[] {
  const problems: string[] = [];
  if (!Number.isInteger(knobs.firstArea) || knobs.firstArea < 1) problems.push('firstArea must be a positive integer');
  if (!Number.isInteger(knobs.growth) || knobs.growth < 0) problems.push('growth must be a non-negative integer');
  if (!Number.isInteger(knobs.maxPerArea) || knobs.maxPerArea < 1) problems.push('maxPerArea must be a positive integer');
  if (!Number.isInteger(areaSize) || areaSize < 1) problems.push('areaSize must be a positive integer');

  steps.forEach((step, index) => {
    const area = index + 1;
    const at = `area ${area}`;
    if (step.area !== area) problems.push(`${at} is numbered ${step.area}`);
    const required = starsRequiredFor(area - 1, knobs);
    const previous = area === 1 ? 0 : starsRequiredFor(area - 2, knobs);
    const behindStars = 3 * areaSize * (area - 1);
    if (step.required !== required) problems.push(`${at} requires ${step.required}, knobs give ${required}`);
    if (step.added !== required - previous) problems.push(`${at} adds ${step.added}, knobs add ${required - previous}`);
    if (step.behindStars !== behindStars) problems.push(`${at} counts ${step.behindStars} stars behind it, not ${behindStars}`);
    if (area === 1 && required !== 0) problems.push('area 1 must be free');
    if (area > 1 && required <= previous) problems.push(`${at} does not ask for more than area ${area - 1}`);
    if (area > 1 && step.added > knobs.maxPerArea) problems.push(`${at} adds ${step.added}, above the cap of ${knobs.maxPerArea}`);
    if (required > behindStars) problems.push(`${at} asks for ${required}, and only ${behindStars} can be earned behind it`);
  });
  return problems;
}

/** A fixed-width table of the curve, for a diff a person can read. */
export function formatGateCurve(steps: readonly GateStep[]): string {
  const header = 'area  level  required  added  behind  share  capped';
  const rows = steps.map(step => [
    String(step.area).padStart(4),
    String(step.level).padStart(5),
    String(step.required).padStart(8),
    String(step.added).padStart(5),
    String(step.behindStars).padStart(6),
    `${step.share}%`.padStart(5),
    step.capped ? 'yes' : 'no',
  ].join('  '));
  return [header, ...rows].join('\n');
}
