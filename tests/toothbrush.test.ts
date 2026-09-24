import { describe, expect, it, vi } from 'vitest';
import type { VoiceName } from '../src/audio/AudioEngine';
import { synthesizeBrush } from '../src/audio/brushSounds';
import { actLevel, levelSpec } from '../src/game/levels';
import { TaskSequence } from '../src/game/TaskSequence';
import { BRUSH_MOTION, BRUSH_REVEAL_SEC, brushFinale, cleanTimes, scrub, teethCleaned } from '../src/vignettes/brushMotion';
import { VIGNETTES } from '../src/vignettes/registry';

vi.mock('phaser', () => ({ default: {} }));

const VOICES: readonly VoiceName[] = ['action', 'success', 'rough', 'scrape', 'judder'];

describe('toothbrush act', () => {
  it('is the twenty-eighth act, and first plays level 53', () => {
    expect(VIGNETTES[27]?.id).toBe('toothbrush');
    expect(levelSpec(53).vignette).toBe('toothbrush');
    expect(actLevel('toothbrush', 1)).toBe(81);
    const definition = VIGNETTES[27]!;
    expect(definition.endingHoldBeats).toBe(5);
    expect(definition.endingSec).toBe(BRUSH_REVEAL_SEC);
    for (const bpm of [120, 136, 150]) {
      const end = new TaskSequence(bpm, 0).ending(10, definition.endingHoldBeats);
      expect(end.slide - end.contact).toBeGreaterThan(BRUSH_REVEAL_SEC);
    }
  });

  it('brushes once round the mouth, a tooth at a time, and never all of it without the finish', () => {
    const { order, teeth } = BRUSH_MOTION;
    expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: teeth }, (_, i) => i));
    // Along the top left to right, then back along the bottom: every step is to a neighbour.
    for (let k = 1; k < teeth; k++) {
      const a = order[k - 1]!, b = order[k]!;
      expect(Math.abs((a % 8) - (b % 8)) <= 1).toBe(true);
    }
    for (const targets of [2, 3, 4, 7, 12]) {
      let previous = 0;
      for (let hits = 0; hits <= targets; hits++) {
        const clean = teethCleaned(hits, targets);
        expect(clean).toBeGreaterThanOrEqual(previous);
        expect(clean).toBeLessThan(teeth);
        previous = clean;
      }
      const hits = Array.from({ length: targets }, (_, i) => 10 + i * 0.5);
      expect(cleanTimes(hits, targets, 20, false).filter(Number.isFinite)).toHaveLength(teethCleaned(targets, targets));
      const all = cleanTimes(hits, targets, 20, true);
      expect(all.every(Number.isFinite)).toBe(true);
      expect(Math.max(...all)).toBeLessThanOrEqual(20 + BRUSH_MOTION.flurry.at(-1)!);
      for (let k = 1; k < teeth; k++) expect(all[order[k]!]).toBeGreaterThanOrEqual(all[order[k - 1]!]!);
    }
    expect(cleanTimes([], 4, 20, false).every(t => t === Infinity)).toBe(true);
  });

  it('scrubs there and back, and is still again before a half-beat pair at the fastest tempo', () => {
    expect(scrub(-0.01)).toBe(0);
    expect(scrub(0)).toBe(0);
    const beat = 60 / 150;
    expect(scrub(beat / 2, beat)).toBe(0);
    let forth = 0, back = 0;
    for (let age = 0; age < BRUSH_MOTION.scrubBeats * beat; age += 0.002) {
      const at = scrub(age, beat);
      expect(Math.abs(at)).toBeLessThanOrEqual(1);
      forth = Math.max(forth, at);
      back = Math.min(back, at);
    }
    expect(forth).toBeGreaterThan(0.3);
    expect(back).toBeLessThan(-0.1);
  });

  it('rinses and gleams on a clean round, and foams over on a rough one', () => {
    const M = BRUSH_MOTION;
    for (const still of [false, true]) {
      expect(brushFinale(-1, true, still)).toEqual({ withdraw: 0, rinse: 0, gleam: -1, ting: 0, swell: 0, drip: 0, bubble: 0 });
      const clean = brushFinale(BRUSH_REVEAL_SEC, true, still);
      expect(clean).toMatchObject({ withdraw: 1, rinse: 1, gleam: 1, swell: 0, drip: 0 });
      expect(clean.ting).toBeGreaterThan(0.5);
      expect(brushFinale(M.gleamFrom - 0.01, true, still).gleam).toBe(-1);
      const rough = brushFinale(BRUSH_REVEAL_SEC, false, still);
      expect(rough).toMatchObject({ withdraw: 0, rinse: 0, gleam: -1, ting: 0, swell: 1, drip: 1, bubble: -1 });
    }
    // The bubble grows until it bursts on its cue.
    expect(brushFinale(M.blorpAt - 0.01, false).bubble).toBeGreaterThan(0.9);
    expect(brushFinale(M.blorpAt, false).bubble).toBe(-1);
    // The brush is out of the mirror before the rinse, and the rinse before the gleam.
    expect(M.withdrawFrom + 0.3).toBeLessThanOrEqual(M.rinseFrom + M.rinseSec);
    expect(M.rinseFrom + M.rinseSec).toBeLessThanOrEqual(M.gleamFrom);
    expect(M.gleamFrom + M.gleamSec).toBeLessThan(BRUSH_REVEAL_SEC);
  });

  it.each(VOICES)('%s is immediate, deterministic, finite and unclipped at both device rates', voice => {
    for (const rate of [44100, 48000]) {
      const data = synthesizeBrush(rate, voice);
      expect(data).toEqual(synthesizeBrush(rate, voice));
      expect(Math.abs(data[0]!)).toBe(0);
      expect(Math.abs(data.at(-1)!)).toBe(0);
      expect(data.every(v => Number.isFinite(v) && Math.abs(v) < 0.87)).toBe(true);
      expect(data.reduce((sum, v) => sum + v * v, 0)).toBeGreaterThan(0.5);
      if (voice === 'action') {
        expect(data.findIndex(v => Math.abs(v) > 0.01) / rate).toBeLessThan(0.005);
        expect(data.length / rate).toBeLessThan(0.3);
      } else expect(data.length / rate).toBeLessThanOrEqual(BRUSH_REVEAL_SEC);
    }
    const energies = new Set(VOICES.map(v => synthesizeBrush(48000, v).reduce((sum, x) => sum + x * x, 0)));
    expect(energies.size).toBe(VOICES.length);
    expect(synthesizeBrush(48000, 'action', 1)).not.toEqual(synthesizeBrush(48000, 'action', 0));
  });

  it('rings the ting and bursts the bubble where the picture does', () => {
    const rate = 48000, loud = (data: Float32Array, at: number) => data.slice(Math.floor(at * rate), Math.floor((at + 0.03) * rate)).some(v => Math.abs(v) > 0.05);
    expect(loud(synthesizeBrush(rate, 'success'), BRUSH_MOTION.tingAt)).toBe(true);
    expect(loud(synthesizeBrush(rate, 'rough'), BRUSH_MOTION.blorpAt)).toBe(true);
  });
});
