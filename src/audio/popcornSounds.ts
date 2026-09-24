import type { VignetteSounds, VoiceName } from './AudioEngine';
import { POPCORN_MOTION } from '../vignettes/popcornMotion';

type Material = 'pop' | 'boom' | 'tick' | 'hiss' | 'pff' | 'twinkle' | 'sigh';
interface SoundEvent { readonly at: number; readonly material: Material; readonly gain: number; readonly pitch: number; readonly length: number }
const TAU = Math.PI * 2;
const LENGTH: Record<VoiceName, number> = { action: 0.16, success: 1.7, rough: 1.5, scrape: 0.1, judder: 0.14 };

/** Oil crackling faster and faster: little ticks, deterministic, denser towards `to`. */
function sizzle(from: number, to: number, count: number, gain: number): { at: number; gain: number; pitch: number }[] {
  return Array.from({ length: count }, (_, k) => {
    const p = (k + 0.5) / count;
    return { at: from + (to - from) * Math.sqrt(p), gain: gain * (0.5 + 0.5 * p), pitch: 0.8 + ((k * 37) % 11) / 11 * 0.8 };
  });
}

function score(voice: VoiceName, take: number): SoundEvent[] {
  const event = (material: Material, at = 0, gain = 1, pitch = 1, length = 0.14): SoundEvent => ({ material, at, gain, pitch, length });
  const M = POPCORN_MOTION;
  switch (voice) {
    case 'action': return [event('pop', 0, 1, take ? 1.08 : 1)];
    case 'scrape': return [event('pop', 0, 0.32, 1.35, 0.08)];
    case 'judder': return [event('pff', 0, 0.5, 0.7, 0.12)];
    case 'success': return [
      ...sizzle(0.02, M.bigPopAt - 0.02, 26, 0.34).map(t => event('tick', t.at, t.gain, t.pitch, 0.012)),
      event('boom', M.bigPopAt, 1, 1, 0.7),
      // The rest of the bowl, popping in behind it.
      ...Array.from({ length: 12 }, (_, k) => event('pop', M.rainFrom + M.rainSec * k / 12, 0.42 - k * 0.015, 0.9 + ((k * 5) % 7) * 0.07, 0.1)),
      event('twinkle', 1.08, 0.3, 1.25, 0.32),
      event('twinkle', 1.26, 0.26, 1.5, 0.36),
    ];
    case 'rough': return [
      ...sizzle(0.02, 0.4, 14, 0.22).map(t => event('tick', t.at, t.gain, t.pitch, 0.012)),
      event('hiss', M.smokeFrom, 0.55, 1, 0.95),
      event('pff', M.burntFrom, 0.8, 0.85, 0.16),
      event('tick', M.burntLands, 0.7, 0.55, 0.03),
      event('sigh', 1.0, 0.55, 1, 0.45),
    ];
  }
}

/** A kernel's husk splitting, oil spitting, and one very large kernel indeed. */
function renderEvent(data: Float32Array, sampleRate: number, event: SoundEvent, seed: number): void {
  const start = Math.round(event.at * sampleRate), frames = Math.ceil(event.length * sampleRate);
  let low = 0, mid = 0, phase = 0;
  const decay = (t: number, rate: number) => t < 0 ? 0 : Math.exp(-t * rate);
  const mode = (t: number, hz: number, rate: number) => Math.sin(TAU * hz * event.pitch * t) * decay(t, rate);
  for (let i = 0; i < frames && start + i < data.length; i++) {
    const t = i / sampleRate, p = t / event.length;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 0xffffffff * 2 - 1;
    low += (noise - low) * (1 - Math.exp(-TAU * 700 / sampleRate));
    mid += (noise - mid) * (1 - Math.exp(-TAU * 5600 / sampleRate));
    const bright = mid - low;
    let value = 0;
    switch (event.material) {
      case 'pop':
        // The husk cracks, and the puff behind it rings hollow for a moment.
        value = noise * decay(t, 650) * 0.8 + bright * decay(t, 160) * 0.6
          + mode(t, 720, 55) * 0.42 + mode(t, 1290, 80) * 0.18 + mode(t, 170, 45) * 0.3;
        break;
      case 'boom': {
        // The enormous one: a crack, a pitch-dropping thump and a long hollow tail.
        phase += TAU * (95 * (1 + 1.4 * Math.exp(-t * 18))) / sampleRate;
        value = noise * decay(t, 120) * 0.9 + bright * decay(t, 30) * 0.5
          + Math.sin(phase) * decay(t, 6) * 0.95 + mode(t, 410, 14) * 0.35 + low * decay(t, 9) * 0.6;
        break;
      }
      case 'tick':
        value = (bright * 1.2 + noise * 0.4) * decay(t, 520) + mode(t, 3100, 400) * 0.2;
        break;
      case 'hiss':
        // Smoke off a dry pan: soft, falling, all air.
        value = (bright * 0.35 + low * 0.35) * Math.sin(Math.PI * p) ** 0.7 * (1 - p * 0.4);
        break;
      case 'pff':
        value = low * decay(t, 34) * 1.1 + mode(t, 240, 40) * 0.25 + noise * decay(t, 400) * 0.15;
        break;
      case 'twinkle': {
        phase += TAU * 1760 * event.pitch * (1 + p * 0.3) / sampleRate;
        value = Math.sin(phase) * Math.sin(Math.PI * p) ** 1.5 * 0.4 * (0.7 + 0.3 * Math.sin(t * 120));
        break;
      }
      case 'sigh': {
        phase += TAU * 560 * event.pitch * (1 - p * 0.45) / sampleRate;
        value = (Math.sin(phase) + Math.sin(phase * 2) * 0.15) * Math.sin(Math.PI * p) ** 1.4 * 0.45;
        break;
      }
    }
    const attack = Math.min(1, i / (sampleRate * 0.0005));
    const release = Math.min(1, (frames - 1 - i) / (sampleRate * 0.008));
    data[start + i]! += value * event.gain * attack * release;
  }
}

export function synthesizePopcorn(sampleRate: number, voice: VoiceName, take = 0): Float32Array {
  const data = new Float32Array(Math.ceil(sampleRate * LENGTH[voice]));
  score(voice, take).forEach((event, i) => renderEvent(data, sampleRate, event, 70117 + i * 5051 + take * 887));
  // A DC blocker and gentle saturation: the big pop is loud, and a phone speaker is small.
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

export function createPopcornSounds(context: AudioContext): VignetteSounds {
  const make = (voice: VoiceName, take = 0): AudioBuffer => {
    const data = synthesizePopcorn(context.sampleRate, voice, take);
    const buffer = context.createBuffer(1, data.length, context.sampleRate);
    buffer.getChannelData(0).set(data);
    return buffer;
  };
  return { action: [make('action'), make('action', 1)], success: make('success'), rough: make('rough'), scrape: make('scrape'), judder: make('judder') };
}
