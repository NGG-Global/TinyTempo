import { MUSIC } from '../config/music';

/**
 * How many of a track's stems a level has earned.
 *
 * A level starts on the first stem alone — the drums, on the layered track — and each
 * scored task moves the count by its accuracy: strong adds a stem, weak takes one away,
 * anything between holds. The count is level-local, reset with every start, stored
 * nowhere and read by nothing that judges, scores, paces, saves or unlocks: it is the
 * room answering, like groove, and a track with one stem hears none of it. It is capped
 * at the track's stems, so the rule is the same for every track and a premix is simply a
 * track that is always full.
 */
export function advanceLayers(current: number, accuracy: number, stems: number): number {
  if (!Number.isInteger(current) || current < 1) throw new Error('At least one stem is always heard.');
  if (!Number.isInteger(stems) || stems < 1) throw new Error('A track has at least one stem.');
  const max = Math.max(1, stems);
  if (accuracy >= MUSIC.layers.strong) return Math.min(max, current + 1);
  if (accuracy < MUSIC.layers.weak) return Math.max(1, current - 1);
  return Math.min(max, current);
}

/** Where every level starts: the first stem alone. */
export const OPENING_LAYERS = 1;
