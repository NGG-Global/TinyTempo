import type { VignetteSounds } from './AudioEngine';
import { SCRATCH_MOTION } from '../vignettes/scratchMotion';

type Voice = keyof VignetteSounds;
const TAU = Math.PI * 2;
const LENGTH: Record<Voice, number> = { action: 0.24, success: 1.6, rough: 1.0, scrape: 0.12, judder: 0.18 };
const decay = (t: number, rate: number) => t < 0 ? 0 : Math.exp(-t * rate);
const tone = (t: number, hz: number, rate: number) => t < 0 ? 0 : Math.sin(TAU * hz * t) * decay(t, rate);
const bell = (t: number, hz: number) => tone(t, hz, 6) * 0.3 + tone(t, hz * 2.71, 14) * 0.1 + tone(t, hz * 4.9, 30) * 0.03;

/**
 * A resonant band-pass, the one filter a scratch needs: vinyl under a stylus is
 * broadband noise, and the "wicka" is that noise with its resonance swept up as the
 * record is shoved and back down as it is drawn back. One state-variable filter per
 * voice, stepped a sample at a time, so the sweep can follow any curve.
 */
class Resonator {
  private low = 0;
  private band = 0;
  public step(input: number, hz: number, sampleRate: number, q: number): number {
    const f = Math.min(0.9, 2 * Math.sin(Math.PI * Math.min(hz, sampleRate * 0.45) / sampleRate));
    const high = input - this.low - q * this.band;
    this.band += f * high;
    this.low += f * this.band;
    return this.band;
  }
}

/** The stylus's path through the scratch: pitch rises through the shove and falls through the return. */
function scratchPitch(t: number): number {
  const push = SCRATCH_MOTION.pushBeats * 0.5, back = SCRATCH_MOTION.returnBeats * 0.5;
  if (t < push) return 700 + 1900 * (t / push);
  const p = Math.min(1, (t - push) / (back - push));
  return 2600 - 1900 * p;
}

/**
 * The scratch act's voices, on the household acts' method: seeded noise, short attack
 * ramps, tail fades and soft saturation. The beat is the "wicka" over a soft thump of
 * the hand on the platter and a grain of vinyl crackle. The success voice adds a
 * spin-back, a crowd and a chord; the rough voice puts the needle's pop at `skipAtSec`,
 * where the picture skips.
 */
export function synthesizeScratch(sampleRate: number, kind: Voice): Float32Array {
  const duration = LENGTH[kind];
  const data = new Float32Array(Math.ceil(sampleRate * duration));
  let seed = 7741, low = 0, band = 0, crackleAt = 0.004;
  const wicka = new Resonator(), skid = new Resonator(), crowd = new Resonator();
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 0xffffffff * 2 - 1;
    low = low * 0.9 + noise * 0.1;
    band = band * 0.6 + (noise - low) * 0.4;
    // Vinyl crackle: sparse clicks, a few a second, under everything the stylus does.
    let crackle = 0;
    if (t >= crackleAt) { crackle = noise * 0.5; crackleAt = t + 0.035 + (seed % 1000) / 1000 * 0.09; }
    crackle += band * 0.02;
    let v = 0;
    if (kind === 'scrape') {
      // The record slips under a hand that touched nothing on the beat: a quick zip.
      v = skid.step(noise, 3000 - t * 12000, sampleRate, 0.4) * decay(t, 40) * 0.5 + tone(t, 1800, 60) * 0.08;
    } else if (kind === 'judder') {
      // A beat with no hand on it: the stylus bumps, a pop and a low thud.
      v = noise * decay(t, 260) * 0.5 + low * decay(t, 30) * 0.5 + tone(t, 70, 22) * 0.3;
    } else {
      const scratch = wicka.step(noise, scratchPitch(t), sampleRate, 0.35) * Math.min(1, t / 0.006) * (t < 0.21 ? 1 : decay(t - 0.21, 90)) * 0.55;
      const thump = low * decay(t, 40) * 0.7 + tone(t, 85, 30) * 0.3;
      const pull = scratch + thump + crackle * 0.6;
      if (kind === 'action') v = pull;
      else if (kind === 'success') {
        // The spin-back: a long falling whirr, then the crowd comes up under a chord.
        const back = t - 0.22;
        const whirr = back < 0 ? 0 : skid.step(noise, 2200 * Math.exp(-back * 2.4) + 120, sampleRate, 0.3) * decay(back, 2.6) * 0.5;
        const roar = crowd.step(noise, 900 + Math.sin(t * 7) * 200, sampleRate, 0.9) * Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.3) / 1.3))) * 0.4;
        v = pull + whirr + roar;
        v += bell(t - 0.5, 523.25) * 0.45 + bell(t - 0.5, 659.25) * 0.4 + bell(t - 0.5, 783.99) * 0.4 + bell(t - 0.66, 1046.5) * 0.4;
        v += tone(t - 0.5, 65.4, 4) * 0.25;
      } else {
        // The needle skips: a pop as it leaves the groove, a skid across the record, then rumble and a sagging note.
        const skip = t - SCRATCH_MOTION.skipAtSec;
        const pop = noise * decay(skip, 180) * 1.2 + low * decay(skip, 40) * 0.9;
        const scrape = skip < 0 ? 0 : skid.step(noise, 1400 + skip * 600, sampleRate, 0.5) * decay(skip, 9) * 0.45 * (1 + Math.sin(skip * 180) * 0.4);
        const rumble = tone(skip - 0.1, 48, 5) * 0.28 + low * decay(skip - 0.1, 6) * 0.2;
        v = pull * 0.9 + pop + scrape + rumble + tone(skip - 0.3, 220 - Math.max(0, skip - 0.3) * 160, 5) * 0.16;
      }
    }
    const attack = Math.min(1, t / 0.0007);
    const release = Math.min(1, (data.length - 1 - i) / (sampleRate * 0.025));
    // Soft saturation catches coincident resonances without a hard clipped transient.
    data[i] = Math.tanh(v * 1.1) * attack * release;
  }
  return data;
}

export function createScratchSounds(context: AudioContext): VignetteSounds {
  const make = (kind: Voice): AudioBuffer => {
    const samples = synthesizeScratch(context.sampleRate, kind);
    const buffer = context.createBuffer(1, samples.length, context.sampleRate);
    buffer.getChannelData(0).set(samples);
    return buffer;
  };
  return { action: make('action'), success: make('success'), rough: make('rough'), scrape: make('scrape'), judder: make('judder') };
}
