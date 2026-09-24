import { PROGRESSION } from '../config/progression';
import { areaLevels, areaOf, isAreaFinale, mapLevelState, type MapLevelState } from './levels';

/**
 * Area finales: what the last level of each area is, and how it is dressed.
 *
 * Pure — no Phaser — so the map, PlayScene and the tests read one answer. Which levels are
 * finales is `isAreaFinale` in `levels.ts`, from `PROGRESSION.areaSize` alone; this module
 * adds the presentation: the area it closes, the next one, and the **treatment** it wears.
 *
 * **A treatment is data, not code.** `ui/finaleStage.ts` draws every finale from one of
 * these — the pennants strung over the stage, the title card, the ribbon that says the
 * area is complete — so an area gets a finale of its own by adding an entry to
 * `FINALE_TREATMENTS`, and a new `motif` by teaching the stage one more drawing. PlayScene
 * does not know which area it is in. An area without an entry wears `DEFAULT_TREATMENT`.
 *
 * Nothing here changes the level's rules: the clear bar, the stars, the heart an attempt
 * spends and what a clear unlocks are every level's (`game/health.ts`, `game/progress.ts`).
 */

/** What is strung over the stage for the whole finale. */
export type FinaleMotif = 'bunting' | 'lanterns';

export interface FinaleTreatment {
  /** Stable and lower-case: the analytics value, never renamed. */
  readonly id: string;
  readonly motif: FinaleMotif;
  /** The pennants' (or lanterns') colours, repeated along the line. */
  readonly pennants: readonly number[];
  /** The ribbon the title card and the payoff are printed on. */
  readonly ribbon: number;
  /** Ink on the ribbon. Checked against `ribbon` for contrast by `tests/finale.test.ts`. */
  readonly ribbonInk: number;
  /** The payoff's confetti. */
  readonly confetti: readonly number[];
}

export const DEFAULT_TREATMENT: FinaleTreatment = Object.freeze({
  id: 'default',
  motif: 'bunting',
  pennants: [0xcf5134, 0xdfc37f, 0xfff4dc, 0x243e35],
  // The game's ink rather than its coral: cream on coral is 3.9:1, fine for a button's
  // one word and too low for a card read over a moving scene.
  ribbon: 0x243e35,
  ribbonInk: 0xfff4dc,
  confetti: [0xcf5134, 0xdfc37f, 0xfff4dc, 0xf2c14e],
});

/**
 * One entry per area, keyed by the area's base name (`AREAS` in `levels.ts`), so Grass II
 * dresses like Grass. Add an entry to give an area its own finale; nothing else changes.
 */
export const FINALE_TREATMENTS: Readonly<Record<string, FinaleTreatment>> = Object.freeze({
  Grass: Object.freeze({
    id: 'grass', motif: 'bunting',
    pennants: [0xcf5134, 0xf2c14e, 0x5b8c3a, 0xfff4dc],
    ribbon: 0x3f6b35, ribbonInk: 0xfff4dc,
    confetti: [0xcf5134, 0xf2c14e, 0x8fbf5a, 0xfff4dc],
  }),
  Pavement: Object.freeze({
    id: 'pavement', motif: 'bunting',
    pennants: [0xf2c14e, 0x35322f, 0xcf5134, 0xf5f2ee],
    ribbon: 0x35322f, ribbonInk: 0xf2c14e,
    confetti: [0xf2c14e, 0xcf5134, 0xf5f2ee, 0x7a746f],
  }),
  Sand: Object.freeze({
    id: 'sand', motif: 'bunting',
    pennants: [0x2e8fa3, 0xfff7e6, 0xe0823d, 0xf2c14e],
    ribbon: 0x236b7c, ribbonInk: 0xfff7e6,
    confetti: [0x2e8fa3, 0xe0823d, 0xf2c14e, 0xfff7e6],
  }),
  Snow: Object.freeze({
    id: 'snow', motif: 'bunting',
    pennants: [0xb8323a, 0xffffff, 0x2d6a4f, 0x9eb4c6],
    ribbon: 0xa82e36, ribbonInk: 0xffffff,
    confetti: [0xffffff, 0xb8323a, 0x9eb4c6, 0xdfe8f0],
  }),
  Dusk: Object.freeze({
    id: 'dusk', motif: 'lanterns',
    pennants: [0xf2b35a, 0xe0703d, 0xf6d98a, 0xd9564a],
    ribbon: 0x2a2236, ribbonInk: 0xf6d98a,
    confetti: [0xf2b35a, 0xf6d98a, 0xe0703d, 0xf3e7d8],
  }),
});

export function finaleTreatment(level: number): FinaleTreatment {
  return FINALE_TREATMENTS[areaOf(level).area.name] ?? DEFAULT_TREATMENT;
}

export interface AreaFinale {
  readonly level: number;
  /** 1-based, as analytics counts areas: area 1 closes at the first finale. */
  readonly area: number;
  /** With its numeral on a later lap: "Grass II". */
  readonly areaName: string;
  /** The area a clear walks into. */
  readonly nextAreaName: string;
  readonly treatment: FinaleTreatment;
}

/** The finale this level is, or null for every other level. */
export function areaFinale(level: number): AreaFinale | null {
  if (!isAreaFinale(level)) return null;
  const { index, name } = areaOf(level);
  return Object.freeze({
    level, area: index + 1, areaName: name,
    nextAreaName: areaOf(level + 1).name,
    treatment: finaleTreatment(level),
  });
}

/** The title card's words. The area's name is the headline; these sit around it. */
export const FINALE_COPY = Object.freeze({
  eyebrow: 'Area finale',
  strapline: (areaName: string) => `The best of ${areaName}, one more time`,
  complete: 'Area complete',
});

/** The finale of the area a level sits in, and how many stops away it is. */
export function nextFinale(level: number): { readonly level: number; readonly away: number } {
  const finale = areaLevels(level).finale;
  return { level: finale, away: finale - level };
}

/** One bead of the dock's trail: a stop in the frontier's area. */
export interface TrailBead {
  readonly level: number;
  readonly finale: boolean;
  readonly state: 'done' | 'current' | 'ahead';
}

/**
 * The dock's row of beads for the area the frontier stands in: one per stop, the last one
 * the finale, so the destination is on screen from the area's first level.
 */
export function areaTrail(frontier: number): readonly TrailBead[] {
  const { first } = areaLevels(frontier);
  return Array.from({ length: PROGRESSION.areaSize }, (_, i) => {
    const level = first + i;
    return { level, finale: isAreaFinale(level), state: level < frontier ? 'done' : level === frontier ? 'current' : 'ahead' };
  });
}

/**
 * How the map marks a finale stop, from the same state its puck is drawn in: every finale
 * in the window carries its flag, locked and previewed ones included, which is what says
 * "something is coming" a dozen levels before it arrives. `complete` once it is cleared.
 */
export function finaleMapMark(level: number, unlocked: number): { readonly state: MapLevelState; readonly complete: boolean } | null {
  if (!isAreaFinale(level)) return null;
  const state = mapLevelState(level, unlocked);
  return { state, complete: state === 'cleared' };
}
