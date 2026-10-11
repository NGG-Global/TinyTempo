import type { VignetteSounds, VoiceName } from './AudioEngine';
import { CHEER_AT, GLASS_BREAK_AT, GLASS_SPILL_AT } from '../vignettes/glassesMotion';

const TAU = Math.PI * 2;
const LENGTH: Record<VoiceName, number> = { action: 0.32, success: 1.35, rough: 1.35, scrape: 0.1, judder: 0.12 };
/** A glass's modes are not a harmonic series: these ratios are what make it ring like glass. */
const MODES = [1, 2.08, 3.41, 5.02] as const;
/** The two glasses of a clink, a little apart in pitch, so the ring shimmers as they beat. */
const PAIR = [1480, 1562] as const;

/** One glass ringing at `hz` from `age` 0, its modes dying faster the higher they sit. */
function ring(age: number, hz: number, decay: number): number {
  if (age < 0) return 0;
  let sum = 0;
  for (const [k, ratio] of MODES.entries()) sum += Math.sin(TAU * hz * ratio * age) * Math.exp(-age * decay * (1 + k * 0.9)) * (0.3 / (1 + k));
  return sum * Math.min(1, age / 0.0008);
}

/** Two glasses touching: the tick of the contact and both of them ringing. */
function clink(age: number, bright: number, pitch: number, decay: number): number {
  if (age < 0) return 0;
  return ring(age, PAIR[0] * pitch, decay) + ring(age, PAIR[1] * pitch, decay * 1.1) + bright * Math.exp(-age * 900) * 0.45;
}

/** Deterministic scatter for the shatter's tinkles: when each piece rings and at what pitch. */
const TINKLES = (() => {
  let seed = 4021;
  const next = (): number => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 0xffffffff;
  return Array.from({ length: 22 }, (_, k) => ({
    // The first half go as the bowl flies apart; the rest as the pieces land on the cloth.
    at: k < 11 ? next() * 0.18 : 0.24 + next() * 0.3,
    hz: 2600 + next() * 5200,
    gain: k < 11 ? 0.24 : 0.15,
  }));
})();

/**
 * The clink, a knock for a tap that clinked nothing, a dull tick for a clink missed, and two
 * codas: a full clink that rings on under a fizz and a rising chime at `CHEER_AT`; or a clink
 * that cracks, the bowl shattering at `GLASS_BREAK_AT`, its pieces landing, and the drink
 * hitting the cloth at `GLASS_SPILL_AT`. Deterministic, so a test can pin every voice.
 */
export function synthesizeGlasses(rate: number, voice: VoiceName, take = 0): Float32Array {
  const data = new Float32Array(Math.ceil(rate * LENGTH[voice]));
  let seed = 9133 + take * 613, low = 0, high = 0, previous = 0, dc = 0;
  const pole = Math.exp(-TAU * 30 / rate);
  const lowCut = 1 - Math.exp(-TAU * 700 / rate);
  const highCut = 1 - Math.exp(-TAU * 3200 / rate);
  for (let i = 0; i < data.length; i++) {
    const t = i / rate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 0xffffffff * 2 - 1;
    low += (noise - low) * lowCut;
    high += (noise - high) * highCut;
    const hiss = noise - high;
    let value = 0;
    if (voice === 'action') {
      value = clink(t, noise, 1 + take * 0.03, 16);
    } else if (voice === 'scrape') {
      // Glass knocked against nothing in time: a dull, short knock.
      value = (Math.sin(TAU * 860 * t) * 0.5 + Math.sin(TAU * 230 * t) * 0.5) * Math.exp(-t * 60) + noise * 0.3 * Math.exp(-t * 400);
    } else if (voice === 'judder') {
      value = (Math.sin(TAU * 420 * t) * 0.4 + low * 0.5) * Math.exp(-t * 48);
    } else if (voice === 'success') {
      value = clink(t, noise, 1, 6);
      // The fizz, crackling up after the clink and fading.
      const fizz = t - 0.04;
      if (fizz > 0) value += hiss * (noise > 0.86 ? 1 : 0.08) * 0.35 * Math.exp(-fizz * 3) * Math.min(1, fizz / 0.05);
      value += [1046.5, 1318.5, 1568, 2093].reduce((sum, hz, k) => {
        const at = t - CHEER_AT - 0.12 - k * 0.07;
        return at < 0 ? sum : sum + Math.sin(TAU * hz * at) * Math.exp(-at * (4 + k)) * 0.14 * Math.min(1, at / 0.003);
      }, 0);
    } else {
      value = clink(t, noise, 1, 14);
      const age = t - GLASS_BREAK_AT;
      if (age >= 0) {
        // The bowl goes: a bright crash of noise, and every piece ringing as it flies and lands.
        value += (hiss * 1.3 + noise * 0.45) * Math.exp(-age * 11) * Math.min(1, age / 0.001);
        value += low * 0.6 * Math.exp(-age * 30);
        for (const tinkle of TINKLES) {
          const a = age - tinkle.at;
          if (a >= 0 && a < 0.12) value += Math.sin(TAU * tinkle.hz * a) * Math.exp(-a * 55) * tinkle.gain * Math.min(1, a / 0.0005);
        }
      }
      const spill = t - GLASS_SPILL_AT;
      if (spill >= 0) {
        // The drink on the cloth: a soft wet slap.
        value += (low * 1.1 + Math.sin(TAU * (130 + 80 * Math.exp(-spill * 30)) * spill) * 0.35) * Math.exp(-spill * 16) * Math.min(1, spill / 0.002);
      }
    }
    dc = value - previous + pole * dc;
    previous = value;
    data[i] = Math.tanh(dc * 1.3) * 0.8 * Math.min(1, i / (rate * 0.001)) * Math.min(1, (data.length - 1 - i) / (rate * 0.012));
  }
  return data;
}

export function createGlassesSounds(context: AudioContext): VignetteSounds {
  const make = (voice: VoiceName, take = 0): AudioBuffer => {
    const data = synthesizeGlasses(context.sampleRate, voice, take);
    const buffer = context.createBuffer(1, data.length, context.sampleRate);
    buffer.getChannelData(0).set(data);
    return buffer;
  };
  // Two takes of the clink, a hair apart in pitch, which the engine alternates.
  return { action: [make('action'), make('action', 1)], success: make('success'), rough: make('rough'), scrape: make('scrape'), judder: make('judder') };
}
