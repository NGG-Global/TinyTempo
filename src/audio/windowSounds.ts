import type { VignetteSounds } from './AudioEngine';
import { recordedVoice } from './samples';

const DURATION: Record<keyof VignetteSounds, number> = {
  action: 0.24, scrape: 0.22, judder: 0.28, success: 0.55, rough: 0.24,
};

export function synthesizeWipe(sampleRate: number, kind: keyof VignetteSounds): Float32Array {
  const duration = DURATION[kind];
  const data = new Float32Array(Math.ceil(sampleRate * duration));
  let seed = 731;
  let filtered = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    filtered = filtered * 0.68 + (seed / 0xffffffff * 2 - 1) * 0.32;
    const envelope = Math.min(1, t / 0.006) * Math.exp(-t * 17);
    const squeak = Math.sin(2 * Math.PI * (kind === 'rough' ? 510 * t - 170 * t * t : 740 * t + 680 * t * t));
    const glint = kind === 'success' ? (Math.sin(t * Math.PI * 2 * 1320) + Math.sin(t * Math.PI * 2 * 1980)) * Math.exp(-t * 9) * Math.min(1, t / 0.004) * 0.12 : 0;
    if (kind === 'scrape') {
      // Rubber skidding dry on glass: the squeal nobody wants to hear.
      const squeal = Math.sin(2 * Math.PI * (1180 * t - 300 * t * t)) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 34 * t));
      data[i] = Math.max(-1, Math.min(1, Math.min(1, t / 0.004) * (squeal * 0.3 + filtered * 0.3) * Math.exp(-t * 13)));
      continue;
    }
    if (kind === 'judder') {
      // The blade dragged across without lifting: a smear, low and flat.
      data[i] = Math.max(-1, Math.min(1, Math.min(1, t / 0.006) * (filtered * 0.7 + Math.sin(2 * Math.PI * 150 * t) * 0.16) * Math.exp(-t * 10)));
      continue;
    }
    data[i] = Math.max(-1, Math.min(1, filtered * envelope * 1.1 + squeak * envelope * 0.1 + glint));
  }
  return data;
}
export function createWindowSounds(context: AudioContext): VignetteSounds {
  const make = (kind: keyof VignetteSounds): AudioBuffer => {
    const data = synthesizeWipe(context.sampleRate, kind);
    const buffer = context.createBuffer(1, data.length, context.sampleRate);
    buffer.getChannelData(0).set(data);
    return buffer;
  };
  return {
    // Two takes, one stroke each way, alternated so a wiped pane is not the same
    // 140 ms of squeegee eleven times running.
    action: recordedVoice(() => make('action'), ['wipe1', 'wipe2']),
    success: make('success'), rough: make('rough'),
    scrape: make('scrape'), judder: make('judder'),
  };
}
