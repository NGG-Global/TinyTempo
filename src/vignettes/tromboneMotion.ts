import { clamp01, easeInOutCubic, easeOut, REFERENCE_BEAT } from './motion';

/**
 * Curves for the trombone act. Pure, so it is unit-tested under node.
 *
 * The horn's beat is not the player's tap. `PlayScene` schedules the action voice for
 * every demonstration cue and every target when a task is placed, and `AudioEngine`
 * hands out the recorded takes in that order — so the note that sounds on a beat is
 * fixed by its position in the level, and the picture has to follow the same count to
 * show the right slide position. `soundedNotes` is that count. The tap still owns what
 * it always owned: the judged reaction, and the curtain that only landed notes open.
 */
export const TROMBONE_REVEAL_SEC = 1.65;

export const TROMBONE_MOTION = {
  /** The slide reaches its new position inside this fraction of a beat. */
  slideBeats: 0.12,
  /** The cheeks stay full for this much of the beat, then let go before the next one. */
  holdBeats: 0.62,
  releaseBeats: 0.26,
  /** Slide extension for the two notes: the second note is lower, so the slide is out. */
  positions: [0, 1] as const,
} as const;

/** Which of the two notes the n-th sounding beat of the level plays: the takes alternate, so the slide does. */
export function noteFor(index: number): 0 | 1 {
  return Math.max(0, Math.floor(index)) % 2 === 0 ? 0 : 1;
}

/**
 * How many of a task's notes have sounded by `now`, and when the latest one did. The
 * demonstration's action cues sound first and the response's targets after them; both
 * consume a take whether or not anyone tapped.
 */
export function soundedNotes(actionCues: readonly number[], targets: readonly number[], now: number): { readonly count: number; readonly lastAt: number } {
  let count = 0, lastAt = -Infinity;
  for (const t of actionCues) if (t <= now) { count++; if (t > lastAt) lastAt = t; }
  for (const t of targets) if (t <= now) { count++; if (t > lastAt) lastAt = t; }
  return { count, lastAt };
}

/**
 * How many notes to keep when a new plan arrives. A later task of the same attempt
 * adds the previous task's sounding beats so the slide stays with the engine's takes.
 * A paused or idle reset is a new attempt: the engine restarts its takes, and so must
 * the count, or the slide opens on the wrong note.
 */
export function carryNotes(notesBefore: number, previousSounded: number, freshAttempt: boolean): number {
  return freshAttempt ? 0 : notesBefore + Math.max(0, previousSounded);
}

/** The slide's travel from the last position to the new one: 0 still on the old note, 1 arrived. */
export function slideTravel(age: number, beat = REFERENCE_BEAT): number {
  if (age < 0) return 0;
  return easeInOutCubic(age / (TROMBONE_MOTION.slideBeats * beat));
}

/** The blow: cheeks full from the beat, held for most of it, released before the next. */
export function blow(age: number, beat = REFERENCE_BEAT): number {
  if (age < 0) return 0;
  const hold = TROMBONE_MOTION.holdBeats * beat;
  if (age < hold) return Math.min(1, age / 0.03);
  return 1 - easeOut((age - hold) / (TROMBONE_MOTION.releaseBeats * beat));
}

/** The curtain across the way, opened one step per landed note; only judged hits open it. */
export function curtainOpen(hits: number, targets: number): number {
  return clamp01(Math.max(0, hits) / Math.max(1, targets));
}

export interface TromboneFinale {
  /** The player leans back and lifts the bell: 0 playing, 1 at full flourish. */
  readonly flourish: number;
  /** Notes and confetti out of the bell, 0 to 1 and gone. */
  readonly burst: number;
  /** The neighbour leaning out to applaud. */
  readonly neighbour: number;
  /** The slide sagging to the floor on a rough round. */
  readonly droop: number;
  /** The shutters across the way, 0 open as they were, 1 slammed. */
  readonly shutters: number;
}

const REST: TromboneFinale = { flourish: 0, burst: 0, neighbour: 0, droop: 0, shutters: 0 };

/** A clean round is a flourish and applause; a rough one is a sagging slide and slammed shutters. */
export function tromboneFinale(age: number, successful: boolean, still = false): TromboneFinale {
  if (age < 0) return REST;
  if (!successful) {
    const droop = easeOut((age - 0.1) / 0.8);
    const shutters = still ? (age >= 0.45 ? 1 : 0) : easeOut((age - 0.45) / 0.25);
    return { ...REST, droop, shutters };
  }
  const flourish = still ? (age >= 0.1 ? 1 : 0) : easeOut(age / 0.45);
  const burst = still ? 0 : clamp01(age / 1.3);
  const neighbour = still ? (age >= 0.3 ? 1 : 0) : easeOut((age - 0.3) / 0.5);
  return { flourish, burst, neighbour, droop: 0, shutters: 0 };
}
