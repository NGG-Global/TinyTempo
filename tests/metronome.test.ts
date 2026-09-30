import { describe, expect, it } from 'vitest';
import { MUSIC } from '../src/config/music';
import { metronomeBar, metronomeSamples } from '../src/audio/metronomeSounds';

const RATE = 8000;

function peakAround(samples: Float32Array, frame: number, window = 400): number {
  let peak = 0;
  for (let i = Math.max(0, frame - 8); i < Math.min(samples.length, frame + window); i++) peak = Math.max(peak, Math.abs(samples[i]!));
  return peak;
}

describe('the metronome bar', () => {
  it('is one bar at the source tempo with a click on every beat and the first accented', () => {
    const samples = metronomeSamples(RATE);
    const beat = RATE * 60 / MUSIC.sourceBpm;
    expect(samples.length).toBe(beat * MUSIC.beatsPerBar);
    const peaks = [0, 1, 2, 3].map(b => peakAround(samples, b * beat));
    expect(peaks[0]).toBeGreaterThan(peaks[1]!);
    for (const p of peaks.slice(1)) { expect(p).toBeGreaterThan(MUSIC.metronome.beatLevel * 0.8); expect(p).toBeLessThanOrEqual(MUSIC.metronome.beatLevel); }
    expect(peaks[0]).toBeLessThanOrEqual(MUSIC.metronome.accentLevel);
    // Silence between clicks: the middle of each beat carries nothing.
    for (let b = 0; b < 4; b++) expect(Math.abs(samples[Math.round((b + 0.5) * beat)]!)).toBe(0);
    // Nothing exceeds the accent, so the bar cannot clip the bus on its own.
    let max = 0; for (const v of samples) max = Math.max(max, Math.abs(v));
    expect(max).toBeLessThanOrEqual(MUSIC.metronome.accentLevel);
  });
  it('wraps the bar in a mono buffer at the context rate', () => {
    let written: Float32Array | null = null;
    const context = { sampleRate: RATE, createBuffer: (channels: number, length: number, rate: number) => ({ channels, length, rate, copyToChannel: (data: Float32Array) => { written = data; } }) };
    const buffer = metronomeBar(context as unknown as BaseAudioContext) as unknown as { channels: number; length: number; rate: number };
    expect(buffer.channels).toBe(1);
    expect(buffer.rate).toBe(RATE);
    expect(buffer.length).toBe(RATE * 2);
    expect(written).not.toBeNull();
  });
});
