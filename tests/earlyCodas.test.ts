import { describe, expect, it, vi } from 'vitest';
import { codaSeconds, EARLY_CODAS, type EarlyAct } from '../src/vignettes/earlyCodas';
import { PROGRESSION } from '../src/config/progression';
import { TaskSequence } from '../src/game/TaskSequence';
import { secondsPerBeat } from '../src/rhythm/patterns';
import { VIGNETTES } from '../src/vignettes/registry';

vi.mock('phaser', () => ({ default: {} }));

const EARLY: readonly EarlyAct[] = ['hammer', 'window', 'bug', 'saw', 'tomato', 'curl', 'cucumber', 'banana'];

/**
 * A report, not a pass mark. The first eight acts hold their ending for the default one
 * beat, where every later act holds five and tests that its reveal fits. This pins what
 * each of the eight does against that beat at the tempo ceiling, so a change to a coda or
 * to the hold shows up here with the numbers beside it; growing the hold is a decision
 * about every level's length and is left to the design.
 */
describe('the first eight acts’ codas against the one-beat hold', () => {
  it('measures the acts that hold one beat and nothing else', () => {
    for (const id of EARLY) {
      const definition = VIGNETTES.find(v => v.id === id)!;
      expect(definition.endingHoldBeats).toBeUndefined();
      expect(definition.endingSec).toBe(1.35);
    }
    expect(VIGNETTES.slice(0, 8).map(v => v.id)).toEqual(EARLY);
    expect(VIGNETTES.slice(8).every(v => v.endingHoldBeats === 5)).toBe(true);
  });

  it('reports which codas outrun the slide, and which the next task, at the tempo ceiling', () => {
    const ceiling = PROGRESSION.baseBpm + PROGRESSION.peakBpmRange;
    expect(ceiling).toBe(150);
    const beat = secondsPerBeat(ceiling);
    const end = new TaskSequence(ceiling, 0).ending(10);
    const toSlide = end.slide - end.contact, toNext = end.next - end.contact;
    expect(toSlide).toBeCloseTo(0.4);
    expect(toNext).toBeCloseTo(1.2);
    const lengths = Object.fromEntries(EARLY.map(id => [id, codaSeconds(EARLY_CODAS[id], beat)])) as Record<EarlyAct, number>;
    const expected = { hammer: 0.7, window: 0.45, bug: 0.5, saw: 1.29, tomato: 1.22, curl: 0.8, cucumber: 0.328, banana: 0.408 };
    for (const id of EARLY) expect(lengths[id]).toBeCloseTo(expected[id], 3);
    expect(EARLY.filter(id => lengths[id] > toSlide)).toEqual(['hammer', 'window', 'bug', 'saw', 'tomato', 'curl', 'banana']);
    expect(EARLY.filter(id => lengths[id] > toNext)).toEqual(['saw', 'tomato']);
    // Every one is over before the act's own ending clock (`endingSec`) runs out, and none
    // reaches the following task's first target, two beats past its downbeat at the least.
    for (const id of EARLY) expect(lengths[id]).toBeLessThanOrEqual(1.35);
  });

  it('follows the tempo where the act does: the two beat-relative codas shrink as the level speeds up', () => {
    for (const id of ['cucumber', 'banana'] as const) {
      expect(codaSeconds(EARLY_CODAS[id], secondsPerBeat(120))).toBeGreaterThan(codaSeconds(EARLY_CODAS[id], secondsPerBeat(150)));
    }
    expect(codaSeconds({ sec: 0.7 }, 0.4)).toBe(0.7);
    expect(codaSeconds({ beats: 1 }, 0.4)).toBe(0.4);
  });
});
