import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { actLevel, levelSpec } from '../src/game/levels';
import { TaskSequence } from '../src/game/TaskSequence';
import { createRoundPlan } from '../src/rhythm/RhythmScheduler';
import { parsePattern } from '../src/rhythm/patterns';
import { VIGNETTES } from '../src/vignettes/registry';
import { definitionForLap } from '../src/vignettes/Vignette';
import { KEEPSAKES } from '../src/game/scrapbook';
import { FROG_LOOKS, frogLook } from '../src/vignettes/frogLooks';
import {
  blink, chorusSwell, croakRipple, croakSwell, duck, FROG_CHORDS, FROG_JOIN_AT, FROG_LEAP_AT, FROG_REVEAL_SEC, FROG_RISE_AT,
  FROG_SPLASH_AT, FROG_SURFACE_AT, joinHop, leap, listenerRise, padBob, splash, surfaced,
} from '../src/vignettes/frogMotion';
import { above, FrogVignette } from '../src/vignettes/FrogVignette';
import { createFrogSounds, FROG_TRIAD, synthesizeFrog } from '../src/audio/frogSounds';

vi.mock('phaser', () => ({ default: {} }));
vi.mock('../src/ui/backdrop', () => ({ Backdrop: class { open() {} layout() {} destroy() {} } }));

/** A Graphics that records the colours of one frame: every method returns itself. */
function recorder() {
  const frame = { fills: [] as number[] };
  const art: Record<string, unknown> = new Proxy({}, {
    get: (_target, method: string) => (...args: unknown[]) => {
      if (method === 'clear') frame.fills = [];
      if (method === 'fillStyle') frame.fills.push(args[0] as number);
      return art;
    },
  });
  const emitter = { setDepth() { return this; }, explode() {}, setParticleTint() {}, reserve() {}, destroy() {} };
  const container = { setDepth() { return this; }, add() {}, setPosition() { return this; }, bringToTop() {} };
  const scene = { add: { container: () => container, graphics: () => art, particles: () => emitter } } as unknown as Phaser.Scene;
  return { scene, frame };
}

const plan = createRoundPlan(1, parsePattern('test', 'X X X X'), 120, 10);

