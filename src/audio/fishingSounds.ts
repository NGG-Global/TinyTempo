import type { VignetteSounds } from './AudioEngine';
import { FISHING_MOTION } from '../vignettes/fishingMotion';

type Voice = keyof VignetteSounds;
const TAU = Math.PI * 2;
const LENGTH: Record<Voice, number> = { action: 0.34, success: 1.6, rough: 1.0, scrape: 0.14, judder: 0.2 };
const decay = (t: number, rate: number) => t < 0 ? 0 : Math.exp(-t * rate);
const tone = (t: number, hz: number, rate: number) => t < 0 ? 0 : Math.sin(TAU * hz * t) * decay(t, rate);
const bell = (t: number, hz: number) => tone(t, hz, 6) * 0.3 + tone(t, hz * 2.71, 14) * 0.1 + tone(t, hz * 4.9, 30) * 0.03;
/** A band of noise swept in pitch and shaped by a half sine: water moving. */
const whoosh = (t: number, noise: number, from: number, to: number, length: number) => {
  if (t < 0 || t > length) return 0;
  const p = t / length;
  return noise * Math.sin(p * Math.PI) * (0.4 + 0.6 * (from + (to - from) * p));
};

/**
 * The fisherman's voices. The pull is the beat: a thump as the weight comes onto the
 * rod, the rod's creak, the line's taut twang bending up in pitch as the tension rises,
 * and the water sloshing at the line. The two finales open with the same pull, and put
 * their splash at `FISHING_MOTION.breachSec`, where the picture breaks the surface.
 */
export function synthesizeFishing(sampleRate: number, kind: Voice): Float32Array {
  const duration = LENGTH[kind];
  const data = new Float32Array(Math.ceil(sampleRate * duration));
  let seed = 9173, low = 0, band = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 0xffffffff * 2 - 1;
    low = low * 0.88 + noise * 0.12;
    band = band * 0.62 + (noise - low) * 0.38;
    let v = 0;
    if (kind === 'scrape') {
      // Line zipping off the spool: a tap that hit nothing pays out slack.
      v = band * decay(t, 55) * 0.22 * (1 + Math.sin(t * 900) * 0.5) + tone(t, 1700, 45) * 0.12;
    } else if (kind === 'judder') {
      // The line goes slack and the rod tip wobbles: a beat nobody pulled on.
      v = low * decay(t, 28) * 0.28 + tone(t, 210 + Math.sin(t * 60) * 40, 18) * 0.2;
    } else {
      // The pull, shared by all three: thump, creak, twang, slosh.
      const thump = low * decay(t, 32) * 0.9 + tone(t, 95, 24) * 0.42;
      const creak = band * decay(t, 26) * 0.16 * (1 + Math.sin(t * 240) * 0.6) + tone(t, 190 - t * 260, 22) * 0.14;
      const twang = tone(t - 0.02, 330 + 110 * (1 - decay(t - 0.02, 40)), 16) * 0.3 + tone(t - 0.02, 660, 30) * 0.08;
      const slosh = whoosh(t - 0.04, band, 0.3, 0.9, 0.22) * 0.24;
      const pull = thump + creak + twang + slosh;
      if (kind === 'action') v = pull;
      else {
        const breach = t - FISHING_MOTION.breachSec;
        if (kind === 'success') {
          // The big splash as it comes out, water raining back down, then a bright three-note answer.
          const splash = noise * decay(breach, 18) * 0.7 + low * decay(breach, 14) * 0.9 + whoosh(breach, band, 1, 0.3, 0.5) * 0.5;
          v = pull * 0.9 + splash;
          for (let d = 0; d < 4; d++) v += tone(breach - 0.32 - d * 0.09, 1400 + d * 260, 70) * 0.06;
          v += bell(t - 0.82, 659.25) * 0.5 + bell(t - 0.96, 880) * 0.55 + bell(t - 1.1, 1318.5) * 0.5;
        } else {
          // A smaller, duller plop, then drips off whatever came up, and the rod settling.
          const plop = low * decay(breach, 26) * 1.1 + tone(breach, 150 - breach * 120, 30) * 0.5 + noise * decay(breach, 60) * 0.25;
          v = pull * 0.8 + plop;
          for (let d = 0; d < 3; d++) v += tone(breach - 0.24 - d * 0.16, 1150 - d * 180, 55) * 0.09 * (1 - d * 0.2);
          v += tone(t - 0.7, 140, 12) * 0.12;
        }
      }
    }
    const attack = Math.min(1, t / 0.0007);
    const release = Math.min(1, (data.length - 1 - i) / (sampleRate * 0.025));
    // Soft saturation catches coincident resonances without a hard clipped transient.
    data[i] = Math.tanh(v * 1.1) * attack * release;
  }
  return data;
}

export function createFishingSounds(context: AudioContext): VignetteSounds {
  const make = (kind: Voice): AudioBuffer => {
    const samples = synthesizeFishing(context.sampleRate, kind);
    const buffer = context.createBuffer(1, samples.length, context.sampleRate);
    buffer.getChannelData(0).set(samples);
    return buffer;
  };
  return { action: make('action'), success: make('success'), rough: make('rough'), scrape: make('scrape'), judder: make('judder') };
}
