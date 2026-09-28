/**
 * Groove's accents, synthesized like every act's voices: one clock, seeded noise, no
 * second AudioContext, nothing to download. All three are decorative and are placed on
 * grid times the level already has — a coda's contact, the next task's downbeat, the
 * result — never on a beat the player is copying, and never on a timer of their own.
 *
 * - **shaker**: a short brushed hiss, on the downbeat a flawless task hands to the next.
 * - **chime**: a damped wooden bell on a flawless coda's contact at level 3.
 * - **sting**: a rolled Bb6/9 mallet voicing under the mastery label on the result.
 */

export type GrooveSound = 'shaker' | 'chime' | 'sting';

const TAU = Math.PI * 2;
const LENGTH: Readonly<Record<GrooveSound, number>> = { shaker: 0.18, chime: 0.64, sting: 1.25 };
/** Bb6/9 without a third: Bb/F/C/G, matching the shipped stems' Bb/F/Eb/G pitch bed.
 * The old Cmaj7 added E and B against that arrangement. See docs/GROOVE-QA.md.
 */
const STING = [233.08, 349.23, 523.25, 783.99] as const;

export function synthesizeGroove(sampleRate: number, kind: GrooveSound): Float32Array {
  const duration = LENGTH[kind];
  const data = new Float32Array(Math.ceil(sampleRate * duration));
  let seed = kind === 'shaker' ? 70123 : kind === 'chime' ? 41911 : 88017;
  let high = 0;
  let previous = 0;
  let body = 0;
  const lowPass = 1 - Math.exp(-TAU * 3200 / sampleRate);
  const highPass = Math.exp(-TAU * 850 / sampleRate);
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 0xffffffff * 2 - 1;
    // A one-pole high-pass: the shaker is the hiss, not the rumble.
    high = highPass * (high + noise - previous);
    previous = noise;
    body += lowPass * (high - body);
    let v: number;
    if (kind === 'shaker') {
      // A brush across seeds, with midrange body audible on small speakers.
      const env = Math.min(1, t / 0.012) * Math.exp(-t * 27);
      v = body * env * 0.9;
    } else if (kind === 'chime') {
      const env = Math.min(1, t / 0.009) * Math.exp(-t * 7);
      v = (Math.sin(TAU * 698.46 * t) * 0.54 + Math.sin(TAU * 1396.92 * t) * Math.exp(-t * 5) * 0.23
        + Math.sin(TAU * 2095.38 * t) * Math.exp(-t * 15) * 0.08 + body * Math.exp(-t * 80) * 0.06) * env * 0.65;
    } else {
      v = 0;
      for (let n = 0; n < STING.length; n++) {
        // A tiny rolled attack and rapidly damped upper partials give the chord a wood body.
        const local = t - n * 0.023;
        if (local < 0) continue;
        const env = Math.min(1, local / 0.014) * Math.exp(-local * (3.2 + n * 0.35));
        for (let k = 1; k <= 3; k++) v += Math.sin(TAU * STING[n]! * k * local) * Math.exp(-local * (k - 1) * 6) * env / (k * k);
      }
      v *= 0.2;
    }
    data[i] = Math.tanh(v * 1.1) * Math.min(1, (duration - t) / 0.025);
  }
  return data;
}

export function createGrooveSound(context: BaseAudioContext, kind: GrooveSound): AudioBuffer {
  const samples = synthesizeGroove(context.sampleRate, kind);
  const buffer = context.createBuffer(1, samples.length, context.sampleRate);
  buffer.getChannelData(0).set(samples);
  return buffer;
}

/** The three accents for one context, built once and kept for the scene's life. */
export interface GrooveVoices {
  readonly shaker: AudioBuffer;
  readonly chime: AudioBuffer;
  readonly sting: AudioBuffer;
}

export function createGrooveVoices(context: BaseAudioContext): GrooveVoices {
  let voices = voiceCache.get(context);
  if (!voices) {
    voices = { shaker: createGrooveSound(context, 'shaker'), chime: createGrooveSound(context, 'chime'), sting: createGrooveSound(context, 'sting') };
    voiceCache.set(context, voices);
  }
  return voices;
}
const voiceCache = new WeakMap<BaseAudioContext, GrooveVoices>();
