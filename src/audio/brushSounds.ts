import type { VignetteSounds, VoiceName } from './AudioEngine';
import { BRUSH_MOTION } from '../vignettes/brushMotion';

type Material = 'scrub' | 'knock' | 'bloop' | 'ting' | 'fizz' | 'blorp' | 'sigh';
interface SoundEvent { readonly at: number; readonly material: Material; readonly gain: number; readonly pitch: number; readonly length: number }
const TAU = Math.PI * 2;
const LENGTH: Record<VoiceName, number> = { action: 0.18, success: 1.75, rough: 1.6, scrape: 0.1, judder: 0.12 };

function score(voice: VoiceName, take: number): SoundEvent[] {
  const event = (material: Material, at = 0, gain = 1, pitch = 1, length = 0.16): SoundEvent => ({ material, at, gain, pitch, length });
  const M = BRUSH_MOTION;
  switch (voice) {
    case 'action': return [event('scrub', 0, 1, take ? 1.07 : 1)];
    case 'scrape': return [event('scrub', 0, 0.32, 1.3, 0.08)];
    case 'judder': return [event('knock', 0, 0.55, 0.8, 0.1)];
    case 'success': return [
      ...M.flurry.map((at, i) => event('scrub', at, 0.8 - i * 0.08, 1 + i * 0.05, 0.1)),
      // The rinse: a mouthful of water bubbling, rising in pitch.
      ...Array.from({ length: 9 }, (_, k) => event('bloop', M.rinseFrom + k * 0.045, 0.36 - k * 0.015, 0.8 + ((k * 7) % 5) * 0.12, 0.08)),
      event('ting', M.tingAt, 0.75, 1, 0.55),
      event('ting', M.tingAt + 0.08, 0.35, 1.5, 0.45),
    ];
    case 'rough': return [
      event('fizz', 0, 0.55, 1, 0.95),
      event('blorp', M.blorpAt, 0.9, 1, 0.14),
      event('sigh', 1.08, 0.5, 1, 0.45),
    ];
  }
}

/** Bristles on enamel, water in a mouth, and the ting a clean smile makes in an advert. */
function renderEvent(data: Float32Array, sampleRate: number, event: SoundEvent, seed: number): void {
  const start = Math.round(event.at * sampleRate), frames = Math.ceil(event.length * sampleRate);
  let low = 0, mid = 0, phase = 0;
  const decay = (t: number, rate: number) => t < 0 ? 0 : Math.exp(-t * rate);
  const mode = (t: number, hz: number, rate: number) => Math.sin(TAU * hz * event.pitch * t) * decay(t, rate);
  for (let i = 0; i < frames && start + i < data.length; i++) {
    const t = i / sampleRate, p = t / event.length;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 0xffffffff * 2 - 1;
    low += (noise - low) * (1 - Math.exp(-TAU * 1100 * event.pitch / sampleRate));
    mid += (noise - mid) * (1 - Math.exp(-TAU * 7000 * event.pitch / sampleRate));
    const bright = mid - low;
    let value = 0;
    switch (event.material) {
      case 'scrub': {
        // Hundreds of bristle tips flicking over the teeth, and the paste's wet squish under them.
        const flick = 0.6 + 0.4 * Math.sin(TAU * 92 * event.pitch * t) ** 2;
        const body = Math.sin(Math.PI * Math.min(1, p * 1.25)) ** 0.6;
        value = (bright * 1.1 * flick + low * 0.35 * (0.5 + 0.5 * Math.sin(TAU * 31 * t))) * body
          + noise * decay(t, 500) * 0.4;
        break;
      }
      case 'knock':
        value = mode(t, 880, 70) * 0.5 + low * decay(t, 60) * 0.6 + noise * decay(t, 700) * 0.3;
        break;
      case 'bloop': {
        // A bubble: a short upward sweep, the pitch of the air it holds.
        phase += TAU * 420 * event.pitch * (1 + p * 1.1) / sampleRate;
        value = Math.sin(phase) * Math.sin(Math.PI * p) * 0.6;
        break;
      }
      case 'ting':
        value = (mode(t, 2637, 6) * 0.45 + mode(t, 3951, 11) * 0.22 + mode(t, 5274, 18) * 0.08) * Math.min(1, t / 0.0015)
          * (0.85 + 0.15 * Math.sin(t * 60));
        break;
      case 'fizz': {
        // Foam: a dense crackle of tiny bursting bubbles, thinning out.
        const burst = (seed >>> 8) % 1000 < 55 * (1 - p * 0.6) ? 1 : 0;
        value = bright * (0.12 + burst * 1.6) * Math.sin(Math.PI * Math.min(1, p * 1.2)) ** 0.5;
        break;
      }
      case 'blorp': {
        phase += TAU * (160 + 520 * Math.min(1, p * 1.6)) / sampleRate;
        value = Math.sin(phase) * decay(t, 18) * 0.8 + noise * decay(t, 400) * 0.25 + low * decay(t, 40) * 0.4;
        break;
      }
      case 'sigh': {
        phase += TAU * 540 * event.pitch * (1 - p * 0.45) / sampleRate;
        value = (Math.sin(phase) + Math.sin(phase * 2) * 0.15) * Math.sin(Math.PI * p) ** 1.4 * 0.45;
        break;
      }
    }
    const attack = Math.min(1, i / (sampleRate * 0.0006));
    const release = Math.min(1, (frames - 1 - i) / (sampleRate * 0.01));
    data[start + i]! += value * event.gain * attack * release;
  }
}

export function synthesizeBrush(sampleRate: number, voice: VoiceName, take = 0): Float32Array {
  const data = new Float32Array(Math.ceil(sampleRate * LENGTH[voice]));
  score(voice, take).forEach((event, i) => renderEvent(data, sampleRate, event, 12391 + i * 6007 + take * 431));
  // A DC blocker and gentle saturation, as every synthesized act has.
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

export function createBrushSounds(context: AudioContext): VignetteSounds {
  const make = (voice: VoiceName, take = 0): AudioBuffer => {
    const data = synthesizeBrush(context.sampleRate, voice, take);
    const buffer = context.createBuffer(1, data.length, context.sampleRate);
    buffer.getChannelData(0).set(data);
    return buffer;
  };
  return { action: [make('action'), make('action', 1)], success: make('success'), rough: make('rough'), scrape: make('scrape'), judder: make('judder') };
}
