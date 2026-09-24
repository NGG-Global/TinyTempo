import type { VignetteSounds, VoiceName } from './AudioEngine';
import { CANVAS_MOTION } from '../vignettes/canvasMotion';

type Material = 'swish' | 'tick' | 'chime' | 'splat' | 'drip';
interface SoundEvent { readonly at: number; readonly material: Material; readonly gain: number; readonly pitch: number; readonly length: number }
const TAU = Math.PI * 2;
const LENGTH: Record<VoiceName, number> = { action: 0.22, success: 1.65, rough: 1.5, scrape: 0.1, judder: 0.12 };

function score(voice: VoiceName, take: number): SoundEvent[] {
  const event = (material: Material, at = 0, gain = 1, pitch = 1, length = 0.16): SoundEvent => ({ material, at, gain, pitch, length });
  const M = CANVAS_MOTION;
  switch (voice) {
    case 'action': return [event('swish', 0, 1, take ? 1.08 : 1, 0.2)];
    case 'scrape': return [event('swish', 0, 0.28, 1.35, 0.08)];
    case 'judder': return [event('tick', 0, 0.5, 0.85, 0.08)];
    case 'success': return [
      ...M.flurry.map((at, i) => event('swish', at, 0.72 - i * 0.08, 1.05 + i * 0.04, 0.12)),
      event('chime', M.signFrom, 0.7, 1, 0.5),
    ];
    case 'rough': return [
      event('splat', 0.05, 0.9, 1, 0.2),
      event('drip', M.dripFrom, 0.55, 1, 0.45),
    ];
  }
}

/** Bristles on a sized canvas: a soft swish, a signed-off chime, and a wet splat. */
function renderEvent(data: Float32Array, sampleRate: number, event: SoundEvent, seed: number): void {
  const start = Math.round(event.at * sampleRate), frames = Math.ceil(event.length * sampleRate);
  let low = 0, band = 0;
  const decay = (t: number, rate: number) => t < 0 ? 0 : Math.exp(-t * rate);
  const tone = (t: number, hz: number, rate: number) => Math.sin(TAU * hz * event.pitch * t) * decay(t, rate);
  for (let i = 0; i < frames && start + i < data.length; i++) {
    const t = i / sampleRate, p = t / event.length;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 0xffffffff * 2 - 1;
    low += (noise - low) * (1 - Math.exp(-TAU * 900 * event.pitch / sampleRate));
    band += (noise - band) * (1 - Math.exp(-TAU * 2800 * event.pitch / sampleRate));
    const bristle = band - low;
    let value = 0;
    switch (event.material) {
      case 'swish': {
        // The bristles load at the start of the stroke and lighten as they leave the cloth.
        const body = Math.sin(Math.PI * Math.min(1, p)) ** 0.7;
        value = (bristle * 1.15 + low * 0.25) * body;
        break;
      }
      case 'tick':
        value = tone(t, 640, 80) * 0.4 + bristle * decay(t, 90) * 0.35;
        break;
      case 'chime':
        value = (tone(t, 880, 4.5) * 0.45 + tone(t, 1320, 7) * 0.2) * Math.min(1, t / 0.004);
        break;
      case 'splat':
        value = low * decay(t, 18) * 0.9 + noise * decay(t, 40) * 0.45;
        break;
      case 'drip':
        value = tone(t, 220 * (1 + p * 0.4), 6) * Math.sin(Math.PI * p) * 0.5;
        break;
    }
    const attack = Math.min(1, i / (sampleRate * 0.004));
    const release = Math.min(1, (frames - 1 - i) / (sampleRate * 0.012));
    data[start + i]! += value * event.gain * attack * release;
  }
}

export function synthesizeCanvas(sampleRate: number, voice: VoiceName, take = 0): Float32Array {
  const data = new Float32Array(Math.ceil(sampleRate * LENGTH[voice]));
  score(voice, take).forEach((event, i) => renderEvent(data, sampleRate, event, 90210 + i * 4099 + take * 97));
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

export function createCanvasSounds(context: AudioContext): VignetteSounds {
  const make = (voice: VoiceName, take = 0): AudioBuffer => {
    const data = synthesizeCanvas(context.sampleRate, voice, take);
    const buffer = context.createBuffer(1, data.length, context.sampleRate);
    buffer.getChannelData(0).set(data);
    return buffer;
  };
  return { action: [make('action'), make('action', 1)], success: make('success'), rough: make('rough'), scrape: make('scrape'), judder: make('judder') };
}