describe('the frog', () => {
  it('joins at level 357, past every keepsake players could hold, and sings in a different pond each lap', () => {
    expect(VIGNETTES[33]?.id).toBe('frog');
    for (let level = 1; level < 357; level++) expect(levelSpec(level).vignette).not.toBe('frog');
    const earlier = new Set(VIGNETTES.slice(0, 33).map(v => v.id));
    for (const keepsake of KEEPSAKES.filter(k => earlier.has(k.vignette))) expect(keepsake.level).toBeLessThan(357);
    for (let lap = 0; lap < 4; lap++) {
      expect(actLevel('frog', lap)).toBe(357 + 35 * lap);
      expect(levelSpec(357 + 35 * lap)).toMatchObject({ vignette: 'frog', lap });
    }
    expect(FROG_LOOKS.map(look => look.pond)).toEqual(['noon', 'moon', 'lotus']);
    expect(frogLook(3)).toBe(FROG_LOOKS[0]);
    // A frog is a frog in any pond: the words never change.
    const definition = VIGNETTES.find(v => v.id === 'frog')!;
    for (const lap of [1, 2]) expect(definitionForLap(definition, lap)).toBe(definition);
    expect(KEEPSAKES.filter(k => k.vignette === 'frog').map(k => [k.name, k.level])).toEqual([['Pond frog', 357], ['Firefly jar', 392]]);
  });

  it('holds its ending long enough for the chorus or the splash, and lands the next task on the bar', () => {
    const definition = VIGNETTES.find(v => v.id === 'frog')!;
    expect(definition.endingSec).toBe(FROG_REVEAL_SEC);
    expect(definition.gridAction).toBeUndefined();
    for (const bpm of [120, 136, 150]) {
      const end = new TaskSequence(bpm, 0).ending(10, definition.endingHoldBeats);
      expect(end.slide - end.contact).toBeGreaterThan(FROG_REVEAL_SEC);
      expect((end.next - 10) / (60 / bpm * 4)).toBeCloseTo(2);
    }
    // Every event of both codas happens inside the reveal.
    const [lastAt, lastLength] = FROG_CHORDS.at(-1)!;
    expect(lastAt + lastLength).toBeLessThan(FROG_REVEAL_SEC);
    expect(FROG_LEAP_AT).toBeLessThan(FROG_SPLASH_AT);
    expect(FROG_RISE_AT).toBeLessThan(FROG_JOIN_AT);
    expect(FROG_JOIN_AT).toBeLessThan(FROG_CHORDS[0]![0]);
    expect(FROG_SURFACE_AT + 0.3).toBeLessThan(FROG_REVEAL_SEC);
  });

  it('swells the sac on the contact and empties it before the next croak', () => {
    expect(croakSwell(-0.01, 0.5)).toBe(0);
    expect(croakSwell(0, 0.5)).toBe(1);
    expect(croakSwell(0.25, 0.5)).toBe(0);
    expect(croakSwell(Infinity, 0.5)).toBe(0);
    expect(croakSwell(0.05, 0.5)).toBeGreaterThan(0.8);
    // At the fastest tempo it is gone by half a beat, never longer than 0.34 s.
    expect(croakSwell(60 / 150 / 2, 60 / 150)).toBe(0);
    for (let age = 0; age < 0.4; age += 0.01) expect(croakSwell(age, 0.5)).toBeLessThanOrEqual(1.1);
    expect(croakRipple(-1)).toBe(-1);
    expect(croakRipple(0)).toBe(0);
    expect(croakRipple(0.7)).toBe(-1);
    expect(blink(0.9 + 0.07 + 3.6 * 4 - 0.9)).toBeGreaterThan(0.9);
    expect(blink(1)).toBe(0);
    expect(blink(Infinity)).toBe(0);
  });

  it('brings the listeners up in proportion to the judged hits, the left one first', () => {
    expect(listenerRise(0, 4, 0)).toBe(0);
    expect(listenerRise(1, 4, 0)).toBe(0.5);
    expect(listenerRise(2, 4, 0)).toBe(1);
    expect(listenerRise(2, 4, 1)).toBe(0);
    expect(listenerRise(3, 4, 1)).toBe(0.5);
    expect(listenerRise(9, 4, 1)).toBe(1);
    expect(listenerRise(1, 0, 0)).toBe(1);
  });

  it('times both codas: the hop and the chords, or the crouch, the leap and the splash', () => {
    expect(joinHop(FROG_RISE_AT - 0.01, false)).toBe(0);
    expect(joinHop(FROG_JOIN_AT, false)).toBe(1);
    expect(joinHop(FROG_RISE_AT, true)).toBe(1);
    expect(chorusSwell(FROG_CHORDS[0]![0] - 0.01, false)).toBe(0);
    for (const [at, length] of FROG_CHORDS) expect(chorusSwell(at + length / 2, false)).toBe(1);
    expect(chorusSwell(1, true)).toBe(0);
    expect(leap(0.05, false).crouch).toBeGreaterThan(0);
    expect(leap(0.05, false).travel).toBe(0);
    expect(leap(FROG_SPLASH_AT - 0.01, false).under).toBe(false);
    expect(leap(FROG_SPLASH_AT, false)).toMatchObject({ travel: 1, under: true });
    expect(leap(0, true).under).toBe(true);
    expect(splash(FROG_SPLASH_AT - 0.01, false)).toBe(-1);
    expect(splash(FROG_REVEAL_SEC, false)).toBe(1);
    expect(surfaced(FROG_SURFACE_AT - 0.01, false)).toBe(0);
    expect(surfaced(FROG_REVEAL_SEC, false)).toBeCloseTo(0.8);
    expect(duck(-1, false)).toBe(1);
    expect(duck(0.4, false)).toBe(0);
    expect(padBob(0.05, false)).toBe(0);
    for (let t = 0; t < 1.4; t += 0.02) expect(Math.abs(padBob(t, false))).toBeLessThanOrEqual(7);
    expect(padBob(0.5, true)).toBe(0);
  });

  it('clips a head at the waterline: all of it above, part of it at the line, none of it below', () => {
    expect(above(0, 0, 10, 10, -20)).toEqual([]);
    const all = above(0, 0, 10, 10, 20);
    expect(Math.min(...all.filter((_, i) => i % 2 === 1))).toBeLessThan(-9.5);
    const half = above(0, 0, 10, 10, 0);
    for (let i = 1; i < half.length; i += 2) expect(half[i]!).toBeLessThanOrEqual(1e-9);
  });

  it('brings the listeners up only on judged hits, never on the example, an extra or a miss', () => {
    for (let lap = 0; lap < 3; lap++) {
      const look = frogLook(lap);
      const [left, right] = look.friends;
      const { scene, frame } = recorder();
      const act = new FrogVignette(scene, lap);
      act.reset(plan);
      act.update(10.02);
      // The demonstration croaks to nobody: the sac swells, and the pond stays empty.
      expect(frame.fills, look.pond).toContain(look.singer.sac);
      expect(frame.fills).not.toContain(left.body);
      expect(frame.fills).not.toContain(right.body);
      act.update(11.99);
      act.onPhase('respond', plan.response);
      act.onPlayerHit(12);
      act.onAccuracy({ kind: 'extra', grade: 'Miss', index: null, deltaMs: 100 }, 12);
      act.onAccuracy({ kind: 'omission', grade: 'Miss', index: 0, deltaMs: null }, 12);
      act.update(12.3);
      expect(frame.fills).not.toContain(left.body);
      act.onAccuracy({ kind: 'hit', grade: 'Perfect', index: 1, deltaMs: 0 }, 12.5);
      act.onAccuracy({ kind: 'hit', grade: 'Good', index: 2, deltaMs: 30 }, 13);
      act.update(13.3);
      expect(frame.fills).toContain(left.body);
      expect(frame.fills).not.toContain(right.body);
      act.onAccuracy({ kind: 'hit', grade: 'Perfect', index: 3, deltaMs: 0 }, 13.5);
      act.update(13.9);
      expect(frame.fills).toContain(right.body);
      // At rest between croaks, the sac is empty.
      expect(frame.fills).not.toContain(look.singer.sac);
      // A new task is a quiet pond again.
      act.reset(plan);
      act.update(9.9);
      expect(frame.fills).not.toContain(left.body);
    }
  });

  it('brings the listeners onto their pads to sing on success, and sends the singer into the water on a rough round', () => {
    for (let lap = 0; lap < 3; lap++) {
      const look = frogLook(lap);
      const [left, right] = look.friends;
      const { scene, frame } = recorder();
      const act = new FrogVignette(scene, lap);
      act.reset(plan);
      act.onPhase('respond', plan.response);
      for (const t of [12, 12.5, 13, 13.5]) act.onAccuracy({ kind: 'hit', grade: 'Perfect', index: 0, deltaMs: 0 }, t);
      act.finish(true, 15);
      // All three sing the last chord, every sac full.
      act.update(15 + FROG_CHORDS[2]![0] + 0.1);
      for (const paint of [look.singer, left, right]) expect(frame.fills, look.pond).toContain(paint.sac);
      // Rough: the singer leaves the frame for the water, and the listeners duck under.
      act.reset(plan);
      act.onPhase('respond', plan.response);
      act.onAccuracy({ kind: 'hit', grade: 'Perfect', index: 0, deltaMs: 0 }, 12);
      act.onAccuracy({ kind: 'hit', grade: 'Perfect', index: 1, deltaMs: 0 }, 12.5);
      act.finish(false, 15);
      act.update(15.02);
      expect(frame.fills).toContain(look.singer.body);
      expect(frame.fills).not.toContain(look.singer.sac);
      act.update(15 + FROG_SPLASH_AT + 0.05);
      expect(frame.fills, look.pond).not.toContain(look.singer.body);
      expect(frame.fills).not.toContain(left.body);
      // And looks back out, sheepish, before the next task.
      act.update(15 + FROG_REVEAL_SEC);
      expect(frame.fills).toContain(look.singer.body);
    }
  });

  it('croaks in a deterministic, bounded voice, and sings a major triad on the chords', () => {
    for (const voice of ['action', 'success', 'rough', 'scrape', 'judder'] as const) {
      const data = synthesizeFrog(8000, voice);
      expect(data).toEqual(synthesizeFrog(8000, voice));
      expect(data.some(x => x !== 0)).toBe(true);
      expect(data.every(x => Number.isFinite(x) && Math.abs(x) < 1)).toBe(true);
      expect(Math.abs(data[0]!)).toBe(0);
      expect(Math.abs(data.at(-1)!)).toBe(0);
    }
    // The croak's onset is the beat: loud within its first 10 ms.
    const croak = synthesizeFrog(8000, 'action');
    expect(Math.max(...Array.from(croak.subarray(0, 80), Math.abs))).toBeGreaterThan(0.2);
    expect(synthesizeFrog(8000, 'action', 1)).not.toEqual(croak);
    const [root, third, fifth] = FROG_TRIAD;
    expect(third / root).toBeCloseTo(2 ** (4 / 12), 2);
    expect(fifth / root).toBeCloseTo(2 ** (7 / 12), 2);
    // The chorus is heard after the hop and the splash lands with the picture.
    const energy = (data: Float32Array, from: number, to: number) => data.subarray(Math.floor(from * 8000), Math.floor(to * 8000)).reduce((sum, x) => sum + x * x, 0);
    const success = synthesizeFrog(8000, 'success');
    const [chordAt] = FROG_CHORDS[2]!;
    expect(energy(success, chordAt, chordAt + 0.2)).toBeGreaterThan(energy(success, 0.2, 0.4) * 4);
    const rough = synthesizeFrog(8000, 'rough');
    expect(energy(rough, FROG_SPLASH_AT, FROG_SPLASH_AT + 0.05)).toBeGreaterThan(energy(rough, FROG_SPLASH_AT - 0.05, FROG_SPLASH_AT) * 4);
    const context = { sampleRate: 8000, createBuffer: (_c: number, length: number) => ({ length, getChannelData: () => new Float32Array(length) }) } as unknown as AudioContext;
    const sounds = createFrogSounds(context);
    expect(Array.isArray(sounds.action) && sounds.action.length).toBe(2);
  });
});
