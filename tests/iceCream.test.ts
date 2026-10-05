import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { actLevel, levelSpec } from '../src/game/levels';
import { TaskSequence } from '../src/game/TaskSequence';
import { createRoundPlan } from '../src/rhythm/RhythmScheduler';
import { parsePattern } from '../src/rhythm/patterns';
import { VIGNETTES } from '../src/vignettes/registry';
import { definitionForLap } from '../src/vignettes/Vignette';
import { KEEPSAKES } from '../src/game/scrapbook';
import { ICE_CREAM_LOOKS, iceCreamLook } from '../src/vignettes/iceCreamLooks';
import {
  dropFall, ICE_CREAM_DROP_AT, ICE_CREAM_REVEAL_SEC, LICKABLE, licked, lickReach, lickSweep, relish, splatSpread,
} from '../src/vignettes/iceCreamMotion';
import { IceCreamVignette } from '../src/vignettes/IceCreamVignette';
import { createIceCreamSounds, synthesizeIceCream } from '../src/audio/iceCreamSounds';
import { SAMPLE_URLS } from '../src/audio/samples';

vi.mock('phaser', () => ({ default: {} }));
vi.mock('../src/ui/backdrop', () => ({ Backdrop: class { open() {} layout() {} destroy() {} } }));

/**
 * A Graphics that records one frame: every colour, and the first shape drawn after each
 * fill. The treat's body colour is drawn by nothing else, so the shapes that follow it are
 * the treat as it stands.
 */
function recorder(body: number) {
  const frame = { fills: [] as number[], treat: [] as string[] };
  let watching = false;
  const art: Record<string, unknown> = new Proxy({}, {
    get: (_target, method: string) => (...args: unknown[]) => {
      if (method === 'clear') { frame.fills = []; frame.treat = []; watching = false; }
      if (method === 'fillStyle') { frame.fills.push(args[0] as number); watching = args[0] === body; }
      // Everything but x: the treat leans in to meet a lick, which moves it and takes nothing.
      else if (watching && method.startsWith('fill')) { frame.treat.push(`${method}${JSON.stringify(args.slice(1))}`); watching = false; }
      return art;
    },
  });
  const container = { setDepth() { return this; }, add() {}, setPosition() { return this; } };
  const scene = { add: { container: () => container, graphics: () => art } } as unknown as Phaser.Scene;
  return { scene, frame };
}

