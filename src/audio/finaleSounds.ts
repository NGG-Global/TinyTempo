/**
 * The finale's two presentation sounds, synthesized like every act's voices: one clock,
 * seeded noise, no second AudioContext, no asset to download.
 *
 * - **roll**: a snare roll that builds across the last bar of the finale's opening and
 *   stops just short of the first demonstration downbeat, so the example's first beat is
 *   heard on its own rather than under a crash.
 * - **fanfare**: a short brass arpeggio under the "Area complete" ribbon. It plays after
 *   the result has been recorded, when nothing is being judged.
 */

export type FinaleSound = 'roll' | 'fanfare';

const TAU = Math.PI * 2;
/** How long before the downbeat the roll falls silent. */
export const ROLL_CLEARANCE_SEC = 0.06;
/** The fanfare's notes, rising a major arpeggio to the octave, and when each speaks. */
const FANFARE = [
  { hz: 523.25, at: 0 },
  { hz: 659.25, at: 0.11 },
  { hz: 783.99, at: 0.22 },
  { hz: 1046.5, at: 0.33 },
] as const;
const FANFARE_SEC = 1.7;

/** A brass-like tone: a few harmonics, the upper ones decaying faster, with a slow vibrato. */
function brass(t: number, hz: number, hold: number): number {
  if (t < 0) return 0;
  const attack = Math.min(1, t / 0.025);
  const release = t < hold ? 1 : Math.exp(-(t - hold) * 7);
  const vibrato = 1 + Math.sin(TAU * 5.2 * t) * 0.004 * Math.min(1, t / 0.3);
  let v = 0;
  for (let k = 1; k <= 6; k++) v += Math.sin(TAU * hz * k * vibrato * t) * Math.exp(-t * k * 0.9) / k;
  return v * attack * release;
}

/**
 * `beatSec` is the length of one beat at the task's tempo; the roll spans `rollBeats` of
 * them. The fanfare ignores both.
 */
export function synthesizeFinale(sampleRate: number, kind: FinaleSound, beatSec = 0.5, rollBeats = 4): Float32Array {
  const duration = kind === 'roll' ? Math.max(0.2, beatSec * rollBeats - ROLL_CLEARANCE_SEC) : FANFARE_SEC;
  const data = new Float32Array(Math.ceil(sampleRate * duration));
  let seed = kind === 'roll' ? 90211 : 44017;
  let low = 0;
  // Strokes land on sextuplets of the beat: fast enough to blur into a roll at any tempo.
  const stroke = beatSec / 6;
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 0xffffffff * 2 - 1;
    low = low * 0.7 + noise * 0.3;
    let v: number;
    if (kind === 'roll') {
      const p = t / duration;
      const since = t % stroke;
      const hit = Math.exp(-since * 55);
      // Crescendo: quiet under the count, full by the end, then a short fade to silence.
      const swell = 0.12 + 0.6 * p * p;
      const tail = Math.min(1, (duration - t) / 0.03);
      v = (noise - low * 0.5) * hit * swell * tail + Math.sin(TAU * 185 * since) * hit * swell * 0.25 * tail;
    } else {
      v = 0;
      FANFARE.forEach((note, n) => {
        const hold = n === FANFARE.length - 1 ? 0.9 : 0.16;
        v += brass(t - note.at, note.hz, hold) * (n === FANFARE.length - 1 ? 0.34 : 0.26);
      });
      // A soft cymbal wash under the top note.
      v += noise * Math.exp(-Math.max(0, t - 0.33) * 5) * (t >= 0.33 ? 0.05 : 0);
    }
    const attack = Math.min(1, t / 0.001);
    data[i] = Math.tanh(v * 1.2) * attack;
  }
  return data;
}

export function createFinaleSound(context: BaseAudioContext, kind: FinaleSound, beatSec?: number, rollBeats?: number): AudioBuffer {
  const samples = synthesizeFinale(context.sampleRate, kind, beatSec, rollBeats);
  const buffer = context.createBuffer(1, samples.length, context.sampleRate);
  buffer.getChannelData(0).set(samples);
  return buffer;
}
