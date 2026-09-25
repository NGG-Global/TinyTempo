import { clamp01, easeOut } from '../vignettes/motion';
import { overshoot, settle } from './spring';
import type { GrooveLevel } from '../game/groove';

/**
 * Groove's poses as pure `f(t)`, sampled from the audio clock like every other pose in a
 * level. No Phaser here: `ui/grooveStage.ts` draws what these return, and the tests read
 * them directly.
 *
 * The scene is the meter. Nothing here is a bar or a number; it is how warm the room's
 * light is, how much the brass edge of the block catches it, and how much the room
 * breathes with the beat. Level 1 is the existing flawless flourish and adds nothing
 * here: the treatment starts at level 2, when a second flawless task says the first was
 * not luck, and is plainly there at level 3.
 */

export const GROOVE_POSE = Object.freeze({
  /** Seconds the room takes to warm up to a new level, or settle back to a lower one. */
  blend: 0.7,
  /** The warm pool behind the act, per level. */
  glow: [0, 0, 0.3, 0.52] as const,
  /** The brass edge on the block's face, per level. */
  rim: [0, 0, 0.32, 0.65] as const,
  /** The room's breath on a beat: how far the pool swells, as a fraction of its size, per level. */
  breath: [0, 0, 0.012, 0.02] as const,
  /** The downbeat breathes fully; the other three beats less. */
  offbeat: 0.55,
  /** How far into the beat the breath peaks, and by when it has let go. */
  breathIn: 0.08,
  breathOut: 0.85,
  /** A Perfect hit at level 3 flares the pool for this long. */
  flare: 0.4,
});

/**
 * Where the room is between two levels: `from` at the change and `to` once `blend` has
 * passed, as a continuous amount from 0 to 3. Under reduced motion the change is at once.
 */
export function grooveBlend(from: GrooveLevel, to: GrooveLevel, age: number, still = false): number {
  if (!Number.isFinite(age) || age < 0) return from;
  if (still) return to;
  return from + (to - from) * easeOut(age / GROOVE_POSE.blend);
}

/** A value between two levels' entries in a per-level table. */
function at(table: readonly [number, number, number, number], amount: number): number {
  const a = Math.max(0, Math.min(3, amount));
  const lo = Math.floor(a), hi = Math.min(3, lo + 1);
  return table[lo]! + (table[hi]! - table[lo]!) * (a - lo);
}

export interface BeatPulse {
  /** 0–3 within the bar. */
  readonly beat: number;
  /** 0–1 through the beat. */
  readonly phase: number;
  /** How much of a breath the room is taking right now, 0–1: fullest just after beat 1. */
  readonly strength: number;
}

const REST_PULSE: BeatPulse = Object.freeze({ beat: 0, phase: 0, strength: 0 });

/**
 * The room's breath, from the bar the plan is on. `barOrigin` is any time on a bar line
 * of the running plan — its demonstration downbeat — so the count is the level's own and
 * the breath lands on the beats the player is hearing, never on a timer of its own.
 * Continuous across the beat: it rises over the first `breathIn` of a beat and has let go
 * by `breathOut`, so the room never jumps. Still under reduced motion.
 */
export function beatPulse(now: number, barOrigin: number, bpm: number, still = false): BeatPulse {
  if (still || !(bpm > 0) || !Number.isFinite(now) || !Number.isFinite(barOrigin)) return REST_PULSE;
  const beatSec = 60 / bpm;
  const beats = (now - barOrigin) / beatSec;
  const index = Math.floor(beats);
  const phase = beats - index;
  const beat = ((index % 4) + 4) % 4;
  const P = GROOVE_POSE;
  const shape = phase < P.breathIn
    ? easeOut(phase / P.breathIn)
    : 1 - easeOut((phase - P.breathIn) / (P.breathOut - P.breathIn));
  return { beat, phase, strength: clamp01(shape) * (beat === 0 ? 1 : P.offbeat) };
}

