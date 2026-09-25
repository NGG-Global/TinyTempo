/**
 * Groove's accents, synthesized like every act's voices: one clock, seeded noise, no
 * second AudioContext, nothing to download. All three are decorative and are placed on
 * grid times the level already has — a coda's contact, the next task's downbeat, the
 * result — never on a beat the player is copying, and never on a timer of their own.
 *
 * - **shaker**: a short brushed hiss, on the downbeat a flawless task hands to the next.
 * - **chime**: a warm two-partial bell, on a flawless coda's contact at level 3.
 * - **sting**: a soft major-seventh chord, under the mastery label on the result.
 */

export type GrooveSound = 'shaker' | 'chime' | 'sting';

const TAU = Math.PI * 2;
const LENGTH: Readonly<Record<GrooveSound, number>> = { shaker: 0.14, chime: 0.9, sting: 1.6 };
/** A soft major seventh on C, the fanfare's key, voiced close so it warms rather than announces. */
const STING = [261.63, 329.63, 392.0, 493.88] as const;

export function synthesizeGroove(sampleRate: number, kind: GrooveSound): Float32Array {
  const duration = LENGTH[kind];
  const data = new Float32Array(Math.ceil(sampleRate * duration));
  let seed = kind === 'shaker' ? 70123 : kind === 'chime' ? 41911 : 88017;
  let high = 0;
  let previous = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 0xffffffff * 2 - 1;
    // A one-pole high-pass: the shaker is the hiss, not the rumble.
    high = 0.92 * (high + noise - previous);
    previous = noise;
    let v: number;
    if (kind === 'shaker') {
      const env = Math.min(1, t / 0.006) * Math.exp(-t * 34);
      v = high * env * 0.5;
    } else if (kind === 'chime') {
      const env = Math.min(1, t / 0.002) * Math.exp(-t * 4.2);
      v = (Math.sin(TAU * 1046.5 * t) * 0.5 + Math.sin(TAU * 2637 * t) * Math.exp(-t * 9) * 0.22) * env * 0.5;
    } else {
      const attack = Math.min(1, t / 0.04);
      const release = t < 0.9 ? 1 : Math.exp(-(t - 0.9) * 4.5);
      v = 0;
      for (const hz of STING) {
        for (let k = 1; k <= 3; k++) v += Math.sin(TAU * hz * k * t + k) * Math.exp(-t * k * 1.1) / (k * k);
      }
      v = v * attack * release * 0.16;
    }
    data[i] = Math.tanh(v * 1.1);
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
  return { shaker: createGrooveSound(context, 'shaker'), chime: createGrooveSound(context, 'chime'), sting: createGrooveSound(context, 'sting') };
}
