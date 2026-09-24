import { describe, expect, it, vi } from 'vitest';
import type { VoiceName } from '../src/audio/AudioEngine';
import { createBarberSounds, synthesizeBarber, type BarberVoice } from '../src/audio/barberSounds';
import { actLevel, levelSpec } from '../src/game/levels';
import { TaskSequence } from '../src/game/TaskSequence';
import {
  BARBER_CUES, BARBER_MOTION, BARBER_REVEAL_SEC, barberFinale, barberOutcome, cutTimes, locksCut, snipOpening, tuftFall,
} from '../src/vignettes/barberMotion';
import { VIGNETTES } from '../src/vignettes/registry';

vi.mock('phaser', () => ({ default: {} }));

const VOICES: readonly BarberVoice[] = ['action', 'success', 'partial', 'rough', 'scrape', 'judder'];

/** A stand-in AudioContext: enough to build buffers under node. */
function fakeContext(sampleRate = 48000): AudioContext {
  return {
    sampleRate,
    createBuffer: (_channels: number, length: number) => {
      const data = new Float32Array(length);
      return { length, getChannelData: () => data };
    },
  } as unknown as AudioContext;
}

describe('barber act', () => {
  it('is the twenty-sixth act, and first plays level 51', () => {
    expect(VIGNETTES[25]?.id).toBe('barber');
    expect(levelSpec(51).vignette).toBe('barber');
    expect(actLevel('barber', 1)).toBe(79);
    expect([1, 25, 26, 50].map(n => levelSpec(n).vignette)).toEqual(['hammer', 'apple', 'hammer', 'apple']);
  });

  it('holds its reveal for five beats, and settles inside the hold at every tempo', () => {
    const definition = VIGNETTES.find(v => v.id === 'barber')!;
    expect(definition.endingHoldBeats).toBe(5);
    expect(definition.endingSec).toBe(BARBER_REVEAL_SEC);
    expect(definition.successAccuracy).toBe(BARBER_MOTION.successAccuracy);
    expect(definition.partial?.minAccuracy).toBe(BARBER_MOTION.partialAccuracy);
    for (const bpm of [120, 136, 150]) {
      const end = new TaskSequence(bpm, 0).ending(10, definition.endingHoldBeats);
      expect(end.slide - end.contact).toBeGreaterThan(BARBER_REVEAL_SEC);
    }
    for (const outcome of ['success', 'partial', 'fail'] as const) {
      const settled = barberFinale(BARBER_REVEAL_SEC, outcome);
      expect(barberFinale(100, outcome)).toEqual(settled);
    }
  });

  it('reads three endings from the round’s accuracy', () => {
    expect([0, 39.99, 40, 55, 69.99, 70, 100].map(barberOutcome)).toEqual(['fail', 'fail', 'partial', 'partial', 'partial', 'success', 'success']);
  });

  it('cuts every lock once, in order, and never the whole mop without a clean finish', () => {
    const { order, locks } = BARBER_MOTION;
    expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: locks }, (_, i) => i));
    for (const targets of [2, 3, 4, 7, 12]) {
      let previous = 0;
      for (let hits = 0; hits <= targets; hits++) {
        const cut = locksCut(hits, targets);
        expect(cut).toBeGreaterThanOrEqual(previous);
        expect(cut).toBeLessThan(locks);
        previous = cut;
      }
      const hits = Array.from({ length: targets }, (_, i) => 10 + i * 0.5);
      for (const outcome of ['partial', 'fail'] as const) {
        const times = cutTimes(hits, targets, 20, outcome);
        expect(times.filter(Number.isFinite)).toHaveLength(locksCut(targets, targets));
      }
      const clean = cutTimes(hits, targets, 20, 'success');
      expect(clean.every(Number.isFinite)).toBe(true);
      expect(Math.max(...clean)).toBeLessThanOrEqual(20 + BARBER_MOTION.flurry.at(-1)!);
      // The cut follows `order`: a lock later in it is never cut before one earlier.
      for (let k = 1; k < locks; k++) expect(clean[order[k]!]).toBeGreaterThanOrEqual(clean[order[k - 1]!]!);
    }
    // Only judged hits cut: an empty round leaves every lock long.
    expect(cutTimes([], 4, 20, 'fail').every(t => t === Infinity)).toBe(true);
    // The first lock of the fringe is cut before the right side, so a half cut is lopsided.
    expect(order.indexOf(8)).toBeLessThan(order.indexOf(7));
  });

  it('opens the blades again before a half-beat pair at the fastest tempo', () => {
    expect(snipOpening(-0.01)).toBe(1);
    expect(snipOpening(0)).toBe(0);
    const beat = 60 / 150;
    expect(snipOpening(beat / 2, beat)).toBe(1);
    expect(tuftFall(-1)).toBe(0);
    expect(tuftFall(0)).toBe(0);
    expect(tuftFall(BARBER_MOTION.fallSec / 2)).toBeLessThan(0.5);
    expect(tuftFall(BARBER_MOTION.fallSec)).toBe(1);
    expect(tuftFall(0.01, true)).toBe(1);
  });

  it('reveals the cut on a clean or middling round, and hides it under a hat on a rough one', () => {
    for (const still of [false, true]) {
      expect(barberFinale(-1, 'success', still)).toEqual({ cape: 0, eyes: 0, shine: 0, hat: 0, squash: 0 });
      expect(barberFinale(BARBER_REVEAL_SEC, 'success', still)).toMatchObject({ cape: 1, eyes: 1, shine: 1, hat: 0 });
      expect(barberFinale(BARBER_REVEAL_SEC, 'partial', still)).toMatchObject({ cape: 1, eyes: 1, shine: 0, hat: 0 });
      expect(barberFinale(BARBER_REVEAL_SEC, 'fail', still)).toMatchObject({ cape: 0, hat: 1, squash: 0 });
      // The cape waits for the cut to be finished, and the hat for the alarm.
      expect(barberFinale(BARBER_CUES.success.capeAt - 0.01, 'success', still).cape).toBe(0);
      expect(barberFinale(BARBER_CUES.fail.hatFrom - 0.01, 'fail', still).hat).toBe(0);
    }
    for (let age = 0; age <= BARBER_REVEAL_SEC; age += 0.05) expect(barberFinale(age, 'fail').cape).toBe(0);
  });

  it.each(VOICES)('%s is immediate, deterministic, finite and unclipped at both device rates', voice => {
    for (const rate of [44100, 48000]) {
      const data = synthesizeBarber(rate, voice);
      expect(data).toEqual(synthesizeBarber(rate, voice));
      expect(Math.abs(data[0]!)).toBe(0);
      expect(Math.abs(data.at(-1)!)).toBe(0);
      expect(data.every(v => Number.isFinite(v) && Math.abs(v) < 0.87)).toBe(true);
      expect(data.reduce((sum, v) => sum + v * v, 0)).toBeGreaterThan(0.5);
      if (voice === 'action') {
        expect(data.findIndex(v => Math.abs(v) > 0.01) / rate).toBeLessThan(0.005);
        expect(data.length / rate).toBeLessThan(0.3);
      } else expect(data.length / rate).toBeLessThanOrEqual(BARBER_REVEAL_SEC);
    }
    const energies = new Set(VOICES.map(v => synthesizeBarber(48000, v).reduce((sum, x) => sum + x * x, 0)));
    expect(energies.size).toBe(VOICES.length);
    expect(synthesizeBarber(48000, 'action', 1)).not.toEqual(synthesizeBarber(48000, 'action', 0));
  });

  it('snips the flurry, and lands the hat, where the picture does', () => {
    const rate = 48000, loud = (data: Float32Array, at: number) => data.slice(Math.floor(at * rate), Math.floor((at + 0.03) * rate)).some(v => Math.abs(v) > 0.05);
    const success = synthesizeBarber(rate, 'success');
    for (const at of BARBER_MOTION.flurry) expect(loud(success, at)).toBe(true);
    const rough = synthesizeBarber(rate, 'rough');
    expect(loud(rough, BARBER_CUES.fail.hatLands)).toBe(true);
    // The middling cut has a coda of its own rather than borrowing the rough one's hat.
    const sounds = createBarberSounds(fakeContext());
    expect(sounds.partial).toBeDefined();
    expect(Array.isArray(sounds.action) ? sounds.action.length : 1).toBe(2);
    const names: readonly VoiceName[] = ['success', 'rough', 'scrape', 'judder'];
    for (const name of names) expect(sounds[name]).toBeDefined();
  });
});
