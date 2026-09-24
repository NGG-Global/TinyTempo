import type { VignetteSounds, VoiceName } from './AudioEngine';
import { BARBER_CUES, BARBER_MOTION } from '../vignettes/barberMotion';

/** The barber's voices, including the middling cut's own coda. */
export type BarberVoice = VoiceName | 'partial';
type Material = 'snip' | 'whoosh' | 'chime' | 'query' | 'thump' | 'sigh' | 'twinkle';
interface SoundEvent { readonly at: number; readonly material: Material; readonly gain: number; readonly pitch: number; readonly length: number }
const TAU = Math.PI * 2;
const LENGTH: Record<BarberVoice, number> = { action: 0.2, success: 1.7, partial: 1.4, rough: 1.3, scrape: 0.12, judder: 0.14 };

function score(voice: BarberVoice, take: number): SoundEvent[] {
  const event = (material: Material, at = 0, gain = 1, pitch = 1, length = 0.18): SoundEvent => ({ material, at, gain, pitch, length });
  switch (voice) {
    case 'action': return [event('snip', 0, 1, take ? 1.045 : 1)];
    case 'scrape': return [event('snip', 0, 0.34, 1.16, 0.1)];
    case 'judder': return [event('snip', 0, 0.36, 0.62, 0.12)];
    case 'success': {
      const cue = BARBER_CUES.success;
      return [
        ...BARBER_MOTION.flurry.map((at, i) => event('snip', at, 0.85 - i * 0.08, 1 + i * 0.04)),
        event('whoosh', cue.capeAt, 0.9, 1, 0.42),
        event('chime', cue.eyesAt, 0.8, 1, 0.9),
        event('chime', cue.eyesAt + 0.13, 0.7, 1.335, 0.8),
        event('twinkle', cue.shineAt, 0.3, 1.5, 0.36),
      ];
    }
    case 'partial': {
      const cue = BARBER_CUES.partial;
      return [event('whoosh', cue.capeAt, 0.6, 0.85, 0.5), event('query', cue.eyesAt, 0.7, 1, 0.55)];
    }
    case 'rough': {
      const cue = BARBER_CUES.fail;
      return [event('snip', 0, 0.45, 0.8, 0.12), event('thump', cue.hatLands, 1, 1, 0.3), event('sigh', cue.hatLands + 0.2, 0.62, 1, 0.5)];
    }
  }
}

/** Two blades closing on each other, cloth rushing through the air, and small bells. */
function renderEvent(data: Float32Array, sampleRate: number, event: SoundEvent, seed: number): void {
  const start = Math.round(event.at * sampleRate), frames = Math.ceil(event.length * sampleRate);
  let low = 0, mid = 0, phase = 0;
  const decay = (t: number, rate: number) => t < 0 ? 0 : Math.exp(-t * rate);
  const mode = (t: number, hz: number, rate: number) => Math.sin(TAU * hz * event.pitch * t) * decay(t, rate);
  for (let i = 0; i < frames && start + i < data.length; i++) {
    const t = i / sampleRate, p = t / event.length;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 0xffffffff * 2 - 1;
    low += (noise - low) * (1 - Math.exp(-TAU * 900 / sampleRate));
    mid += (noise - mid) * (1 - Math.exp(-TAU * 5200 / sampleRate));
    const bright = mid - low;
    let value = 0;
    switch (event.material) {
      case 'snip': {
        // The edges grinding past each other, then the ring of the blades as they meet.
        const shear = bright * decay(t, 70) * Math.min(1, t / 0.004) * 0.9;
        const meet = t - 0.018;
        value = shear + noise * decay(t, 900) * 0.35
          + (mode(meet, 4180, 60) * 0.34 + mode(meet, 6230, 85) * 0.2 + mode(meet, 2710, 48) * 0.16) * (meet >= 0 ? 1 : 0)
          + bright * decay(meet, 260) * 0.7 * (meet >= 0 ? 1 : 0);
        break;
      }
      case 'whoosh': {
        // A cape through the air: noise whose band rises and falls with the swing.
        const swing = Math.sin(Math.PI * p);
        value = (bright * (0.35 + 0.65 * swing) + low * 0.8 * swing) * swing * 0.7;
        break;
      }
      case 'chime':
        value = (mode(t, 1318.5, 5) * 0.5 + mode(t, 2637, 11) * 0.18 + mode(t, 3950, 19) * 0.07) * Math.min(1, t / 0.002);
        break;
      case 'query': {
        // A hum that dips and then lifts: "hm?"
        const hz = 330 * (1 - 0.09 * Math.sin(Math.PI * Math.min(1, p * 1.6)) + 0.22 * Math.max(0, p - 0.55));
        phase += TAU * hz * event.pitch / sampleRate;
        value = (Math.sin(phase) + Math.sin(phase * 2) * 0.22 + Math.sin(phase * 3) * 0.08) * Math.sin(Math.PI * p) ** 0.8 * 0.5;
        break;
      }
      case 'thump':
        // Knitted wool landing on hair: all body and no click.
        value = (mode(t, 96, 20) * 0.9 + low * decay(t, 30) * 0.7) * Math.min(1, t / 0.006);
        break;
      case 'sigh': {
        const hz = 620 * event.pitch * (1 - p * 0.45);
        phase += TAU * hz / sampleRate;
        value = (Math.sin(phase) + Math.sin(phase * 2) * 0.15) * Math.sin(Math.PI * p) ** 1.4 * 0.45;
        break;
      }
      case 'twinkle': {
        const hz = 1760 * event.pitch * (1 + p * 0.3);
        phase += TAU * hz / sampleRate;
        value = Math.sin(phase) * Math.sin(Math.PI * p) ** 1.5 * 0.4 * (0.7 + 0.3 * Math.sin(t * 120));
        break;
      }
    }
    const attack = Math.min(1, i / (sampleRate * 0.0006));
    const release = Math.min(1, (frames - 1 - i) / (sampleRate * 0.012));
    data[start + i]! += value * event.gain * attack * release;
  }
}

export function synthesizeBarber(sampleRate: number, voice: BarberVoice, take = 0): Float32Array {
  const data = new Float32Array(Math.ceil(sampleRate * LENGTH[voice]));
  score(voice, take).forEach((event, i) => renderEvent(data, sampleRate, event, 40961 + i * 7919 + take * 613));
  // A DC blocker and gentle saturation keep coincident snips clean on a phone speaker.
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

export function createBarberSounds(context: AudioContext): VignetteSounds {
  const make = (voice: BarberVoice, take = 0): AudioBuffer => {
    const data = synthesizeBarber(context.sampleRate, voice, take);
    const buffer = context.createBuffer(1, data.length, context.sampleRate);
    buffer.getChannelData(0).set(data);
    return buffer;
  };
  return {
    action: [make('action'), make('action', 1)], success: make('success'), partial: make('partial'), rough: make('rough'),
    scrape: make('scrape'), judder: make('judder'),
  };
}