export interface GroovePose {
  /** The warm pool's alpha, 0 at rest. */
  readonly glow: number;
  /** The pool's size, as a multiple of its laid-out size: 1 plus the breath. */
  readonly scale: number;
  /** The brass edge on the block's face, 0 at rest. */
  readonly rim: number;
  /** How far the pool is tinted from the paper toward the sun, 0–1. */
  readonly warmth: number;
}

/**
 * The room at `amount` (a continuous groove level), taking `pulse` of a breath, `flareAge`
 * seconds after the last Perfect hit. The flare is the level-3 reaction to a hit: a small
 * extra swell that is gone inside a beat. Under reduced motion the pool and the rim hold
 * their level's value and nothing moves.
 */
export function groovePose(amount: number, pulse: BeatPulse, flareAge: number, still = false): GroovePose {
  const P = GROOVE_POSE;
  const glow = at(P.glow, amount);
  const rim = at(P.rim, amount);
  const warmth = clamp01(amount / 3);
  if (still) return { glow, scale: 1, rim, warmth };
  const breath = at(P.breath, amount) * pulse.strength;
  const flareOn = clamp01(amount - 2);
  const flare = Number.isFinite(flareAge) && flareAge >= 0 && flareAge < P.flare
    ? Math.sin(Math.PI * flareAge / P.flare) * 0.08 * flareOn : 0;
  return {
    glow: Math.min(1, glow + breath * 4 + flare * 0.5),
    scale: 1 + breath + flare * 0.25,
    rim: Math.min(1, rim + breath * 6),
    warmth,
  };
}

/**
 * The mastery payoff on the result: a full-level flawless run. It waits for the medals
 * and, on a finale, for the ribbon and the card under it — Area complete is the bigger
 * thing and goes first — then a brass ring opens behind the plaque, the medals glint
 * together once, the plaque takes a small knock and the label under it arrives.
 */
export const MASTERY = Object.freeze({
  /** Seconds after the summary: past the third medal's chorus, which fades from 0.9 s. */
  delay: 1.35,
  /** On a cleared finale: after the ribbon (1.0 s) and its card (1.25 s) have landed. */
  finaleDelay: 1.9,
  /** The ring's opening, and how long the whole payoff lasts. */
  ring: 0.8,
  hold: 2.2,
  /** The medals' shared glint. */
  flash: 0.5,
  /** The knock the plaque takes, in plaque heights. */
  knock: 0.035,
  /** A keepsake earned by the same clear waits this long behind the label, so the two never arrive together. */
  keepsakeLag: 0.7,
});

export interface MasteryPose {
  /** The ring's reach, 0 → 1 across its opening, and its alpha. */
  readonly ring: { readonly spread: number; readonly alpha: number };
  /** The medals' shared glint, 0 → 1 → 0. */
  readonly flash: number;
  /** The plaque's knock, in plaque heights; positive is down. */
  readonly knock: number;
  /** The label's arrival: rise 1 → 0 and alpha 0 → 1. */
  readonly label: { readonly rise: number; readonly alpha: number };
}

/** Null before the payoff is due. Once it has played, the label stays and the rest is at rest. */
export function masteryPose(age: number, still = false): MasteryPose | null {
  if (!Number.isFinite(age) || age < 0) return null;
  if (still) return { ring: { spread: 1, alpha: age < MASTERY.hold ? 0.35 * (1 - age / MASTERY.hold) : 0 }, flash: 0, knock: 0, label: { rise: 0, alpha: 1 } };
  const M = MASTERY;
  const p = clamp01(age / M.ring);
  const ring = { spread: overshoot(p, 0.06), alpha: age < M.hold ? Math.sin(Math.PI * clamp01(age / M.hold)) * 0.8 : 0 };
  const flash = age < M.flash ? Math.sin(Math.PI * age / M.flash) : 0;
  const knock = Math.max(0, settle(age, 22, 9)) * M.knock;
  const arrive = clamp01((age - 0.15) / 0.45);
  return { ring, flash, knock, label: { rise: 1 - overshoot(arrive, 0.12), alpha: easeOut(Math.min(1, arrive * 1.6)) } };
}
