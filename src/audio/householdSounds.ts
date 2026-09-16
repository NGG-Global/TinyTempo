import type { VignetteSounds } from './AudioEngine';
import { BUBBLE_CHAIN } from '../vignettes/householdMotion';

export type HouseholdAct = 'egg' | 'bubble' | 'light' | 'doorbell';
type Voice = keyof VignetteSounds;
const TAU = Math.PI * 2;
const LENGTH: Record<HouseholdAct, Record<Voice, number>> = {
  egg: { action: 0.18, success: 1.1, rough: 0.52, scrape: 0.15, judder: 0.16 },
  bubble: { action: 0.14, success: 1.05, rough: 0.3, scrape: 0.12, judder: 0.14 },
  light: { action: 0.12, success: 1.5, rough: 0.34, scrape: 0.12, judder: 0.14 },
  doorbell: { action: 0.39, success: 1.5, rough: 0.64, scrape: 0.13, judder: 0.18 },
};
const decay = (t: number, rate: number) => t < 0 ? 0 : Math.exp(-t * rate);
const tone = (t: number, hz: number, rate: number) => t < 0 ? 0 : Math.sin(TAU * hz * t) * decay(t, rate);
const pop = (t: number, pitch: number, noise: number) => t < 0 ? 0
  : Math.sin(TAU * (pitch * t + 13 * (1 - Math.exp(-t * 65)))) * decay(t, 62) * 0.58
    + noise * decay(t, 210) * 0.23;
const bell = (t: number, hz: number) => tone(t, hz, 12) * 0.3 + tone(t, hz * 2.756, 25) * 0.08 + tone(t, hz * 5.404, 42) * 0.025;

/** Material voices share one clock and seeded excitation, never a second AudioContext. */
export function synthesizeHousehold(sampleRate: number, act: HouseholdAct, kind: Voice): Float32Array {
  const duration = LENGTH[act][kind];
  const data = new Float32Array(Math.ceil(sampleRate * duration));
  let seed = 7349 + act.length * 7919, low = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 0xffffffff * 2 - 1;
    low = low * 0.84 + noise * 0.16;
    let v = 0;
    if (kind === 'scrape' || kind === 'judder') {
      // Small material-specific error sounds leave the musical pulse audible.
      const pitch = { egg: 480, bubble: 220, light: 960, doorbell: 330 }[act];
      v = kind === 'scrape'
        ? noise * decay(t, 70) * 0.18 + tone(t, pitch, 40) * 0.19
        : tone(t, pitch * 0.6, 32) * 0.21 + low * decay(t, 35) * 0.15;
    } else if (act === 'egg') {
      const ceramic = bell(t, 1660) * 0.56 + tone(t, 780, 43) * 0.16;
      const knock = noise * decay(t, 180) * 0.23 + tone(t, 290, 60) * 0.2;
      if (kind === 'action') v = ceramic + knock;
      else if (kind === 'success') {
        const crack = noise * (decay(t, 80) + decay(t - 0.026, 100) * 0.55 + decay(t - 0.06, 95) * 0.25);
        const wet = t - 0.6;
        v = crack * 0.28 + ceramic * 0.55 + low * decay(wet, 18) * 0.8 + pop(wet, 95, noise) * 0.4;
      } else v = knock * 0.8 + noise * decay(t - 0.09, 38) * 0.15 + tone(t - 0.21, 1050, 38) * 0.12;
    } else if (act === 'bubble') {
      if (kind === 'action') v = pop(t, 220, noise);
      else if (kind === 'success') {
        v = pop(t, 220, noise) * 0.4;
        for (let p = 0; p < BUBBLE_CHAIN.length; p++) v += pop(t - BUBBLE_CHAIN[p]!, 170 + p * 31, noise) * (0.82 + (p % 2) * 0.12);
      } else v = low * decay(t, 17) * 0.55 + tone(t, 120, 35) * 0.17;
    } else if (act === 'light') {
      const click = noise * decay(t, 260) * 0.45 + tone(t, 1850, 115) * 0.25 + tone(t - 0.022, 720, 120) * 0.17;
      v = click;
      if (kind === 'success') {
        for (let k = 0; k < 5; k++) v += bell(t - 0.28 - k * 0.09, [523.25, 659.25, 783.99, 1046.5, 1318.5][k]!) * 0.6;
        v += tone(t - 0.12, 130.81, 2.8) * 0.035;
      } else if (kind === 'rough') v += tone(t - 0.09, 110, 22) * 0.17 + low * decay(t - 0.09, 24) * 0.12;
    } else {
      const button = noise * decay(t, 210) * 0.13 + tone(t, 640, 90) * 0.13;
      if (kind === 'action') v = button + bell(t, 1046.5) + bell(t - 0.115, 783.99) * 0.85;
      else if (kind === 'success') {
        const hinge = t - 0.16;
        const creak = hinge >= 0 ? Math.sin(TAU * (180 * hinge + 21 * hinge * hinge) + Math.sin(hinge * 53) * 0.8) * decay(hinge, 5) : 0;
        v = button + tone(t - 0.12, 340, 45) * 0.23 + creak * 0.075 + low * decay(hinge, 7) * 0.12;
        v += bell(t - 0.42, 523.25) * 0.48 + bell(t - 0.57, 659.25) * 0.43 + bell(t - 0.72, 783.99) * 0.4;
      } else v = button + bell(t, 783.99) * 0.45 + bell(t - 0.15, 587.33) * 0.38;
    }
    const attack = Math.min(1, t / 0.0007);
    const release = Math.min(1, (data.length - 1 - i) / (sampleRate * 0.025));
    // Soft saturation catches coincident resonances without a hard clipped transient.
    data[i] = Math.tanh(v * 1.1) * attack * release;
  }
  return data;
}

export function createHouseholdSounds(context: AudioContext, act: HouseholdAct): VignetteSounds {
  const make = (kind: Voice): AudioBuffer => {
    const samples = synthesizeHousehold(context.sampleRate, act, kind);
    const buffer = context.createBuffer(1, samples.length, context.sampleRate);
    buffer.getChannelData(0).set(samples);
    return buffer;
  };
  return { action: make('action'), success: make('success'), rough: make('rough'), scrape: make('scrape'), judder: make('judder') };
}
