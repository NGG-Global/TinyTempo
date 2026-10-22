/**
 * The finale's two presentation sounds, synthesized like every act's voices: one clock,
 * seeded noise, no second AudioContext, no asset to download.
 *
 * - **roll**: a snare roll that builds across the last bar of the finale's opening and
 *   stops just short of the first demonstration downbeat, so the example's first beat is
 *   heard on its own rather than under a crash.
 * - **fanfare**: a short brass arpeggio under the "Area complete" ribbon. It plays after
 *   the result has been recorded, when nothing is being judged.
 */

export type FinaleSound = 'roll' | 'fanfare';

const TAU = Math.PI * 2;
/** How long before the downbeat the roll falls silent. */
export const ROLL_CLEARANCE_SEC = 0.06;
/** The fanfare's notes, rising a major arpeggio to the octave, and when each speaks. */
const FANFARE = [
  { hz: 523.25, at: 0 },
  { hz: 659.25, at: 0.11 },
  { hz: 783.99, at: 0.22 },
  { hz: 1046.5, at: 0.33 },
] as const;
const FANFARE_SEC = 1.7;

/** A brass-like tone: a few harmonics, the upper ones decaying faster, with a slow vibrato. */
function brass(t: number, hz: number, hold: number): number {
  if (t < 0) return 0;
  const attack = Math.min(1, t / 0.025);
  const release = t < hold ? 1 : Math.exp(-(t - hold) * 7);
  const vibrato = 1 + Math.sin(TAU * 5.2 * t) * 0.004 * Math.min(1, t / 0.3);
  let v = 0;
  for (let k = 1; k <= 6; k++) v += Math.sin(TAU * hz * k * vibrato * t) * Math.exp(-t * k * 0.9) / k;
  return v * attack * release;
}

/**
 * A synthesis in progress: the samples so far, and how far along it is. `advance` runs for
 * about `budgetMs` and stops, so the work can be spread over frames that have time to
 * spare; `finish` runs it to the end in one go.
 */
export interface FinaleSynth {
  readonly kind: FinaleSound;
  readonly done: boolean;
  /** Samples written so far, over the whole length. */
  readonly progress: number;
  advance(budgetMs: number): void;
  finish(): Float32Array;
}

/** Samples synthesized between two looks at the clock. A few hundred microseconds' worth. */
const SLICE = 512;

/**
 * `beatSec` is the length of one beat at the task's tempo; the roll spans `rollBeats` of
 * them. The fanfare ignores both.
 *
 * Every sample carries the state of the one before it — the noise generator and its
 * low-passed copy — so the loop is a stepper rather than a map, and a job advanced in
 * slices writes exactly the samples a single run would.
 */
export function finaleSynth(sampleRate: number, kind: FinaleSound, beatSec = 0.5, rollBeats = 4): FinaleSynth {
  const duration = kind === 'roll' ? Math.max(0.2, beatSec * rollBeats - ROLL_CLEARANCE_SEC) : FANFARE_SEC;
  const data = new Float32Array(Math.ceil(sampleRate * duration));
  let seed = kind === 'roll' ? 90211 : 44017;
  let low = 0;
  let i = 0;
  // Strokes land on sextuplets of the beat: fast enough to blur into a roll at any tempo.
  const stroke = beatSec / 6;
  const step = (until: number): void => {
    for (; i < until; i++) {
      const t = i / sampleRate;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = seed / 0xffffffff * 2 - 1;
      low = low * 0.7 + noise * 0.3;
      let v: number;
      if (kind === 'roll') {
        const p = t / duration;
        const since = t % stroke;
        const hit = Math.exp(-since * 55);
        // Crescendo: quiet under the count, full by the end, then a short fade to silence.
        const swell = 0.12 + 0.6 * p * p;
        const tail = Math.min(1, (duration - t) / 0.03);
        v = (noise - low * 0.5) * hit * swell * tail + Math.sin(TAU * 185 * since) * hit * swell * 0.25 * tail;
      } else {
        v = 0;
        FANFARE.forEach((note, n) => {
          const hold = n === FANFARE.length - 1 ? 0.9 : 0.16;
          v += brass(t - note.at, note.hz, hold) * (n === FANFARE.length - 1 ? 0.34 : 0.26);
        });
        // A soft cymbal wash under the top note.
        v += noise * Math.exp(-Math.max(0, t - 0.33) * 5) * (t >= 0.33 ? 0.05 : 0);
      }
      const attack = Math.min(1, t / 0.001);
      data[i] = Math.tanh(v * 1.2) * attack;
    }
  };
  return {
    kind,
    get done() { return i >= data.length; },
    get progress() { return data.length === 0 ? 1 : i / data.length; },
    advance(budgetMs) {
      const until = performance.now() + Math.max(0, budgetMs);
      while (i < data.length) {
        step(Math.min(data.length, i + SLICE));
        if (performance.now() >= until) break;
      }
    },
    finish() {
      step(data.length);
      return data;
    },
  };
}

