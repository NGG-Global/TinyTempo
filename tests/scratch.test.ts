import { describe, expect, it, vi } from 'vitest';
import { faderCut, meterLevel, scratchFinale, scratchPush, SCRATCH_MOTION, SCRATCH_REVEAL_SEC } from '../src/vignettes/scratchMotion';
import { synthesizeScratch } from '../src/audio/scratchSounds';
import { VIGNETTES } from '../src/vignettes/registry';
import { levelSpec } from '../src/game/levels';
import { TaskSequence } from '../src/game/TaskSequence';

vi.mock('phaser', () => ({ default: {} }));

describe('DJ scratch act', () => {
  it('is appended as the nineteenth act and keeps every earlier level', () => {
    expect(VIGNETTES.at(-1)?.id).toBe('scratch');
    expect(VIGNETTES).toHaveLength(19);
    expect(levelSpec(19).vignette).toBe('scratch');
    expect(levelSpec(38).vignette).toBe('scratch');
    expect([1, 9, 17, 18].map(n => levelSpec(n).vignette)).toEqual(['hammer', 'paper', 'stapler', 'fisherman']);
    expect(levelSpec(20).vignette).toBe('hammer');
    expect(levelSpec(20).lap).toBe(1);
  });

  it('holds its finale for five beats, and settles inside the hold at every tempo', () => {
    const definition = VIGNETTES.at(-1)!;
    expect(definition.endingHoldBeats).toBe(5);
    expect(definition.endingSec).toBe(SCRATCH_REVEAL_SEC);
    expect(definition.partial).toBeUndefined();
    for (const bpm of [120, 136, 150]) {
      const end = new TaskSequence(bpm, 0).ending(10, definition.endingHoldBeats);
      expect(end.slide - end.contact).toBeGreaterThan(SCRATCH_REVEAL_SEC);
      expect((end.next - 10) / (60 / bpm * 4)).toBeCloseTo(2);
    }
  });

  it('shoves the record on the beat and has it back in place before the tightest half beat', () => {
    for (const bpm of [120, 136, 150]) {
      const beat = 60 / bpm;
      expect(scratchPush(-1, beat)).toBe(0);
      expect(scratchPush(0, beat)).toBe(0);
      expect(scratchPush(SCRATCH_MOTION.pushBeats * beat, beat)).toBeCloseTo(1);
      expect(scratchPush(SCRATCH_MOTION.pushBeats * beat * 0.5, beat)).toBeGreaterThan(0.5);
      expect(scratchPush(SCRATCH_MOTION.returnBeats * beat, beat)).toBeCloseTo(0);
      expect(scratchPush(beat / 2, beat)).toBeCloseTo(0);
      expect(faderCut(0, beat)).toBe(1);
      expect(faderCut(SCRATCH_MOTION.cutBeats * beat, beat)).toBeCloseTo(0);
    }
    expect(SCRATCH_MOTION.returnBeats).toBeLessThan(0.5);
    expect(SCRATCH_MOTION.cutBeats).toBeLessThan(0.5);
    expect(faderCut(-1)).toBe(0);
  });

  it('lights the meter one step per landed scratch and never past the top', () => {
    expect(meterLevel(0, 4)).toBe(0);
    expect(meterLevel(2, 4)).toBeLessThan(meterLevel(3, 4));
    expect(meterLevel(4, 4)).toBe(1);
    expect(meterLevel(9, 4)).toBe(1);
    expect(meterLevel(-1, 4)).toBe(0);
  });

  it('throws the hands up under the lights on success, and skips the needle and stops the platter on failure', () => {
    for (const still of [false, true]) {
      expect(scratchFinale(-1, true, still)).toEqual({ handsUp: 0, spinback: 0, lights: 0, skip: 0, stopped: 0 });
      const up = scratchFinale(SCRATCH_REVEAL_SEC, true, still);
      expect(up.handsUp).toBe(1);
      expect(up.lights).toBe(1);
      expect(up.skip).toBe(0);
      expect(up.stopped).toBe(0);
      if (still) expect(up.spinback).toBe(0); else expect(up.spinback).toBeGreaterThan(5);
      expect(scratchFinale(SCRATCH_MOTION.skipAtSec - 0.01, false, still)).toEqual({ handsUp: 0, spinback: 0, lights: 0, skip: 0, stopped: 0 });
      const off = scratchFinale(SCRATCH_REVEAL_SEC, false, still);
      expect(off.skip).toBe(1);
      expect(off.stopped).toBe(1);
      expect(off.handsUp).toBe(0);
      expect(off.lights).toBe(0);
      expect(off.spinback).toBe(0);
    }
    // The spin-back coasts: it keeps turning back but ever more slowly.
    const a = scratchFinale(0.3, true).spinback, b = scratchFinale(0.6, true).spinback, c = scratchFinale(0.9, true).spinback;
    expect(b - a).toBeGreaterThan(c - b);
  });

  it('has distinct, deterministic, click-free and unclipped voices', () => {
    for (const rate of [44100, 48000]) {
      const voices = ['action', 'success', 'rough', 'scrape', 'judder'] as const;
      const signatures = new Set<number>();
      for (const kind of voices) {
        const samples = synthesizeScratch(rate, kind);
        expect(samples).toEqual(synthesizeScratch(rate, kind));
        expect(Math.abs(samples[0]!)).toBe(0);
        expect(Math.abs(samples.at(-1)!)).toBe(0);
        expect(samples.every(v => Number.isFinite(v) && Math.abs(v) < 1)).toBe(true);
        const energy = samples.reduce((sum, v) => sum + v * v, 0);
        expect(energy).toBeGreaterThan(0.5);
        signatures.add(energy);
      }
      expect(signatures.size).toBe(voices.length);
    }
  });

  it('puts the rough voice\'s pop where the needle leaves the groove', () => {
    const rate = 48000;
    const rough = synthesizeScratch(rate, 'rough');
    let peakAt = 0;
    for (let i = 0; i < rough.length; i++) if (Math.abs(rough[i]!) > Math.abs(rough[peakAt]!)) peakAt = i;
    expect(peakAt / rate).toBeGreaterThanOrEqual(SCRATCH_MOTION.skipAtSec);
    expect(peakAt / rate).toBeLessThan(SCRATCH_MOTION.skipAtSec + 0.03);
  });

  it('sweeps the scratch up through the shove and back down: the wicka is not a static hiss', () => {
    const rate = 48000;
    const action = synthesizeScratch(rate, 'action');
    // Zero crossings per window as a cheap pitch estimate: higher through the shove than at the end of the return.
    const crossings = (from: number, to: number): number => {
      let n = 0;
      for (let i = Math.floor(from * rate) + 1; i < Math.floor(to * rate); i++) if ((action[i]! >= 0) !== (action[i - 1]! >= 0)) n++;
      return n / (to - from);
    };
    expect(crossings(0.05, 0.08)).toBeGreaterThan(crossings(0.17, 0.2));
  });
});
