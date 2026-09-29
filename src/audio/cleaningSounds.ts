import type { VignetteSounds, VoiceName } from './AudioEngine';
import { recordedVoice } from './samples';
import { CLEANING_REVEAL_AT } from '../vignettes/cleaningMotion';

export type CleaningAct = 'nose' | 'dish';
const TAU = Math.PI * 2;
const LENGTH: Record<VoiceName, number> = { action: 0.19, success: 1.2, rough: 1.2, scrape: 0.09, judder: 0.12 };

/** Wet sponge friction, a tissue's breathy honk, a bright finish and a little drip. */
export function synthesizeCleaning(rate: number, act: CleaningAct, voice: VoiceName, take = 0): Float32Array {
  const data = new Float32Array(Math.ceil(rate * LENGTH[voice]));
  let seed = 5719 + take * 977, low = 0, previous = 0, dc = 0;
  const pole = Math.exp(-TAU * 25 / rate);
  for (let i = 0; i < data.length; i++) {
    const t = i / rate, p = i / data.length;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 0xffffffff * 2 - 1;
    low += (noise - low) * (1 - Math.exp(-TAU * 1000 / rate));
    let value = 0;
    if (voice === 'action' || voice === 'scrape') {
      const envelope = Math.exp(-p * 3) * Math.min(1, t / 0.002);
      value = act === 'nose'
        ? (low * 1.5 + Math.sin(TAU * (170 + take * 11) * t) * 0.25 * (0.6 + 0.4 * Math.sin(t * 90))) * envelope
        : ((noise - low) * 0.65 + low * 0.5) * envelope * (0.65 + 0.35 * Math.sin(t * 175) ** 2);
      if (voice === 'scrape') value *= 0.3;
    } else if (voice === 'judder') {
      value = (low * 0.6 + Math.sin(TAU * 310 * t) * 0.3) * Math.exp(-t * 38);
    } else {
      // These contacts coincide with the uncovered face / final clean patch.
      const age = t - CLEANING_REVEAL_AT;
      if (age >= 0) {
        if (voice === 'success') {
          value = [880, 1320, 1760].reduce((sum, hz, k) => sum + Math.sin(TAU * hz * age) * Math.exp(-age * (5 + k * 2)) * 0.18, 0);
          if (act === 'nose') value += low * Math.exp(-age * 7) * 0.3;
        } else {
          value = act === 'nose'
            ? (low * 0.9 + Math.sin(TAU * (230 * age - 55 * age * age)) * 0.2) * Math.exp(-age * 6)
            : Math.sin(TAU * (530 * age - 180 * age * age)) * Math.exp(-age * 13) * 0.65;
        }
        value *= Math.min(1, age / 0.003);
      }
    }
    dc = value - previous + pole * dc;
    previous = value;
    data[i] = Math.tanh(dc * 1.4) * 0.8 * Math.min(1, i / (rate * 0.001)) * Math.min(1, (data.length - 1 - i) / (rate * 0.012));
  }
  return data;
}

export function createCleaningSounds(context: AudioContext, act: CleaningAct): VignetteSounds {
  const make = (voice: VoiceName, take = 0): AudioBuffer => {
    const data = synthesizeCleaning(context.sampleRate, act, voice, take);
    const buffer = context.createBuffer(1, data.length, context.sampleRate);
    buffer.getChannelData(0).set(data);
    return buffer;
  };
  return {
    action: act === 'nose' ? recordedVoice(() => make('action'), ['nose']) : [make('action'), make('action', 1)],
    success: make('success'), rough: make('rough'), scrape: make('scrape'), judder: make('judder'),
  };
}
