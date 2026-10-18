import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { actLevel, levelSpec } from '../src/game/levels';
import { TaskSequence } from '../src/game/TaskSequence';
import { createRoundPlan } from '../src/rhythm/RhythmScheduler';
import { parsePattern } from '../src/rhythm/patterns';
import { VIGNETTES } from '../src/vignettes/registry';
import { definitionForLap } from '../src/vignettes/Vignette';
import { KEEPSAKES } from '../src/game/scrapbook';
import { GLASSES_LOOKS, glassesLook } from '../src/vignettes/glassesLooks';
import {
  broken, CHEER_AT, cheerPop, clinkShine, clinkSwing, cracksShown, GLASS_BREAK_AT, GLASS_REVEAL_SEC, GLASS_SPILL_AT,
  lightsLit, MAX_CRACKS, puddleSpread, shardPose, slosh, spillFall, toastLift,
} from '../src/vignettes/glassesMotion';
import { clipToLine, CRACK, glassPose, GLASSES, GlassesVignette, SHARD } from '../src/vignettes/GlassesVignette';
import { createGlassesSounds, synthesizeGlasses } from '../src/audio/glassesSounds';

vi.mock('phaser', () => ({ default: {} }));
vi.mock('../src/ui/backdrop', () => ({ Backdrop: class { open() {} layout() {} destroy() {} } }));

/**
 * A Graphics that records one frame: every fill colour and its alpha, every line colour, and
 * whether "Cheers!" is up.
 */
function recorder() {
  const frame = { fills: [] as [number, number | undefined][], lines: [] as number[] };
  const cheer = { visible: false };
  const art: Record<string, unknown> = new Proxy({}, {
    get: (_target, method: string) => (...args: unknown[]) => {
      if (method === 'clear') { frame.fills = []; frame.lines = []; }
      if (method === 'fillStyle') frame.fills.push([args[0] as number, args[1] as number | undefined]);
      if (method === 'lineStyle') frame.lines.push(args[1] as number);
      return art;
    },
  });
  const text: Record<string, unknown> = new Proxy({}, {
    get: (_target, method: string) => (...args: unknown[]) => {
      if (method === 'setVisible') cheer.visible = args[0] as boolean;
      return text;
    },
  });
  const emitter = { setDepth() { return this; }, explode() {}, setParticleTint() {}, reserve() {}, destroy() {} };
  const container = { setDepth() { return this; }, add() {}, setPosition() { return this; }, bringToTop() {} };
  const scene = { add: { container: () => container, graphics: () => art, particles: () => emitter, text: () => text } } as unknown as Phaser.Scene;
  const fills = () => frame.fills.map(([colour]) => colour);
  /** Lights fully on: a bulb or a flame painted at full strength in the look's lit colour. */
  const lit = (colour: number) => frame.fills.filter(([c, alpha]) => c === colour && alpha === undefined).length;
  return { scene, frame, cheer, fills, lit };
}

const plan = createRoundPlan(1, parsePattern('test', 'X X X X'), 120, 10);

