import type { VignetteSounds, VoiceName } from './AudioEngine';
import { CAMERA_REVEAL_SEC, RISE_END_SEC } from '../vignettes/cameraMotion';

const TAU = Math.PI * 2;
const LENGTH: Record<VoiceName, number> = { action: 0.16, success: CAMERA_REVEAL_SEC, rough: CAMERA_REVEAL_SEC, scrape: 0.08, judder: 0.22 };
/** The motor that pushes the print out runs from just after the click to here. */
export const WHIR_END_SEC = 0.32;
/** The two codas are the same click and the same whir up to here, and part after it. */
export const CAMERA_PARTING_SEC = 0.34;

/**
 * One mechanical click starting at `at`: a sharp tick of the blade, a small metal ping and
 * the knock of the body, all gone within a few hundredths of a second.
 */
function click(t: number, at: number, crunch: number, gain: number, pitch: number): number {
  const age = t - at;
  if (age < 0) return 0;
  return gain * (
    crunch * Math.exp(-age * 900) * 0.9
    + Math.sin(TAU * 2400 * pitch * age) * Math.exp(-age * 160) * 0.22
    + Math.sin(TAU * 190 * pitch * age) * Math.exp(-age * 60) * 0.4
  );
}

/** The shutter as the beat: the blade opening and, a few hundredths later, closing. */
function shutter(t: number, crunch: number, take: number): number {
  const pitch = 1 + take * 0.04;
  const close = 0.034 + take * 0.004;
  const spring = t >= 0.04 ? Math.sin(TAU * 3300 * pitch * (t - 0.04)) * Math.exp(-(t - 0.04) * 45) * 0.06 : 0;
  return click(t, 0, crunch, 1, pitch) + click(t, close, crunch, 0.7, pitch * 1.06) + spring;
}

/** The motor that drives the print out of the slot: a buzzing hum that rises as it runs. */
function whir(t: number, noise: number): number {
  const from = 0.06;
  if (t < from || t > WHIR_END_SEC) return 0;
  const age = t - from, span = WHIR_END_SEC - from;
  const envelope = Math.min(1, age / 0.02) * Math.min(1, (WHIR_END_SEC - t) / 0.03);
  const hz = 140 + 50 * (age / span);
  return (Math.tanh(4 * Math.sin(TAU * hz * age)) * 0.16 + noise * 0.05) * envelope;
}

/**
 * An instant camera's shutter, its dry click with nothing behind it and its jammed motor,
 * and the two codas: one last shot, the whir of the print coming out, and then either a
 * paper flick and a bright two-note chime as the picture clears, or the motor choking
 * and a low, flat fall. Deterministic, so a test can pin every voice, and synthesized, so
 * the act needs nothing downloaded.
 */
export function synthesizeCamera(rate: number, voice: VoiceName, take = 0): Float32Array {
  const data = new Float32Array(Math.ceil(rate * LENGTH[voice]));
  let seed = 3307 + take * 977, low = 0, previous = 0, dc = 0;
  const pole = Math.exp(-TAU * 30 / rate);
  const lowCut = 1 - Math.exp(-TAU * 1200 / rate);
  for (let i = 0; i < data.length; i++) {
    const t = i / rate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 0xffffffff * 2 - 1;
    low += (noise - low) * lowCut;
    const crunch = noise - low;
    let value = 0;
    if (voice === 'action') {
      value = shutter(t, crunch, take);
    } else if (voice === 'scrape') {
      // The button pressed with nothing behind it: one soft, dry click.
      value = click(t, 0, crunch, 0.45, 0.8);
    } else if (voice === 'judder') {
      // The motor catching and jamming: a hum chopped into stutters.
      const gate = Math.sin(TAU * 26 * t) > 0 ? 1 : 0.2;
      value = (Math.tanh(3 * Math.sin(TAU * 118 * t)) * 0.3 + low * 0.4) * gate * Math.exp(-t * 11);
    } else {
      value = shutter(t, crunch, 0) * 0.85 + whir(t, noise);
      const after = t - CAMERA_PARTING_SEC;
      if (after >= 0) {
        if (voice === 'success') {
          // The print lands with a flick of paper, and the picture clears on two bright notes.
          const flick = t - (RISE_END_SEC - 0.04);
          if (flick >= 0) value += crunch * Math.exp(-flick * 60) * 0.25;
          value += [[1318.5, 0.72], [1975.5, 0.84]].reduce((sum, [hz, at]) => {
            const a = t - at!;
            return a < 0 ? sum : sum + Math.sin(TAU * hz! * a) * Math.exp(-a * 5) * 0.18 * Math.min(1, a / 0.004);
          }, 0);
        } else {
          // The motor tries again and chokes, and the picture comes out flat.
          if (after < 0.2) value += Math.tanh(4 * Math.sin(TAU * 96 * after)) * 0.14 * (Math.sin(TAU * 18 * after) > 0 ? 1 : 0.15) * (1 - after / 0.2);
          value += [[330, 0.6], [247, 0.78]].reduce((sum, [hz, at]) => {
            const a = t - at!;
            return a < 0 ? sum : sum + (Math.sin(TAU * hz! * a) + 0.3 * Math.sin(TAU * hz! * 2 * a)) * Math.exp(-a * 7) * 0.16 * Math.min(1, a / 0.004);
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

export function createCameraSounds(context: AudioContext): VignetteSounds {
  const make = (voice: VoiceName, take = 0): AudioBuffer => {
    const data = synthesizeCamera(context.sampleRate, voice, take);
    const buffer = context.createBuffer(1, data.length, context.sampleRate);
    buffer.getChannelData(0).set(data);
    return buffer;
  };
  // Two takes of the shutter, alternated by the engine, so a level of shots is not one sample.
  return { action: [make('action'), make('action', 1)], success: make('success'), rough: make('rough'), scrape: make('scrape'), judder: make('judder') };
}
