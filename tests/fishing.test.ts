import { describe, expect, it, vi } from 'vitest';
import {
  BIG_FISH, bigFish, FISHING_MOTION, FISHING_REVEAL_SEC, fishingOutcome, haulFinale, HEAVE, JUNK, junkFor, rodHeave, shadowRise,
} from '../src/vignettes/fishingMotion';
import { synthesizeFishing } from '../src/audio/fishingSounds';
import { VIGNETTES } from '../src/vignettes/registry';
import { levelSpec } from '../src/game/levels';
import { TaskSequence } from '../src/game/TaskSequence';

vi.mock('phaser', () => ({ default: {} }));

describe('fisherman act', () => {
  it('is appended as the eighteenth act and keeps every earlier level', () => {
    expect(VIGNETTES.at(-1)?.id).toBe('fisherman');
    expect(VIGNETTES).toHaveLength(18);
    expect(levelSpec(18).vignette).toBe('fisherman');
    expect(levelSpec(36).vignette).toBe('fisherman');
    expect([1, 4, 9, 13, 14, 17].map(n => levelSpec(n).vignette)).toEqual(['hammer', 'saw', 'paper', 'doorbell', 'roller', 'stapler']);
    // Level 19 is the hammer again: the rotation is one longer, and lap 1 starts a level later.
    expect(levelSpec(19).vignette).toBe('hammer');
    expect(levelSpec(19).lap).toBe(1);
  });

  it('holds its finale for five beats, and every ending settles inside the hold at every tempo', () => {
    const definition = VIGNETTES.at(-1)!;
    expect(definition.endingHoldBeats).toBe(5);
    expect(definition.endingSec).toBe(FISHING_REVEAL_SEC);
    expect(definition.partial?.minAccuracy).toBe(FISHING_MOTION.partialAccuracy);
    expect(definition.successAccuracy).toBe(FISHING_MOTION.successAccuracy);
    for (const bpm of [120, 136, 150]) {
      const end = new TaskSequence(bpm, 0).ending(10, definition.endingHoldBeats);
      expect(end.slide - end.contact).toBeGreaterThan(FISHING_REVEAL_SEC);
      expect((end.next - 10) / (60 / bpm * 4)).toBeCloseTo(2);
    }
  });

  it('grades the round into a big fish, a small fish or junk from the authoritative accuracy', () => {
    expect(fishingOutcome(100)).toBe('success');
    expect(fishingOutcome(70)).toBe('success');
    expect(fishingOutcome(69.9)).toBe('partial');
    expect(fishingOutcome(40)).toBe('partial');
    expect(fishingOutcome(39.9)).toBe('fail');
    expect(fishingOutcome(0)).toBe('fail');
  });

  it('heaves on the beat and settles back, with a yank of resistance on the way, inside half a beat', () => {
    for (const bpm of [120, 136, 150]) {
      const beat = 60 / bpm;
      expect(rodHeave(-1, beat)).toBe(0);
      expect(rodHeave(0, beat)).toBe(1);
      expect(rodHeave(FISHING_MOTION.heaveBeats * beat, beat)).toBeCloseTo(0);
      expect(rodHeave(beat / 2, beat)).toBeCloseTo(0);
      // The way back is not monotonic: the rod springs up, is yanked down again, then settles.
      const window = FISHING_MOTION.heaveBeats * beat;
      expect(rodHeave(HEAVE.springBy * window, beat)).toBeCloseTo(0, 1);
      expect(rodHeave(HEAVE.yankAt * window, beat)).toBeGreaterThan(0.3);
      expect(rodHeave(HEAVE.yankAt * window, beat)).toBeLessThan(rodHeave(0, beat));
      const samples = Array.from({ length: 40 }, (_, i) => rodHeave(i / 40 * window, beat));
      expect(samples.every(v => v >= 0 && v <= 1)).toBe(true);
    }
    expect(FISHING_MOTION.heaveBeats).toBeLessThan(0.5);
  });

  it('brings the shadow up one step per landed pull and never past the surface', () => {
    expect(shadowRise(0, 4)).toBe(0);
    expect(shadowRise(2, 4)).toBeLessThan(shadowRise(3, 4));
    expect(shadowRise(4, 4)).toBe(1);
    expect(shadowRise(9, 4)).toBe(1);
    expect(shadowRise(-1, 4)).toBe(0);
  });

  it('cycles three big fish with three different flights, and two kinds of junk, by round', () => {
    expect(BIG_FISH.length).toBeGreaterThanOrEqual(3);
    expect(new Set(BIG_FISH.map(f => f.flight)).size).toBe(BIG_FISH.length);
    expect(new Set(BIG_FISH.map(f => f.id)).size).toBe(BIG_FISH.length);
    expect([1, 2, 3, 4].map(id => bigFish(id).id)).toEqual(['bass', 'salmon', 'carp', 'bass']);
    expect(bigFish(0)).toBe(BIG_FISH[0]);
    expect(JUNK).toEqual(['boot', 'tyre']);
    expect([1, 2, 3].map(junkFor)).toEqual(['boot', 'tyre', 'boot']);
  });

  it('keeps every catch under the water until the breach, then lifts it clear by the end of the reveal', () => {
    for (const still of [false, true]) {
      for (const fish of BIG_FISH) {
        for (const outcome of ['success', 'partial', 'fail'] as const) {
          expect(haulFinale(-1, outcome, fish.flight, still).breached).toBe(false);
          expect(haulFinale(-1, outcome, fish.flight, still).lift).toBe(0);
          const loading = haulFinale(FISHING_MOTION.breachSec - 0.01, outcome, fish.flight, still);
          expect(loading.breached).toBe(false);
          expect(loading.lift).toBe(0);
          expect(loading.bow).toBeGreaterThan(0.9);
          const out = haulFinale(FISHING_REVEAL_SEC, outcome, fish.flight, still);
          expect(out.breached).toBe(true);
          expect(out.lift).toBeGreaterThan(0.5);
          expect(out.lift).toBeLessThanOrEqual(1);
          expect(out.toward).toBeGreaterThanOrEqual(0);
          expect(out.toward).toBeLessThanOrEqual(1);
          expect(out.splash).toBe(0);
          if (still) expect(out.spin).toBe(0);
        }
      }
    }
  });

  it('gives each big fish its own way out of the water', () => {
    const at = (age: number, flight: (typeof BIG_FISH)[number]['flight']) => haulFinale(age, 'success', flight);
    // The bass leaps: straight up, a full somersault, barely any travel toward the jetty.
    expect(at(FISHING_REVEAL_SEC, 'leap').spin).toBeCloseTo(Math.PI * 2);
    expect(at(FISHING_REVEAL_SEC, 'leap').toward).toBeLessThan(0.3);
    expect(at(FISHING_REVEAL_SEC, 'leap').lift).toBeCloseTo(1);
    // The salmon swings the whole way across into the fisherman's arms.
    expect(at(FISHING_REVEAL_SEC, 'arc').toward).toBeCloseTo(1);
    const midway = at(FISHING_MOTION.breachSec + 0.5, 'arc');
    expect(midway.lift).toBeGreaterThan(at(FISHING_REVEAL_SEC, 'arc').lift);
    // The carp is hauled: slower up, the rod still bowed, the fisherman right back on his heels.
    expect(at(FISHING_MOTION.breachSec + 0.4, 'heave').lift).toBeLessThan(at(FISHING_MOTION.breachSec + 0.4, 'leap').lift);
    expect(at(FISHING_REVEAL_SEC, 'heave').stagger).toBeCloseTo(1);
    expect(at(FISHING_REVEAL_SEC, 'heave').bow).toBeGreaterThan(at(FISHING_REVEAL_SEC, 'leap').bow);
  });

  it('splashes hardest for a big fish, and only after the breach', () => {
    const mid = FISHING_MOTION.breachSec + FISHING_MOTION.splashSec / 2;
    expect(haulFinale(FISHING_MOTION.breachSec - 0.05, 'success', 'leap').splash).toBe(0);
    expect(haulFinale(mid, 'success', 'leap').splash).toBeCloseTo(1);
    expect(haulFinale(mid, 'partial', 'leap').splash).toBeLessThan(haulFinale(mid, 'fail', 'leap').splash);
    expect(haulFinale(mid, 'fail', 'leap').splash).toBeLessThan(1);
    expect(haulFinale(mid, 'success', 'leap', true).splash).toBe(0);
  });

  it('has distinct, deterministic, click-free and unclipped voices', () => {
    for (const rate of [44100, 48000]) {
      const voices = ['action', 'success', 'rough', 'scrape', 'judder'] as const;
      const signatures = new Set<number>();
      for (const kind of voices) {
        const samples = synthesizeFishing(rate, kind);
        expect(samples).toEqual(synthesizeFishing(rate, kind));
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

  it('puts both finales\' splash where the picture breaks the surface', () => {
    const rate = 48000;
    for (const kind of ['success', 'rough'] as const) {
      const voice = synthesizeFishing(rate, kind);
      const from = Math.floor(rate * FISHING_MOTION.breachSec), to = Math.floor(rate * (FISHING_MOTION.breachSec + 0.08));
      const before = voice.subarray(Math.floor(rate * 0.15), from).reduce((sum, v) => sum + v * v, 0) / (from - Math.floor(rate * 0.15));
      const splash = voice.subarray(from, to).reduce((sum, v) => sum + v * v, 0) / (to - from);
      // The splash is the loudest thing after the pull itself has died away.
      expect(splash).toBeGreaterThan(before * 3);
    }
  });
});
