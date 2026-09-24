import { describe, expect, it, vi } from 'vitest';
import type { VoiceName } from '../src/audio/AudioEngine';
import { synthesizePopcorn } from '../src/audio/popcornSounds';
import { actLevel, levelSpec } from '../src/game/levels';
import { TaskSequence } from '../src/game/TaskSequence';
import {
  BOWL, CROWN, demoHop, flight, HEAP, launchPoint, launchTimes, panJolt, piecesAfter, POPCORN_MOTION, POPCORN_REVEAL_SEC, popcornFinale,
} from '../src/vignettes/popcornMotion';
import { VIGNETTES } from '../src/vignettes/registry';

vi.mock('phaser', () => ({ default: {} }));

const VOICES: readonly VoiceName[] = ['action', 'success', 'rough', 'scrape', 'judder'];

describe('popcorn act', () => {
  it('is the twenty-seventh act, and first plays level 52', () => {
    expect(VIGNETTES[26]?.id).toBe('popcorn');
    expect(levelSpec(52).vignette).toBe('popcorn');
    expect(actLevel('popcorn', 1)).toBe(80);
    const definition = VIGNETTES[26]!;
    expect(definition.endingHoldBeats).toBe(5);
    expect(definition.endingSec).toBe(POPCORN_REVEAL_SEC);
    for (const bpm of [120, 136, 150]) {
      const end = new TaskSequence(bpm, 0).ending(10, definition.endingHoldBeats);
      expect(end.slide - end.contact).toBeGreaterThan(POPCORN_REVEAL_SEC);
    }
  });

  it('builds a heap from inside the bowl up to a dome, a layer at a time', () => {
    expect(HEAP.length).toBeGreaterThan(30);
    for (let i = 1; i < HEAP.length; i++) expect(HEAP[i]!.layer).toBeGreaterThanOrEqual(HEAP[i - 1]!.layer);
    for (const slot of HEAP) {
      expect(Math.abs(slot.x - BOWL.x)).toBeLessThanOrEqual(BOWL.rx);
      expect(slot.y).toBeLessThanOrEqual(BOWL.y + BOWL.ry);
    }
    // Higher layers are narrower, which is what makes it a dome rather than a column.
    const spread = (layer: number) => Math.max(...HEAP.filter(s => s.layer === layer).map(s => Math.abs(s.x - BOWL.x)));
    expect(spread(8)).toBeLessThan(spread(4));
    expect(CROWN.y).toBeLessThan(Math.min(...HEAP.map(s => s.y)));
  });

  it('fills with judged hits only, and never to the brim without the big pop', () => {
    for (const targets of [2, 3, 4, 7, 12]) {
      let previous = 0;
      for (let hits = 0; hits <= targets; hits++) {
        const pieces = piecesAfter(hits, targets);
        expect(pieces).toBeGreaterThanOrEqual(previous);
        expect(pieces).toBeLessThan(HEAP.length);
        previous = pieces;
      }
      const hits = Array.from({ length: targets }, (_, i) => 10 + i * 0.5);
      expect(launchTimes(hits, targets, 20, false).filter(Number.isFinite)).toHaveLength(piecesAfter(targets, targets));
      for (const share of [0, 0.7, 1]) {
        const some = hits.slice(0, Math.round(targets * share));
        const times = launchTimes(some, targets, 20, true);
        expect(times.every(Number.isFinite)).toBe(true);
        // However much is left for the big pop, the last piece has landed inside the reveal.
        expect(Math.max(...times) + POPCORN_MOTION.flightSec).toBeLessThanOrEqual(20 + POPCORN_REVEAL_SEC);
      }
    }
    expect(launchTimes([], 4, null, false).every(t => t === Infinity)).toBe(true);
  });

  it('arcs every piece from the pan into its slot, and settles it there', () => {
    for (let i = 0; i < HEAP.length; i++) {
      const from = launchPoint(i), to = HEAP[i]!;
      expect(flight(0, from, to)).toMatchObject({ x: from.x, y: from.y, landed: false });
      const land = flight(POPCORN_MOTION.flightSec, from, to);
      expect(land.x).toBeCloseTo(to.x, 6);
      expect(land.y).toBeCloseTo(to.y, 6);
      expect(land.landed).toBe(true);
      expect(flight(POPCORN_MOTION.flightSec / 2, from, to).y).toBeLessThan(Math.min(from.y, to.y));
      expect(flight(POPCORN_MOTION.flightSec + 1, from, to).squash).toBe(0);
    }
  });

  it('hops the example’s kernel straight back into the pan, and settles the pan inside a third of a beat', () => {
    expect(demoHop(-0.1)).toBe(-1);
    expect(demoHop(0)).toBe(0);
    expect(demoHop(0.35 * 0.5)).toBeCloseTo(1, 6);
    expect(demoHop(0.7 * 0.5)).toBe(-1);
    expect(panJolt(-0.1)).toBe(0);
    expect(panJolt(0.3 * 0.5)).toBe(0);
    for (let age = 0; age < 0.2; age += 0.01) expect(Math.abs(panJolt(age))).toBeLessThanOrEqual(1);
  });

  it('swells one enormous kernel and bursts it on its cue; a rough round smokes instead', () => {
    const M = POPCORN_MOTION;
    for (const still of [false, true]) {
      const before = popcornFinale(M.bigPopAt - 0.001, true, still), after = popcornFinale(M.bigPopAt, true, still);
      expect(before.burst).toBe(0);
      expect(after.swell).toBe(0);
      expect(popcornFinale(POPCORN_REVEAL_SEC, true, still)).toMatchObject({ swell: 0, burst: 1, shake: 0, smoke: 0, burnt: -1 });
      expect(popcornFinale(POPCORN_REVEAL_SEC, false, still)).toMatchObject({ swell: 0, burst: 0, shake: 0, smoke: 1, burnt: 1 });
      expect(popcornFinale(M.burntFrom - 0.01, false, still).burnt).toBe(-1);
      expect(popcornFinale(-1, true, still)).toEqual({ swell: 0, burst: 0, shake: 0, smoke: 0, burnt: -1 });
    }
    expect(popcornFinale(M.bigPopAt - 0.02, true).swell).toBeGreaterThan(0.9);
    // The crowning piece lands on the heap well before the hold ends.
    expect(M.bigPopAt + M.crownFlightSec).toBeLessThan(POPCORN_REVEAL_SEC);
  });

  it.each(VOICES)('%s is immediate, deterministic, finite and unclipped at both device rates', voice => {
    for (const rate of [44100, 48000]) {
      const data = synthesizePopcorn(rate, voice);
      expect(data).toEqual(synthesizePopcorn(rate, voice));
      expect(Math.abs(data[0]!)).toBe(0);
      expect(Math.abs(data.at(-1)!)).toBe(0);
      expect(data.every(v => Number.isFinite(v) && Math.abs(v) < 0.87)).toBe(true);
      expect(data.reduce((sum, v) => sum + v * v, 0)).toBeGreaterThan(0.5);
      if (voice === 'action') {
        expect(data.findIndex(v => Math.abs(v) > 0.01) / rate).toBeLessThan(0.005);
        expect(data.length / rate).toBeLessThan(0.3);
      } else expect(data.length / rate).toBeLessThanOrEqual(POPCORN_REVEAL_SEC);
    }
    const energies = new Set(VOICES.map(v => synthesizePopcorn(48000, v).reduce((sum, x) => sum + x * x, 0)));
    expect(energies.size).toBe(VOICES.length);
    expect(synthesizePopcorn(48000, 'action', 1)).not.toEqual(synthesizePopcorn(48000, 'action', 0));
  });

  it('makes the last pop the loudest thing in the coda, on the frame it bursts', () => {
    const rate = 48000, data = synthesizePopcorn(rate, 'success');
    const peak = (from: number, to: number) => Math.max(...data.slice(Math.floor(from * rate), Math.floor(to * rate)).map(Math.abs));
    const pop = peak(POPCORN_MOTION.bigPopAt, POPCORN_MOTION.bigPopAt + 0.05);
    expect(pop).toBeGreaterThan(peak(0, POPCORN_MOTION.bigPopAt - 0.001) * 1.5);
    expect(pop).toBeGreaterThanOrEqual(peak(POPCORN_MOTION.bigPopAt + 0.05, data.length / rate));
  });
});
