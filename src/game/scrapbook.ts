import { VIGNETTES } from '../vignettes/registry';
import type { Progress } from './progress';
import { levelStars } from './stars';

/**
 * The Scrapbook: a keepsake for three stars on a designated level, and nothing else.
 *
 * **Ownership is derived, never stored.** A keepsake is owned exactly when its level has
 * three stars, and a level's stars are already derived — its best accuracy against its
 * own thresholds (`game/stars.ts`). So there is no second record that could disagree
 * with the first: a save code, an Auto Backup restore or `mergeProgress` carries the
 * whole collection without knowing it exists, a player who three-starred these levels
 * before the Scrapbook shipped owns their keepsakes the moment it does, and a keepsake
 * cannot be owned twice because it is a fact about a level, not an item in a list. The
 * thresholds it depends on are pinned by `tests/fixtures/level-thresholds.json`.
 *
 * **The rule is the level.** Keepsake `lap` of an act is earned by three stars on the level
 * where that act plays for the `lap`-th time: `registry index + 1 + lap × 25`. It is the
 * level whose look the keepsake shows — the second bug keepsake is the ladybird because
 * level 28's bug is the ladybird — and it is the one fact the Scrapbook prints under every
 * slot, found or not, so nobody has to guess what earns what. There is no chance in it
 * anywhere: no drop, no roll, no duplicate, no currency.
 *
 * **Append only.** `id` is the identity; `vignette` and `lap` fix the level. Changing any
 * of the three for an existing entry would move a keepsake players already hold, which is
 * the registry trap in miniature, so `tests/fixtures/keepsakes.json` pins them. New
 * keepsakes go at the end of `KEEPSAKE_LIST` — see `docs/SCRAPBOOK.md`.
 */

export interface Keepsake {
  /** Stable, lower-case, never renamed: it is the analytics id and the drawing's key. */
  readonly id: string;
  /** The act it belongs to, by registry id. */
  readonly vignette: string;
  /** Which of the act's appearances earns it: 0 is its first level, 1 its second, … */
  readonly lap: number;
  readonly name: string;
  /** Derived from `vignette` and `lap`: three stars here earns it. */
  readonly level: number;
}

type Entry = Omit<Keepsake, 'level'>;

/**
 * Every keepsake, in the order they were added. **Append new ones at the end.** The
 * Scrapbook groups them by act and orders them by lap, so where an entry sits in this
 * list only matters for keeping history honest, never for how the page reads.
 */
const KEEPSAKE_LIST: readonly Entry[] = [
  // The first set: one for each act's first appearance, levels 1–25.
  { id: 'hammer-lucky-nail', vignette: 'hammer', lap: 0, name: 'Lucky nail' },
  { id: 'window-squeegee', vignette: 'window', lap: 0, name: 'Squeegee' },
  { id: 'bug-plum-beetle', vignette: 'bug', lap: 0, name: 'Plum beetle pin' },
  { id: 'saw-pine-round', vignette: 'saw', lap: 0, name: 'Pine round' },
  { id: 'tomato-slice', vignette: 'tomato', lap: 0, name: 'Tomato slice' },
  { id: 'curl-coach-ribbon', vignette: 'curl', lap: 0, name: 'Coach’s ribbon' },
  { id: 'cucumber-coin', vignette: 'cucumber', lap: 0, name: 'Cucumber coin' },
  { id: 'banana-sticker', vignette: 'banana', lap: 0, name: 'Banana sticker' },
  { id: 'paper-star', vignette: 'paper', lap: 0, name: 'Paper star' },
  { id: 'egg-painted', vignette: 'egg', lap: 0, name: 'Painted egg' },
  { id: 'bubble-square', vignette: 'bubble', lap: 0, name: 'Bubble square' },
  { id: 'light-salon-switch', vignette: 'light', lap: 0, name: 'Salon switch' },
  { id: 'doorbell-ginger-bell', vignette: 'doorbell', lap: 0, name: 'Ginger’s bell' },
  { id: 'roller-swatch', vignette: 'roller', lap: 0, name: 'Paint swatch' },
  { id: 'bell-desk-bell', vignette: 'bell', lap: 0, name: 'Front-desk bell' },
  { id: 'balloon-red', vignette: 'balloon', lap: 0, name: 'Red balloon' },
  { id: 'stapler-note', vignette: 'stapler', lap: 0, name: 'Stapled note' },
  { id: 'fisherman-lure', vignette: 'fisherman', lap: 0, name: 'Brass lure' },
  { id: 'scratch-record', vignette: 'scratch', lap: 0, name: 'Seven-inch record' },
  { id: 'trombone-mouthpiece', vignette: 'trombone', lap: 0, name: 'Mouthpiece' },
  { id: 'clap-encore-ticket', vignette: 'clap', lap: 0, name: 'Encore ticket' },
  { id: 'snare-sticks', vignette: 'snare', lap: 0, name: 'Drumsticks' },
  { id: 'bongos-charm', vignette: 'bongos', lap: 0, name: 'Bongo charm' },
  { id: 'slushy-berry-cup', vignette: 'slushy', lap: 0, name: 'Berry slushy' },
  { id: 'apple-shiny', vignette: 'apple', lap: 0, name: 'Shiny apple' },
  // The second looks: the acts that change on their second appearance, levels 28–50.
  { id: 'bug-ladybird', vignette: 'bug', lap: 1, name: 'Ladybird pin' },
  { id: 'curl-sprinter-ribbon', vignette: 'curl', lap: 1, name: 'Sprinter’s ribbon' },
  { id: 'paper-butterfly', vignette: 'paper', lap: 1, name: 'Paper butterfly' },
  { id: 'light-kitchen-switch', vignette: 'light', lap: 1, name: 'Kitchen switch' },
  { id: 'doorbell-crimson-knocker', vignette: 'doorbell', lap: 1, name: 'Crimson knocker' },
  { id: 'slushy-blue-cup', vignette: 'slushy', lap: 1, name: 'Blue slushy' },
  { id: 'apple-pear', vignette: 'apple', lap: 1, name: 'Ripe pear' },
];

