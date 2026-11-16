import { clamp01, easeOut } from '@/vignettes/motion';
import { arrive, overshoot, settle, squash } from './spring';

/**
 * What one judged hit does to the row, and how its verdict lands, as pure `f(age)`.
 *
 * A Perfect used to be a word rising at the shelf, a swell on its socket and a handful
 * of sparks: it looked exactly like a Good with a different word, and the player's eyes
 * are on the act, not the word. This is the hit answered at the socket itself — the
 * place the thumb just was — with the things a struck object does: a shockwave ring
 * leaving the socket, a burst of rays for the first instant, the socket and the plate
 * flashing bright and cooling, and the baton hopping once in its slot, the way a drummer
 * nods. A Good keeps the flash and a faint ring, so the two still read apart at a glance;
 * a Miss gets nothing here, since the row's bar through the socket already says it.
 *
 * Everything is sampled from the audio clock at the strike's own time, like every other
 * curve on the block, so a dropped frame costs that frame and nothing drifts off its
 * beat. Under reduced motion the flash alone remains: the information without the travel.
 */
export const HIT = {
  /** The shockwave: how long the ring takes to spread and fade, in seconds. */
  ring: 0.42,
  /** The rays last this long; they are the first instant of the strike, not a glow. */
  rays: 0.26,
  rayCount: 8,
  /** The socket's flash and the plate's brightening, cooling from the strike. */
  flash: 0.3,
  /** The baton's hop, up and back, in seconds. */
  bob: 0.34,
  /** How high the baton hops, in design units. */
  bobReach: 9,
  /** The verdict word's hold and stamp, in seconds. */
  verdictHold: 0.55,
  verdictStamp: 0.2,
} as const;

export interface HitPose {
  /** The shockwave: 0 → 1 across its spread, and the alpha left. */
  readonly ring: { readonly spread: number; readonly alpha: number };
  /** The rays: how far they reach, 0 → 1, and the alpha left. Perfect only. */
  readonly rays: { readonly reach: number; readonly alpha: number };
  /** 1 on the strike, cooling to 0: the socket's and the plate's brightening. */
  readonly flash: number;
  /** The baton's hop: height in design units, and its compression as it lands. */
  readonly bob: { readonly lift: number; readonly squash: number };
}

const REST: HitPose = Object.freeze({
  ring: { spread: 1, alpha: 0 }, rays: { reach: 1, alpha: 0 }, flash: 0, bob: { lift: 0, squash: 0 },
});

/** Null for a hit that has not happened or is long over, so a drawer has one check. */
export function hitPose(age: number, perfect: boolean, still: boolean): HitPose | null {
  if (!Number.isFinite(age) || age < 0) return null;
  const longest = Math.max(HIT.ring, HIT.rays, HIT.flash, HIT.bob);
  if (age >= longest) return null;
  const strength = perfect ? 1 : 0.5;
  const flash = (1 - clamp01(age / HIT.flash)) ** 1.5 * strength;
  if (still) return { ...REST, flash };
  const ringP = clamp01(age / HIT.ring);
  const raysP = clamp01(age / HIT.rays);
  const bobP = clamp01(age / HIT.bob);
  return {
    ring: { spread: easeOut(ringP), alpha: ringP < 1 ? (1 - ringP) ** 1.6 * (perfect ? 0.85 : 0.4) : 0 },
    rays: perfect && raysP < 1 ? { reach: easeOut(raysP), alpha: (1 - raysP) ** 1.3 * 0.9 } : { reach: 1, alpha: 0 },
    flash,
    bob: perfect
      ? { lift: Math.sin(Math.PI * bobP) * HIT.bobReach, squash: squash(age - HIT.bob * 0.82, HIT.bob * 0.3, 0.2) }
      : { lift: 0, squash: 0 },
  };
}

export type VerdictGrade = 'Perfect' | 'Good' | 'Miss' | 'Extra';

/**
 * The word the verdict strikes for a judgement. An untapped beat and a surplus tap are
 * different mistakes — one asks for more, the other for less — and both read "Miss" until
 * the result's timing details counted them apart; "Extra" says which while the player can
 * still do something about the next beat. The grade is unchanged: an extra is still scored
 * as the judge scores it.
 */
export function verdictWord(result: { readonly kind: 'hit' | 'omission' | 'extra'; readonly grade: 'Perfect' | 'Good' | 'Miss' }): VerdictGrade {
  return result.kind === 'extra' ? 'Extra' : result.grade;
}

