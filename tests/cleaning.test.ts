import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { actLevel, levelSpec } from '../src/game/levels';
import { TaskSequence } from '../src/game/TaskSequence';
import { createRoundPlan } from '../src/rhythm/RhythmScheduler';
import { parsePattern } from '../src/rhythm/patterns';
import { VIGNETTES } from '../src/vignettes/registry';
import { definitionForLap } from '../src/vignettes/Vignette';
import { NOSE_LOOKS, noseLook } from '../src/vignettes/noseLooks';
import { DISH_LOOKS, dishLook } from '../src/vignettes/dishLooks';
import { cleanedSpots, cleaningPulse, cleaningReveal, CLEANING_REVEAL_AT, CLEANING_REVEAL_SEC } from '../src/vignettes/cleaningMotion';
import { DishCleaningVignette } from '../src/vignettes/DishCleaningVignette';
import { createCleaningSounds, synthesizeCleaning } from '../src/audio/cleaningSounds';
import { samples } from '../src/audio/samples';

vi.mock('phaser', () => ({ default: {} }));
vi.mock('../src/ui/backdrop', () => ({ Backdrop: class { open() {} layout() {} destroy() {} } }));

describe('nose blowing and washing up', () => {
  it('opens a new era after two complete paintbrush laps and rotates every variation', () => {
    expect(VIGNETTES).toHaveLength(31);
    for (let level = 107; level < 165; level++) {
      expect(levelSpec(level).vignette).toBe(VIGNETTES[(28 + level - 107) % 29]!.id);
    }
    for (const [id, first, looks] of [['nose', 165, 4], ['dish', 166, 3]] as const) {
      for (let lap = 0; lap < looks; lap++) {
        expect(actLevel(id, lap)).toBe(first + 31 * lap);
        expect(levelSpec(first + 31 * lap)).toMatchObject({ vignette: id, lap });
      }
      const definition = VIGNETTES.find(v => v.id === id)!;
      for (const bpm of [120, 136, 150]) {
        const end = new TaskSequence(bpm, 0).ending(10, definition.endingHoldBeats);
        expect(end.slide - end.contact).toBeGreaterThan(CLEANING_REVEAL_SEC);
      }
    }
    expect(noseLook(4)).toBe(NOSE_LOOKS[0]);
    expect(new Set(NOSE_LOOKS.map(look => look.style)).size).toBe(4);
    expect(dishLook(3)).toBe(DISH_LOOKS[0]);
    const dish = VIGNETTES.find(v => v.id === 'dish')!;
    expect([0, 1, 2].map(lap => definitionForLap(dish, lap).title)).toEqual(['Wash the plate', 'Wash the glass', 'Wash the cutlery']);
  });

  it('keeps grime until a success contact, even when extras spoil an otherwise fully hit phrase', () => {
    for (const targets of [2, 4, 8, 12]) {
      for (const look of DISH_LOOKS) {
        const n = look.spots.length;
        expect(cleanedSpots(0, targets, n, -1, false)).toBe(0);
        expect(cleanedSpots(targets, targets, n, 10, false)).toBe(n - 1);
        expect(cleanedSpots(targets, targets, n, -0.01, true)).toBe(n - 1);
        expect(cleanedSpots(1, targets, n, CLEANING_REVEAL_AT, true)).toBe(n);
      }
    }
    expect(cleaningReveal(-1, true)).toBe(0);
    expect(cleaningReveal(0, true)).toBe(1);
    expect(cleaningReveal(CLEANING_REVEAL_SEC, false)).toBe(1);
    expect(cleaningPulse(-1, 0.4)).toBe(0);
    expect(cleaningPulse(0.06, 0.4)).toBeGreaterThan(0.9);
    expect(cleaningPulse(0.125, 0.4)).toBe(0);
  });

  it('does not let demonstrations, extras or omissions clean dishes, and restores dirt on reset', () => {
    let dirt = 0;
    const art: Record<string, unknown> = {};
    for (const method of ['clear', 'fillStyle', 'fillRoundedRect', 'lineStyle', 'strokeRoundedRect', 'lineBetween', 'fillEllipse', 'fillCircle', 'strokeCircle', 'strokeEllipse', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'fillPath', 'strokePath', 'fillTriangle']) {
      art[method] = (...args: unknown[]) => {
        if (method === 'clear') dirt = 0;
        if (method === 'fillStyle' && (args[0] === 0x997147 || args[0] === 0xb7683f)) dirt++;
        return art;
      };
    }
    const container = { setDepth() { return this; }, add() {}, setPosition() { return this; } };
    const scene = { add: { container: () => container, graphics: () => art } } as unknown as Phaser.Scene;
    const plan = createRoundPlan(1, parsePattern('test', 'X X X X'), 120, 10);
    for (let lap = 0; lap < 3; lap++) {
      const act = new DishCleaningVignette(scene, lap);
      act.reset(plan);
      act.update(11.6);
      expect(dirt).toBe(7);
      act.onPhase('respond', plan.response);
      act.onPlayerHit(12);
      act.onAccuracy({ kind: 'extra', grade: 'Miss', index: null, deltaMs: 100 }, 12);
      act.onAccuracy({ kind: 'omission', grade: 'Miss', index: 0, deltaMs: null }, 12);
      act.update(12.1);
      expect(dirt).toBe(7);
      act.onAccuracy({ kind: 'hit', grade: 'Perfect', index: 1, deltaMs: 0 }, 12.5);
      act.update(12.6);
      expect(dirt).toBe(6);
      act.finish(false, 15);
      act.update(16);
      expect(dirt).toBe(6);
      act.finish(true, 17);
      act.update(18);
      expect(dirt).toBe(0);
      act.reset(plan);
      act.update(10);
      expect(dirt).toBe(7);
    }
  });

  it('has deterministic bounded sounds and endings timed to the reveal', () => {
    for (const act of ['nose', 'dish'] as const) for (const voice of ['action', 'success', 'rough', 'scrape', 'judder'] as const) {
      const data = synthesizeCleaning(8000, act, voice);
      expect(data).toEqual(synthesizeCleaning(8000, act, voice));
      expect(data.some(x => x !== 0)).toBe(true);
      expect(data.every(x => Number.isFinite(x) && Math.abs(x) < 1)).toBe(true);
      expect(Math.abs(data[0]!)).toBe(0);
      expect(Math.abs(data.at(-1)!)).toBe(0);
      if (voice === 'success' || voice === 'rough') expect(data.slice(0, Math.floor(8000 * CLEANING_REVEAL_AT)).every(x => x === 0)).toBe(true);
    }
  });

  it('uses the supplied recording when available, with a working fallback', () => {
    const context = { sampleRate: 8000, createBuffer: (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) }) } as unknown as AudioContext;
    const recorded = {} as AudioBuffer;
    const spy = vi.spyOn(samples, 'get').mockReturnValue(recorded);
    try {
      expect(createCleaningSounds(context, 'nose').action).toEqual([recorded]);
      expect(spy).toHaveBeenCalledWith('nose');
      spy.mockReturnValue(null);
      expect(createCleaningSounds(context, 'nose').action).toHaveProperty('getChannelData');
    } finally { spy.mockRestore(); }
  });
});
