import { clamp01, easeOut } from '../vignettes/motion';
import { overshoot, settle, stagger } from './spring';

/**
 * The flourish for a flawless task: every beat of the response judged Perfect.
 *
 * The row already records each beat as it lands, and a clean row of full rings is
 * legible to a player who knows to read it. But a clean row is the best thing that can
 * happen in a task and the game said nothing about it: the last "Perfect" looked exactly
 * like the eleven before it. This is the one moment a task gets its own celebration —
 * a word struck over the shelf, a band of light crossing the face, and each socket
 * glinting as the light passes it, left to right, the same direction the fuse lit them.
 *
 * Everything is `f(age)` from the instant the round resolved, sampled from the audio
 * clock like every other curve on the block; nothing here is scheduled or tweened and
 * nothing decides anything. The judge said Perfect eleven times; this only says so once.
 */
export const FLAWLESS = {
  /** How long the word stays, in seconds. Longer than a verdict: it is the task's, not a tap's. */
  hold: 1.5,
  /** The word's stamp — from oversized to rest — in seconds. */
  stamp: 0.32,
  /** The band of light takes this long to cross the face. */
  sweep: 0.55,
  /** How long one socket's glint lasts once the band reaches it. */
  glint: 0.4,
  /**
   * The chorus: once the band has crossed, every socket throws one ring together, the
   * plate catches the light, the baton lands again and the word kicks. One beat of the
   * whole row answering at once, after the sweep has counted it off.
   */
  chorusAt: 0.55,
  chorus: 0.5,
} as const;

export interface FlawlessPose {
  readonly scale: number;
  /** Design units, negative above the word's line: it drops in like the count's strikes. */
  readonly rise: number;
  readonly alpha: number;
  readonly tilt: number;
  /** The halo behind the word, 0 → 1 → 0 across the hold. */
  readonly glow: number;
}

/** Null once the flourish is over, so the scene has one check to hide everything by. */
export function flawlessPose(age: number, still = false): FlawlessPose | null {
  if (!Number.isFinite(age) || age < 0 || age >= FLAWLESS.hold) return null;
  const leaving = 1 - clamp01((age - FLAWLESS.hold * 0.72) / (FLAWLESS.hold * 0.28));
  if (still) return { scale: 1, rise: 0, alpha: leaving, tilt: 0, glow: 0 };
  const p = clamp01(age / FLAWLESS.stamp);
  // The word kicks once more as the chorus lands: the row and the word answer together.
  const kick = clamp01((age - FLAWLESS.chorusAt) / (FLAWLESS.chorus * 0.6));
  return {
    scale: (1 + 0.9 * (1 - overshoot(p, 0.2))) * (1 + 0.14 * Math.sin(Math.PI * kick)),
    rise: -30 * (1 - overshoot(p, 0.1)),
    alpha: clamp01(age / (FLAWLESS.stamp * 0.3)) * leaving,
    tilt: settle(age, 24, 6) * 0.08,
    glow: Math.sin(Math.PI * clamp01(age / FLAWLESS.hold)) * leaving,
  };
}

/**
 * The band of light crossing the face: where its centre is as a fraction of the face's
 * width (it starts off the left edge and leaves off the right), and how bright it is.
 */
export function sweepBand(age: number): { readonly at: number; readonly alpha: number } {
  if (!Number.isFinite(age) || age < 0 || age >= FLAWLESS.sweep) return { at: 0, alpha: 0 };
  const p = age / FLAWLESS.sweep;
  return { at: -0.2 + 1.4 * easeOut(p), alpha: Math.sin(Math.PI * p) * 0.55 };
}

/**
 * The chorus ring every socket throws together once the sweep is done: how far it has
 * spread, 0 → 1, and the alpha left. Nothing before the chorus or after it, so the sweep
 * still reads as counting the sockets off one at a time before the whole row answers.
 */
export function chorusRing(age: number): { readonly spread: number; readonly alpha: number } {
  const local = age - FLAWLESS.chorusAt;
  if (!Number.isFinite(local) || local < 0 || local >= FLAWLESS.chorus) return { spread: 1, alpha: 0 };
  const p = local / FLAWLESS.chorus;
  return { spread: easeOut(p), alpha: (1 - p) ** 1.5 * 0.8 };
}

/** How bright the plate is at `age` of the flourish: the chorus's flash, cooling. */
export function plateGlow(age: number): number {
  const local = age - FLAWLESS.chorusAt;
  if (!Number.isFinite(local) || local < 0 || local >= FLAWLESS.chorus) return 0;
  return (1 - local / FLAWLESS.chorus) ** 1.4;
}

/**
 * How far socket `index` of `count` is into its glint: 0 as the band reaches it, 1 once
 * it has faded, and -1 before the band has arrived. Sockets glint in order, so the row
 * reads as being counted off rather than lit at once.
 */
export function socketGlint(age: number, index: number, count: number): number {
  // -Infinity is a flourish that has not happened; +Infinity is one long over.
  if (Number.isNaN(age) || age < 0) return -1;
  const start = stagger(index, count, FLAWLESS.sweep * 0.7) + FLAWLESS.sweep * 0.1;
  const local = age - start;
  if (local < 0) return -1;
  return Math.min(1, local / FLAWLESS.glint);
}
