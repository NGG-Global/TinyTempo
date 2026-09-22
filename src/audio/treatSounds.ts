import type { VignetteSounds, VoiceName } from './AudioEngine';
import { BONGO_BEAT, BONGO_FAIL, FREEZE_AT, SNARE_ROLL, STICK_LANDINGS, WORM_AT } from '../vignettes/treatMotion';

export type TreatAct = 'snare' | 'bongos' | 'slushy' | 'apple';
type Material = 'snare' | 'bongo' | 'wood' | 'slurp' | 'bite' | 'ice' | 'chirp';
interface SoundEvent { at: number; material: Material; gain: number; pitch: number; length: number }
const TAU = Math.PI * 2;
const LENGTH = { action: 0.28, success: 1.8, rough: 1.65, scrape: 0.13, judder: 0.16 } as const;

function score(act: TreatAct, voice: VoiceName, take: number): SoundEvent[] {
  const event = (material: Material, at = 0, gain = 1, pitch = 1, length = 0.24): SoundEvent => ({ material, at, gain, pitch, length });
  const material = { snare: 'snare', bongos: 'bongo', slushy: 'slurp', apple: 'bite' }[act] as Material;
  if (voice === 'scrape' || voice === 'judder') return [event(material, 0, 0.32, voice === 'scrape' ? 1.14 : 0.67, 0.12)];
  if (voice === 'action') return [event(material, 0, 1, take ? 1.035 : 1, act === 'snare' ? 0.2 : 0.25)];
  if (act === 'snare') return voice === 'success'
    ? SNARE_ROLL.map((h, i) => event('snare', h.at, h.gain * 0.74, h.side ? 1.035 : 1, i === SNARE_ROLL.length - 1 ? 0.38 : 0.17))
    : STICK_LANDINGS.map((at, i) => event('wood', at, 0.86 - i * 0.16, 1 + i * 0.13, 0.17));
  if (act === 'bongos') return (voice === 'success' ? BONGO_BEAT : BONGO_FAIL).map(h =>
    event('bongo', h.at, h.gain, (h.side ? 0.78 : 1.14) * (voice === 'rough' ? 0.76 : 1), voice === 'rough' ? 0.37 : 0.26));
  if (act === 'slushy') return voice === 'success'
    ? [event('slurp', 0, 0.8, 1, 0.65), event('slurp', 0.64, 0.45, 1.5, 0.12), event('chirp', 0.86, 0.24, 1.25, 0.3), event('chirp', 1.03, 0.19, 1.5, 0.35)]
    : [event('slurp', 0, 0.65, 1.1, 0.25), event('ice', FREEZE_AT, 0.8, 1, 0.8), event('chirp', 0.53, 0.23, 0.52, 0.5)];
  return voice === 'success'
    ? [event('bite', 0, 0.85, 1, 0.23), event('bite', 0.25, 0.65, 1.12, 0.21), event('bite', 0.5, 0.6, 1.24, 0.2), event('chirp', 0.82, 0.21, 1.25, 0.32), event('chirp', 1, 0.16, 1.5, 0.35)]
    : [event('bite', 0, 0.55, 0.9, 0.18), event('slurp', WORM_AT, 0.45, 1.4, 0.3), event('chirp', 0.62, 0.38, 0.85, 0.47)];
}

