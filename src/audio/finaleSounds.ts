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
  /** Samples in the whole sound. */
  readonly length: number;
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
    length: data.length,
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

/**
 * How long one frame may spend on a finale's sounds when they have to be made on the main
 * thread. A fraction of the budget, so the frame it rides on still lands.
 */
export const FINALE_SYNTH_BUDGET_MS = 2.5;

/** What the worker is asked for, and what it answers with. */
export interface FinaleSynthRequest {
  readonly id: number;
  readonly sampleRate: number;
  readonly kind: FinaleSound;
  readonly beatSec: number;
  readonly rollBeats: number;
}
export interface FinaleSynthReply { readonly id: number; readonly kind: FinaleSound; readonly samples: Float32Array }

/** The part of a `Worker` the preparation uses, so a test can stand one in. */
export interface SynthWorker {
  postMessage(request: FinaleSynthRequest): void;
  onmessage: ((event: MessageEvent<FinaleSynthReply>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

/**
 * The one synthesis worker, made on the first finale and kept: a worker costs a few
 * milliseconds and a script fetch to start, and a session may play several finales. Null
 * where workers are not available, and null again after one has failed, so the main-thread
 * path takes over for good rather than retrying a worker that cannot run.
 */
let synthWorker: SynthWorker | null | undefined;
let requestId = 0;

function defaultWorker(): SynthWorker | null {
  if (synthWorker !== undefined) return synthWorker;
  try {
    synthWorker = typeof Worker === 'function'
      ? new Worker(new URL('./finaleSynth.worker.ts', import.meta.url), { type: 'module' })
      : null;
  } catch {
    synthWorker = null;
  }
  return synthWorker ?? null;
}

/**
 * A finale's two sounds, made before they are needed rather than in the frame that asks
 * for them — and off the main thread wherever there is one to spare.
 *
 * Built in one go, the roll and the fanfare were about a tenth of a second of per-sample
 * work on a desktop and several times that on a handset, spent inside the finale's opening
 * while the title card was dropping on its ropes — the frame every finale opened with was
 * the longest in the game. Sliced across frames under `FINALE_SYNTH_BUDGET_MS` they stopped
 * hitching the opening and instead cost every frame of the first task a slice: 2.5 ms of
 * budget that a 512-sample slice overran by a frame's worth on a handset, for the two or
 * three seconds the fanfare took to finish — a steady drop through the start of every
 * finale. **The worker** (`finaleSynth.worker.ts`) runs the same `synthesizeFinale` on
 * another thread and hands the samples back transferred, so the main thread does nothing
 * but copy them into a buffer; both are done well inside the opening's first bar. The
 * slices stay as the fallback where there is no worker or it fails, and each buffer is
 * taken when it is wanted: finished already in the ordinary case, and finished on the spot
 * if nothing has got there, which is no worse than before. The fanfare is cached per
 * context as it always was, so a finale whose fanfare is already built has only the roll
 * to make.
 */
export interface FinaleSoundPrep {
  /** Run the next main-thread slice, where the sounds are being made there. Nothing to do once both are made. */
  advance(budgetMs?: number): void;
  readonly done: boolean;
  roll(): AudioBuffer;
  fanfare(): AudioBuffer;
}

export function prepareFinaleSounds(
  context: BaseAudioContext, beatSec: number, rollBeats: number, worker: () => SynthWorker | null = defaultWorker,
): FinaleSoundPrep {
  const rate = context.sampleRate;
  const cached = fanfareCache.get(context);
  const wantFanfare = !(cached && cached.sampleRate === rate);
  const roll = finaleSynth(rate, 'roll', beatSec, rollBeats);
  const fanfare = wantFanfare ? finaleSynth(rate, 'fanfare') : null;
  const jobs = fanfare ? [roll, fanfare] : [roll];
  /** Samples the worker has handed back, by sound. */
  const made: Partial<Record<FinaleSound, Float32Array>> = {};
  const ids = new Map<number, FinaleSound>();
  let onWorker = false;
  let rollBuffer: AudioBuffer | null = null;

  const thread = worker();
  if (thread) {
    onWorker = true;
    const ask = (kind: FinaleSound): void => {
      const id = ++requestId;
      ids.set(id, kind);
      thread.postMessage({ id, sampleRate: rate, kind, beatSec, rollBeats });
    };
    // Several preparations may share the one worker, so each answer is matched by its id,
    // and an answer for a sound this preparation already finished itself is dropped.
    const previous = thread.onmessage;
    thread.onmessage = event => {
      previous?.(event);
      const kind = ids.get(event.data.id);
      if (kind === undefined) return;
      ids.delete(event.data.id);
      if (event.data.samples.length === (kind === 'roll' ? roll : fanfare)?.length) made[kind] = event.data.samples;
    };
    const previousError = thread.onerror;
    thread.onerror = event => {
      previousError?.(event);
      // Back to the main thread for this and every later finale; nothing already made is lost.
      onWorker = false;
      synthWorker = null;
    };
    ask('roll');
    if (fanfare) ask('fanfare');
  }

  const ready = (kind: FinaleSound): boolean => made[kind] !== undefined || (kind === 'roll' ? roll : fanfare)?.done === true;
  const finish = (kind: FinaleSound): Float32Array => made[kind] ?? (kind === 'roll' ? roll : fanfare)!.finish();

  return {
    advance(budgetMs = FINALE_SYNTH_BUDGET_MS) {
      // Nothing on the main thread while the worker is on it.
      if (onWorker) return;
      // The roll first: it is due a bar after the level opens, the fanfare only at the result.
      const until = performance.now() + Math.max(0, budgetMs);
      for (const job of jobs) {
        if (job.done || made[job.kind] !== undefined) continue;
        job.advance(until - performance.now());
        if (performance.now() >= until) return;
      }
    },
    get done() { return jobs.every(job => ready(job.kind)); },
    roll() {
      rollBuffer ??= bufferFrom(context, finish('roll'));
      return rollBuffer;
    },
    fanfare() {
      if (fanfare) {
        const existing = fanfareCache.get(context);
        if (existing && existing.sampleRate === rate) return existing;
        const buffer = bufferFrom(context, finish('fanfare'));
        fanfareCache.set(context, buffer);
        return buffer;
      }
      return createFinaleSound(context, 'fanfare');
    },
  };
}
