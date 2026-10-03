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
  glow: [0, 0, 0.34, 0.54] as const,
  /** The brass edge on the block's face, per level. */
  rim: [0, 0, 0.42, 0.76] as const,
  /** The room's breath on a beat: how far the pool swells, as a fraction of its size, per level. */
  breath: [0, 0, 0.012, 0.02] as const,
  /** The downbeat breathes fully; the other three beats less. */
  offbeat: 0.3,
  /** How far into the beat the breath peaks, and by when it has let go. */
  breathIn: 0.08,
  breathOut: 0.85,
  /** A Perfect hit at level 3 flares the pool for this long. */
  flare: 0.4,
  activation: 0.65,
});

/**
 * Where the room is between two levels: `from` at the change and `to` once `blend` has
 * passed, as a continuous amount from 0 to 3. Under reduced motion the change is at once.
 */
export function grooveBlend(from: number, to: GrooveLevel, age: number, still = false): number {
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
  beat: number;
  /** 0–1 through the beat. */
  phase: number;
  /** How much of a breath the room is taking right now, 0–1: fullest just after beat 1. */
  strength: number;
}

const REST_PULSE: BeatPulse = Object.freeze({ beat: 0, phase: 0, strength: 0 });

/**
 * The room's breath, from the bar the plan is on. `barOrigin` is any time on a bar line
 * of the running plan — its demonstration downbeat — so the count is the level's own and
 * the breath lands on the beats the player is hearing, never on a timer of its own.
 * Continuous across the beat: it rises over the first `breathIn` of a beat and has let go
 * by `breathOut`, so the room never jumps. Still under reduced motion.
 */
export function beatPulse(now: number, barOrigin: number, bpm: number, still = false, out: BeatPulse = { beat: 0, phase: 0, strength: 0 }): BeatPulse {
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
  out.beat = beat; out.phase = phase; out.strength = clamp01(shape) * (beat === 0 ? 1 : P.offbeat);
  return out;
}

export interface GroovePose {
  /** The warm pool's alpha, 0 at rest. */
  glow: number;
  /** The pool's size, as a multiple of its laid-out size: 1 plus the breath. */
  scale: number;
  /** The brass edge on the block's face, 0 at rest. */
  rim: number;
  /** How far the pool is tinted from the paper toward the sun, 0–1. */
  warmth: number;
  /** Side lighting only joins at 3; it is absent at 2. */
  sides: number;
  glint: number;
}

/**
 * The room at `amount` (a continuous groove level), taking `pulse` of a breath, `flareAge`
 * seconds after the last Perfect hit. The flare is the level-3 reaction to a hit: a small
 * extra swell that is gone inside a beat. Under reduced motion the pool and the rim hold
 * their level's value and nothing moves.
 */
export function groovePose(amount: number, pulse: BeatPulse, flareAge: number, still = false,
  out: GroovePose = { glow: 0, scale: 1, rim: 0, warmth: 0, sides: 0, glint: 0 }): GroovePose {
  const P = GROOVE_POSE;
  const glow = at(P.glow, amount);
  const rim = at(P.rim, amount);
  const warmth = clamp01(amount / 3);
  const sides = clamp01(amount - 2);
  const strength = still ? 0 : pulse.strength;
  const breath = at(P.breath, amount) * strength;
  const flareOn = clamp01(amount - 2);
  const flare = !still && Number.isFinite(flareAge) && flareAge >= 0 && flareAge < P.flare
    ? Math.sin(Math.PI * flareAge / P.flare) * 0.08 * flareOn : 0;
  out.glow = Math.min(1, glow + breath * 4 + flare * 0.5);
  out.scale = 1 + breath + flare * 0.25;
  out.rim = Math.min(1, rim + breath * 6);
  out.warmth = warmth;
  out.sides = sides * (0.5 + strength * 0.25) + flare;
  out.glint = sides * (0.25 + strength * 0.25) + flare * 5;
  return out;
}

/** Short, single threshold response; never a new beat or a repeating cue. */
export function grooveActivation(age: number, level: GrooveLevel, still = false): number {
  if (level < 2 || age < 0 || age >= GROOVE_POSE.activation || !Number.isFinite(age)) return 0;
  const p = age / GROOVE_POSE.activation;
  return Math.sin(Math.PI * p) * (level === 3 ? 1 : 0.55) * (still ? 0.3 : 1);
}

/** Continuous presentation state shared by the room and optional object highlights. */
export class GrooveEnvelope {
  private from = 0;
  private to: GrooveLevel = 0;
  private at = -Infinity;
  public amount(now: number): number { return grooveBlend(this.from, this.to, now - this.at); }
  public show(level: GrooveLevel, now: number): boolean {
    if (level === this.to) return false;
    this.from = this.amount(now);
    this.to = level;
    this.at = now;
    return true;
  }
  public reset(): void { this.from = this.to = 0; this.at = -Infinity; }
}

/**
 * The mastery payoff on the result: a full-level flawless run. It waits for the medals
 * and, on a finale, for the ribbon and the card under it — Area complete is the bigger
 * thing and goes first — then a brass ring opens behind the plaque, the medals glint
 * together once, the plaque takes a small knock and the label under it arrives.
 */
export const MASTERY = Object.freeze({
  /** Seconds after the summary: past the third medal's chorus, which fades from 0.9 s. */
  delay: 1.5,
  /** After the area's 1.0 s ribbon start plus its complete 1.7 s fanfare. */
  finaleDelay: 2.75,
  /** The ring's opening, and how long the whole payoff lasts. */
  ring: 0.8,
  hold: 2.2,
  /** The medals' shared glint. */
  flash: 0.5,
  /** The knock the plaque takes, in plaque heights. */
  knock: 0.018,
  /** Minimum extra keepsake delay for a mastered result. Also wait for badgeSettle. */
  keepsakeLag: 1.15,
  badgeSettle: 0.65,
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

/**
 * Null before the payoff is due. Once it has played, the label stays and the rest is at rest.
 *
 * `repeat` is a flawless run of a level the save already had mastered (`game/mastery.ts`):
 * the run is acknowledged, so the plate still arrives, but the ring, the medals' glint and
 * the knock are the reveal's and are not played a second time.
 */
export function masteryPose(age: number, still = false, repeat = false): MasteryPose | null {
  if (!Number.isFinite(age) || age < 0) return null;
  if (repeat) {
    const arrive = still ? 1 : clamp01((age - 0.15) / 0.45);
    return { ring: { spread: 0, alpha: 0 }, flash: 0, knock: 0, label: { rise: 1 - overshoot(arrive, 0.12), alpha: easeOut(Math.min(1, arrive * 1.6)) } };
  }
  if (still) return { ring: { spread: 1, alpha: age < MASTERY.hold ? 0.35 * (1 - age / MASTERY.hold) : 0 }, flash: 0, knock: 0, label: { rise: 0, alpha: 1 } };
  const M = MASTERY;
  const p = clamp01(age / M.ring);
  const ring = { spread: overshoot(p, 0.06), alpha: age < M.hold ? Math.sin(Math.PI * clamp01(age / M.hold)) * 0.8 : 0 };
  const flash = age < M.flash ? Math.sin(Math.PI * age / M.flash) : 0;
  const knock = Math.max(0, settle(age, 22, 9)) * M.knock;
  const arrive = clamp01((age - 0.15) / 0.45);
  return { ring, flash, knock, label: { rise: 1 - overshoot(arrive, 0.12), alpha: easeOut(Math.min(1, arrive * 1.6)) } };
}
