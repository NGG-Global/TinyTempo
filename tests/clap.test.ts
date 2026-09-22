import { describe, expect, it, vi } from 'vitest';
import {
  CLAP_MOTION, CLAP_REVEAL_SEC, CROWD_HANDS, clapFinale, clapOutcome, clapRing, crowdClap, crowdSize,
  handGap, palmSquash, POLITE_HANDS, roomWarmth,
} from '../src/vignettes/clapMotion';
import { synthesizeClap } from '../src/audio/clapSounds';
import { SAMPLE_URLS } from '../src/audio/samples';
import { VIGNETTES } from '../src/vignettes/registry';
import { levelSpec } from '../src/game/levels';
import { TaskSequence } from '../src/game/TaskSequence';

vi.mock('phaser', () => ({ default: {} }));

describe('clapping hands act', () => {
  it('is appended as the twenty-first act and keeps every earlier level', () => {
    expect(VIGNETTES[20]?.id).toBe('clap');
    expect(levelSpec(21).vignette).toBe('clap');
    expect(levelSpec(21 + VIGNETTES.length).vignette).toBe('clap');
    expect([1, 9, 19, 20].map(n => levelSpec(n).vignette)).toEqual(['hammer', 'paper', 'scratch', 'trombone']);
    expect(levelSpec(1 + VIGNETTES.length).vignette).toBe('hammer');
    expect(levelSpec(1 + VIGNETTES.length).lap).toBe(1);
  });

  it('holds its finale for five beats, and settles inside the hold at every tempo', () => {
    const definition = VIGNETTES.find(v => v.id === 'clap')!;
    expect(definition.endingHoldBeats).toBe(5);
    expect(definition.endingSec).toBe(CLAP_REVEAL_SEC);
    // The middle ending is declared, so the plaque's words and the coda agree on it.
    expect(definition.partial?.minAccuracy).toBe(CLAP_MOTION.partialAccuracy);
    expect(definition.successAccuracy).toBe(CLAP_MOTION.successAccuracy);
    for (const bpm of [120, 136, 150]) {
      const end = new TaskSequence(bpm, 0).ending(10, definition.endingHoldBeats);
      expect(end.slide - end.contact).toBeGreaterThan(CLAP_REVEAL_SEC);
      expect((end.next - 10) / (60 / bpm * 4)).toBeCloseTo(2);
    }
    // Everything the finale moves has arrived by the time the summary is allowed up.
    expect(clapFinale(CLAP_REVEAL_SEC, 'success').crowd).toBe(1);
    expect(clapFinale(CLAP_REVEAL_SEC, 'partial').crowd).toBe(1);
    expect(clapFinale(CLAP_REVEAL_SEC, 'fail').shrug).toBe(1);
  });

  it('claps on the beat and has the hands waiting again before the tightest half beat', () => {
    for (const bpm of [120, 136, 150]) {
      const beat = 60 / bpm;
      // Nothing winds up: the hands are already apart, so the whole motion is after contact.
      expect(handGap(-1, beat)).toBe(CLAP_MOTION.readyGap);
      expect(handGap(0, beat)).toBe(0);
      expect(handGap(CLAP_MOTION.reboundBeats * beat, beat)).toBeCloseTo(1);
      expect(handGap(CLAP_MOTION.reboundBeats * beat * 0.5, beat)).toBeGreaterThan(0.5);
      expect(handGap(CLAP_MOTION.readyBeats * beat, beat)).toBeCloseTo(CLAP_MOTION.readyGap);
      expect(handGap(beat / 2, beat)).toBeCloseTo(CLAP_MOTION.readyGap);
      expect(palmSquash(0, beat)).toBe(1);
      expect(palmSquash(CLAP_MOTION.squashBeats * beat, beat)).toBeCloseTo(0);
      // The ring leaves the palms and is gone before it could be taken for the next clap.
      expect(clapRing(0, beat)).toBe(0);
      expect(clapRing(CLAP_MOTION.ringBeats * beat * 0.5, beat)).toBeGreaterThan(0);
      expect(clapRing(CLAP_MOTION.ringBeats * beat, beat)).toBe(0);
    }
    expect(CLAP_MOTION.readyBeats).toBeLessThan(0.5);
    expect(palmSquash(-1)).toBe(0);
    expect(clapRing(-1)).toBe(0);
  });

  it('warms the room one step per landed clap and never past full', () => {
    expect(roomWarmth(0, 4)).toBe(0);
    expect(roomWarmth(2, 4)).toBeLessThan(roomWarmth(3, 4));
    expect(roomWarmth(4, 4)).toBe(1);
    expect(roomWarmth(9, 4)).toBe(1);
    expect(roomWarmth(-1, 4)).toBe(0);
  });

  it('sorts the round into a full house, a scattered few, and nobody', () => {
    expect(clapOutcome(100)).toBe('success');
    expect(clapOutcome(CLAP_MOTION.successAccuracy)).toBe('success');
    expect(clapOutcome(CLAP_MOTION.successAccuracy - 1)).toBe('partial');
    expect(clapOutcome(CLAP_MOTION.partialAccuracy)).toBe('partial');
    expect(clapOutcome(CLAP_MOTION.partialAccuracy - 1)).toBe('fail');
    expect(clapOutcome(0)).toBe('fail');
    expect(crowdSize('success')).toBe(CROWD_HANDS.length);
    expect(crowdSize('partial')).toBe(POLITE_HANDS);
    expect(crowdSize('fail')).toBe(0);
  });

  it('brings a crowd up on a clean round, a scatter on a middling one, and nobody on a rough one', () => {
    for (const still of [false, true]) {
      expect(clapFinale(-1, 'success', still)).toEqual({ open: CLAP_MOTION.readyGap, crowd: 0, hands: 0, shrug: 0, lights: 0 });
      const up = clapFinale(CLAP_REVEAL_SEC, 'success', still);
      expect(up.crowd).toBe(1);
      expect(up.hands).toBe(CROWD_HANDS.length);
      expect(up.lights).toBe(1);
      expect(up.shrug).toBe(0);
      const few = clapFinale(CLAP_REVEAL_SEC, 'partial', still);
      expect(few.hands).toBe(POLITE_HANDS);
      expect(few.lights).toBeLessThan(up.lights);
      // A rough round gets no crowd at any point, and the hands turn over instead.
      for (const age of [0, 0.3, 0.8, CLAP_REVEAL_SEC, 10]) {
        const none = clapFinale(age, 'fail', still);
        expect(none.crowd).toBe(0);
        expect(none.hands).toBe(0);
        expect(none.lights).toBe(0);
      }
      const shrug = clapFinale(CLAP_REVEAL_SEC, 'fail', still);
      expect(shrug.shrug).toBe(1);
      expect(shrug.open).toBe(1);
      expect(clapFinale(CLAP_MOTION.shrugAtSec, 'fail', still).shrug).toBe(0);
    }
    // Applause is a 5 Hz oscillation, which is exactly what reduced motion is about: it
    // holds the hands where they wait instead, and steps the crowd on rather than sliding it.
    const applause = [0.1, 0.2, 0.3].map(t => clapFinale(t, 'success').open);
    expect(new Set(applause).size).toBe(3);
    expect(applause.some(open => open > 0.2)).toBe(true);
    expect([0.1, 0.2, 0.3].every(t => clapFinale(t, 'success', true).open === CLAP_MOTION.readyGap)).toBe(true);
    expect(clapFinale(CLAP_MOTION.crowdAtSec - 0.01, 'success', true).crowd).toBe(0);
    expect(clapFinale(CLAP_MOTION.crowdAtSec, 'success', true).crowd).toBe(1);
  });

  it('gives the crowd its own hands: spread out, and never clapping in lockstep', () => {
    // The scatter a middling round gets is three people sitting apart, not three together.
    const polite = CROWD_HANDS.slice(0, POLITE_HANDS);
    for (let i = 0; i < polite.length; i++) {
      for (let j = i + 1; j < polite.length; j++) {
        expect(Math.abs(polite[i]!.x - polite[j]!.x)).toBeGreaterThan(150);
      }
    }
    expect(new Set(CROWD_HANDS.map(h => h.rate)).size).toBe(CROWD_HANDS.length);
    const at = CROWD_HANDS.map((_, i) => crowdClap(0.37, i));
    expect(new Set(at.map(v => v.toFixed(3))).size).toBeGreaterThan(CROWD_HANDS.length / 2);
    expect(at.every(v => v >= 0 && v <= 1)).toBe(true);
    // Out of range is somebody else's hand rather than a crash.
    expect(crowdClap(0.37, CROWD_HANDS.length)).toBeCloseTo(crowdClap(0.37, 0));
    expect(crowdClap(0.37, 4, true)).toBe(crowdClap(9.1, 7, true));
  });

  it('registers the four recorded takes: the beat as WAV, the three endings as MP3', () => {
    expect(SAMPLE_URLS.clap).toMatch(/clap\.wav$/);
    for (const name of ['clapSuccess', 'clapPartial', 'clapFail'] as const) {
      expect(SAMPLE_URLS[name]).toMatch(/clap-[a-z]+\.mp3$/);
    }
  });

  it('has distinct, deterministic, click-free and unclipped voices', () => {
    for (const rate of [44100, 48000]) {
      const voices = ['action', 'success', 'partial', 'rough', 'scrape', 'judder'] as const;
      const signatures = new Set<number>();
      for (const kind of voices) {
        const samples = synthesizeClap(rate, kind);
        expect(samples).toEqual(synthesizeClap(rate, kind));
        expect(Math.abs(samples[0]!)).toBe(0);
        expect(Math.abs(samples.at(-1)!)).toBe(0);
        expect(samples.every(v => Number.isFinite(v) && Math.abs(v) < 1)).toBe(true);
        const energy = samples.reduce((sum, v) => sum + v * v, 0);
        expect(energy, kind).toBeGreaterThan(0.5);
        signatures.add(energy);
      }
      expect(signatures.size).toBe(voices.length);
    }
  });

  it('answers a clean round with a room full of claps and a middling one with a handful', () => {
    const rate = 48000;
    const claps = (kind: 'success' | 'partial'): number => {
      const data = synthesizeClap(rate, kind);
      // Count transients after the round's own clap: a peak that is well above the decay
      // around it is another pair of hands starting.
      let count = 0;
      for (let i = Math.floor(rate * 0.1); i < data.length - 1; i++) {
        const window = Math.abs(data[i - Math.floor(rate * 0.004)] ?? 0);
        if (Math.abs(data[i]!) > 0.18 && Math.abs(data[i]!) > window * 3) { count++; i += Math.floor(rate * 0.02); }
      }
      return count;
    };
    const full = claps('success'), few = claps('partial');
    expect(few).toBeGreaterThan(0);
    expect(full).toBeGreaterThan(few * 2);
  });
});
