/**
 * Which act plays a level, and for the how-manyth time. Pure, so the rotation can be
 * tested without Phaser.
 *
 * The rotation used to be one line, `VIGNETTES[(level - 1) % VIGNETTES.length]`, and
 * appending an act kept levels 1 to n and silently reassigned every level after them.
 * That was harmless while nothing was tied to a level's act. Keepsakes are: each is owned
 * by three stars on the level where its act plays a given lap (`game/scrapbook.ts`), so a
 * reassigned level hands a keepsake players already hold to a different level.
 *
 * So the rotation grows in **eras**. An era starts at a level and cycles through the
 * first `acts` entries of the registry; levels before it keep the era they had. A new era
 * opens on the acts it adds, so a player arriving there meets them at once, and then runs
 * in registry order from the first act. Every era but the last spans whole laps, which is
 * what keeps a lap count honest across the seam: each act present in an era plays it the
 * same number of times.
 */
export interface RotationEra {
  /** The first level of the era. The first era starts at level 1. */
  readonly fromLevel: number;
  /** How many registry entries it cycles through, from the first. Only ever grows. */
  readonly acts: number;
}

export interface Placement {
  /** The act's index in the registry. */
  readonly index: number;
  /** How many earlier levels this act played: 0 on its first, and the index into its looks. */
  readonly lap: number;
}

/** The registry index an era opens on: the first act it adds. */
function opening(eras: readonly RotationEra[], era: number): number {
  return era === 0 ? 0 : eras[era - 1]!.acts;
}

/** How many times each act that an era carries plays in it; Infinity for the last. */
function lapsIn(eras: readonly RotationEra[], era: number): number {
  const next = eras[era + 1];
  return next ? (next.fromLevel - eras[era]!.fromLevel) / eras[era]!.acts : Infinity;
}

/**
 * Throws unless the eras describe a rotation every level can be placed in, ending on the
 * whole registry. Run by the tests; the game trusts the table rather than stopping on it.
 */
export function checkRotation(eras: readonly RotationEra[], registrySize: number): void {
  const first = eras[0];
  if (!first || first.fromLevel !== 1) throw new Error('The rotation starts at level 1.');
  eras.forEach((era, i) => {
    if (!Number.isInteger(era.fromLevel) || !Number.isInteger(era.acts) || era.acts < 1) throw new Error(`Era ${i} is malformed.`);
    const previous = eras[i - 1];
    if (previous && (era.acts <= previous.acts || era.fromLevel <= previous.fromLevel)) throw new Error(`Era ${i} must add acts, later.`);
    if (!Number.isInteger(lapsIn(eras, i)) && i < eras.length - 1) throw new Error(`Era ${i} must span whole laps.`);
  });
  if (eras.at(-1)!.acts !== registrySize) throw new Error('The last era must carry every act in the registry.');
}

/** The act at a level, and its lap. Levels start at 1; anything below is placed as level 1. */
export function placementAt(eras: readonly RotationEra[], level: number): Placement {
  const at = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
  let era = 0;
  while (era + 1 < eras.length && eras[era + 1]!.fromLevel <= at) era++;
  const { fromLevel, acts } = eras[era]!;
  const offset = at - fromLevel;
  const index = (opening(eras, era) + offset) % acts;
  let lap = Math.floor(offset / acts);
  for (let earlier = 0; earlier < era; earlier++) if (index < eras[earlier]!.acts) lap += lapsIn(eras, earlier);
  return { index, lap };
}

/** The level where act `index` plays for the `lap`-th time: `placementAt`, read backwards. */
export function levelAt(eras: readonly RotationEra[], index: number, lap: number): number {
  if (!Number.isInteger(index) || index < 0 || !Number.isInteger(lap) || lap < 0) throw new Error(`No level for act ${index} lap ${lap}.`);
  let remaining = lap;
  for (let era = 0; era < eras.length; era++) {
    const { fromLevel, acts } = eras[era]!;
    if (index >= acts) continue;
    const laps = lapsIn(eras, era);
    if (remaining < laps) return fromLevel + remaining * acts + (index - opening(eras, era) + acts) % acts;
    remaining -= laps;
  }
  throw new Error(`Act ${index} is not in the rotation.`);
}
