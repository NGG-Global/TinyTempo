import type { VignetteSounds, VoiceName } from './AudioEngine';
import { recordedVoice, samples } from './samples';
import { CLAP_MOTION } from '../vignettes/clapMotion';

type Voice = VoiceName | 'partial';
const TAU = Math.PI * 2;
const LENGTH: Record<Voice, number> = { action: 0.26, success: 1.7, partial: 1.4, rough: 1.0, scrape: 0.14, judder: 0.2 };
const decay = (t: number, rate: number) => t < 0 ? 0 : Math.exp(-t * rate);
const tone = (t: number, hz: number, rate: number) => t < 0 ? 0 : Math.sin(TAU * hz * t) * decay(t, rate);
/** Claps in the recorded crowd, and in the scatter that answers a middling round. */
const CROWD = { full: 58, polite: 13, spread: 1.25 } as const;

/**
 * A resonant band-pass, stepped a sample at a time. A clap has no pitch to synthesize —
 * it is a pressure pulse through two cupped palms, which is broadband noise with a
 * resonance where the air between the hands rings. One filter per clap, so a crowd is
 * a crowd of slightly different hands rather than one hand played many times.
 */
class Band {
  private low = 0;
  private band = 0;
  public step(input: number, hz: number, sampleRate: number, q: number): number {
    const f = Math.min(0.9, 2 * Math.sin(Math.PI * Math.min(hz, sampleRate * 0.45) / sampleRate));
    const high = input - this.low - q * this.band;
    this.band += f * high;
    this.low += f * this.band;
    return this.band;
  }
}

/** A deterministic stream: the same buffer every time the act is entered, on any device. */
function noiseStream(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0xffffffff * 2 - 1;
  };
}

/**
 * One clap written into the buffer at `at`. Two parts, which is what makes it a clap and
 * not a click: the crack of air between the palms, and the soft body of two hands meeting,
 * a couple of hundred hertz lower and gone almost as fast.
 */
function clapInto(data: Float32Array, sampleRate: number, at: number, gain: number, hz: number, seed: number): void {
  const start = Math.round(at * sampleRate);
  if (start >= data.length) return;
  const crack = new Band(), body = new Band();
  const noise = noiseStream(seed);
  const length = Math.min(data.length - start, Math.ceil(sampleRate * 0.16));
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const n = noise();
    // The resonance falls through the clap as the palms part and the cavity opens.
    const v = crack.step(n, hz - t * 2200, sampleRate, 0.45) * decay(t, 46) * Math.min(1, t / 0.0006)
      + body.step(n, 280, sampleRate, 0.8) * decay(t, 26) * 0.5;
    data[start + i] = (data[start + i] ?? 0) + v * gain;
  }
}

/**
 * How a crowd arrives: nobody together. The claps are spread by a seeded jitter around an
 * even spacing and they swell rather than starting at full — which is the difference
 * between a room applauding and a drum roll.
 */
function crowdInto(data: Float32Array, sampleRate: number, count: number, from: number, until: number, gain: number, seed: number): void {
  const jitter = noiseStream(seed);
  const span = until - from;
  for (let i = 0; i < count; i++) {
    const p = i / count;
    const at = from + span * p + jitter() * span * CROWD.spread / count;
    const swell = Math.min(1, 0.35 + p * 2) * (1 - p * 0.35);
    clapInto(data, sampleRate, Math.max(0, at), gain * swell * (0.7 + jitter() * 0.3), 1500 + jitter() * 500, 0x9e37 + i * 977);
  }
}

export function synthesizeClap(sampleRate: number, kind: Voice): Float32Array {
  const data = new Float32Array(Math.ceil(sampleRate * LENGTH[kind]));
  if (kind === 'action') clapInto(data, sampleRate, 0, 1, 2000, 7741);
  else if (kind === 'success') {
    // The round's own last clap, and then the room comes in behind it.
    clapInto(data, sampleRate, 0, 0.9, 2000, 7741);
    crowdInto(data, sampleRate, CROWD.full, CLAP_MOTION.crowdAtSec, LENGTH.success - 0.18, 0.5, 5309);
  } else if (kind === 'partial') {
    clapInto(data, sampleRate, 0, 0.9, 2000, 7741);
    // A scatter, and no swell under it: a few people clapping, from a few directions.
    crowdInto(data, sampleRate, CROWD.polite, CLAP_MOTION.crowdAtSec, LENGTH.partial - 0.3, 0.42, 3167);
  } else if (kind === 'rough') {
    // The shrug: one clap that does not quite land, and a two-note hum falling away from it.
    clapInto(data, sampleRate, 0, 0.55, 1200, 4451);
    const hum = noiseStream(2207);
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const breath = hum() * decay(t - 0.18, 9) * 0.05;
      data[i] = (data[i] ?? 0) + tone(t - 0.2, 233.08, 2.2) * 0.3 + tone(t - 0.2, 466.16, 3.4) * 0.06
        + tone(t - 0.52, 185, 2.4) * 0.28 + tone(t - 0.52, 370, 3.6) * 0.05 + breath;
    }
  } else if (kind === 'scrape') {
    // Palms brushing past each other: air, and no contact at all, so no transient.
    const noise = noiseStream(1289);
    const air = new Band();
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      data[i] = air.step(noise(), 3200, sampleRate, 0.9) * Math.min(1, t / 0.012) * decay(t, 22) * 0.4;
    }
  } else {
    // A beat that went by: one hand patting the other, muffled, with none of the crack.
    const noise = noiseStream(6151);
    const pat = new Band();
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      data[i] = pat.step(noise(), 420, sampleRate, 1.1) * decay(t, 34) * 0.55 + tone(t, 120, 30) * 0.2;
    }
  }
  for (let i = 0; i < data.length; i++) {
    const attack = Math.min(1, i / sampleRate / 0.0007);
    const release = Math.min(1, (data.length - 1 - i) / (sampleRate * 0.025));
    // Soft saturation catches coincident claps without a hard clipped transient.
    data[i] = Math.tanh((data[i] ?? 0) * 1.1) * attack * release;
  }
  return data;
}

/**
 * The act's voices. All four recordings are performances of a room: one pair of hands on
 * the beat, and the three answers it can get. The synthesis is the fallback for a device
 * that never received them, and it is built to say the same three things — a full house,
 * a scattered few, and a shrug with nobody behind it.
 */
export function createClapSounds(context: AudioContext): VignetteSounds {
  const make = (kind: Voice): AudioBuffer => {
    const data = synthesizeClap(context.sampleRate, kind);
    const buffer = context.createBuffer(1, data.length, context.sampleRate);
    buffer.getChannelData(0).set(data);
    return buffer;
  };
  return {
    action: recordedVoice(() => make('action'), ['clap']),
    success: samples.get('clapSuccess') ?? make('success'),
    partial: samples.get('clapPartial') ?? make('partial'),
    rough: samples.get('clapFail') ?? make('rough'),
    scrape: make('scrape'), judder: make('judder'),
  };
}