/** The whole sound in one run, for a buffer wanted now. */
export function synthesizeFinale(sampleRate: number, kind: FinaleSound, beatSec = 0.5, rollBeats = 4): Float32Array {
  return finaleSynth(sampleRate, kind, beatSec, rollBeats).finish();
}

/**
 * The fanfare does not depend on tempo, and synthesizing it is a long stretch of
 * per-sample work — long enough to hitch the medal animation if it is built when the
 * ribbon asks for it. One buffer per context; the roll stays uncached because its
 * length is the task's own beat.
 */
const fanfareCache = new WeakMap<BaseAudioContext, AudioBuffer>();

function bufferFrom(context: BaseAudioContext, samples: Float32Array): AudioBuffer {
  const buffer = context.createBuffer(1, samples.length, context.sampleRate);
  buffer.getChannelData(0).set(samples);
  return buffer;
}

export function createFinaleSound(context: BaseAudioContext, kind: FinaleSound, beatSec?: number, rollBeats?: number): AudioBuffer {
  if (kind === 'fanfare') {
    const cached = fanfareCache.get(context);
    if (cached && cached.sampleRate === context.sampleRate) return cached;
  }
  const buffer = bufferFrom(context, synthesizeFinale(context.sampleRate, kind, beatSec, rollBeats));
  if (kind === 'fanfare') fanfareCache.set(context, buffer);
  return buffer;
}

/** How long one frame may spend on a finale's sounds. A fraction of the budget, so the frame it rides on still lands. */
export const FINALE_SYNTH_BUDGET_MS = 2.5;

/**
 * A finale's two sounds, made in the frames before they are needed rather than in the one
 * that asks for them.
 *
 * Built in one go, the roll and the fanfare were about a tenth of a second of per-sample
 * work on a desktop and several times that on a handset, spent inside the finale's opening
 * while the title card was dropping on its ropes — the frame every finale opened with was
 * the longest in the game. `advance` is called once a frame with a budget, from the
 * scene's `update`, and each buffer is taken when it is wanted: finished already in the
 * ordinary case, and finished on the spot if a slow device has not got there, which is
 * no worse than before. The fanfare is cached per context as it always was, so a finale
 * whose fanfare is already built has only the roll to make.
 */
export interface FinaleSoundPrep {
  /** Run the next slice. Nothing to do once both are made. */
  advance(budgetMs?: number): void;
  readonly done: boolean;
  roll(): AudioBuffer;
  fanfare(): AudioBuffer;
}

export function prepareFinaleSounds(context: BaseAudioContext, beatSec: number, rollBeats: number): FinaleSoundPrep {
  const roll = finaleSynth(context.sampleRate, 'roll', beatSec, rollBeats);
  const cached = fanfareCache.get(context);
  const fanfare = cached && cached.sampleRate === context.sampleRate ? null : finaleSynth(context.sampleRate, 'fanfare');
  let rollBuffer: AudioBuffer | null = null;
  const jobs = fanfare ? [roll, fanfare] : [roll];
  return {
    advance(budgetMs = FINALE_SYNTH_BUDGET_MS) {
      // The roll first: it is due a bar after the level opens, the fanfare only at the result.
      const until = performance.now() + Math.max(0, budgetMs);
      for (const job of jobs) {
        if (job.done) continue;
        job.advance(until - performance.now());
        if (performance.now() >= until) return;
      }
    },
    get done() { return jobs.every(job => job.done); },
    roll() {
      rollBuffer ??= bufferFrom(context, roll.finish());
      return rollBuffer;
    },
    fanfare() {
      if (fanfare) {
        const existing = fanfareCache.get(context);
        if (existing && existing.sampleRate === context.sampleRate) return existing;
        const buffer = bufferFrom(context, fanfare.finish());
        fanfareCache.set(context, buffer);
        return buffer;
      }
      return createFinaleSound(context, 'fanfare');
    },
  };
}
