import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { actLevel, levelSpec } from '../src/game/levels';
import { TaskSequence } from '../src/game/TaskSequence';
import { createRoundPlan } from '../src/rhythm/RhythmScheduler';
import { parsePattern } from '../src/rhythm/patterns';
import { DEBUT_LEVELS, VIGNETTES } from '../src/vignettes/registry';
import { definitionForLap } from '../src/vignettes/Vignette';
import { KEEPSAKES } from '../src/game/scrapbook';
import { eligibleActs } from '../src/game/endless';
import { CAMERA_LOOKS, cameraLook } from '../src/vignettes/cameraLooks';
import {
  CAMERA_REVEAL_SEC, DEVELOP_END_SEC, EJECT_SEC, RISE_END_SEC, developed, ejectOut, flashLife, printRise, printsHung, shutterPress,
} from '../src/vignettes/cameraMotion';
import { CameraVignette, PEG, PRINT_FRAME, SHINE, WASHOUT } from '../src/vignettes/CameraVignette';
import { CAMERA_PARTING_SEC, WHIR_END_SEC, createCameraSounds, synthesizeCamera } from '../src/audio/cameraSounds';

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

describe('the instant camera', () => {
  it('is the thirty-sixth act, first plays level 171, the opener of area 18, and shoots a different subject each lap', () => {
    expect(VIGNETTES[35]?.id).toBe('camera');
    expect(DEBUT_LEVELS.at(-1)).toBe(171);
    for (let level = 1; level < 171; level++) expect(levelSpec(level).vignette).not.toBe('camera');
    for (let lap = 0; lap < 4; lap++) {
      const level = [171, 207, 243, 279][lap]!;
      expect(actLevel('camera', lap)).toBe(level);
      expect(levelSpec(level)).toMatchObject({ vignette: 'camera', lap });
    }
    // Past level 100, so Endless Mode's pool is untouched.
    expect(eligibleActs().map(index => VIGNETTES[index]!.id)).not.toContain('camera');
    expect(CAMERA_LOOKS.map(look => look.subject)).toEqual(['cat', 'cake', 'castle']);
    expect(cameraLook(3)).toBe(CAMERA_LOOKS[0]);
    // The subject changes what the shoot is, so it changes the words too.
    const definition = VIGNETTES.find(v => v.id === 'camera')!;
    const words = [0, 1, 2].map(lap => definitionForLap(definition, lap));
    expect(words.map(d => d.title)).toEqual(['Snapshot', 'Party snapshot', 'Holiday snapshot']);
    expect(words.map(d => d.success[0])).toEqual(['Picture\nperfect!', 'Make a\nwish!', 'Wish you\nwere here!']);
    for (const d of words) expect(d.rough[0]).toBe('Blurry\nshot.');
    // No maker's name on it: an instant camera, never a brand.
    for (const d of words) expect(`${d.title} ${d.intro} ${d.success.join(' ')} ${d.rough.join(' ')}`).not.toMatch(/polaroid/i);
    expect(KEEPSAKES.filter(k => k.vignette === 'camera').map(k => [k.name, k.level])).toEqual([['Cat snapshot', 171], ['Birthday snapshot', 207]]);
  });

  it('holds its ending long enough to eject and develop the print, and lands the next task on the bar', () => {
    const definition = VIGNETTES.find(v => v.id === 'camera')!;
    expect(definition.endingSec).toBe(CAMERA_REVEAL_SEC);
    expect(DEVELOP_END_SEC).toBeLessThan(CAMERA_REVEAL_SEC);
    expect(definition.gridAction).toBeUndefined();
    for (const bpm of [120, 136, 150]) {
      const end = new TaskSequence(bpm, 0).ending(10, definition.endingHoldBeats);
      expect(end.slide - end.contact).toBeGreaterThan(CAMERA_REVEAL_SEC);
      expect((end.next - 10) / (60 / bpm * 4)).toBeCloseTo(2);
    }
  });

  it('presses on the contact and lifts in time for the fastest grid, then ejects, lifts and develops in order', () => {
    expect(shutterPress(-0.01, 0.5)).toBe(0);
    expect(shutterPress(0, 0.5)).toBe(1);
    expect(shutterPress(0.18, 0.5)).toBe(0);
    // A sixteenth at 136 BPM is 110 ms: the button is back up inside it.
    expect(shutterPress(0.04, 60 / 136 / 4)).toBeLessThan(0.05);
    expect(flashLife(0)).toBe(1);
    expect(flashLife(0.15)).toBe(0);
    expect(printsHung(0, 4, 6)).toBe(0);
    expect(printsHung(2, 4, 6)).toBe(3);
    expect(printsHung(9, 4, 6)).toBe(6);
    expect(ejectOut(-1, false)).toBe(0);
    expect(ejectOut(EJECT_SEC, false)).toBe(1);
    expect(printRise(EJECT_SEC - 0.01, false)).toBe(0);
    expect(printRise(RISE_END_SEC, false)).toBe(1);
    expect(developed(RISE_END_SEC - 0.01, false)).toBe(0);
    expect(developed(DEVELOP_END_SEC, false)).toBe(1);
    // Under reduced motion the finished print is simply there.
    for (const f of [ejectOut, printRise, developed]) expect(f(0, true)).toBe(1);
  });

  it('hangs a print only for judged hits, never for the example, an extra or a miss, and develops a clean picture only on success', () => {
    const plan = createRoundPlan(1, parsePattern('test', 'X X X X'), 120, 10);
    const pegs = (frame: { fills: number[] }) => frame.fills.filter(c => c === PEG).length;
    for (let lap = 0; lap < 3; lap++) {
      const { scene, frame } = recorder();
      const act = new CameraVignette(scene, lap);
      act.reset(plan);
      act.update(11.6);
      expect(pegs(frame)).toBe(0);
      act.onDemonstrationBeat(11.7);
      act.update(11.71);
      expect(pegs(frame)).toBe(0);
      act.onPhase('respond', plan.response);
      act.onPlayerHit(12);
      act.onAccuracy({ kind: 'extra', grade: 'Miss', index: null, deltaMs: 100 }, 12);
      act.onAccuracy({ kind: 'omission', grade: 'Miss', index: 0, deltaMs: null }, 12);
      act.update(12.1);
      expect(pegs(frame)).toBe(0);
      act.onAccuracy({ kind: 'hit', grade: 'Perfect', index: 1, deltaMs: 0 }, 12.5);
      act.onAccuracy({ kind: 'hit', grade: 'Good', index: 2, deltaMs: 40 }, 13);
      act.update(13.1);
      expect(pegs(frame)).toBe(3);
      expect(frame.fills).not.toContain(PRINT_FRAME);
      // A rough ending still gives a print, but it comes out washed out, never glossy.
      act.finish(false, 15);
      act.update(15 + CAMERA_REVEAL_SEC);
      expect(frame.fills).toContain(PRINT_FRAME);
      expect(frame.fills).toContain(WASHOUT);
      expect(frame.fills).not.toContain(SHINE);
      act.finish(true, 17);
      // On the last shot's click nothing is out of the slot yet.
      act.update(17);
      expect(frame.fills).not.toContain(PRINT_FRAME);
      act.update(17 + CAMERA_REVEAL_SEC);
      expect(frame.fills).toContain(PRINT_FRAME);
      expect(frame.fills).toContain(SHINE);
      expect(frame.fills).not.toContain(WASHOUT);
      // A new task is a new line of prints.
      act.reset(plan);
      act.update(10);
      expect(pegs(frame)).toBe(0);
      expect(frame.fills).not.toContain(PRINT_FRAME);
    }
  });

  it('has deterministic, bounded voices whose two codas part only once the print is out', () => {
    for (const voice of ['action', 'success', 'rough', 'scrape', 'judder'] as const) {
      const data = synthesizeCamera(8000, voice);
      expect(data).toEqual(synthesizeCamera(8000, voice));
      expect(data.some(x => x !== 0)).toBe(true);
      expect(data.every(x => Number.isFinite(x) && Math.abs(x) < 1)).toBe(true);
      expect(Math.abs(data[0]!)).toBe(0);
      expect(Math.abs(data.at(-1)!)).toBe(0);
    }
    expect(synthesizeCamera(8000, 'action', 1)).not.toEqual(synthesizeCamera(8000, 'action', 0));
    // The shutter is a click, short and front-loaded: most of its energy in the first 50 ms.
    const shot = synthesizeCamera(8000, 'action');
    const energy = (from: number, to: number) => shot.subarray(from, to).reduce((sum, x) => sum + x * x, 0);
    expect(energy(0, 400)).toBeGreaterThan(energy(400, shot.length) * 3);
    expect(WHIR_END_SEC).toBeLessThan(CAMERA_PARTING_SEC);
    const success = synthesizeCamera(8000, 'success'), rough = synthesizeCamera(8000, 'rough');
    const parting = Math.floor(8000 * CAMERA_PARTING_SEC);
    expect(Array.from(success.subarray(0, parting))).toEqual(Array.from(rough.subarray(0, parting)));
    expect(Array.from(success.subarray(parting))).not.toEqual(Array.from(rough.subarray(parting)));
    const context = { sampleRate: 8000, createBuffer: (_c: number, length: number) => ({ getChannelData: () => new Float32Array(length) }) } as unknown as AudioContext;
    const sounds = createCameraSounds(context);
    expect(Array.isArray(sounds.action) && sounds.action.length).toBe(2);
  });
});
