import { describe, expect, it, vi } from 'vitest';
import {
  blow, curtainOpen, noteFor, slideTravel, soundedNotes, TROMBONE_MOTION, TROMBONE_REVEAL_SEC, tromboneFinale,
} from '../src/vignettes/tromboneMotion';
import { synthesizeTrombone } from '../src/audio/tromboneSounds';
import { SAMPLE_URLS } from '../src/audio/samples';
import { VIGNETTES } from '../src/vignettes/registry';
import { levelSpec } from '../src/game/levels';
import { TaskSequence } from '../src/game/TaskSequence';
import { createRoundPlan } from '../src/rhythm/RhythmScheduler';
import { PATTERN_TIERS } from '../src/game/levels';

vi.mock('phaser', () => ({ default: {} }));

describe('trombone act', () => {
  it('is the twentieth act and keeps every earlier level', () => {
    expect(VIGNETTES[19]?.id).toBe('trombone');
    expect(levelSpec(20).vignette).toBe('trombone');
    expect(levelSpec(20 + VIGNETTES.length).vignette).toBe('trombone');
    expect([1, 9, 18, 19].map(n => levelSpec(n).vignette)).toEqual(['hammer', 'paper', 'fisherman', 'scratch']);
    expect(levelSpec(1 + VIGNETTES.length).vignette).toBe('hammer');
    expect(levelSpec(1 + VIGNETTES.length).lap).toBe(1);
  });

  it('holds its finale for five beats, long enough for the two-second recorded endings at every tempo', () => {
    const definition = VIGNETTES[19]!;
    expect(definition.endingHoldBeats).toBe(5);
    expect(definition.endingSec).toBe(TROMBONE_REVEAL_SEC);
    for (const bpm of [120, 136, 150]) {
      const end = new TaskSequence(bpm, 0).ending(10, definition.endingHoldBeats);
      expect(end.slide - end.contact).toBeGreaterThan(TROMBONE_REVEAL_SEC);
      // The delivered success and fail takes are 2.0 s; the hold must not hand the next task a tail.
      expect(end.slide - end.contact).toBeGreaterThanOrEqual(2.0 - 1e-9);
      expect((end.next - 10) / (60 / bpm * 4)).toBeCloseTo(2);
    }
  });

  it('registers the four recorded takes beside the other one-shots', () => {
    for (const name of ['trombone1', 'trombone2', 'tromboneSuccess', 'tromboneFail'] as const) {
      expect(SAMPLE_URLS[name]).toMatch(/trombone-[a-z0-9]+\.mp3$/);
    }
  });

  it('alternates the two notes by sounding order, first position first', () => {
    expect([0, 1, 2, 3, 4, 5].map(noteFor)).toEqual([0, 1, 0, 1, 0, 1]);
    expect(noteFor(-1)).toBe(0);
    expect(TROMBONE_MOTION.positions).toEqual([0, 1]);
  });

  it('counts the demonstration cues before the targets, in the order the engine hands out takes', () => {
    const plan = createRoundPlan(1, PATTERN_TIERS[0]![0]!, 120, 10);
    const cues = plan.cues.filter(c => c.kind === 'action').map(c => c.time);
    expect(cues.length).toBe(plan.targets.length);
    expect(soundedNotes(cues, plan.targets, plan.start - 1)).toEqual({ count: 0, lastAt: -Infinity });
    const firstDemo = soundedNotes(cues, plan.targets, cues[0]!);
    expect(firstDemo.count).toBe(1);
    expect(firstDemo.lastAt).toBe(cues[0]);
    const allDemo = soundedNotes(cues, plan.targets, plan.targets[0]! - 0.01);
    expect(allDemo.count).toBe(cues.length);
    const firstTarget = soundedNotes(cues, plan.targets, plan.targets[0]!);
    expect(firstTarget.count).toBe(cues.length + 1);
    expect(firstTarget.lastAt).toBe(plan.targets[0]);
    expect(soundedNotes(cues, plan.targets, plan.end + 1).count).toBe(cues.length + plan.targets.length);
  });

  it('moves the slide inside the beat and holds the cheeks for most of it, then lets go before the next', () => {
    for (const bpm of [120, 136, 150]) {
      const beat = 60 / bpm;
      expect(slideTravel(-1, beat)).toBe(0);
      expect(slideTravel(0, beat)).toBe(0);
      expect(slideTravel(TROMBONE_MOTION.slideBeats * beat, beat)).toBeCloseTo(1);
      expect(blow(-1, beat)).toBe(0);
      expect(blow(0.04, beat)).toBe(1);
      expect(blow(TROMBONE_MOTION.holdBeats * beat * 0.9, beat)).toBe(1);
      expect(blow(beat, beat)).toBeCloseTo(0);
      expect(blow(beat / 2, beat)).toBe(1);
    }
    expect(TROMBONE_MOTION.holdBeats + TROMBONE_MOTION.releaseBeats).toBeLessThan(1);
    expect(TROMBONE_MOTION.slideBeats).toBeLessThan(0.5);
  });

  it('opens the curtain one step per landed note and never past the frame', () => {
    expect(curtainOpen(0, 4)).toBe(0);
    expect(curtainOpen(2, 4)).toBeLessThan(curtainOpen(3, 4));
    expect(curtainOpen(4, 4)).toBe(1);
    expect(curtainOpen(9, 4)).toBe(1);
    expect(curtainOpen(-1, 4)).toBe(0);
  });

  it('ends in a flourish and applause, or a sagging slide and slammed shutters', () => {
    for (const still of [false, true]) {
      expect(tromboneFinale(-1, true, still)).toEqual({ flourish: 0, burst: 0, neighbour: 0, droop: 0, shutters: 0 });
      const bravo = tromboneFinale(TROMBONE_REVEAL_SEC, true, still);
      expect(bravo.flourish).toBe(1);
      expect(bravo.neighbour).toBe(1);
      expect(bravo.droop).toBe(0);
      expect(bravo.shutters).toBe(0);
      expect(bravo.burst).toBe(still ? 0 : 1);
      const wah = tromboneFinale(TROMBONE_REVEAL_SEC, false, still);
      expect(wah.droop).toBe(1);
      expect(wah.shutters).toBe(1);
      expect(wah.flourish).toBe(0);
      expect(wah.neighbour).toBe(0);
    }
    expect(tromboneFinale(0.3, false).shutters).toBe(0);
    expect(tromboneFinale(0.3, false).droop).toBeGreaterThan(0);
  });

  it('synthesizes two fallback notes a fifth apart, and distinct, deterministic, click-free endings', () => {
    for (const rate of [44100, 48000]) {
      const voices = ['action', 'note2', 'success', 'rough', 'scrape', 'judder'] as const;
      const signatures = new Set<number>();
      for (const kind of voices) {
        const samples = synthesizeTrombone(rate, kind);
        expect(samples).toEqual(synthesizeTrombone(rate, kind));
        expect(Math.abs(samples[0]!)).toBe(0);
        expect(Math.abs(samples.at(-1)!)).toBe(0);
        expect(samples.every(v => Number.isFinite(v) && Math.abs(v) < 1)).toBe(true);
        const energy = samples.reduce((sum, v) => sum + v * v, 0);
        expect(energy).toBeGreaterThan(0.5);
        signatures.add(energy);
      }
      expect(signatures.size).toBe(voices.length);
      // Zero crossings as a pitch estimate: the second note is the lower one, as the slide says.
      const crossings = (kind: 'action' | 'note2'): number => {
        const s = synthesizeTrombone(rate, kind);
        let n = 0;
        for (let i = Math.floor(rate * 0.1); i < Math.floor(rate * 0.3); i++) if ((s[i]! >= 0) !== (s[i - 1]! >= 0)) n++;
        return n;
      };
      expect(crossings('note2')).toBeLessThan(crossings('action'));
    }
  });
});
