/**
 * The third batch of Play Games achievements, as Play Console imports them.
 *
 * Nothing in the game reads this file. It is the source for
 * `scripts/achievement-import.mjs`, which writes the Console's import ZIP
 * (`store/achievements/`), and for `tests/achievementImport.test.ts`, which holds every
 * row to the import's rules before anyone uploads it. Once the Console has created them,
 * each one is appended to `ACHIEVEMENTS` in `config/achievements.ts` with the id the
 * Console gave it, which is where an achievement starts to be earned.
 *
 * `earn` is the rule each one will be given, written in the shapes `ACHIEVEMENTS` uses or
 * will need. Every one is derived from something the game already keeps (the save, the
 * Scrapbook, the Endless record, the daily stamps), so, like the first ten, none needs a
 * ledger of its own. The shapes `ACHIEVEMENTS` does not have yet are `stars`,
 * `threeStarLevels`, `mastered`, `areaSweep`, `keepsakes` and `stamps`.
 *
 * **Points.** Google's current guide gives a game 2,000 points in all; an older page of
 * Google's says 1,000. This batch is 565, so the whole game stays under 1,000 as long as the
 * ten already in the Console total 435 or less.
 */
export type AchievementArt =
  | 'first-downbeat' | 'offbeat' | 'long-phrase' | 'triplets' | 'sixteenths'
  | 'three-stars' | 'first-keepsake' | 'pocket-1' | 'pocket-10' | 'pocket-25'
  | 'stamp-day' | 'stamp-week' | 'stamp-month'
  | 'stars-50' | 'stars-150' | 'stars-300' | 'clean-sweep'
  | 'keepsakes-12' | 'keepsakes-36' | 'full-cast'
  | 'endless-900s' | 'endless-runs-25'
  | `area-${number}`;

export type AchievementRule =
  | { readonly clearLevel: number }
  | { readonly threeStarLevels: number }
  | { readonly stars: number }
  | { readonly mastered: number }
  | { readonly areaSweep: number }
  | { readonly keepsakes: number }
  | { readonly stamps: number }
  | { readonly endlessMs: number }
  | { readonly endlessRuns: number };

export interface ImportedAchievement {
  /** The key it will take in `ACHIEVEMENTS`. */
  readonly key: string;
  /** Play's default-locale name: unique, at most 100 characters, no commas. */
  readonly name: string;
  /** At most 500 characters, no commas. */
  readonly description: string;
  /** A multiple of 5 from 5 to 200. */
  readonly points: number;
  /** Where it sits in the player's list; the ten already created hold 1 to 10. */
  readonly order: number;
  readonly earn: AchievementRule;
  readonly art: AchievementArt;
}

/**
 * The names already in the Console, which a new name must not repeat. The five finale
 * names are the ones `docs/ACHIEVEMENTS.md` gave the Console; the Endless five are as the
 * import created them.
 */
export const CONSOLE_NAMES: readonly string[] = Object.freeze([
  'Grass Complete', 'Pavement Complete', 'Sand Complete', 'Snow Complete', 'Dusk Complete',
  'Century of Tempo', 'Going On and On', 'Bronze Tempo', 'Silver Tempo', 'Golden Tempo',
]);

/** Area finales past Dusk. Level 100 closes Space and is already *Century of Tempo*. */
const FINALES: readonly (readonly [level: number, area: number, name: string, points: number])[] = [
  [60, 5, 'Garden', 15], [70, 6, 'Swamp', 15], [80, 7, 'Village', 20], [90, 8, 'Castle', 20],
  [110, 10, 'Candy', 25], [120, 11, 'Haunted', 25], [130, 12, 'Hollywood', 30], [140, 13, 'Art Deco', 30],
];

