import type { VignetteSounds, VoiceName } from './AudioEngine';
import { recordedVoice } from './samples';

const DURATION: Record<VoiceName, number> = {
  action: 0.24, scrape: 0.26, judder: 0.28, success: 0.7, rough: 0.8,
};

/**
 * A rep has two sounds in it, a breath and iron, so every voice here is shaped from one
 * seeded noise source and a few decaying sines. Deterministic and local: no encoder, no
 * downloaded asset.
 */
export function synthesizeCurl(sampleRate: number, kind: VoiceName): Float32Array {
  const data = new Float32Array(Math.ceil(sampleRate * DURATION[kind]));
  let seed = 613;
  let breath = 0;
  let slow = 0;
  const clink = (t: number, hz: number, decay: number): number => t > 0 ? Math.sin(2 * Math.PI * hz * t) * Math.exp(-t * decay) : 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const white = seed / 0xffffffff * 2 - 1;
    // Breath is noise with the hiss taken off and the rumble taken out: a band, not a sheet.
    breath = breath * 0.62 + white * 0.38;
    slow = slow * 0.94 + breath * 0.06;
    const puff = breath - slow;
    let voice: number;
    if (kind === 'action') {
      // The exhale on the squeeze, and the plates settling against the grip under it.
      const exhale = puff * 0.9 * Math.min(1, t / 0.012) * Math.exp(-t * 15);
      const iron = clink(t, 1650, 70) * 0.22 + clink(t, 2420, 95) * 0.1;
      voice = exhale + iron;
    } else if (kind === 'scrape') {
      // A half rep let go: the plates clank against each other twice as the arm gives.
      const pair = (f: number): number => clink(f, 1280, 55) + clink(f, 1900, 62) * 0.6;
      voice = pair(t) * 0.5 + pair(t - 0.09) * 0.38 + slow * 0.5 * Math.exp(-t * 20);
    } else if (kind === 'judder') {
      // The arm trembling under a weight it did not lift: a low shake, not a note.
      const tremor = Math.sin(2 * Math.PI * 62 * t) * (0.55 + 0.45 * Math.sin(2 * Math.PI * 17 * t));
      voice = tremor * 0.55 * Math.exp(-t * 7) + slow * 0.6 * Math.exp(-t * 9);
    } else if (kind === 'success') {
      // The weight racked cleanly, then a long relieved breath out.
      const rack = (clink(t, 1650, 22) * 0.5 + clink(t, 2470, 30) * 0.25) * Math.min(1, t / 0.004);
      const relief = t > 0.12 ? puff * 0.45 * Math.min(1, (t - 0.12) / 0.05) * Math.exp(-(t - 0.12) * 4) : 0;
      const hum = Math.sin(2 * Math.PI * (220 * t - 40 * t * t)) * 0.12 * Math.exp(-t * 5);
      voice = rack + relief + hum;
    } else {
      // The arm gives with a grunt, and the dumbbell meets the mat a moment later, twice.
      const grunt = Math.sin(2 * Math.PI * (110 * t - 40 * t * t)) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 30 * t)) * Math.exp(-t * 9) * 0.5;
      const thud = (f: number, level: number): number => f > 0
        ? (Math.sin(2 * Math.PI * (64 * f - 30 * f * f)) * Math.exp(-f * 18) * 0.85 + slow * 0.9 * Math.exp(-f * 40)) * level
        : 0;
      voice = grunt + slow * 0.3 * Math.exp(-t * 12) + thud(t - 0.3, 1) + thud(t - 0.6, 0.35);
    }
    // The attack ramp starts from true silence; a ramp of zero times a negative sample is -0.
    data[i] = i === 0 ? 0 : Math.max(-1, Math.min(1, Math.min(1, t / 0.002) * voice));
  }
  return data;
}

export function createCurlSounds(context: AudioContext): VignetteSounds {
  const make = (kind: VoiceName): AudioBuffer => {
    const data = synthesizeCurl(context.sampleRate, kind);
    const buffer = context.createBuffer(1, data.length, context.sampleRate);
    buffer.getChannelData(0).set(data);
    return buffer;
  };
  return {
    action: recordedVoice(() => make('action'), ['grunt']), success: make('success'), rough: make('rough'),
    scrape: make('scrape'), judder: make('judder'),
  };
}
