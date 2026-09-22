import { describe, expect, it, vi } from 'vitest';
import type { VoiceName } from '../src/audio/AudioEngine';
import { synthesizeTreat, type TreatAct } from '../src/audio/treatSounds';
import { BONGO_BEAT, BONGO_FAIL, consumed, contactPulse, FREEZE_AT, percussionPose, reveal, SNARE_ROLL, STICK_LANDINGS, TREAT_REVEAL_SEC, WORM_AT } from '../src/vignettes/treatMotion';
import { VIGNETTES } from '../src/vignettes/registry';
import { levelSpec } from '../src/game/levels';
import { TaskSequence } from '../src/game/TaskSequence';

vi.mock('phaser', () => ({ default: {} }));

const ACTS: readonly TreatAct[] = ['snare', 'bongos', 'slushy', 'apple'];
const VOICES: readonly VoiceName[] = ['action', 'success', 'rough', 'scrape', 'judder'];

describe('percussion and picnic acts', () => {
  it('adds levels 22–25 after all existing introductory acts', () => {
    expect(VIGNETTES.slice(21).map(v => v.id)).toEqual(ACTS);
    expect([22, 23, 24, 25].map(level => levelSpec(level).vignette)).toEqual(ACTS);
    expect(VIGNETTES.slice(0, 21).map(v => v.id)).toEqual([
      'hammer', 'window', 'bug', 'saw', 'tomato', 'curl', 'cucumber', 'banana', 'paper',
      'egg', 'bubble', 'light', 'doorbell', 'roller', 'bell', 'balloon', 'stapler',
      'fisherman', 'scratch', 'trombone', 'clap',
    ]);
    for (const definition of VIGNETTES.slice(21)) {
      for (const bpm of [120, 136, 150]) {
        const ending = new TaskSequence(bpm, 0).ending(10, definition.endingHoldBeats);
        expect(ending.slide - ending.contact).toBeGreaterThan(TREAT_REVEAL_SEC);
        expect((ending.next - 10) / (60 / bpm * 4)).toBeCloseTo(2);
      }
    }
  });

  it('reserves the last mouthful for success and never refills a failed cup or apple', () => {
    for (const targets of [3, 4, 7, 12]) {
      let previous = 0;
      for (let hits = 0; hits <= targets; hits++) {
        const progress = consumed(hits, targets, -1, false);
        expect(progress).toBeGreaterThanOrEqual(previous);
        expect(progress).toBeLessThan(1);
        expect(consumed(hits, targets, 1.8, false)).toBe(progress);
        expect(consumed(hits, targets, 0, true)).toBe(progress);
        expect(consumed(hits, targets, 1.8, true)).toBe(1);
        previous = progress;
      }
    }
    expect(consumed(-1, 4, -1, false)).toBe(0);
    expect(consumed(100, 4, -1, false)).toBe(0.82);
    expect(Number.isFinite(consumed(0, 0, -1, false))).toBe(true);
  });

  it('puts every coda hand strike at its audible contact and rests between strokes', () => {
    for (const score of [SNARE_ROLL, BONGO_BEAT, BONGO_FAIL]) {
      for (const hit of score) expect(percussionPose(hit.at, score, hit.side)).toBe(1);
      expect(percussionPose(-0.01, score, 0)).toBe(0);
      expect(percussionPose(TREAT_REVEAL_SEC, score, 1)).toBe(0);
    }
    expect(contactPulse(-0.001)).toBe(0);
    expect(contactPulse(0)).toBe(1);
    expect(contactPulse(0.2)).toBe(0);
    for (const at of [FREEZE_AT, WORM_AT]) for (const still of [false, true]) {
      expect(reveal(at - 0.001, at, still)).toBe(0);
      expect(reveal(1.8, at, still)).toBe(1);
    }
  });

  it.each(ACTS)('%s has immediate, deterministic, finite and unclipped sounds at both device rates', act => {
    for (const rate of [44100, 48000]) {
      const energies = new Set<number>();
      for (const voice of VOICES) {
        const data = synthesizeTreat(rate, act, voice);
        expect(data).toEqual(synthesizeTreat(rate, act, voice));
        expect(Math.abs(data[0]!)).toBe(0);
        expect(Math.abs(data.at(-1)!)).toBe(0);
        expect(data.every(v => Number.isFinite(v) && Math.abs(v) < 0.87)).toBe(true);
        const energy = data.reduce((sum, v) => sum + v * v, 0);
        expect(energy).toBeGreaterThan(0.5);
        energies.add(energy);
        if (voice === 'action') {
          expect(data.findIndex(v => Math.abs(v) > 0.01) / rate).toBeLessThan(0.005);
          expect(data.length / rate).toBeLessThan(0.3);
        } else expect(data.length / rate).toBeLessThanOrEqual(TREAT_REVEAL_SEC);
      }
      expect(energies.size).toBe(VOICES.length);
      expect(synthesizeTreat(rate, act, 'action', 1)).not.toEqual(synthesizeTreat(rate, act, 'action', 0));
    }
  });

  it('sounds the falling sticks when they reach the floor', () => {
    const rate = 48000, data = synthesizeTreat(rate, 'snare', 'rough');
    expect(data.slice(0, Math.floor(STICK_LANDINGS[0] * rate)).every(v => v === 0)).toBe(true);
    for (const at of STICK_LANDINGS) {
      expect(data.slice(Math.ceil(at * rate), Math.ceil((at + 0.015) * rate)).some(v => Math.abs(v) > 0.04)).toBe(true);
    }
  });
});