describe('ice cream', () => {
  it('joins at level 291, past every keepsake players could hold, and licks a different treat each lap', () => {
    expect(VIGNETTES.at(-1)?.id).toBe('icecream');
    for (let level = 1; level < 291; level++) expect(levelSpec(level).vignette).not.toBe('icecream');
    for (const keepsake of KEEPSAKES.filter(k => k.vignette !== 'icecream')) expect(keepsake.level).toBeLessThan(291);
    for (let lap = 0; lap < 4; lap++) {
      expect(actLevel('icecream', lap)).toBe(291 + 33 * lap);
      expect(levelSpec(291 + 33 * lap)).toMatchObject({ vignette: 'icecream', lap });
    }
    expect(ICE_CREAM_LOOKS.map(look => look.treat)).toEqual(['cone', 'icePop', 'lollipop']);
    expect(iceCreamLook(3)).toBe(ICE_CREAM_LOOKS[0]);
    // The treat changes what the act is, so it changes the words too: never "Ice cream" over a lollipop.
    const definition = VIGNETTES.find(v => v.id === 'icecream')!;
    const words = [0, 1, 2].map(lap => definitionForLap(definition, lap));
    expect(words.map(d => d.title)).toEqual(['Ice cream', 'Ice pop', 'Lollipop']);
    for (const d of words) expect(d.rough[0]).toBe('Dropped\nit!');
    expect(new Set(words.map(d => d.rough[1])).size).toBe(3);
    // Each look is a different licker as well as a different treat.
    expect(new Set(ICE_CREAM_LOOKS.map(look => look.hairStyle)).size).toBe(3);
    expect(KEEPSAKES.filter(k => k.vignette === 'icecream').map(k => [k.name, k.level])).toEqual([['Waffle cone', 291], ['Cherry ice pop', 324]]);
  });

  it('holds its ending long enough to finish or drop the treat, and lands the next task on the bar', () => {
    const definition = VIGNETTES.find(v => v.id === 'icecream')!;
    expect(definition.endingSec).toBe(ICE_CREAM_REVEAL_SEC);
    expect(definition.gridAction).toBeUndefined();
    for (const bpm of [120, 136, 150]) {
      const end = new TaskSequence(bpm, 0).ending(10, definition.endingHoldBeats);
      expect(end.slide - end.contact).toBeGreaterThan(ICE_CREAM_REVEAL_SEC);
      expect((end.next - 10) / (60 / bpm * 4)).toBeCloseTo(2);
    }
  });

  it('lands each lick on its contact and has the tongue back in time for the fastest grid', () => {
    expect(lickReach(-0.01, 0.5)).toBe(0);
    expect(lickReach(0, 0.5)).toBe(1);
    expect(lickReach(0.3, 0.5)).toBe(0);
    // A sixteenth at 136 BPM is 110 ms: the tongue is nearly in by then.
    expect(lickReach(0.08, 60 / 136 / 4)).toBeLessThan(0.05);
    expect(lickSweep(0, 0.5)).toBe(0);
    expect(lickSweep(0.3, 0.5)).toBe(1);
    // Judged hits take up to LICKABLE; only a successful coda takes the rest.
    expect(licked(0, 4, -Infinity, false, false)).toBe(0);
    expect(licked(2, 4, -Infinity, false, false)).toBeCloseTo(LICKABLE / 2);
    expect(licked(9, 4, -Infinity, false, false)).toBeCloseTo(LICKABLE);
    expect(licked(4, 4, 5, false, false)).toBeCloseTo(LICKABLE);
    expect(licked(2, 4, 0, true, false)).toBeCloseTo(LICKABLE / 2);
    expect(licked(2, 4, 0.5, true, false)).toBe(1);
    expect(licked(2, 4, 0, true, true)).toBe(1);
    expect(dropFall(-1, false)).toBe(0);
    expect(dropFall(ICE_CREAM_DROP_AT, false)).toBe(1);
    expect(dropFall(0, true)).toBe(1);
    expect(splatSpread(ICE_CREAM_DROP_AT - 0.01, false)).toBe(0);
    expect(splatSpread(ICE_CREAM_REVEAL_SEC, false)).toBe(1);
    expect(relish(0.4, false)).toBe(0);
    expect(relish(ICE_CREAM_REVEAL_SEC, false)).toBe(1);
  });

  it('wears the treat down only on judged hits, never on the example, an extra or a miss', () => {
    const plan = createRoundPlan(1, parsePattern('test', 'X X X X'), 120, 10);
    for (let lap = 0; lap < 3; lap++) {
      const look = iceCreamLook(lap);
      const { scene, frame } = recorder(look.body);
      const act = new IceCreamVignette(scene, lap);
      act.reset(plan);
      act.update(10);
      const whole = [...frame.treat];
      expect(whole.length, look.treat).toBeGreaterThan(0);
      // The demonstration licks it and leaves it whole.
      act.onDemonstrationBeat(11.7);
      act.update(11.71);
      act.update(12.4);
      expect(frame.treat).toEqual(whole);
      act.onPhase('respond', plan.response);
      act.onPlayerHit(12);
      act.onAccuracy({ kind: 'extra', grade: 'Miss', index: null, deltaMs: 100 }, 12);
      act.onAccuracy({ kind: 'omission', grade: 'Miss', index: 0, deltaMs: null }, 12);
      act.update(12.6);
      expect(frame.treat).toEqual(whole);
      act.onAccuracy({ kind: 'hit', grade: 'Perfect', index: 1, deltaMs: 0 }, 12.5);
      act.update(13.2);
      const once = [...frame.treat];
      expect(once).not.toEqual(whole);
      act.onAccuracy({ kind: 'hit', grade: 'Good', index: 2, deltaMs: 40 }, 13);
      act.update(13.6);
      expect(frame.treat).not.toEqual(once);
      expect(frame.fills).toContain(look.body);
      // A new task is a new treat.
      act.reset(plan);
      act.update(10);
      expect(frame.treat).toEqual(whole);
    }
  });

  it('finishes the treat on success, with a tongue the colour of it, and drops what is left on a rough round', () => {
    const plan = createRoundPlan(1, parsePattern('test', 'X X X X'), 120, 10);
    for (let lap = 0; lap < 3; lap++) {
      const look = iceCreamLook(lap);
      const { scene, frame } = recorder(look.body);
      const act = new IceCreamVignette(scene, lap);
      act.reset(plan);
      act.onPhase('respond', plan.response);
      act.onAccuracy({ kind: 'hit', grade: 'Perfect', index: 0, deltaMs: 0 }, 12);
      act.onAccuracy({ kind: 'hit', grade: 'Perfect', index: 1, deltaMs: 0 }, 12.5);
      act.finish(true, 15);
      act.update(15);
      expect(frame.fills, look.treat).toContain(look.body);
      act.update(15 + ICE_CREAM_REVEAL_SEC);
      expect(frame.fills, look.treat).not.toContain(look.body);
      expect(frame.fills, look.treat).toContain(look.tongue);
      // Rough: nothing more is licked, and what was left ends up on the floor.
      act.reset(plan);
      act.onPhase('respond', plan.response);
      act.onAccuracy({ kind: 'hit', grade: 'Perfect', index: 0, deltaMs: 0 }, 12);
      act.finish(false, 15);
      act.update(15 + ICE_CREAM_REVEAL_SEC);
      expect(frame.fills, look.treat).toContain(look.body);
      expect(frame.fills, look.treat).not.toContain(look.tongue);
    }
  });

  it('licks with the delivered slurp, and keeps deterministic, bounded voices behind it', () => {
    expect(SAMPLE_URLS.lick).toContain('lick');
    for (const voice of ['action', 'success', 'rough', 'scrape', 'judder'] as const) {
      const data = synthesizeIceCream(8000, voice);
      expect(data).toEqual(synthesizeIceCream(8000, voice));
      expect(data.some(x => x !== 0)).toBe(true);
      expect(data.every(x => Number.isFinite(x) && Math.abs(x) < 1)).toBe(true);
      expect(Math.abs(data[0]!)).toBe(0);
      expect(Math.abs(data.at(-1)!)).toBe(0);
    }
    // The rough coda's splat lands with the picture's: quiet before the drop, loud after it.
    const rough = synthesizeIceCream(8000, 'rough');
    const at = Math.floor(8000 * ICE_CREAM_DROP_AT);
    const energy = (from: number, to: number) => rough.subarray(from, to).reduce((sum, x) => sum + x * x, 0);
    expect(energy(at, at + 400)).toBeGreaterThan(energy(at - 400, at) * 4);
    // With no sample loaded, the act falls back on its synthesized lick rather than going quiet.
    const context = { sampleRate: 8000, createBuffer: (_c: number, length: number) => ({ length, getChannelData: () => new Float32Array(length) }) } as unknown as AudioContext;
    const sounds = createIceCreamSounds(context);
    expect(Array.isArray(sounds.action)).toBe(false);
    expect((sounds.action as AudioBuffer).length).toBe(Math.ceil(8000 * 0.22));
  });
});
