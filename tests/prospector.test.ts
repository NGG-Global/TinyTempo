import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { actLevel, levelSpec } from '../src/game/levels';
import { TaskSequence } from '../src/game/TaskSequence';
import { createRoundPlan } from '../src/rhythm/RhythmScheduler';
import { parsePattern } from '../src/rhythm/patterns';
import { VIGNETTES } from '../src/vignettes/registry';
import { definitionForLap } from '../src/vignettes/Vignette';
import { KEEPSAKES } from '../src/game/scrapbook';
import { PROSPECTOR_LOOKS, prospectorLook } from '../src/vignettes/prospectorLooks';
import {
  cracksShown, pickAngle, pickBlow, PICK_RAISED, PICK_STRUCK, PROSPECTOR_REVEAL_SEC, PROSPECTOR_SPLIT_AT,
  revealGlow, sparkLife, splitOpen,
} from '../src/vignettes/prospectorMotion';
import { CRACK_INK, DUST, ProspectorVignette } from '../src/vignettes/ProspectorVignette';
import { createProspectorSounds, synthesizeProspector } from '../src/audio/prospectorSounds';

vi.mock('phaser', () => ({ default: {} }));
vi.mock('../src/ui/backdrop', () => ({ Backdrop: class { open() {} layout() {} destroy() {} } }));

/** A Graphics that records the colours of one frame: every method returns itself. */
function recorder() {
  const frame = { fills: [] as number[], lines: [] as number[] };
  const art: Record<string, unknown> = new Proxy({}, {
    get: (_target, method: string) => (...args: unknown[]) => {
      if (method === 'clear') { frame.fills = []; frame.lines = []; }
      if (method === 'fillStyle') frame.fills.push(args[0] as number);
      if (method === 'lineStyle') frame.lines.push(args[1] as number);
      return art;
    },
  });
  const container = { setDepth() { return this; }, add() {}, setPosition() { return this; } };
  const scene = { add: { container: () => container, graphics: () => art } } as unknown as Phaser.Scene;
  return { scene, frame };
}

