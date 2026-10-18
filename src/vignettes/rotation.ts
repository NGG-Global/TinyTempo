/**
 * Which act plays a level, and for the how-manyth time. Pure, so the schedule can be
 * tested without Phaser.
 *
 * **Every act has a debut level, and the debut levels are the whole schedule.** An act
 * first plays on its debut level; every other level plays the act that has gone longest
 * without a turn among those that have debuted. So a new act arrives exactly where the
 * table says, the rest of the cast comes round as evenly as it can, and no act plays two
 * levels running.
 *
 * It replaced a table of eras, each cycling the first n acts of the registry for a whole
 * number of laps. That model could only add an act two full laps past the last keepsake,
 * so each act pushed the next one further out: the last seven arrived between levels 107
 * and 358, and thirty-one of the first forty areas introduced nothing. The debut schedule
 * puts a new act in every area until the cast runs out (`DEBUT_LEVELS` in `registry.ts`).
 *
 * **Changing the schedule moves every level from the first change onward**, keepsakes
 * included, since a keepsake is owned by three stars on the level where its act plays a
 * given lap (`game/scrapbook.ts`). Append a new act's debut past the furthest level
 * players have reached, or grandfather what they hold (`game/keepsakeLegacy.ts`).
 *
 * Once the last act has debuted the schedule is a fixed cycle of every act, so a table up
 * to one lap past the last debut answers every level.
 */

/** `debuts[i]` is the level registry entry `i` first plays on. */
export type DebutSchedule = readonly number[];

export interface Placement {
  /** The act's index in the registry. */
  readonly index: number;
  /** How many earlier levels this act played: 0 on its first, and the index into its looks. */
  readonly lap: number;
}

/**
 * Throws unless the schedule places every act in the registry exactly once: the first at
 * level 1, later ones on later levels, and none on an area's finale, which is a reprise
 * of its area and never where something new arrives (`docs/FINALES.md`). Run by the
 * tests; the game trusts the table rather than stopping on it.
 */
export function checkDebuts(debuts: DebutSchedule, registrySize: number, areaSize: number): void {
  if (debuts.length !== registrySize) throw new Error(`The schedule must give all ${registrySize} acts a debut level, not ${debuts.length}.`);
  if (debuts[0] !== 1) throw new Error('The first act debuts on level 1.');
  debuts.forEach((level, i) => {
    if (!Number.isInteger(level) || level < 1) throw new Error(`Act ${i}'s debut level is malformed.`);
    const previous = debuts[i - 1];
    if (previous !== undefined && level <= previous) throw new Error(`Act ${i} must debut after act ${i - 1}.`);
    if (level % areaSize === 0) throw new Error(`Act ${i} debuts on level ${level}, an area finale.`);
  });
}

interface Table {
  /** The last level the table holds: one full lap past the last debut. */
  readonly end: number;
  /** Indexed by level; slot 0 unused. */
  readonly index: readonly number[];
  readonly lap: readonly number[];
  /** Every level each act plays within the table, in order. */
  readonly visits: readonly (readonly number[])[];
}

const tables = new WeakMap<DebutSchedule, Table>();

function tableFor(debuts: DebutSchedule): Table {
  const cached = tables.get(debuts);
  if (cached) return cached;
  const acts = debuts.length;
  if (acts === 0) throw new Error('The schedule has no acts.');
  const end = debuts[acts - 1]! + acts;
  const index = [0], lap = [0];
  const visits: number[][] = debuts.map(() => []);
  const lastPlayed: number[] = debuts.map(() => -1);
  let debuted = 0;
  for (let level = 1; level <= end; level++) {
    let act: number;
    if (debuted < acts && debuts[debuted] === level) {
      act = debuted++;
    } else {
      // The act that has gone longest without a turn. Every debuted act has played at least
      // once, on its debut, so no two share a last level and there is never a tie.
      act = 0;
      for (let candidate = 1; candidate < debuted; candidate++) if (lastPlayed[candidate]! < lastPlayed[act]!) act = candidate;
    }
    index.push(act);
    lap.push(visits[act]!.length);
    visits[act]!.push(level);
    lastPlayed[act] = level;
  }
  const table = { end, index, lap, visits };
  tables.set(debuts, table);
  return table;
}

/** The act at a level, and its lap. Levels start at 1; anything below is placed as level 1. */
export function placementAt(debuts: DebutSchedule, level: number): Placement {
  const at = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
  const table = tableFor(debuts);
  if (at <= table.end) return { index: table.index[at]!, lap: table.lap[at]! };
  // Past the table every act plays once a lap, in the order of the table's last lap.
  const acts = debuts.length;
  const laps = Math.ceil((at - table.end) / acts);
  const base = at - laps * acts;
  return { index: table.index[base]!, lap: table.lap[base]! + laps };
}

/** The level where act `index` plays for the `lap`-th time: `placementAt`, read backwards. */
export function levelAt(debuts: DebutSchedule, index: number, lap: number): number {
  if (!Number.isInteger(index) || index < 0 || index >= debuts.length || !Number.isInteger(lap) || lap < 0) {
    throw new Error(`No level for act ${index} lap ${lap}.`);
  }
  const visits = tableFor(debuts).visits[index]!;
  if (lap < visits.length) return visits[lap]!;
  // Its last visit in the table falls in the table's final lap, after which it returns once a lap.
  return visits[visits.length - 1]! + (lap - (visits.length - 1)) * debuts.length;
}
