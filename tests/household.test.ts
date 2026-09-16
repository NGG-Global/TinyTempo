import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import type { Viewport } from '../src/core/Viewport';
import { synthesizeHousehold } from '../src/audio/householdSounds';
import { BUBBLE_CHAIN, doorOpening, eggReveal, HOUSEHOLD_REVEAL_SEC, roomReveal } from '../src/vignettes/householdMotion';
import { HouseholdVignette } from '../src/vignettes/HouseholdVignette';
import { VIGNETTES } from '../src/vignettes/registry';
import { levelSpec, PATTERN_TIERS } from '../src/game/levels';
import { TaskSequence } from '../src/game/TaskSequence';
import { createRoundPlan } from '../src/rhythm/RhythmScheduler';
import { parsePattern } from '../src/rhythm/patterns';

vi.mock('phaser', () => ({ default: {} }));
vi.mock('../src/ui/backdrop', () => ({ Backdrop: class {
  open() {} layout() {} destroy() {}
} }));

class Probe extends HouseholdVignette {
  public frame = { now: 0, ending: 0 };
  protected draw(now: number, ending: number): void { this.frame = { now, ending }; }
  public get state() { return { hits: this.hitTimes.length, demos: this.demoTimes.length, taps: this.taps, strike: this.strikeAt, successful: this.successful }; }
}
function probe() {
  const container = {
    x: 0, y: 0, scale: 1,
    setDepth() { return this; },
    setPosition(x: number, y: number) { this.x = x; this.y = y; return this; },
    setScale(scale: number) { this.scale = scale; return this; },
    add() {},
    destroy: vi.fn(),
  };
  const scene = { add: { container: () => container, graphics: () => ({}) } } as unknown as Phaser.Scene;
  const vignette = new Probe(scene, 0, 0);
  const plan = createRoundPlan(1, parsePattern('test', 'X X - X'), 120, 10);
  vignette.reset(plan);
  return { vignette, plan, container };
}

describe('household act lifecycle', () => {
  it('returns the stage to its laid-out home every frame, so the table slide cannot accumulate', () => {
    const { vignette, container } = probe();
    const viewport = { safe: { width: 720, height: 1280, top: 0, bottom: 1280, centerX: 360 } } as unknown as Viewport;
    vignette.layout(viewport);
    const home = { x: container.x, y: container.y };
    expect(home.x).toBe(360);
    // PlayScene calls translate right after update, with an absolute offset from the
    // home rather than a step, for every frame of the between-task slide.
    for (const offset of [-6, -180, -720, 720, 240, 30]) {
      vignette.update(11);
      vignette.translate(offset);
      expect(container.x).toBe(home.x + offset);
      expect(container.y).toBe(home.y);
    }
    vignette.update(12);
    expect(container).toMatchObject(home);
    // A second layout, as a resize mid-slide gives, re-homes rather than compounding.
    vignette.translate(-400);
    vignette.layout(viewport);
    vignette.update(13);
    expect(container).toMatchObject(home);
  });
  it('deduplicates demonstration callbacks without consuming player progress', () => {
    const { vignette, plan } = probe();
    vignette.onDemonstrationBeat(10);
    vignette.update(10.1);
    expect(vignette.state).toMatchObject({ demos: 1, hits: 0, taps: 0 });
    vignette.update(11.6);
    expect(vignette.state.demos).toBe(3);
    vignette.onPhase('respond', plan.response);
    vignette.onDemonstrationBeat(11.5);
    expect(vignette.state).toMatchObject({ hits: 0, taps: 0, strike: -Infinity });
  });
  it('acknowledges taps, but only judged hits consume bubbles; omissions never invent actions', () => {
    const { vignette, plan } = probe();
    vignette.onPlayerHit(10);
    expect(vignette.state.taps).toBe(0);
    vignette.onPhase('respond', plan.response);
    vignette.onPlayerHit(12);
    vignette.onAccuracy({ kind: 'hit', grade: 'Perfect', index: 0, deltaMs: 0 }, 12);
    vignette.onPlayerHit(12.1);
    vignette.onAccuracy({ kind: 'extra', grade: 'Miss', index: null, deltaMs: 100 }, 12.1);
    vignette.onAccuracy({ kind: 'omission', grade: 'Miss', index: 1, deltaMs: null }, 12.7);
    expect(vignette.state).toMatchObject({ taps: 2, hits: 1, strike: 12.1 });
  });
  it('waits for audio contact, freezes when paused, and clears the entire ending on reset', () => {
    const { vignette, plan, container } = probe();
    vignette.finish(true, 15);
    vignette.update(14.9);
    expect(vignette.frame.ending).toBeLessThan(0);
    vignette.update(15.5);
    expect(vignette.frame.ending).toBe(0.5);
    vignette.pause();
    vignette.update(100);
    expect(vignette.frame).toEqual({ now: 15.5, ending: 0.5 });
    vignette.reset(plan);
    vignette.update(10);
    expect(vignette.frame.ending).toBe(-Infinity);
    expect(vignette.state).toMatchObject({ hits: 0, taps: 0, successful: false });
    vignette.destroy();
    expect(container.destroy).toHaveBeenCalledWith(true);
  });
});

