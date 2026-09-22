import type { VignetteSounds, VoiceName } from './AudioEngine';

const DURATION: Record<VoiceName, number> = {
  action: 0.2, scrape: 0.18, judder: 0.24, success: 0.6, rough: 0.55,
};

/**
 * A knife meeting a wooden board through a cucumber: a short bright click, a watery
 * crunch of cell walls, and pale sap. Deterministic and local: no encoder, no asset.
 */
export function synthesizeCucumber(sampleRate: number, kind: VoiceName): Float32Array {
  const data = new Float32Array(Math.ceil(sampleRate * DURATION[kind]));
  let seed = 2011;
  let wet = 0;
  let crunch = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const white = seed / 0xffffffff * 2 - 1;
    wet = wet * 0.78 + white * 0.22;
    crunch = crunch * 0.55 + white * 0.45;
    const board = Math.sin(2 * Math.PI * 200 * t) * Math.exp(-t * 36);
    const click = white * Math.exp(-t * 240);
    const snap = Math.sin(2 * Math.PI * 2100 * t) * Math.exp(-t * 70);
    let voice: number;
    if (kind === 'action') {
      voice = board * 0.55 + click * 0.45 + snap * 0.28 + wet * 0.28 * Math.exp(-t * 20) + crunch * 0.18 * Math.exp(-t * 26);
    } else if (kind === 'scrape') {
      voice = Math.sin(2 * Math.PI * 240 * t) * Math.exp(-t * 30) * 0.6 + click * 0.6;
    } else if (kind === 'judder') {
      const tremor = 0.6 + 0.4 * Math.sin(2 * Math.PI * 21 * t);
      const knock = Math.sin(2 * Math.PI * 120 * t) * Math.exp(-t * 26) * 0.42;
      voice = knock + Math.sin(2 * Math.PI * 2300 * t) * Math.exp(-t * 12) * 0.2 * tremor + wet * 0.05 * Math.exp(-t * 9);
    } else if (kind === 'success') {
      const late = t - 0.34;
      const pip = late > 0 ? Math.sin(2 * Math.PI * 1700 * late) * Math.exp(-late * 64) * 0.22 : 0;
      voice = board * 0.5 * Math.exp(-t * 4) + click * 0.4 + snap * 0.22 + wet * 0.38 * Math.exp(-t * 12) + pip;
    } else {
      voice = wet * 0.7 * Math.exp(-t * 8) + crunch * 0.22 * Math.exp(-t * 10) + board * 0.22
        + Math.sin(2 * Math.PI * (140 * t - 50 * t * t)) * Math.exp(-t * 9) * 0.18;
    }
    data[i] = t === 0 ? 0 : Math.max(-1, Math.min(1, Math.min(1, t / 0.002) * voice));
  }
  return data;
}

export function createCucumberSounds(context: AudioContext): VignetteSounds {
  const make = (kind: VoiceName): AudioBuffer => {
    const samples = synthesizeCucumber(context.sampleRate, kind);
    const buffer = context.createBuffer(1, samples.length, context.sampleRate);
    buffer.getChannelData(0).set(samples);
    return buffer;
  };
  return {
    action: make('action'), success: make('success'), rough: make('rough'),
    scrape: make('scrape'), judder: make('judder'),
  };
}
