import type { VignetteSounds, VoiceName } from './AudioEngine';

const DURATION: Record<VoiceName, number> = {
  action: 0.22, scrape: 0.2, judder: 0.26, success: 0.62, rough: 0.6,
};

/**
 * Teeth are a band of noise rather than a tone, so every voice is shaped from one
 * seeded noise source. Deterministic and local: no encoder, no downloaded asset.
 */
export function synthesizeSaw(sampleRate: number, kind: VoiceName): Float32Array {
  const data = new Float32Array(Math.ceil(sampleRate * DURATION[kind]));
  let seed = 977;
  let rasp = 0;
  let dull = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const white = seed / 0xffffffff * 2 - 1;
    // A skid keeps almost none of each new sample, which is what makes it dull;
    // the bite keeps most of it and stays bright.
    rasp = rasp * (kind === 'scrape' ? 0.88 : 0.42) + white * (kind === 'scrape' ? 0.12 : 0.58);
    dull = dull * 0.9 + rasp * 0.1;
    let voice: number;
    if (kind === 'action') {
      const teeth = Math.sin(2 * Math.PI * (760 * t + 520 * t * t));
      voice = (rasp * 0.9 + teeth * 0.2) * Math.exp(-t * 14);
    } else if (kind === 'scrape') {
      voice = (dull * 1.6 + Math.sin(2 * Math.PI * (210 * t - 90 * t * t)) * 0.12) * Math.exp(-t * 11);
    } else if (kind === 'judder') {
      // A blade stalling in the kerf: the rattle is amplitude, not pitch.
      const stutter = Math.sin(2 * Math.PI * 26 * t) > 0 ? 1 : 0.22;
      voice = (dull * 1.7 + Math.sin(2 * Math.PI * 118 * t) * 0.2) * stutter * Math.exp(-t * 9);
    } else if (kind === 'success') {
      // The last of the cut, then the offcut landing squarely a moment later.
      const fall = t - 0.3;
      const knock = fall > 0 ? Math.sin(2 * Math.PI * (96 * fall - 40 * fall * fall)) * Math.exp(-fall * 22) : 0;
      voice = rasp * 0.75 * Math.exp(-t * 9) + knock * 0.7;
    } else {
      // A splintered hinge taking the offcut's weight and complaining about it.
      const creak = Math.sin(2 * Math.PI * (300 * t - 210 * t * t)) * (0.55 + 0.45 * Math.sin(2 * Math.PI * 7 * t));
      voice = creak * 0.5 * Math.exp(-t * 4) + rasp * 0.3 * Math.exp(-t * 6);
    }
    data[i] = Math.max(-1, Math.min(1, Math.min(1, t / 0.002) * voice));
  }
  return data;
}

export function createSawSounds(context: AudioContext): VignetteSounds {
  const make = (kind: VoiceName): AudioBuffer => {
    const samples = synthesizeSaw(context.sampleRate, kind);
    const buffer = context.createBuffer(1, samples.length, context.sampleRate);
    buffer.getChannelData(0).set(samples);
    return buffer;
  };
  return {
    action: make('action'), success: make('success'), rough: make('rough'),
    scrape: make('scrape'), judder: make('judder'),
  };
}
