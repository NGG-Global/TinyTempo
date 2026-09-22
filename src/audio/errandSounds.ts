import type { VignetteSounds, VoiceName } from './AudioEngine';
import { BALLOON_MOTION } from '../vignettes/errandMotion';

export type ErrandAct = 'roller' | 'bell' | 'balloon' | 'stapler';
type Voice = VoiceName;
const TAU = Math.PI * 2;
const LENGTH: Record<ErrandAct, Record<Voice, number>> = {
  roller: { action: 0.26, success: 1.2, rough: 0.7, scrape: 0.14, judder: 0.16 },
  bell: { action: 0.9, success: 1.5, rough: 0.6, scrape: 0.14, judder: 0.18 },
  balloon: { action: 0.24, success: 1.3, rough: 0.7, scrape: 0.13, judder: 0.2 },
  stapler: { action: 0.16, success: 1.1, rough: 0.55, scrape: 0.12, judder: 0.15 },
};
const decay = (t: number, rate: number) => t < 0 ? 0 : Math.exp(-t * rate);
const tone = (t: number, hz: number, rate: number) => t < 0 ? 0 : Math.sin(TAU * hz * t) * decay(t, rate);
const bell = (t: number, hz: number) => tone(t, hz, 6) * 0.3 + tone(t, hz * 2.71, 14) * 0.1 + tone(t, hz * 4.9, 30) * 0.03;
/** A band of noise swept in pitch: the roller's nap on the wall, the pump's air. */
const whoosh = (t: number, noise: number, from: number, to: number, length: number) => {
  if (t < 0 || t > length) return 0;
  const p = t / length;
  const env = Math.sin(p * Math.PI);
  return noise * env * (0.4 + 0.6 * (from + (to - from) * p));
};

/** Material voices share one clock and seeded excitation, never a second AudioContext. */
export function synthesizeErrand(sampleRate: number, act: ErrandAct, kind: Voice): Float32Array {
  const duration = LENGTH[act][kind];
  const data = new Float32Array(Math.ceil(sampleRate * duration));
  let seed = 5231 + act.length * 6151, low = 0, band = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 0xffffffff * 2 - 1;
    low = low * 0.86 + noise * 0.14;
    band = band * 0.6 + (noise - low) * 0.4;
    let v = 0;
    if (kind === 'scrape' || kind === 'judder') {
      const pitch = { roller: 720, bell: 1800, balloon: 1400, stapler: 2400 }[act];
      v = kind === 'scrape'
        ? band * decay(t, 60) * 0.2 + tone(t, pitch, 45) * 0.16
        : low * decay(t, 30) * 0.26 + tone(t, pitch * 0.14, 28) * 0.18;
    } else if (act === 'roller') {
      const roll = whoosh(t, band, 0.3, 1, 0.24) * 0.32 + low * decay(t, 12) * 0.12;
      if (kind === 'action') v = roll;
      else if (kind === 'success') {
        v = roll + bell(t - 0.34, 659.25) * 0.5 + bell(t - 0.5, 880) * 0.55 + bell(t - 0.66, 1108.7) * 0.45;
      } else {
        // The roller slips: a squeal off the nap, then paint dripping onto the floor.
        v = whoosh(t, band, 1, 0.2, 0.3) * 0.28 + tone(t, 1150 - t * 900, 9) * 0.12;
        for (let d = 0; d < 3; d++) v += tone(t - 0.28 - d * 0.14, 300 + d * 60, 40) * 0.16 + low * decay(t - 0.28 - d * 0.14, 60) * 0.2;
      }
    } else if (act === 'bell') {
      const strike = noise * decay(t, 320) * 0.18 + tone(t, 2400, 140) * 0.1;
      const ding = bell(t, 2093) * 0.7 + bell(t, 1567.98) * 0.35;
      if (kind === 'action') v = strike + ding;
      else if (kind === 'success') {
        // The desk bell, then two quick steps and the bell boy's brighter answer.
        v = strike + ding;
        v += low * decay(t - 0.32, 55) * 0.5 + low * decay(t - 0.48, 55) * 0.45;
        v += bell(t - 0.66, 2637) * 0.6 + bell(t - 0.8, 3136) * 0.55;
      } else v = strike * 0.7 + bell(t, 1567.98) * 0.32 * decay(t, 9) + tone(t - 0.22, 196, 14) * 0.2;
    } else if (act === 'balloon') {
      const squeak = tone(t, 1900 + Math.sin(t * 40) * 300, 26) * 0.07;
      const air = whoosh(t, band, 0.2, 1, 0.22) * 0.3;
      if (kind === 'action') v = air + squeak + low * decay(t, 20) * 0.1;
      else if (kind === 'success') {
        const tie = t - BALLOON_MOTION.tieSec;
        v = air * 0.6 + tone(tie, 2600 - tie * 1800, 22) * 0.1 + band * decay(tie, 40) * 0.08;
        for (let k = 0; k < 4; k++) v += bell(t - BALLOON_MOTION.riseFromSec - k * 0.11, [523.25, 659.25, 783.99, 1046.5][k]!) * 0.45;
      } else {
        // The pop: a hard broadband crack, its low thump, then scraps of rubber settling.
        const pop = t - BALLOON_MOTION.popAtSec;
        v = air * 0.5 + noise * decay(pop, 90) * 0.85 + low * decay(pop, 22) * 0.9 + tone(pop, 90, 18) * 0.35;
        v += band * decay(pop - 0.12, 30) * 0.12;
      }
    } else {
      // Stapler: the jaw's click, the staple driven a few milliseconds later, the spring.
      const click = noise * decay(t, 300) * 0.3 + tone(t, 3100, 160) * 0.18;
      const drive = noise * decay(t - 0.018, 220) * 0.4 + tone(t - 0.018, 640, 70) * 0.28 + low * decay(t - 0.018, 60) * 0.3;
      const spring = tone(t - 0.05, 2200, 40) * 0.07;
      if (kind === 'action') v = click + drive + spring;
      else if (kind === 'success') {
        v = click + drive + spring;
        // The bound pile is lifted and set down: a paper riffle, then a wood thump and chime.
        v += band * decay(t - 0.3, 14) * 0.16 * (1 + Math.sin(t * 90) * 0.5);
        v += low * decay(t - 0.62, 30) * 0.7 + tone(t - 0.62, 140, 22) * 0.3;
        v += bell(t - 0.7, 1318.5) * 0.45 + bell(t - 0.82, 1760) * 0.4;
      } else {
        // A jam: the jaw grinds instead of driving, and the spring rattles back.
        v = click * 0.8 + band * decay(t, 20) * 0.22 * (1 + Math.sin(t * 260) * 0.6) + tone(t - 0.14, 420, 24) * 0.22;
        v += tone(t - 0.3, 1900, 30) * 0.1 + tone(t - 0.36, 1700, 30) * 0.08;
      }
    }
    const attack = Math.min(1, t / 0.0007);
    const release = Math.min(1, (data.length - 1 - i) / (sampleRate * 0.025));
    // Soft saturation catches coincident resonances without a hard clipped transient.
    data[i] = Math.tanh(v * 1.1) * attack * release;
  }
  return data;
}

export function createErrandSounds(context: AudioContext, act: ErrandAct): VignetteSounds {
  const make = (kind: Voice): AudioBuffer => {
    const samples = synthesizeErrand(context.sampleRate, act, kind);
    const buffer = context.createBuffer(1, samples.length, context.sampleRate);
    buffer.getChannelData(0).set(samples);
    return buffer;
  };
  return { action: make('action'), success: make('success'), rough: make('rough'), scrape: make('scrape'), judder: make('judder') };
}