describe('the glasses', () => {
  it('first play level 161, the opener of area 17, and raise a different glass each lap', () => {
    expect(VIGNETTES[34]?.id).toBe('glasses');
    expect(VIGNETTES).toHaveLength(36);
    for (let level = 1; level < 161; level++) expect(levelSpec(level).vignette).not.toBe('glasses');
    for (let lap = 0; lap < 4; lap++) {
      const level = [161, 197, 233, 269][lap]!;
      expect(actLevel('glasses', lap)).toBe(level);
      expect(levelSpec(level)).toMatchObject({ vignette: 'glasses', lap });
    }
    expect(GLASSES_LOOKS.map(look => look.glass)).toEqual(['flute', 'tumbler', 'goblet']);
    expect(glassesLook(3)).toBe(GLASSES_LOOKS[0]);
    const definition = VIGNETTES.find(v => v.id === 'glasses')!;
    for (const lap of [1, 2]) expect(definitionForLap(definition, lap)).toBe(definition);
    expect(KEEPSAKES.filter(k => k.vignette === 'glasses').map(k => [k.name, k.level])).toEqual([['Party flute', 161], ['Lemonade tumbler', 197]]);
  });

  it('holds its ending long enough for the toast or the spill, and lands the next task on the bar', () => {
    const definition = VIGNETTES.find(v => v.id === 'glasses')!;
    expect(definition.endingSec).toBe(GLASS_REVEAL_SEC);
    expect(definition.gridAction).toBeUndefined();
    for (const bpm of [120, 136, 150]) {
      const end = new TaskSequence(bpm, 0).ending(10, definition.endingHoldBeats);
      expect(end.slide - end.contact).toBeGreaterThan(GLASS_REVEAL_SEC);
      expect((end.next - 10) / (60 / bpm * 4)).toBeCloseTo(2);
    }
    expect(GLASS_BREAK_AT).toBeLessThan(GLASS_SPILL_AT);
    expect(GLASS_SPILL_AT + 0.3).toBeLessThan(GLASS_REVEAL_SEC);
    expect(CHEER_AT + 0.3).toBeLessThan(GLASS_REVEAL_SEC);
  });

  it('meets rim to rim on the contact and parts in time for the fastest grid', () => {
    expect(clinkSwing(-0.01, 0.5)).toBe(0);
    expect(clinkSwing(0, 0.5)).toBe(1);
    expect(clinkSwing(0.3, 0.5)).toBe(0);
    expect(clinkSwing(60 / 150 * 0.45, 60 / 150)).toBe(0);
    expect(clinkShine(0)).toBe(1);
    expect(clinkShine(0.22)).toBe(0);
    // Before the first clink the age is infinite, and the drink must still have a surface.
    expect(slosh(Infinity)).toBe(0);
    expect(slosh(-Infinity)).toBe(0);
    expect(Math.abs(slosh(0.05))).toBeGreaterThan(0);
    for (const glass of Object.values(GLASSES)) {
      for (const side of [-1, 1] as const) {
        // The rim's inner corner, turned and placed: where this glass touches the other.
        const corner = (swing: number) => {
          const pose = glassPose(glass, side, swing);
          const w = glass.halfWidth(1) * -side, h = glass.rim;
          return { pose, x: pose.x + 1.15 * (w * Math.cos(pose.angle) - h * Math.sin(pose.angle)), y: pose.y + 1.15 * (w * Math.sin(pose.angle) + h * Math.cos(pose.angle)) };
        };
        const contact = corner(1), rest = corner(0);
        expect(contact.x).toBeCloseTo(0, 6);
        expect(contact.y).toBeCloseTo(glass.contactY, 6);
        // At rest the rims are the gap apart, and the glasses lean less.
        expect(rest.x * side).toBeCloseTo(glass.gap, 6);
        expect(Math.abs(rest.pose.angle)).toBeLessThan(Math.abs(contact.pose.angle));
      }
    }
  });

  it('lights the room on judged hits, keeps two lights for the toast, and cracks the glass on mistakes', () => {
    expect(lightsLit(0, 4, 7, -Infinity, false, false)).toBe(0);
    expect(lightsLit(2, 4, 7, -Infinity, false, false)).toBe(2);
    expect(lightsLit(4, 4, 7, -Infinity, false, false)).toBe(5);
    expect(lightsLit(9, 4, 7, -Infinity, false, false)).toBe(5);
    expect(lightsLit(4, 4, 7, 5, false, false)).toBe(5);
    expect(lightsLit(3, 4, 7, 0, true, false)).toBe(4);
    expect(lightsLit(3, 4, 7, 1, true, false)).toBe(7);
    expect(lightsLit(0, 4, 6, 0, true, true)).toBe(6);
    expect(cracksShown(0)).toBe(0);
    expect(cracksShown(2)).toBe(2);
    expect(cracksShown(40)).toBe(MAX_CRACKS);
    expect(cheerPop(CHEER_AT - 0.01, false)).toBe(0);
    expect(cheerPop(GLASS_REVEAL_SEC, false)).toBeCloseTo(1);
    expect(cheerPop(0, true)).toBe(1);
    expect(toastLift(GLASS_REVEAL_SEC, false)).toBe(1);
    expect(broken(GLASS_BREAK_AT - 0.01, false)).toBe(false);
    expect(broken(GLASS_BREAK_AT, false)).toBe(true);
    expect(spillFall(GLASS_SPILL_AT, false)).toBe(1);
    expect(puddleSpread(GLASS_SPILL_AT - 0.01, false)).toBe(0);
    expect(puddleSpread(GLASS_REVEAL_SEC, false)).toBe(1);
  });

  it('throws each shard on a parabola and leaves it where it lands', () => {
    expect(shardPose(-100, 50, -300, 5, 150, 0)).toEqual({ dx: 0, dy: 0, angle: 0, landed: false });
    const flying = shardPose(-100, 50, -300, 5, 150, 0.1);
    expect(flying.landed).toBe(false);
    expect(flying.dy).toBeLessThan(0);
    const down = shardPose(-100, 50, -300, 5, 150, 3);
    expect(down.landed).toBe(true);
    expect(-100 + down.dy).toBeCloseTo(150, 6);
    expect(shardPose(-100, 50, -300, 5, 150, 9)).toEqual(down);
  });

  it('clips a contour to one side of a line', () => {
    const square = [0, 0, 10, 0, 10, 10, 0, 10];
    const below = clipToLine(square, 5, 0, true);
    for (let i = 1; i < below.length; i += 2) expect(below[i]!).toBeGreaterThanOrEqual(5);
    expect(below.length / 2).toBe(4);
    expect(clipToLine(square, 20, 0, true)).toEqual([]);
    expect(clipToLine(square, -20, 0, true)).toEqual(square);
  });

  it('lights nothing on the example, an extra or a miss, and cracks only on a mistake', () => {
    for (let lap = 0; lap < 3; lap++) {
      const look = glassesLook(lap);
      const r = recorder();
      const act = new GlassesVignette(r.scene, lap);
      act.reset(plan);
      act.update(9.9);
      // Before the first clink there is already a drink in each glass.
      expect(r.fills(), look.glass).toContain(look.drink);
      act.update(10.02);
      expect(r.lit(look.lit)).toBe(0);
      expect(r.frame.lines).not.toContain(CRACK);
      act.update(11.99);
      act.onPhase('respond', plan.response);
      act.onPlayerHit(12);
      act.onAccuracy({ kind: 'extra', grade: 'Miss', index: null, deltaMs: 100 }, 12);
      act.update(12.2);
      expect(r.lit(look.lit)).toBe(0);
      expect(r.frame.lines).toContain(CRACK);
      act.onAccuracy({ kind: 'hit', grade: 'Perfect', index: 1, deltaMs: 0 }, 12.5);
      act.onAccuracy({ kind: 'hit', grade: 'Good', index: 2, deltaMs: 30 }, 13);
      act.update(13.2);
      expect(r.lit(look.lit), look.glass).toBe(lightsLit(2, 4, look.lights === 'festoon' ? 7 : 6, -Infinity, false, false));
      expect(r.lit(look.lit)).toBeGreaterThan(0);
      // A new task is a new pair of glasses in a dark room.
      act.reset(plan);
      act.update(9.9);
      expect(r.lit(look.lit)).toBe(0);
      expect(r.frame.lines).not.toContain(CRACK);
    }
  });

  it('raises the glasses to "Cheers!" with every light on, or shatters one on a rough round', () => {
    for (let lap = 0; lap < 3; lap++) {
      const look = glassesLook(lap);
      const lights = look.lights === 'festoon' ? 7 : 6;
      const r = recorder();
      const act = new GlassesVignette(r.scene, lap);
      act.reset(plan);
      act.onPhase('respond', plan.response);
      for (const t of [12, 12.5, 13]) act.onAccuracy({ kind: 'hit', grade: 'Perfect', index: 0, deltaMs: 0 }, t);
      act.finish(true, 15);
      act.update(15.01);
      expect(r.cheer.visible).toBe(false);
      act.update(15 + GLASS_REVEAL_SEC);
      expect(r.cheer.visible, look.glass).toBe(true);
      expect(r.lit(look.lit)).toBe(lights);
      expect(r.fills()).not.toContain(SHARD);
      // Rough: whole on the contact, in pieces just after it, and "Cheers!" never goes up.
      act.reset(plan);
      act.onPhase('respond', plan.response);
      act.onAccuracy({ kind: 'hit', grade: 'Perfect', index: 0, deltaMs: 0 }, 12);
      act.finish(false, 15);
      act.update(15.01);
      expect(r.fills()).not.toContain(SHARD);
      act.update(15 + GLASS_BREAK_AT + 0.02);
      expect(r.fills(), look.glass).toContain(SHARD);
      act.update(15 + GLASS_REVEAL_SEC);
      expect(r.fills()).toContain(SHARD);
      expect(r.cheer.visible).toBe(false);
      // Only the light the one hit earned: a rough coda lights nothing more.
      expect(r.lit(look.lit)).toBe(lightsLit(1, 4, lights, -Infinity, false, false));
    }
  });

  it('clinks in a deterministic, bounded voice, and shatters louder than it toasts', () => {
    for (const voice of ['action', 'success', 'rough', 'scrape', 'judder'] as const) {
      const data = synthesizeGlasses(16000, voice);
      expect(data).toEqual(synthesizeGlasses(16000, voice));
      expect(data.some(x => x !== 0)).toBe(true);
      expect(data.every(x => Number.isFinite(x) && Math.abs(x) < 1)).toBe(true);
      expect(Math.abs(data[0]!)).toBe(0);
      expect(Math.abs(data.at(-1)!)).toBe(0);
    }
    const clink = synthesizeGlasses(16000, 'action');
    expect(Math.max(...Array.from(clink.subarray(0, 160), Math.abs))).toBeGreaterThan(0.2);
    expect(synthesizeGlasses(16000, 'action', 1)).not.toEqual(clink);
    const energy = (data: Float32Array, from: number, to: number) => data.subarray(Math.floor(from * 16000), Math.floor(to * 16000)).reduce((sum, x) => sum + x * x, 0);
    const success = synthesizeGlasses(16000, 'success'), rough = synthesizeGlasses(16000, 'rough');
    expect(energy(rough, GLASS_BREAK_AT, GLASS_BREAK_AT + 0.15)).toBeGreaterThan(energy(success, GLASS_BREAK_AT, GLASS_BREAK_AT + 0.15) * 1.5);
    // The drink lands on the cloth with the picture: louder just after than just before.
    expect(energy(rough, GLASS_SPILL_AT, GLASS_SPILL_AT + 0.04)).toBeGreaterThan(energy(rough, GLASS_SPILL_AT - 0.04, GLASS_SPILL_AT));
    const context = { sampleRate: 8000, createBuffer: (_c: number, length: number) => ({ length, getChannelData: () => new Float32Array(length) }) } as unknown as AudioContext;
    const sounds = createGlassesSounds(context);
    expect(Array.isArray(sounds.action) && sounds.action.length).toBe(2);
  });
});
