import { describe, expect, it, vi } from 'vitest';
import {
  BALLOON_MOTION, backSoonCard, balloonFinale, balloonSize, bellboyArrival, ERRAND_REVEAL_SEC, PAINT_GRID,
  PAINT_IMAGES, paintImage, pileFinale, pumpStroke, rollerPass, rollerReturn, ROLLER_MOTION, staplerClose, staplerJaw, STAPLER_REST_RAD, stripeColumns,
} from '../src/vignettes/errandMotion';
import { synthesizeErrand } from '../src/audio/errandSounds';
import { VIGNETTES } from '../src/vignettes/registry';
import { levelSpec, PATTERN_TIERS } from '../src/game/levels';
import { TaskSequence } from '../src/game/TaskSequence';

vi.mock('phaser', () => ({ default: {} }));

describe('errand acts', () => {
  it('appends four acts after the household ones and keeps every earlier level', () => {
    expect(VIGNETTES.map(v => v.id).slice(13, 17)).toEqual(['roller', 'bell', 'balloon', 'stapler']);
    expect([14, 15, 16, 17].map(n => levelSpec(n).vignette)).toEqual(['roller', 'bell', 'balloon', 'stapler']);
    expect([1, 4, 9, 13].map(n => levelSpec(n).vignette)).toEqual(['hammer', 'saw', 'paper', 'doorbell']);
    // A five-beat hold, so every finale completes and the next task stays on the downbeat.
    for (const definition of VIGNETTES.slice(13, 17)) {
      expect(definition.endingHoldBeats).toBe(5);
      expect(definition.endingSec).toBe(ERRAND_REVEAL_SEC);
      for (const bpm of [120, 136, 150]) {
        const end = new TaskSequence(bpm, 0).ending(10, definition.endingHoldBeats);
        expect(end.slide - end.contact).toBeGreaterThan(ERRAND_REVEAL_SEC);
        expect((end.next - 10) / (60 / bpm * 4)).toBeCloseTo(2);
      }
    }
  });

  it('authors every picture as a full grid of palette indices and cycles them by round', () => {
    for (const image of PAINT_IMAGES) {
      expect(image.rows).toHaveLength(PAINT_GRID.rows);
      for (const row of image.rows) {
        expect(row).toHaveLength(PAINT_GRID.columns);
        for (const cell of row) expect(Number(cell)).toBeLessThan(image.palette.length);
      }
    }
    expect([1, 2, 3, 4].map(id => paintImage(id).id)).toEqual(['sun', 'heart', 'rocket', 'sun']);
  });

  it('divides the wall into whole columns that cover it exactly for any task length', () => {
    for (const tier of PATTERN_TIERS) for (const pattern of tier) {
      const stripes = pattern.hits.length + 1;
      let covered = 0;
      for (let s = 0; s < stripes; s++) {
        const { from, to } = stripeColumns(s, stripes);
        expect(from).toBe(covered);
        expect(to).toBeGreaterThan(from);
        covered = to;
      }
      expect(covered).toBe(PAINT_GRID.columns);
    }
    expect(stripeColumns(9, 4)).toEqual(stripeColumns(3, 4));
  });

  it('rolls a stripe and returns to the next one before the tightest half beat', () => {
    for (const bpm of [120, 136, 150]) {
      const beat = 60 / bpm;
      expect(rollerPass(-1, beat)).toBe(0);
      expect(rollerPass(0, beat)).toBe(0);
      expect(rollerPass(ROLLER_MOTION.passBeats * beat, beat)).toBeCloseTo(1);
      expect(rollerReturn(ROLLER_MOTION.passBeats * beat * 0.5, beat)).toBe(0);
      expect(rollerReturn((ROLLER_MOTION.passBeats + ROLLER_MOTION.returnBeats) * beat, beat)).toBeCloseTo(1);
      expect(ROLLER_MOTION.passBeats).toBeLessThan(0.5);
      expect(pumpStroke(0, beat)).toBe(1);
      expect(pumpStroke(beat / 2, beat)).toBeCloseTo(0);
      expect(staplerClose(0, beat)).toBe(1);
      expect(staplerClose(beat / 2, beat)).toBeCloseTo(0);
    }
    expect(pumpStroke(-1)).toBe(0);
    expect(staplerClose(-1)).toBe(0);
    // Rest is a readable gape; shut is zero; a jam opens further, never past a right angle.
    expect(staplerJaw(1)).toBe(0);
    expect(staplerJaw(0)).toBe(STAPLER_REST_RAD);
    expect(staplerJaw(-4)).toBe(STAPLER_REST_RAD);
    expect(staplerJaw(0, 1)).toBeGreaterThan(staplerJaw(0));
    expect(staplerJaw(0, 1)).toBeLessThan(Math.PI / 2);
  });

  it('brings the bell boy only on success and the card only on failure', () => {
    for (const still of [false, true]) {
      for (const age of [-1, 0, 0.5, 1, 2]) {
        expect(bellboyArrival(age, false, still)).toEqual({ rise: 0, tip: 0 });
        expect(backSoonCard(age, true, still)).toBe(0);
      }
      expect(bellboyArrival(ERRAND_REVEAL_SEC, true, still).rise).toBe(1);
      expect(backSoonCard(ERRAND_REVEAL_SEC, false, still)).toBe(1);
    }
    expect(bellboyArrival(0.1, true).rise).toBe(0);
    expect(bellboyArrival(1.15, true).tip).toBeCloseTo(1);
    expect(bellboyArrival(1.15, true, true).tip).toBe(1);
  });

  it('inflates a step per accurate stroke, then either ties off and rises or bursts', () => {
    expect(balloonSize(0, 4)).toBe(BALLOON_MOTION.restSize);
    expect(balloonSize(2, 4)).toBeLessThan(balloonSize(3, 4));
    expect(balloonSize(4, 4)).toBe(1);
    expect(balloonSize(9, 4)).toBe(1);
    expect(balloonSize(-1, 4)).toBe(BALLOON_MOTION.restSize);
    expect(balloonFinale(-1, true).rise).toBe(0);
    const risen = balloonFinale(ERRAND_REVEAL_SEC, true);
    expect(risen.tied).toBe(1);
    expect(risen.rise).toBe(1);
    expect(risen.pop).toBe(0);
    expect(balloonFinale(ERRAND_REVEAL_SEC, true, true).sway).toBe(0);
    expect(balloonFinale(BALLOON_MOTION.popAtSec - 0.01, false).pop).toBe(0);
    const popped = balloonFinale(ERRAND_REVEAL_SEC, false);
    expect(popped.pop).toBe(1);
    expect(popped.burst).toBe(1);
    expect(popped.rise).toBe(0);
  });

  it('squares the pile on success and jams the stapler on failure', () => {
    expect(pileFinale(-1, true)).toEqual({ fan: 1, lift: 0, jam: 0 });
    const bound = pileFinale(ERRAND_REVEAL_SEC, true);
    expect(bound.fan).toBeCloseTo(0);
    expect(bound.jam).toBe(0);
    expect(pileFinale(0.9, true).lift).toBeGreaterThan(0);
    expect(pileFinale(0.9, true, true).lift).toBe(0);
    const jammed = pileFinale(ERRAND_REVEAL_SEC, false);
    expect(jammed.jam).toBe(1);
    expect(jammed.fan).toBeGreaterThan(1);
  });

  it.each(['roller', 'bell', 'balloon', 'stapler'] as const)('%s has distinct, deterministic, click-free and unclipped voices', act => {
    for (const rate of [44100, 48000]) {
      const voices = ['action', 'success', 'rough', 'scrape', 'judder'] as const;
      const signatures = new Set<number>();
      for (const kind of voices) {
        const samples = synthesizeErrand(rate, act, kind);
        expect(samples).toEqual(synthesizeErrand(rate, act, kind));
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

  it('puts the balloon pop where the sound puts its crack', () => {
    const rate = 48000;
    const rough = synthesizeErrand(rate, 'balloon', 'rough');
    let peakAt = 0;
    for (let i = 0; i < rough.length; i++) if (Math.abs(rough[i]!) > Math.abs(rough[peakAt]!)) peakAt = i;
    expect(peakAt / rate).toBeGreaterThanOrEqual(BALLOON_MOTION.popAtSec);
    expect(peakAt / rate).toBeLessThan(BALLOON_MOTION.popAtSec + 0.03);
  });
});