describe('household finales and integration', () => {
  it('keeps the door completely closed on every failed frame, including reduced motion', () => {
    for (const still of [false, true]) for (const age of [-1, 0, 0.16, 0.5, 1, 2, 100]) {
      expect(doorOpening(age, false, still)).toBe(0);
      expect(doorOpening(age, true, still)).toBeGreaterThanOrEqual(0);
      expect(doorOpening(age, true, still)).toBeLessThanOrEqual(1);
    }
    expect(doorOpening(0, true)).toBe(0);
    expect(doorOpening(1, true)).toBe(1);
    expect(roomReveal(2, false)).toBe(0);
    expect(roomReveal(1.1, true)).toBe(1);
    expect(eggReveal(1, false).drop).toBe(0);
    expect(eggReveal(1, true).drop).toBe(1);
    expect(eggReveal(0.7, true, true).splash).toBe(0);
  });
  it('appends four acts and leaves enough time for every final sound and animation', () => {
    expect([10, 11, 12, 13].map(n => levelSpec(n).vignette)).toEqual(['egg', 'bubble', 'light', 'doorbell']);
    for (const definition of VIGNETTES.slice(9)) for (const bpm of [120, 136, 150]) {
      const end = new TaskSequence(bpm, 0).ending(10, definition.endingHoldBeats);
      expect(end.slide - end.contact).toBeGreaterThan(HOUSEHOLD_REVEAL_SEC);
      expect((end.next - 10) / (60 / bpm * 4)).toBeCloseTo(2);
    }
    // Reserve eight intact pockets even for the longest possible player phrase.
    for (const tier of PATTERN_TIERS) for (const pattern of tier) expect(pattern.hits.length + BUBBLE_CHAIN.length).toBeLessThanOrEqual(30);
  });
  it.each(['egg', 'bubble', 'light', 'doorbell'] as const)('%s has distinct, deterministic, click-free and unclipped voices at both device sample rates', act => {
    for (const rate of [44100, 48000]) {
      const voices = ['action', 'success', 'rough', 'scrape', 'judder'] as const;
      const signatures = new Set<number>();
      for (const kind of voices) {
        const samples = synthesizeHousehold(rate, act, kind);
        expect(samples).toEqual(synthesizeHousehold(rate, act, kind));
        expect(Math.abs(samples[0]!)).toBe(0);
        expect(Math.abs(samples.at(-1)!)).toBe(0);
        expect(samples.every(v => Number.isFinite(v) && Math.abs(v) < 1)).toBe(true);
        const energy = samples.reduce((sum, v) => sum + v * v, 0);
        expect(energy).toBeGreaterThan(1);
        signatures.add(energy);
      }
      expect(signatures.size).toBe(voices.length);
    }
  });
  it('gives every bubble in the cascade a synchronized audible transient', () => {
    const rate = 48000;
    const sound = synthesizeHousehold(rate, 'bubble', 'success');
    for (const at of BUBBLE_CHAIN) {
      const burst = sound.slice(Math.floor(at * rate), Math.floor((at + 0.025) * rate));
      expect(burst.reduce((peak, v) => Math.max(peak, Math.abs(v)), 0)).toBeGreaterThan(0.2);
    }
  });
});
