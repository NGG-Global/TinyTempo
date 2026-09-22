import type { VignetteSounds, VoiceName } from './AudioEngine';
import { recordedVoice } from './samples';

const DURATION: Record<VoiceName, number> = { action: 0.15, scrape: 0.19, judder: 0.23, success: 0.9, rough: 0.8 };

/** Dry blade contact followed by paper fibres; all five voices are synthesized locally. */
export function synthesizePaper(sampleRate: number, kind: VoiceName): Float32Array {
  const data = new Float32Array(Math.ceil(sampleRate * DURATION[kind]));
  let seed = 7829, low = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 0xffffffff * 2 - 1;
    low = low * 0.76 + noise * 0.24;
    const fibre = noise - low;
    let voice = 0;
    if (kind === 'action') {
      voice = fibre * 0.45 * Math.exp(-t * 38) + low * 1.5 * Math.exp(-t * 32)
        + Math.sin(t * Math.PI * 2 * 2800) * Math.exp(-t * 105) * 0.23;
    } else if (kind === 'success') {
      const rustle = Math.sin(Math.min(1, t / 0.6) * Math.PI) ** 2;
      voice = fibre * rustle * 0.14 + low * rustle * 0.75;
      for (const [delay, hz] of [[0.18, 880], [0.32, 1108.73], [0.46, 1318.51]] as const) {
        const age = t - delay;
        if (age > 0) voice += Math.sin(2 * Math.PI * hz * age) * Math.exp(-age * 9) * Math.min(1, age / 0.006) * 0.13;
      }
    } else if (kind === 'rough') {
      voice = (low * 1.2 + fibre * 0.18) * (0.5 + 0.5 * Math.sin(t * 73)) * Math.sin(Math.min(1, t / 0.8) * Math.PI) ** 2;
    } else if (kind === 'scrape') {
      voice = fibre * Math.exp(-t * 23) * 0.38 + Math.sin(t * 2 * Math.PI * 1850) * Math.exp(-t * 50) * 0.12;
    } else {
      voice = low * Math.exp(-t * 16) * 1.2 + Math.sin(t * 2 * Math.PI * 170) * Math.exp(-t * 28) * 0.12;
    }
    const fade = Math.min(1, t / 0.002, (data.length - 1 - i) / (sampleRate * 0.012));
    data[i] = i === 0 ? 0 : Math.max(-1, Math.min(1, voice * Math.max(0, fade)));
  }
  return data;
}

export function createPaperSounds(context: AudioContext): VignetteSounds {
  const make = (kind: VoiceName): AudioBuffer => {
    const data = synthesizePaper(context.sampleRate, kind);
    const buffer = context.createBuffer(1, data.length, context.sampleRate);
    buffer.getChannelData(0).set(data);
    return buffer;
  };
  return { action: recordedVoice(() => make('action'), ['scissors']), success: make('success'), rough: make('rough'), scrape: make('scrape'), judder: make('judder') };
}