/** Modal percussion, microfractures and wet filtered air. No runtime audio nodes per hit. */
function renderEvent(data: Float32Array, sampleRate: number, event: SoundEvent, seed: number): void {
  const start = Math.round(event.at * sampleRate), frames = Math.ceil(event.length * sampleRate);
  let low = 0, mid = 0, resonator = 0, velocity = 0, phase = 0;
  const decay = (t: number, rate: number) => t < 0 ? 0 : Math.exp(-t * rate);
  const mode = (t: number, hz: number, rate: number) => Math.sin(TAU * hz * event.pitch * t) * decay(t, rate);
  for (let i = 0; i < frames && start + i < data.length; i++) {
    const t = i / sampleRate, p = t / event.length;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 0xffffffff * 2 - 1;
    low += (noise - low) * (1 - Math.exp(-TAU * 780 / sampleRate));
    mid += (noise - mid) * (1 - Math.exp(-TAU * 4200 / sampleRate));
    const bright = mid - low;
    let value = 0;
    switch (event.material) {
      case 'snare': {
        const wire = (noise * 0.55 + bright * 0.65) * decay(t, 27) * (0.82 + 0.18 * Math.sin(t * 390));
        const skin = mode(t, 184, 32) * 0.6 + mode(t, 331, 38) * 0.22 + mode(t, 426, 47) * 0.13;
        value = skin + wire * 0.95 + noise * decay(t, 480) * 0.2;
        break;
      }
      case 'bongo': {
        // Integrating the pitch relaxation keeps the attack round, with no oscillator discontinuity.
        phase += TAU * 238 * event.pitch * (1 + 0.19 * Math.exp(-t * 95)) / sampleRate;
        value = Math.sin(phase) * decay(t, 23) * 0.79 + mode(t, 377, 31) * 0.27
          + mode(t, 521, 45) * 0.16 + bright * decay(t, 140) * 0.68;
        break;
      }
      case 'wood':
        value = mode(t, 940, 55) * 0.42 + mode(t, 1570, 74) * 0.24 + bright * decay(t, 130) * 0.6;
        break;
      case 'slurp': {
        // A resonant straw cavity driven by turbulent air, with little suction bubbles.
        const hz = (950 + 340 * Math.sin(t * 33) + 160 * Math.sin(t * 89)) * event.pitch;
        const f = 2 * Math.sin(Math.PI * Math.min(hz, sampleRate * 0.12) / sampleRate);
        velocity += f * (noise - resonator - velocity * 0.32);
        resonator += f * velocity;
        const env = Math.min(1, t / 0.008) * (1 - p) ** 0.5;
        value = (resonator * 0.2 + bright * 0.19) * env * (0.72 + Math.sin(t * 71) * 0.18);
        for (const at of [0.009, 0.054, 0.113, 0.19, 0.32, 0.46, 0.58]) {
          const u = t - at;
          if (u >= 0) value += Math.sin(TAU * (460 * event.pitch * u - 1200 * u * u)) * decay(u, 85) * 0.32;
        }
        break;
      }
      case 'bite': {
        // One bite: a skin snap followed by a cluster of short, juicy flesh fractures.
        value = bright * decay(t, 60) * 0.88 + noise * decay(t, 310) * 0.33 + mode(t, 185, 50) * 0.32;
        for (const [at, gain] of [[0.013, 0.7], [0.031, 0.52], [0.056, 0.4], [0.081, 0.24], [0.117, 0.15]] as const) {
          const u = t - at;
          if (u >= 0) value += (bright * 1.5 + mode(u, 710 + at * 4500, 120) * 0.18) * decay(u, 115) * gain;
        }
        value += low * decay(t, 24) * 0.32;
        break;
      }
      case 'ice':
        for (let k = 0; k < 5; k++) {
          const u = t - k * 0.025;
          if (u >= 0) value += (mode(u, 1730 + k * 640, 9 + k * 3) + mode(u, 2370 + k * 390, 17)) * 0.09;
        }
        value += bright * decay(t, 32) * 0.18;
        break;
      case 'chirp': {
        const hz = 640 * event.pitch * (1 + Math.sin(p * Math.PI) * 0.3 - p * 0.16);
        phase += TAU * hz / sampleRate;
        value = (Math.sin(phase) + Math.sin(phase * 2) * 0.13) * Math.sin(Math.PI * p) ** 1.5 * 0.5;
        break;
      }
    }
    const attack = Math.min(1, i / (sampleRate * 0.0006));
    const release = Math.min(1, (frames - 1 - i) / (sampleRate * 0.015));
    data[start + i]! += value * event.gain * attack * release;
  }
}

export function synthesizeTreat(sampleRate: number, act: TreatAct, voice: VoiceName, take = 0): Float32Array {
  const data = new Float32Array(Math.ceil(sampleRate * LENGTH[voice]));
  score(act, voice, take).forEach((event, i) => renderEvent(data, sampleRate, event, 91573 + i * 8311 + take * 331 + act.length * 727));
  // A DC blocker and gentle saturation protect small phone speakers and coincident roll strokes.
  let previous = 0, dc = 0;
  const pole = Math.exp(-TAU * 25 / sampleRate);
  for (let i = 0; i < data.length; i++) {
    const value = data[i]!;
    dc = value - previous + pole * dc;
    previous = value;
    data[i] = Math.tanh(dc * 1.35) * 0.86 * Math.min(1, (data.length - 1 - i) / (sampleRate * 0.012));
  }
  return data;
}

export function createTreatSounds(context: AudioContext, act: TreatAct): VignetteSounds {
  const make = (voice: VoiceName, take = 0): AudioBuffer => {
    const data = synthesizeTreat(context.sampleRate, act, voice, take);
    const buffer = context.createBuffer(1, data.length, context.sampleRate);
    buffer.getChannelData(0).set(data);
    return buffer;
  };
  return { action: [make('action'), make('action', 1)], success: make('success'), rough: make('rough'), scrape: make('scrape'), judder: make('judder') };
}
