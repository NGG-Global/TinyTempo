import type { Phase } from '@/game/RoundController';
import type { Judgement } from '@/rhythm/judge';

export const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
export const easeOut = (value: number): number => 1 - (1 - clamp01(value)) ** 3;
/** Slow at both ends: what a thing carried from one hand to another does. */
export const easeInOutCubic = (value: number): number => {
  const t = clamp01(value);
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
};

/** Seconds per beat at the music's source tempo. Motion tuned at this length scales from it. */
export const REFERENCE_BEAT = 0.5;

/**
 * How quickly the stage light and the turn plaque finish their handover. There is no
 * bar between the example and the response, so a 700 ms fade still looked like the
 * demonstration after the player was already being judged.
 */
export const TURN_OPEN_SEC = 0.22;

/** Player hits must not start while the example is still on the tool. */
export function isPlayerTurn(phase: Phase): boolean {
  return phase === 'respond';
}

/**
 * How far the stage light has opened toward the player's side.
 *
 * Keyed to the handover rather than to the response downbeat. The light used to start
 * moving on the same frame the turn arrived, which meant the cue and the beat it
 * announced were the same event: by the time the room had finished turning, the first
 * beat was already being judged. `handoverAt` sits `RHYTHM.runwayBeats` earlier, inside
 * the demonstration's own bar, so the light has finished opening before the player owes
 * anything.
 *
 * The light is the *only* thing that moves this early. The demonstration is still
 * running, so nothing that consumes the act's subject — a nail sunk, a cut advanced, a
 * tool handed over — may start here.
 */
export function turnOpen(now: number, handoverAt: number, phase: Phase): number {
  // A paused or unstarted round has no turn to hand over; the light shuts rather than
  // holding wherever the interruption caught it.
  if (phase === 'paused' || phase === 'idle') return 0;
  return easeOut((now - handoverAt) / TURN_OPEN_SEC);
}

/**
 * A demonstration beat can arrive twice: rendering re-scans the plan's cues every
 * frame, and the host also forwards the controller's cue. Returns the new high
 * water mark, or null when the beat has already been drawn.
 */
export function acceptDemoBeat(lastDemo: number, time: number): number | null {
  return time > lastDemo ? time : null;
}

/**
 * Only an accurate action advances a vignette's progress. An extra tap still moves
 * the tool and a missed target still reacts, but neither counts, and an omission
 * never invents an action the player did not make.
 */
export function advanceOnHit(count: number, kind: Judgement['kind']): number {
  return kind === 'hit' ? count + 1 : count;
}
