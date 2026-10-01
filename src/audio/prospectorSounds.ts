import type { VignetteSounds, VoiceName } from './AudioEngine';
import { PROSPECTOR_SPLIT_AT } from '../vignettes/prospectorMotion';

const TAU = Math.PI * 2;
const LENGTH: Record<VoiceName, number> = { action: 0.22, success: 1.25, rough: 1.25, scrape: 0.1, judder: 0.16 };
/** Inharmonic, like struck steel: a pick's ring is not a note. */
const STEEL = [1870, 2990, 4410] as const;

/** The ring of steel on stone and the crunch of the stone itself, starting at `age` 0. */
function blow(age: number, low: number, crunch: number, pitch: number): number {
  if (age < 0) return 0;
  const ring = STEEL.reduce((sum, hz, k) => sum + Math.sin(TAU * hz * pitch * age) * Math.exp(-age * (55 + k * 25)) * (0.22 - k * 0.05), 0);
  return ring + crunch * Math.exp(-age * 48) * 0.75 + low * Math.exp(-age * 30) * 0.5;
}

/**
 * A pick on a boulder, its glance and its miss, and the two codas: one last blow, the
 * stone splitting at `PROSPECTOR_SPLIT_AT`, and then either a bright rising chime or a
 * dry trickle of grit and two hollow knocks — nothing in there. Deterministic, so a test
 * can pin every voice, and synthesized, so the act needs nothing downloaded.
 */
export function synthesizeProspector(rate: number, voice: VoiceName, take = 0): Float32Array {
  const data = new Float32Array(Math.ceil(rate * LENGTH[voice]));
  let seed = 8461 + take * 1201, low = 0, previous = 0, dc = 0;
  const pole = Math.exp(-TAU * 30 / rate);
  const lowCut = 1 - Math.exp(-TAU * 700 / rate);
  for (let i = 0; i < data.length; i++) {
    const t = i / rate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 0xffffffff * 2 - 1;
    low += (noise - low) * lowCut;
    const crunch = noise - low;
    let value = 0;
    if (voice === 'action') {
      value = blow(t, low, crunch, 1 + take * 0.035);
    } else if (voice === 'scrape') {
      // A glance: grit and a thin edge of steel, no ring.
      value = (crunch * 0.5 + Math.sin(TAU * 3600 * t) * 0.06) * Math.exp(-t * 40);
    } else if (voice === 'judder') {
      value = (low * 0.9 + Math.sin(TAU * 96 * t) * 0.4) * Math.exp(-t * 26);
    } else {
      value = blow(t, low, crunch, 0.97) * 0.8;
      const age = t - PROSPECTOR_SPLIT_AT;
      if (age >= 0) {
        // The stone gives: a low crack and a burst of grit, the same for both endings.
        value += (low * 1.1 + Math.sin(TAU * (70 + 40 * Math.exp(-age * 20)) * age) * 0.5) * Math.exp(-age * 14);
        const after = age - 0.12;
        if (after >= 0) {
          value += voice === 'success'
            ? [1318.5, 1760, 2349.3, 2637].reduce((sum, hz, k) => {
              const at = after - k * 0.07;
              return at < 0 ? sum : sum + Math.sin(TAU * hz * at) * Math.exp(-at * (4 + k)) * 0.16 * Math.min(1, at / 0.003);
            }, 0)
            : crunch * 0.22 * Math.exp(-after * 5) * (0.5 + 0.5 * Math.sin(after * 70))
              + [0.18, 0.42].reduce((sum, at) => {
                const a = after - at;
                return a < 0 ? sum : sum + Math.sin(TAU * 170 * a) * Math.exp(-a * 28) * 0.35 * Math.min(1, a / 0.002);
              }, 0);
        }
      }
    }
    dc = value - previous + pole * dc;
    previous = value;
    data[i] = Math.tanh(dc * 1.3) * 0.8 * Math.min(1, i / (rate * 0.001)) * Math.min(1, (data.length - 1 - i) / (rate * 0.012));
  }
  return data;
}

export function createProspectorSounds(context: AudioContext): VignetteSounds {
  const make = (voice: VoiceName, take = 0): AudioBuffer => {
    const data = synthesizeProspector(context.sampleRate, voice, take);
    const buffer = context.createBuffer(1, data.length, context.sampleRate);
    buffer.getChannelData(0).set(data);
    return buffer;
  };
  // Two takes of the blow, alternated by the engine, so a level of strikes is not one sample.
  return { action: [make('action'), make('action', 1)], success: make('success'), rough: make('rough'), scrape: make('scrape'), judder: make('judder') };
}
