/**
 * The unlock a player taps a star gate open with, synthesized like every other voice: one
 * clock, seeded noise, nothing downloaded. A key turning — two dry metal ticks — then the
 * hasp springing with a bright ring, so the sound has a cause and an effect inside a third of
 * a second. The area's fanfare that follows is the finale's (`finaleSounds.ts`).
 *
 * Bb and F partials, the same pitch bed as the shipped stems and groove's sting
 * (`grooveSounds.ts`), so the ring sits in the road's loop rather than against it.
 */
const TAU = Math.PI * 2;
const LENGTH = 0.62;
const RING = [932.33, 1396.91, 1864.66] as const;

export function synthesizeUnlock(sampleRate: number): Float32Array {
  const data = new Float32Array(Math.ceil(sampleRate * LENGTH));
  let seed = 51787;
  let high = 0, previous = 0;
  const highPass = Math.exp(-TAU * 2400 / sampleRate);
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 0xffffffff * 2 - 1;
    high = highPass * (high + noise - previous);
    previous = noise;
    let v = 0;
    // Two ticks of the key, 60 ms apart, the second the heavier.
    for (const [at, gain] of [[0, 0.5], [0.06, 0.75]] as const) {
      const local = t - at;
      if (local >= 0) v += high * Math.exp(-local * 160) * gain + Math.sin(TAU * 2900 * local) * Math.exp(-local * 120) * gain * 0.25;
    }
    // The hasp springs: a knock and a ring that decays over half a second.
    const local = t - 0.13;
    if (local >= 0) {
      v += high * Math.exp(-local * 90) * 0.45;
      const env = Math.min(1, local / 0.004) * Math.exp(-local * 6.5);
      RING.forEach((f, n) => { v += Math.sin(TAU * f * local) * env * (0.32 / (n + 1)); });
    }
    data[i] = Math.tanh(v * 1.05) * Math.min(1, (LENGTH - t) / 0.03) * Math.min(1, t / 0.0015);
  }
  return data;
}

export function createUnlockSound(context: BaseAudioContext): AudioBuffer {
  const cached = cache.get(context);
  if (cached) return cached;
  const samples = synthesizeUnlock(context.sampleRate);
  const buffer = context.createBuffer(1, samples.length, context.sampleRate);
  buffer.getChannelData(0).set(samples);
  cache.set(context, buffer);
  return buffer;
}
const cache = new WeakMap<BaseAudioContext, AudioBuffer>();