export interface VerdictPose {
  readonly alpha: number;
  /** Design units, negative above the word's line. */
  readonly rise: number;
  readonly scale: number;
  /** Radians. */
  readonly tilt: number;
  /**
   * How present the early/late tag beside the word is, 0 → 1: it pops in a few frames
   * after the word has landed, so it reads as a qualifier of the verdict rather than a
   * second word striking with it.
   */
  readonly tag: number;
}

/** When the tag starts to arrive after the word, and how long it takes, in seconds. */
const TAG_AFTER = 0.07;
const TAG_IN = 0.1;
/** How far the word lifts, in design units, and how much it shrinks, as it leaves. */
const LIFT_OFF = { rise: 9, shrink: 0.07 } as const;
/** One frame at 60 Hz: the most a struck word may take to become opaque. */
const FIRST_FRAME = 1 / 60;

/**
 * How the verdict word lands, `age` seconds after the tap it answers. A Perfect is struck
 * — dropped in oversized and stamped down to size with an overshoot, leaning alternate
 * ways by the beat it answered, the way the count's numerals land — so a run of them
 * reads as a row of strikes rather than one label refreshing. A Good arrives from below
 * with the small pop it always had, and a Miss arrives flat with a shake. Every grade
 * holds the same `HIT.verdictHold` and leaves over the back of it — **lifting off** as it
 * fades, a little up and a little smaller, since a word that arrived with a direction
 * should leave with one rather than dissolve where it stands. A struck word is opaque
 * from its first frame: fading a strike in over three frames softened exactly the thing
 * it was for. Under reduced motion the word is simply there at size, and still leaves.
 * Null once it has gone.
 */
export function verdictPose(age: number, grade: VerdictGrade, index: number, still: boolean): VerdictPose | null {
  if (!Number.isFinite(age) || age < 0 || age >= HIT.verdictHold) return null;
  const leaving = 1 - clamp01((age - 0.35) / (HIT.verdictHold - 0.35));
  const tag = clamp01((age - TAG_AFTER) / TAG_IN);
  if (still) return { alpha: leaving, rise: 0, scale: 1, tilt: 0, tag: 1 };
  // The lift-off eases in over the fade, so the word is at rest for the whole of its hold.
  const gone = (1 - leaving) ** 2;
  const lift = -LIFT_OFF.rise * gone;
  const shrink = 1 - LIFT_OFF.shrink * gone;
  if (grade === 'Perfect') {
    const p = clamp01(age / HIT.verdictStamp);
    const lean = (index % 2 === 0 ? -1 : 1) * 0.06 * (1 - 0.4 * p);
    return {
      alpha: clamp01(age / FIRST_FRAME) * leaving,
      rise: -16 * (1 - overshoot(p, 0.1)) + lift,
      scale: (1 + 0.55 * (1 - overshoot(p, 0.22))) * shrink,
      tilt: lean + settle(age, 24, 7) * 0.03,
      tag,
    };
  }
  const { rise, alpha } = arrive(age, 0.45);
  return {
    alpha: alpha * leaving,
    rise: -(1 - rise) * 18 + lift,
    scale: (grade === 'Good' ? 0.85 + 0.15 * overshoot(Math.min(1, age / 0.45), 0.4) : 1) * shrink,
    tilt: grade === 'Miss' || grade === 'Extra' ? settle(age, 40, 10) * 0.05 : 0,
    tag,
  };
}

/**
 * The verdict word and its early/late tag (`tapTiming`) as one group centred on the
 * verdict's line: each one's centre as an offset from that line's centre, and the group's
 * width for the pill behind it. With no tag the word is centred alone, exactly as before.
 * There is no room above or below the word — the act's shelf is over it and the block under
 * it — so the tag sits beside it.
 */
export function verdictGroup(wordWidth: number, tagWidth: number, scale: number, gap: number): {
  readonly wordX: number; readonly tagX: number; readonly width: number;
} {
  const word = Math.max(0, wordWidth) * scale;
  if (!(tagWidth > 0)) return { wordX: 0, tagX: 0, width: word };
  const tag = tagWidth * scale;
  const width = word + gap * scale + tag;
  return { wordX: (word - width) / 2, tagX: (width - tag) / 2, width };
}
