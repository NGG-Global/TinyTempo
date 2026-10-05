import type { VignetteSounds, VoiceName } from './AudioEngine';
import { recordedVoice } from './samples';
import { ICE_CREAM_DROP_AT } from '../vignettes/iceCreamMotion';

const TAU = Math.PI * 2;
const LENGTH: Record<VoiceName, number> = { action: 0.22, success: 1.3, rough: 1.3, scrape: 0.09, judder: 0.14 };

/**
 * A wet lick: a band of noise swept upward with the tongue, opening fast and closing
 * slower. Only the fallback for the recorded slurp, and the start of the success coda.
 */
function lick(age: number, noise: number, low: number): number {
  if (age < 0 || age > 0.2) return 0;
  const sweep = Math.sin(TAU * 420 * age + 900 * age * age);
  return ((noise - low) * 0.45 + low * 0.6) * (0.55 + 0.45 * sweep) * Math.min(1, age / 0.004) * Math.exp(-age * 16);
}

/**
 * The lick's fallback, a smack of the lips for a tap that licked nothing, a hum for a lick
 * missed, and two codas: one last lick and a bright "mm" and chime, or a squeak as the
 * treat slips and a wet splat on the floor at `ICE_CREAM_DROP_AT`. Deterministic, so a
 * test can pin every voice.
 */
export function synthesizeIceCream(rate: number, voice: VoiceName): Float32Array {
  const data = new Float32Array(Math.ceil(rate * LENGTH[voice]));
  let seed = 3307, low = 0, previous = 0, dc = 0;
  const pole = Math.exp(-TAU * 30 / rate);
  const lowCut = 1 - Math.exp(-TAU * 900 / rate);
  for (let i = 0; i < data.length; i++) {
    const t = i / rate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 0xffffffff * 2 - 1;
    low += (noise - low) * lowCut;
    let value = 0;
    if (voice === 'action') {
      value = lick(t, noise, low);
    } else if (voice === 'scrape') {
      // Lips meeting on nothing: a short, dry smack.
      value = ((noise - low) * 0.5 + Math.sin(TAU * 1300 * t) * 0.15) * Math.exp(-t * 60);
    } else if (voice === 'judder') {
      value = Math.sin(TAU * (180 - 40 * t) * t) * Math.exp(-t * 20) * 0.5;
    } else if (voice === 'success') {
      value = lick(t, noise, low);
      // A pleased "mm", then a little rising chime once the treat is gone.
      value += Math.sin(TAU * 196 * t) * Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.3) / 0.4))) * 0.22;
      value += [1046.5, 1318.5, 1568, 2093].reduce((sum, hz, k) => {
        const at = t - 0.45 - k * 0.08;
        return at < 0 ? sum : sum + Math.sin(TAU * hz * at) * Math.exp(-at * (5 + k)) * 0.15 * Math.min(1, at / 0.003);
      }, 0);
    } else {
      // The treat slips: a short falling squeak, then the splat as it lands.
      if (t < 0.18) value = Math.sin(TAU * (1500 * t - 2600 * t * t)) * Math.sin(Math.PI * t / 0.18) * 0.18;
      const age = t - ICE_CREAM_DROP_AT;
      if (age >= 0) {
        value += (low * 1.3 + Math.sin(TAU * (90 + 60 * Math.exp(-age * 30)) * age) * 0.45) * Math.exp(-age * 18) * Math.min(1, age / 0.002);
        value += (noise - low) * 0.25 * Math.exp(-age * 9) * (0.5 + 0.5 * Math.sin(age * 90));
      }
    }
    dc = value - previous + pole * dc;
    previous = value;
    data[i] = Math.tanh(dc * 1.3) * 0.8 * Math.min(1, i / (rate * 0.001)) * Math.min(1, (data.length - 1 - i) / (rate * 0.012));
  }
  return data;
}

export function createIceCreamSounds(context: AudioContext): VignetteSounds {
  const make = (voice: VoiceName): AudioBuffer => {
    const data = synthesizeIceCream(context.sampleRate, voice);
    const buffer = context.createBuffer(1, data.length, context.sampleRate);
    buffer.getChannelData(0).set(data);
    return buffer;
  };
  return {
    // The delivered slurp is the lick; the synthesized one is only there if it never arrives.
    action: recordedVoice(() => make('action'), ['lick']),
    success: make('success'), rough: make('rough'), scrape: make('scrape'), judder: make('judder'),
  };
}
