import { RHYTHM } from '@/config/rhythm';
import type { RoundPlan } from '@/rhythm/RhythmScheduler';
import type { Judgement } from '@/rhythm/judge';
import { clamp01, easeInOutCubic } from '@/vignettes/motion';

/**
 * The beat track: what the row of beads under the action is showing at any moment.
 *
 * Pure, with no Phaser import, so it unit-tests under node like the vignettes' motion
 * curves. The scene draws what these return; it decides nothing itself.
 *
 * The track is the answer to two complaints at once. A player could not tell the
 * demonstration from their own turn, because only a headline word changed; and a tap
 * that landed perfectly looked exactly like one that missed by 120 ms, because nothing
 * recorded the outcome outside a debug build.
 */

/** What one bead is showing. `pending` is a beat not yet played or not yet answered. */
export type Mark = 'pending' | 'perfect' | 'good' | 'miss';

/**
 * The mark for one beat, from the judge's own verdict.
 *
 * An extra tap never reaches here: it carries no index, because it belongs to no beat.
 * The scene shakes the whole track for those instead of marking one.
 */
export function markFor(outcome: Judgement | null | undefined): Mark {
  if (!outcome) return 'pending';
  if (outcome.kind === 'omission') return 'miss';
  if (outcome.kind === 'extra') return 'pending';
  return outcome.grade === 'Perfect' ? 'perfect' : outcome.grade === 'Good' ? 'good' : 'miss';
}

export interface TrackGeometry {
  /** Bead centres as offsets from the track's centre, in the same units as `width`. */
  readonly centres: readonly number[];
  /** Radius that keeps `count` beads inside `width` with room to breathe. */
  readonly radius: number;
  readonly gap: number;
}

/** Spacing that keeps a nine-beat pattern inside the frame instead of running off it. */
export function trackGeometry(count: number, width: number, preferredGap = 46, maxRadius = 13): TrackGeometry {
  if (count <= 0 || !Number.isFinite(width) || width <= 0) return { centres: [], radius: 0, gap: 0 };
  if (count === 1) return { centres: [0], radius: maxRadius, gap: 0 };
  // Shrink the pitch before the beads: a tight row of readable marks beats a loose row
  // of dots, and the longest pattern the vocabulary produces still has to fit.
  const gap = Math.min(preferredGap, width / (count - 1));
  const radius = Math.min(maxRadius, gap * 0.38);
  const centres = Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * gap);
  return { centres, radius, gap };
}

/**
 * How many of the demonstration's beats have sounded by `now`, from the plan's own action
 * cues. Sampled from the audio clock by the caller, so a dropped frame cannot lose one.
 */
export function beatsPlayed(plan: RoundPlan | null, now: number): number {
  if (!plan) return 0;
  let played = 0;
  for (const cue of plan.cues) if (cue.kind === 'action' && cue.time <= now) played++;
  return played;
}

/**
 * The last four lead-in ticks before the demonstration, as a fraction filled.
 *
 * Only the last four count, so the opening bar and a sixteen-beat breather read the
 * same: a breather is a rest, not a count to sixteen. Returns null outside the lead-in,
 * which is what tells the scene to hide the pips.
 */
export function countIn(plan: RoundPlan | null, now: number, beats = 4): number | null {
  if (!plan || now >= plan.demo) return null;
  const lead = plan.cues.filter(cue => cue.kind !== 'action');
  if (lead.length === 0) return null;
  const last = lead.slice(-beats);
  const first = last[0]!.time;
  // One beat of warning before the first pip, so the row arrives rather than appearing
  // already half full. Earlier than that — deep in a breather — there is nothing to count.
  const beat = last.length > 1 ? last[1]!.time - first : plan.demo - first;
  if (now < first - beat) return null;
  let filled = 0;
  for (const cue of last) if (cue.time <= now) filled++;
  return filled;
}

/**
 * When the turn starts changing hands: `RHYTHM.runwayBeats` before the player's first
 * expected tap, which is inside the demonstration's own bar. Nothing is added to the
 * loop and no cue moves — this is a time to render against, derived from the plan.
 *
 * Every pattern in the vocabulary opens on its phrase's downbeat, so this normally sits
 * a whole number of beats before `plan.response`; it is expressed against the first
 * target rather than against the downbeat because the target is what the player is
 * winding up for, and a pattern that ever opened on a rest would want the later one.
 */
export function handoverAt(plan: RoundPlan | null): number {
  if (!plan) return Infinity;
  const first = plan.targets[0] ?? plan.response;
  return first - RHYTHM.runwayBeats * (60 / plan.bpm);
}

/**
 * The turn, as two numbers everything on the block is a function of.
 *
 * `runway` runs 0 → 1 across the handover and is what carries the baton, lights the
 * sockets and pre-warms the face, so that by the downbeat nothing new appears. `yours`
 * runs 0 → 1 over a fraction of a beat from the first target, and is the turn having
 * actually arrived.
 */
export interface Handover {
  /** 0 before the handover opens, 1 at the player's first target. */
  readonly runway: number;
  /** 0 until that target, 1 once the turn has fully passed. */
  readonly yours: number;
}

/** How much of a beat `yours` takes to arrive once the target is reached. */
const YOURS_BEATS = 0.18;

export function handover(plan: RoundPlan | null, now: number): Handover {
  if (!plan || !Number.isFinite(now)) return { runway: 0, yours: 0 };
  const first = plan.targets[0] ?? plan.response;
  const from = handoverAt(plan);
  const beat = 60 / plan.bpm;
  return {
    runway: clamp01((now - from) / (first - from)),
    yours: clamp01((now - first) / (beat * YOURS_BEATS)),
  };
}

/**
 * How far the socket at `index` has been lit by the runway: a fuse burning left to
 * right, so the row reads as a sequence being handed over rather than a bank of lamps
 * switching on together. Full the moment the turn actually arrives, whatever the runway
 * did — a reduced-motion or interrupted handover must still end with every socket lit.
 */
export function fuse(turn: Handover, index: number, stagger = 0.17, ramp = 0.3): number {
  return Math.max(turn.yours, clamp01((turn.runway - index * stagger) / ramp));
}

/**
 * The guiding ring closing onto the next socket, for the level that still teaches.
 *
 * `radius` is a fraction: 1 at its widest, 0 once it has landed on the socket. `alpha`
 * fades it in over the beat before the target and takes it off just after, so the ring
 * says *where* and leaves the beat to say *when*.
 */
/** How long the ring lingers past the beat it pointed at, before it is another's. */
export const GHOST_FADE = 0.14;

export function ghostRing(target: number, beat: number, now: number, lead = 0.9, fade = GHOST_FADE): { readonly radius: number; readonly alpha: number } {
  if (!Number.isFinite(target) || !Number.isFinite(beat) || beat <= 0) return { radius: 1, alpha: 0 };
  const span = beat * lead;
  const closing = clamp01((now - (target - span)) / span);
  return {
    radius: 1 - easeInOutCubic(closing),
    alpha: clamp01(closing * 2.4) * (1 - clamp01((now - target) / fade)),
  };
}