describe('the prospector', () => {
  it('joins at level 227, past every keepsake players could hold, and digs a different gem each lap', () => {
    expect(VIGNETTES[31]?.id).toBe('prospector');
    for (let level = 1; level < 227; level++) expect(levelSpec(level).vignette).not.toBe('prospector');
    const earlier = new Set(VIGNETTES.slice(0, 31).map(v => v.id));
    for (const keepsake of KEEPSAKES.filter(k => earlier.has(k.vignette))) expect(keepsake.level).toBeLessThan(227);
    // Its era is two whole laps, 227–290; ice cream's era from 291 carries 33 acts, so its
    // first two laps, and both keepsakes, stay where they were.
    for (let lap = 0; lap < 4; lap++) {
      const level = lap < 2 ? 227 + 32 * lap : 323 + 33 * (lap - 2);
      expect(actLevel('prospector', lap)).toBe(level);
      expect(levelSpec(level)).toMatchObject({ vignette: 'prospector', lap });
    }
    expect(PROSPECTOR_LOOKS.map(look => look.gem)).toEqual(['gold', 'diamond', 'emerald']);
    expect(prospectorLook(3)).toBe(PROSPECTOR_LOOKS[0]);
    // The gem changes what the act is, so it changes the words too: never "Strike gold" over a diamond.
    const definition = VIGNETTES.find(v => v.id === 'prospector')!;
    const words = [0, 1, 2].map(lap => definitionForLap(definition, lap));
    expect(words.map(d => d.title)).toEqual(['Strike gold', 'Dig for diamonds', 'Emerald seam']);
    expect(words.map(d => d.success[0])).toEqual(['Struck\ngold!', 'A\ndiamond!', 'An\nemerald!']);
    // Failure finds nothing, whatever the dig.
    for (const d of words) expect(d.rough[0]).toBe('Nothing\nbut rock.');
    // Its keepsakes are the first two finds, on the levels that dig them.
    expect(KEEPSAKES.filter(k => k.vignette === 'prospector').map(k => [k.name, k.level])).toEqual([['Gold nugget', 227], ['Rough diamond', 259]]);
  });

  it('holds its ending long enough to split the stone and show what is in it, and lands the next task on the bar', () => {
    const definition = VIGNETTES.find(v => v.id === 'prospector')!;
    expect(definition.endingSec).toBe(PROSPECTOR_REVEAL_SEC);
    expect(definition.gridAction).toBeUndefined();
    for (const bpm of [120, 136, 150]) {
      const end = new TaskSequence(bpm, 0).ending(10, definition.endingHoldBeats);
      expect(end.slide - end.contact).toBeGreaterThan(PROSPECTOR_REVEAL_SEC);
      expect((end.next - 10) / (60 / bpm * 4)).toBeCloseTo(2);
    }
  });

  it('lands each blow on its contact and lifts in time for the fastest grid', () => {
    expect(pickBlow(-0.01, 0.5)).toBe(0);
    expect(pickBlow(0, 0.5)).toBe(1);
    expect(pickBlow(0.32, 0.5)).toBe(0);
    // A sixteenth at 136 BPM is 110 ms: the pick is off the stone well inside it.
    expect(pickBlow(0.07, 60 / 136 / 4)).toBeLessThan(0.05);
    expect(pickAngle(0)).toBeCloseTo(PICK_RAISED, 12);
    expect(pickAngle(1)).toBeCloseTo(PICK_STRUCK, 12);
    expect(sparkLife(0)).toBe(1);
    expect(sparkLife(0.2)).toBe(0);
    expect(cracksShown(0, 4, 6)).toBe(0);
    expect(cracksShown(2, 4, 6)).toBe(3);
    expect(cracksShown(9, 4, 6)).toBe(6);
    expect(splitOpen(-1, false)).toBe(0);
    expect(splitOpen(0, true)).toBe(1);
    expect(splitOpen(PROSPECTOR_SPLIT_AT, false)).toBe(1);
    expect(revealGlow(PROSPECTOR_SPLIT_AT - 0.01, false)).toBe(0);
    expect(revealGlow(PROSPECTOR_REVEAL_SEC, false)).toBe(1);
  });

  it('cracks the stone only on judged hits, never on the example, an extra or a miss, and finds a gem only on success', () => {
    const plan = createRoundPlan(1, parsePattern('test', 'X X X X'), 120, 10);
    const cracks = (frame: { lines: number[] }) => frame.lines.filter(c => c === CRACK_INK).length;
    for (let lap = 0; lap < 3; lap++) {
      const { scene, frame } = recorder();
      const look = prospectorLook(lap);
      const act = new ProspectorVignette(scene, lap);
      act.reset(plan);
      act.update(11.6);
      expect(cracks(frame)).toBe(0);
      act.onDemonstrationBeat(11.7);
      act.update(11.71);
      expect(cracks(frame)).toBe(0);
      act.onPhase('respond', plan.response);
      act.onPlayerHit(12);
      act.onAccuracy({ kind: 'extra', grade: 'Miss', index: null, deltaMs: 100 }, 12);
      act.onAccuracy({ kind: 'omission', grade: 'Miss', index: 0, deltaMs: null }, 12);
      act.update(12.1);
      expect(cracks(frame)).toBe(0);
      act.onAccuracy({ kind: 'hit', grade: 'Perfect', index: 1, deltaMs: 0 }, 12.5);
      act.onAccuracy({ kind: 'hit', grade: 'Good', index: 2, deltaMs: 40 }, 13);
      act.update(13.1);
      expect(cracks(frame)).toBe(3);
      expect(frame.fills).not.toContain(look.gemBody);
      // A rough ending opens the stone too, and there is nothing in it but dust.
      act.finish(false, 15);
      act.update(15 + PROSPECTOR_REVEAL_SEC);
      expect(frame.fills).not.toContain(look.gemBody);
      expect(frame.fills).toContain(DUST);
      act.finish(true, 17);
      // On the last blow's contact the stone is still whole; the gem shows as the halves part.
      act.update(17);
      expect(frame.fills).not.toContain(look.gemBody);
      act.update(17 + PROSPECTOR_REVEAL_SEC);
      expect(frame.fills).toContain(look.gemBody);
      expect(frame.fills).not.toContain(DUST);
      // A new task is a new stone.
      act.reset(plan);
      act.update(10);
      expect(cracks(frame)).toBe(0);
      expect(frame.fills).not.toContain(look.gemBody);
    }
  });

  it('has deterministic, bounded voices whose two codas part only once the stone has split', () => {
    for (const voice of ['action', 'success', 'rough', 'scrape', 'judder'] as const) {
      const data = synthesizeProspector(8000, voice);
      expect(data).toEqual(synthesizeProspector(8000, voice));
      expect(data.some(x => x !== 0)).toBe(true);
      expect(data.every(x => Number.isFinite(x) && Math.abs(x) < 1)).toBe(true);
      expect(Math.abs(data[0]!)).toBe(0);
      expect(Math.abs(data.at(-1)!)).toBe(0);
    }
    expect(synthesizeProspector(8000, 'action', 1)).not.toEqual(synthesizeProspector(8000, 'action', 0));
    const success = synthesizeProspector(8000, 'success'), rough = synthesizeProspector(8000, 'rough');
    const parting = Math.floor(8000 * (PROSPECTOR_SPLIT_AT + 0.12));
    expect(Array.from(success.subarray(0, parting))).toEqual(Array.from(rough.subarray(0, parting)));
    expect(Array.from(success.subarray(parting))).not.toEqual(Array.from(rough.subarray(parting)));
    const context = { sampleRate: 8000, createBuffer: (_c: number, length: number) => ({ getChannelData: () => new Float32Array(length) }) } as unknown as AudioContext;
    const sounds = createProspectorSounds(context);
    expect(Array.isArray(sounds.action) && sounds.action.length).toBe(2);
  });
});
