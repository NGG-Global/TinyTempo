import type { VignetteSounds, VoiceName } from './AudioEngine';
import { FROG_CHORDS, FROG_JOIN_AT, FROG_LEAP_AT, FROG_RISE_AT, FROG_SPLASH_AT, FROG_SURFACE_AT } from '../vignettes/frogMotion';

const TAU = Math.PI * 2;
const LENGTH: Record<VoiceName, number> = { action: 0.2, success: 1.4, rough: 1.4, scrape: 0.09, judder: 0.16 };
/** The singer's note and the two that join it: a C major triad, the singer on the root. */
export const FROG_TRIAD = [130.81, 164.81, 196] as const;
/** Where a frog's throat rings: the band the croak's harmonics are weighted toward. */
const FORMANT = { hz: 720, width: 340 } as const;

/**
 * One croak at `hz`, `age` seconds in and `length` long. A buzz of harmonics weighted to
 * the throat's formant, chopped into pulses by the larynx — the rasp that makes a croak a
 * croak rather than a hum — opening in 3 ms so its start is the beat. `bend` slides the
 * pitch over the croak: up for a startled one, down for a deflated one.
 */
function croak(age: number, hz: number, length: number, bend = 0, rasp = 34): number {
  if (age < 0 || age >= length) return 0;
  const settle = 0.06 * (1 - Math.exp(-age * 20)) / 20;
  const phase = TAU * hz * (age + settle + bend * age * age / (2 * length));
  let buzz = 0, total = 0;
  for (let h = 1; h <= 10; h++) {
    const w = 1 / (1 + ((h * hz - FORMANT.hz) / FORMANT.width) ** 2) + 0.2 / h;
    buzz += Math.sin(h * phase) * w;
    total += w;
  }
  const pulse = 0.5 + 0.5 * Math.cos(TAU * rasp * age);
  const tail = age < length * 0.6 ? 1 : 1 - (age - length * 0.6) / (length * 0.4);
  return buzz / total * (0.45 + 0.55 * pulse ** 3) * Math.min(1, age / 0.003) * tail * Math.exp(-age * 2.5);
}

/** A drop of water: a short sine that rises as the bubble it closes over shrinks. */
function plip(age: number, from: number, to: number, length = 0.04): number {
  if (age < 0 || age >= length) return 0;
  const t = age / length;
  return Math.sin(TAU * (from * age + (to - from) * age * t / 2)) * Math.sin(Math.PI * t) * Math.exp(-age * 30);
}

/**
 * The croak, its two misses, and the two codas: one more croak, two splashes and two soft
 * landings as the listeners hop onto their pads at `FROG_JOIN_AT`, and the triad sung on
 * `FROG_CHORDS`; or a startled croak, a whip of air as it leaps at `FROG_LEAP_AT`, the
 * splash on `FROG_SPLASH_AT` with the bubbles after it, and one bubble as it surfaces.
 * Deterministic, so a test can pin every voice, and synthesized, so the act needs nothing
 * downloaded.
 */
export function synthesizeFrog(rate: number, voice: VoiceName, take = 0): Float32Array {
  const data = new Float32Array(Math.ceil(rate * LENGTH[voice]));
  let seed = 5711 + take * 977, low = 0, previous = 0, dc = 0;
  const pole = Math.exp(-TAU * 30 / rate);
  const lowCut = 1 - Math.exp(-TAU * 900 / rate);
  const [root, third, fifth] = FROG_TRIAD;
  for (let i = 0; i < data.length; i++) {
    const t = i / rate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 0xffffffff * 2 - 1;
    low += (noise - low) * lowCut;
    let value = 0;
    if (voice === 'action') {
      value = croak(t, root * (1 - take * 0.03), 0.17) * 0.95;
    } else if (voice === 'scrape') {
      // A gulp: the throat closing on nothing.
      value = Math.sin(TAU * (420 * t - 900 * t * t)) * Math.exp(-t * 45) * 0.5 + (noise - low) * 0.15 * Math.exp(-t * 120);
    } else if (voice === 'judder') {
      // A croak with no air behind it: short, low and sagging.
      value = croak(t, root * 0.75, 0.14, -0.25, 22) * 0.6;
    } else if (voice === 'success') {
      value = croak(t, root, 0.17) * 0.8;
      for (const [k, at] of [[0, FROG_RISE_AT], [1, FROG_RISE_AT + 0.03]] as const) {
        value += plip(t - at, 700 + k * 120, 1500 + k * 200) * 0.35;
      }
      for (const at of [FROG_JOIN_AT, FROG_JOIN_AT + 0.02]) {
        const age = t - at;
        if (age >= 0) value += (Math.sin(TAU * 180 * age) * 0.35 + low * 0.5) * Math.exp(-age * 40) * Math.min(1, age / 0.002);
      }
      // The triad, all three on each chord, the last held and opened with a little vibrato.
      for (const [at, length] of FROG_CHORDS) {
        const held = length > 0.3;
        for (const [k, hz] of [[0, root], [1, third], [2, fifth]] as const) {
          const age = t - at;
          const vibrato = held ? 1 + 0.008 * Math.sin(TAU * 5.5 * age) : 1;
          value += croak(age, hz * vibrato, length + 0.06, held ? 0.02 : 0, 30 + k * 4) * (held ? 0.38 : 0.34);
        }
      }
    } else {
      // Startled, then the leap, the splash, the bubbles after it, and one as it looks back out.
      value = croak(t, root * 1.05, 0.12, 0.35) * 0.7;
      const whip = t - FROG_LEAP_AT;
      if (whip >= 0 && whip < 0.16) value += Math.sin(TAU * (520 * whip + 2600 * whip * whip)) * Math.sin(Math.PI * whip / 0.16) * 0.12;
      const age = t - FROG_SPLASH_AT;
      if (age >= 0) {
        value += (noise - low) * 0.6 * Math.exp(-age * 9) * Math.min(1, age / 0.002);
        value += low * 0.9 * Math.exp(-age * 7);
        value += Math.sin(TAU * (320 * age - 520 * age * age)) * Math.exp(-age * 14) * 0.45 * Math.min(1, age / 0.002);
        for (const [k, after] of [0.12, 0.2, 0.31, 0.46].entries()) value += plip(age - after, 600 + k * 140, 1300 + k * 160, 0.035) * 0.22;
      }
      value += plip(t - FROG_SURFACE_AT, 520, 1100, 0.05) * 0.3;
    }
    dc = value - previous + pole * dc;
    previous = value;
    data[i] = Math.tanh(dc * 1.3) * 0.8 * Math.min(1, i / (rate * 0.001)) * Math.min(1, (data.length - 1 - i) / (rate * 0.012));
  }
  return data;
}

export function createFrogSounds(context: AudioContext): VignetteSounds {
  const make = (voice: VoiceName, take = 0): AudioBuffer => {
    const data = synthesizeFrog(context.sampleRate, voice, take);
    const buffer = context.createBuffer(1, data.length, context.sampleRate);
    buffer.getChannelData(0).set(data);
    return buffer;
  };
  // Two takes of the croak, a hair apart in pitch, which the engine alternates.
  return { action: [make('action'), make('action', 1)], success: make('success'), rough: make('rough'), scrape: make('scrape'), judder: make('judder') };
}