/** The level where an act plays for the `lap`-th time: the rotation, read backwards. */
export function levelOf(vignette: string, lap: number): number {
  const index = VIGNETTES.findIndex(definition => definition.id === vignette);
  if (index < 0 || !Number.isInteger(lap) || lap < 0) throw new Error(`No level for ${vignette} lap ${lap}.`);
  return index + 1 + lap * VIGNETTES.length;
}

export const KEEPSAKES: readonly Keepsake[] = Object.freeze(
  KEEPSAKE_LIST.map(entry => Object.freeze({ ...entry, level: levelOf(entry.vignette, entry.lap) })),
);

const BY_LEVEL: ReadonlyMap<number, Keepsake> = new Map(KEEPSAKES.map(keepsake => [keepsake.level, keepsake]));

/** The keepsake three stars on this level earns, or null. At most one per level. */
export function keepsakeAt(level: number): Keepsake | null {
  return BY_LEVEL.get(level) ?? null;
}

export function ownsKeepsake(progress: Progress, keepsake: Keepsake): boolean {
  return levelStars(progress, keepsake.level) === 3;
}

export function ownedKeepsakes(progress: Progress): readonly Keepsake[] {
  return KEEPSAKES.filter(keepsake => ownsKeepsake(progress, keepsake));
}

export function collectionCount(progress: Progress): { readonly owned: number; readonly total: number } {
  return { owned: ownedKeepsakes(progress).length, total: KEEPSAKES.length };
}

/**
 * The keepsake a finished level has just earned: its level went from under three stars to
 * three. Null for a level that already had them — a replay that matches its old best
 * earns nothing new, which is what keeps "no duplicates" true at the moment of reveal too.
 */
export function keepsakeEarned(before: Progress, after: Progress, level: number): Keepsake | null {
  const keepsake = keepsakeAt(level);
  if (!keepsake) return null;
  return !ownsKeepsake(before, keepsake) && ownsKeepsake(after, keepsake) ? keepsake : null;
}

/** How a slot says what earns it, found or not. */
export function earnedBy(keepsake: Keepsake): string {
  return `Three stars on level ${keepsake.level}`;
}

export interface ScrapbookPage {
  readonly vignette: string;
  readonly keepsakes: readonly Keepsake[];
}

/** The Scrapbook's order: acts in the rotation's order, each act's keepsakes by lap. */
export function scrapbookPages(): readonly ScrapbookPage[] {
  return VIGNETTES
    .map(definition => ({
      vignette: definition.id,
      keepsakes: KEEPSAKES.filter(k => k.vignette === definition.id).sort((a, b) => a.lap - b.lap),
    }))
    .filter(page => page.keepsakes.length > 0);
}