const ROWS: readonly Omit<ImportedAchievement, 'order'>[] = [
  // The first session: things a new player can do on day one.
  { key: 'clear-1', name: 'First Downbeat', description: 'Clear your first level.', points: 5, earn: { clearLevel: 1 }, art: 'first-downbeat' },
  { key: 'three-stars-1', name: 'Three for Three', description: 'Earn three stars on any level.', points: 5, earn: { threeStarLevels: 1 }, art: 'three-stars' },
  { key: 'keepsake-1', name: 'Something to Keep', description: 'Earn your first keepsake for the Scrapbook.', points: 5, earn: { keepsakes: 1 }, art: 'first-keepsake' },
  { key: 'clear-6', name: 'Between the Beats', description: 'Clear level 6 where the offbeat first appears.', points: 5, earn: { clearLevel: 6 }, art: 'offbeat' },
  { key: 'stamps-1', name: 'Stamped', description: 'Complete all three daily objectives in one day.', points: 5, earn: { stamps: 1 }, art: 'stamp-day' },
  { key: 'mastered-1', name: 'In the Pocket', description: 'Master a level by hitting every beat Perfect with no extra taps.', points: 10, earn: { mastered: 1 }, art: 'pocket-1' },
  // New rhythms, on the level each is first asked for (`game/conceptIntro.ts`).
  { key: 'clear-18', name: 'The Long Phrase', description: 'Clear level 18 where two-bar phrases begin.', points: 5, earn: { clearLevel: 18 }, art: 'long-phrase' },
  { key: 'clear-43', name: 'Triplet Time', description: 'Clear level 43 where triplets begin.', points: 10, earn: { clearLevel: 43 }, art: 'triplets' },
  { key: 'clear-59', name: 'Sixteenth Notes', description: 'Clear level 59 where sixteenth notes begin.', points: 15, earn: { clearLevel: 59 }, art: 'sixteenths' },
  // Collections that grow with the road.
  { key: 'stars-50', name: 'Star Collector', description: 'Collect 50 stars.', points: 10, earn: { stars: 50 }, art: 'stars-50' },
  { key: 'stamps-7', name: 'A Week of Stamps', description: 'Earn 7 daily objective stamps.', points: 10, earn: { stamps: 7 }, art: 'stamp-week' },
  { key: 'keepsakes-12', name: 'Scrapbooker', description: 'Collect 12 keepsakes for the Scrapbook.', points: 15, earn: { keepsakes: 12 }, art: 'keepsakes-12' },
  { key: 'area-sweep-1', name: 'Clean Sweep', description: 'Earn three stars on every level of one area.', points: 20, earn: { areaSweep: 1 }, art: 'clean-sweep' },
  { key: 'mastered-10', name: 'Groove Master', description: 'Master 10 levels.', points: 20, earn: { mastered: 10 }, art: 'pocket-10' },
  { key: 'stars-150', name: 'Constellation', description: 'Collect 150 stars.', points: 20, earn: { stars: 150 }, art: 'stars-150' },
  ...FINALES.map(([level, area, name, points]) => ({
    key: `clear-${level}`, name: `${name} Complete`, description: `Clear level ${level} and complete ${name}.`, points, earn: { clearLevel: level }, art: `area-${area}` as const,
  })),
  // The long game.
  { key: 'stamps-30', name: 'A Month of Stamps', description: 'Earn 30 daily objective stamps.', points: 25, earn: { stamps: 30 }, art: 'stamp-month' },
  { key: 'keepsakes-36', name: 'Treasure Trove', description: 'Collect 36 keepsakes: half the Scrapbook.', points: 30, earn: { keepsakes: 36 }, art: 'keepsakes-36' },
  { key: 'mastered-25', name: 'Deep in the Pocket', description: 'Master 25 levels.', points: 40, earn: { mastered: 25 }, art: 'pocket-25' },
  { key: 'stars-300', name: 'Night Sky', description: 'Collect 300 stars.', points: 40, earn: { stars: 300 }, art: 'stars-300' },
  { key: 'clear-171', name: 'Full Cast', description: 'Clear level 171 and meet all 36 acts.', points: 40, earn: { clearLevel: 171 }, art: 'full-cast' },
  // Endless Mode, beside Bronze, Silver and Golden Tempo and Going On and On.
  { key: 'endless-runs-25', name: 'Encore', description: 'Finish 25 Endless runs.', points: 10, earn: { endlessRuns: 25 }, art: 'endless-runs-25' },
  { key: 'endless-900s', name: 'Platinum Tempo', description: 'Last 15 minutes in one Endless run.', points: 40, earn: { endlessMs: 900_000 }, art: 'endless-900s' },
];

export const ACHIEVEMENT_BATCH: readonly ImportedAchievement[] = Object.freeze(ROWS.map((entry, i) => ({ ...entry, order: 11 + i })));
