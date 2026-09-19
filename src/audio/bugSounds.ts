import type { VignetteSounds } from './AudioEngine';
import { recordedVoice } from './samples';
const DURATION: Record<keyof VignetteSounds, number> = {
  action: 0.2, scrape: 0.22, judder: 0.24, success: 0.55, rough: 0.55,
};

export function synthesizeStomp(rate: number, kind: keyof VignetteSounds): Float32Array {
  const data = new Float32Array(Math.ceil(rate * DURATION[kind]));
  let seed = 409;
  let grit = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / rate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    grit = grit * 0.8 + (seed / 4294967296 * 2 - 1) * 0.2;
    if (kind === 'scrape') {
      // The sole skidding sideways over the tile, catching the grout.
      const catchy = 0.55 + 0.45 * Math.sin(2 * Math.PI * 41 * t);
      data[i] = Math.max(-1, Math.min(1, Math.min(1, t / 0.003) * grit * 1.4 * catchy * Math.exp(-t * 12)));
      continue;
    }
    if (kind === 'judder') {
      // A stomp that landed on bare floor: all thud, no give.
      const flat = Math.sin(2 * Math.PI * (74 * t - 30 * t * t)) * Math.exp(-t * 24);
      data[i] = Math.max(-1, Math.min(1, Math.min(1, t / 0.002) * (flat * 0.6 + grit * 0.22 * Math.exp(-t * 30))));
      continue;
    }
    const thump = Math.sin(2 * Math.PI * (92 * t - 45 * t * t)) * Math.exp(-t * 28);
    const rubber = Math.sin(2 * Math.PI * (kind === 'rough' ? 340 * t - 200 * t * t : 260 * t + 420 * t * t)) * Math.exp(-t * 13);
    data[i] = Math.min(1, t / 0.003) * (0.55 * thump + 0.18 * rubber);
  }
  return data;
}
export function createBugSounds(context: AudioContext): VignetteSounds {
  const make = (kind: keyof VignetteSounds) => {
    const data = synthesizeStomp(context.sampleRate, kind);
    const buffer = context.createBuffer(1, data.length, context.sampleRate);
    buffer.getChannelData(0).set(data);
    return buffer;
  };
  return {
    action: recordedVoice(() => make('action'), ['shoe']), success: make('success'), rough: make('rough'),
    scrape: make('scrape'), judder: make('judder'),
  };
}
