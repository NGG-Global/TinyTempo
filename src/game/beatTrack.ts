import { RHYTHM } from '@/config/rhythm';
import type { RoundPlan } from '@/rhythm/RhythmScheduler';
import type { Judgement } from '@/rhythm/judge';
import { overshoot, settle } from '@/ui/spring';
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
 * The count into the player's turn: "3", "2", "1" landing on the beats before their
 * first target, and "Go!" on the target itself.
 *
 * The block says whose turn it is and says it early, but it says it only in colour,
 * position and motion — a player who has not yet learnt to read it has nothing to hold
 * on to while it happens. This is the same information in the one form everybody already
 * knows, and it is measured the way a musician's count-in is measured: in beats back from
 * the event, never in seconds, so it holds at every tempo and on a phrase that runs two
 * bars as readily as one. Nothing here is scheduled and nothing sounds. The numerals land
 * on beats the plan already carries, which is what keeps them on the grid the player is
 * about to be judged against rather than beside it.
 *
 * `weight` answers the one risk a count-in carries here, which is that it competes with
 * the demonstration it is counting through. It ramps from a quarter at the first numeral
 * to full on the "Go!", so the count is faintest where the example is still the thing to
 * watch and loudest at the moment the example is over.
 */
export interface TurnCount {
  /** The numeral showing: `beats` down to 1, then 0 for the "Go!" on the first target. */
  readonly count: number;
  /** Seconds since this numeral landed on its beat. */
  readonly age: number;
  /** How present it should be, 0 → 1 across the count. The scene maps it to size and alpha. */
  readonly weight: number;
}

/** How long the "Go!" holds before the slot empties again, as a fraction of a beat. */
export const GO_HOLD_BEATS = 0.75;

/** Tolerance, in beats, for a time that is meant to be exactly on one. See `turnCount`. */
const BEAT_EPSILON = 1e-9;

// `beats` is annotated because `RHYTHM` is `as const`: the default would otherwise fix
// the parameter's type at the literal 3 and no other count could be passed, not even in a test.
export function turnCount(plan: RoundPlan | null, now: number, beats: number = RHYTHM.turnCountBeats): TurnCount | null {
  if (!plan || !Number.isFinite(now) || beats < 1) return null;
  const first = plan.targets[0] ?? plan.response;
  const beat = 60 / plan.bpm;
  if (!Number.isFinite(first) || !(beat > 0)) return null;
  // Never in front of the phrase it is counting. The count belongs to the demonstration's
  // own last beats, and on a pattern that opened on a rest rather than its downbeat it
  // would otherwise start before there was anything to count through.
  const from = Math.max(first - beats * beat, plan.demo);
  if (now < from || now >= first + GO_HOLD_BEATS * beat) return null;
  // Nudged before the ceiling, because a time sampled exactly on a beat does not divide
  // exactly: `(first - now) / beat` at the "1" came back as 1.0000000000000002 and the
  // numeral read 2 for that frame. The tolerance is a billionth of a beat — some orders
  // of magnitude above the error and some below anything a player could hear.
  // Clamped rather than extrapolated: where the phrase is too short to carry the whole
  // count the first numeral simply holds longer, and every numeral after it is still on
  // its own beat. A count that opened at "4" would be a count to a beat that is not there.
  const remaining = Math.ceil((first - now) / beat - BEAT_EPSILON);
  const count = now >= first ? 0 : Math.min(beats, Math.max(1, remaining));
  return {
    count,
    age: Math.max(0, now - (first - count * beat)),
    weight: (beats - count + 1) / (beats + 1),
  };
}

/**
 * How a numeral of the count is posed at `age` seconds after its beat, as plain numbers
 * the scene maps onto one Text.
 *
 * The count used to arrive as a fade with a knock on it, which read as a caption
 * updating rather than as anything counting. A count-in is percussive — each numeral is
 * *struck* on its beat — so each one now drops in from above, oversized, and stamps down
 * to size with a small overshoot, the way the medals land on the plaque. The numerals
 * lean alternate ways so the row of them reads as three separate strikes rather than one
 * label changing, and a ring leaves each one as it lands, which is the visible report of
 * the beat it sat on. The "Go!" is the biggest strike and the one that has stopped leaning.
 *
 * All of it is `f(age)`, sampled from the audio clock like every other curve on the block,
 * so a dropped frame costs nothing but the frame. `heat` is how far the numeral has warmed
 * from the act's ink toward coral: the count is the row's colour arriving, one beat at a time.
 */
export interface TurnCountPose {
  /** Scale about the numeral's own centre; oversized on the strike, then settled. */
  readonly scale: number;
  /** Vertical offset in design units, negative above its line: it drops in, never fades in. */
  readonly rise: number;
  readonly alpha: number;
  /** Radians. Numerals lean alternately; the "Go!" stands upright with a shimmy off the strike. */
  readonly tilt: number;
  /** 0 on "3" through 1 on "Go!": how far the numeral's ink has warmed to coral. */
  readonly heat: number;
  /** The ring the strike leaves: how far it has spread, 0 → 1, and how much of it is left. */
  readonly ring: { readonly spread: number; readonly alpha: number };
}

/** How long a numeral takes to stamp down to size, as a fraction of a beat. */
const STAMP_BEATS = 0.34;
/** How long the strike's ring is visible, as a fraction of a beat. */
const RING_BEATS = 0.6;
/** How far above its line the numeral starts, in design units. */
const DROP = 26;

export function turnCountPose(call: TurnCount, beat: number, still: boolean, beats: number = RHYTHM.turnCountBeats): TurnCountPose {
  const go = call.count === 0;
  const heat = beats > 0 ? clamp01((beats - call.count) / beats) : 1;
  // The "Go!" leaves rather than blinking out, over the back of its own hold; the numerals
  // are replaced in place by the next strike and never leave on their own.
  const leaving = go ? 1 - clamp01((call.age - beat * GO_HOLD_BEATS * 0.45) / (beat * GO_HOLD_BEATS * 0.55)) : 1;
  const presence = 0.55 + 0.45 * call.weight;
  if (still) {
    // Information without motion: the numeral is there at full size on its beat and the
    // "Go!" still fades, since a hold that ends is not a movement.
    return { scale: 1, rise: 0, alpha: presence * leaving, tilt: 0, heat, ring: { spread: 1, alpha: 0 } };
  }
  const stamp = beat * STAMP_BEATS;
  const p = clamp01(call.age / stamp);
  // Oversized on arrival and driven past its rest size, so the settle reads as a stamp
  // landing rather than as a zoom. The "Go!" starts larger still: it is the strike the
  // others were counting toward.
  const from = go ? 1.9 : 1.45;
  const scale = 1 + (from - 1) * (1 - overshoot(p, 0.18));
  const rise = -DROP * (1 - overshoot(p, 0.1));
  const alpha = presence * clamp01(call.age / (stamp * 0.3)) * leaving;
  const tilt = go
    ? settle(call.age, 26, 7) * 0.09
    : (call.count % 2 === 0 ? 1 : -1) * 0.085 * (1 - 0.35 * p);
  const ringP = clamp01(call.age / (beat * RING_BEATS));
  return {
    scale, rise, alpha, tilt, heat,
    ring: { spread: ringP, alpha: ringP > 0 && ringP < 1 ? (1 - ringP) ** 1.6 * (0.5 + 0.5 * call.weight) : 0 },
  };
}

/** Every beat answered Perfect, and at least one beat to answer: the flourish's one condition. */
export function isFlawless(marks: readonly Mark[]): boolean {
  return marks.length > 0 && marks.every(mark => mark === 'perfect');
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
