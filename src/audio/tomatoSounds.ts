import type { VignetteSounds, VoiceName } from './AudioEngine';

const DURATION: Record<VoiceName, number> = {
  action: 0.2, scrape: 0.18, judder: 0.24, success: 0.6, rough: 0.55,
};

/**
 * A knife meeting a wooden board: a short bright click into a dry wood body, with a
 * wet element for the tomato. Deterministic and local: no encoder, no downloaded asset.
 */
export function synthesizeChop(sampleRate: number, kind: VoiceName): Float32Array {
  const data = new Float32Array(Math.ceil(sampleRate * DURATION[kind]));
  let seed = 1289;
  let wet = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const white = seed / 0xffffffff * 2 - 1;
    // Low-passed noise reads as flesh giving way; the raw click is the edge on the board.
    wet = wet * 0.82 + white * 0.18;
    const board = Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 38);
    const click = white * Math.exp(-t * 260);
    let voice: number;
    if (kind === 'action') {
      voice = board * 0.6 + click * 0.5 + wet * 0.35 * Math.exp(-t * 22);
    } else if (kind === 'scrape') {
      // Bare board, nothing to cut: a hollower knock and no wet component at all.
      voice = Math.sin(2 * Math.PI * 240 * t) * Math.exp(-t * 30) * 0.6 + click * 0.6;
    } else if (kind === 'judder') {
      // A blade held still but not steady: it settles back on the board with a dull knock
      // and rings with a tremor over it. Levelled with the other four vignettes' accents —
      // measured, this was a fifth of their peak, so a missed beat all but passed here.
      const tremor = 0.6 + 0.4 * Math.sin(2 * Math.PI * 21 * t);
      const knock = Math.sin(2 * Math.PI * 120 * t) * Math.exp(-t * 26) * 0.42;
      voice = knock + Math.sin(2 * Math.PI * 2300 * t) * Math.exp(-t * 12) * 0.2 * tremor + wet * 0.05 * Math.exp(-t * 9);
    } else if (kind === 'success') {
      // The last slice, then a single seed landing a moment later.
      const late = t - 0.34;
      const pip = late > 0 ? Math.sin(2 * Math.PI * 1500 * late) * Math.exp(-late * 70) * 0.25 : 0;
      voice = board * 0.55 * Math.exp(-t * 4) + click * 0.45 + wet * 0.4 * Math.exp(-t * 14) + pip;
    } else {
      // A squashed slice: the wet part dominates and lingers, the board barely speaks.
      voice = wet * 0.75 * Math.exp(-t * 7) + board * 0.25 + Math.sin(2 * Math.PI * (130 * t - 60 * t * t)) * Math.exp(-t * 9) * 0.2;
    }
    data[i] = Math.max(-1, Math.min(1, Math.min(1, t / 0.002) * voice));
  }
  return data;
}

export function createTomatoSounds(context: AudioContext): VignetteSounds {
  const make = (kind: VoiceName): AudioBuffer => {
    const samples = synthesizeChop(context.sampleRate, kind);
    const buffer = context.createBuffer(1, samples.length, context.sampleRate);
    buffer.getChannelData(0).set(samples);
    return buffer;
  };
  return {
    action: make('action'), success: make('success'), rough: make('rough'),
    scrape: make('scrape'), judder: make('judder'),
  };
}
