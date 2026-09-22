import type { VignetteSounds, VoiceName } from './AudioEngine';

const DURATION: Record<VoiceName, number> = {
  action: 0.22, scrape: 0.18, judder: 0.24, success: 0.62, rough: 0.58,
};

/**
 * A knife meeting a wooden board through a banana: a duller knock, soft flesh giving
 * way, almost no crunch. Deterministic and local: no encoder, no downloaded asset.
 */
export function synthesizeBanana(sampleRate: number, kind: VoiceName): Float32Array {
  const data = new Float32Array(Math.ceil(sampleRate * DURATION[kind]));
  let seed = 3347;
  let wet = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const white = seed / 0xffffffff * 2 - 1;
    wet = wet * 0.88 + white * 0.12;
    const board = Math.sin(2 * Math.PI * 155 * t) * Math.exp(-t * 32);
    const click = white * Math.exp(-t * 180) * 0.55;
    let voice: number;
    if (kind === 'action') {
      voice = board * 0.5 + click * 0.28 + wet * 0.5 * Math.exp(-t * 14);
    } else if (kind === 'scrape') {
      voice = Math.sin(2 * Math.PI * 240 * t) * Math.exp(-t * 30) * 0.6 + click * 0.55;
    } else if (kind === 'judder') {
      const tremor = 0.6 + 0.4 * Math.sin(2 * Math.PI * 21 * t);
      const knock = Math.sin(2 * Math.PI * 110 * t) * Math.exp(-t * 24) * 0.44;
      voice = knock + Math.sin(2 * Math.PI * 1800 * t) * Math.exp(-t * 11) * 0.16 * tremor + wet * 0.06 * Math.exp(-t * 8);
    } else if (kind === 'success') {
      const late = t - 0.36;
      const flop = late > 0 ? Math.sin(2 * Math.PI * (90 * late - 40 * late * late)) * Math.exp(-late * 18) * 0.28 : 0;
      voice = board * 0.48 * Math.exp(-t * 4) + click * 0.25 + wet * 0.42 * Math.exp(-t * 10) + flop;
    } else {
      voice = wet * 0.82 * Math.exp(-t * 6) + board * 0.18
        + Math.sin(2 * Math.PI * (110 * t - 55 * t * t)) * Math.exp(-t * 8) * 0.22;
    }
    data[i] = t === 0 ? 0 : Math.max(-1, Math.min(1, Math.min(1, t / 0.002) * voice));
  }
  return data;
}

export function createBananaSounds(context: AudioContext): VignetteSounds {
  const make = (kind: VoiceName): AudioBuffer => {
    const samples = synthesizeBanana(context.sampleRate, kind);
    const buffer = context.createBuffer(1, samples.length, context.sampleRate);
    buffer.getChannelData(0).set(samples);
    return buffer;
  };
  return {
    action: make('action'), success: make('success'), rough: make('rough'),
    scrape: make('scrape'), judder: make('judder'),
  };
}
