import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import type { Viewport } from '../src/core/Viewport';
import { GrooveEnvelope, grooveActivation, groovePose, beatPulse, MASTERY } from '../src/ui/groove';
import { GrooveStage } from '../src/ui/grooveStage';
import { GrooveReaction } from '../src/ui/grooveReaction';
import { createGrooveVoices } from '../src/audio/grooveSounds';
import { synthesizeFinale } from '../src/audio/finaleSounds';
import { advanceGroove, GROOVE_START, isMastered } from '../src/game/groove';
import { createJudge, judgeTap } from '../src/rhythm/judge';
import { scoreRound } from '../src/game/scoring';
import { isFlawless, markFor } from '../src/game/beatTrack';

vi.mock('phaser', () => ({ default: { Geom: { Rectangle: class {} } } }));
const source = (file: string) => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
function renderer() {
  const images: Record<string, ReturnType<typeof vi.fn>>[] = [];
  const image = () => {
    const obj: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of ['setTint', 'setAlpha', 'setDepth', 'setVisible', 'setPosition', 'setDisplaySize', 'destroy']) obj[method] = vi.fn(() => obj);
    images.push(obj);
    return obj;
  };
  const graphics: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['clear', 'fillStyle', 'lineStyle', 'fillRoundedRect', 'fillTriangle', 'lineBetween', 'beginPath', 'moveTo', 'lineTo', 'strokePath', 'fillEllipse', 'fillCircle', 'setDepth', 'setAlpha', 'destroy']) graphics[method] = vi.fn(() => graphics);
  const scene = { add: { image: vi.fn(image), graphics: vi.fn(() => graphics) } };
  return { scene: scene as unknown as Phaser.Scene, images, graphics, add: scene.add };
}

describe('continuous room light', () => {
  it('starts a reversal from the exact fractional brightness, with no rounding jump', () => {
    const light = new GrooveEnvelope();
    light.show(3, 0);
    const before = light.amount(0.21);
    expect(before % 1).not.toBe(0);
    light.show(2, 0.21);
    expect(light.amount(0.21)).toBe(before);
    light.show(1, 0.3);
    expect(light.amount(0.31)).toBeLessThan(light.amount(0.3));
    light.reset();
    expect(light.amount(9)).toBe(0);
  });
  it('adds side lighting and glints only at 3, including a static reduced-motion version', () => {
    const rest = beatPulse(0, 0, 120, true);
    expect(groovePose(2, rest, Infinity).sides).toBe(0);
    const pose = groovePose(3, rest, Infinity, true);
    expect(pose.sides).toBeGreaterThan(0);
    expect(pose.glint).toBeGreaterThan(0);
    expect(pose).toEqual(groovePose(3, beatPulse(0.04, 0, 120), 0.1, true));
  });
  it('reuses pose and beat storage on the render path', () => {
    const pulse = { beat: 0, phase: 0, strength: 0 };
    expect(beatPulse(0.04, 0, 120, false, pulse)).toBe(pulse);
    const pose = groovePose(0, pulse, Infinity);
    expect(groovePose(3, pulse, Infinity, false, pose)).toBe(pose);
  });
  it('holds its level across null plans and creates no objects on beats or hits', () => {
    const r = renderer(), stage = new GrooveStage(r.scene);
    stage.show(3, 0, 0);
    expect(stage.update(2, null, false).glow).toBeGreaterThan(0.5);
    for (let n = 0; n < 60; n++) { stage.flare(2 + n / 60); stage.update(2 + n / 60, null, false); }
    expect(r.add.image).toHaveBeenCalledTimes(3);
    stage.reset();
    expect(stage.update(4, null, false).glow).toBe(0);
    for (const image of r.images) expect(image.setAlpha).toHaveBeenLastCalledWith(0);
    stage.destroy(); stage.destroy(); stage.update(5, null, false);
    for (const image of r.images) expect(image.destroy).toHaveBeenCalledTimes(1);
  });
  it('fires one activation per upward threshold crossing, on its scheduled contact', () => {
    const r = renderer(), stage = new GrooveStage(r.scene);
    stage.show(2, 0, 1);
    stage.update(0.9, null, false);
    const before = r.images[0]!.setAlpha!.mock.lastCall![0];
    stage.update(1.3, null, false);
    expect(r.images[0]!.setAlpha!.mock.lastCall![0]).toBeGreaterThan(before);
    stage.show(2, 2, 2); // duplicate level cannot re-arm it
    stage.update(2.3, null, false);
    expect(r.images[0]!.setAlpha!.mock.lastCall![0]).toBeCloseTo(before);
    stage.show(3, 3, 3); stage.show(2, 4); stage.show(3, 5, 5);
    stage.update(5.3, null, false);
    expect(r.images[0]!.setAlpha!.mock.lastCall![0]).toBeGreaterThan(0.54 * 0.6);
    expect(grooveActivation(0.7, 3)).toBe(0);
    expect(grooveActivation(0.3, 1)).toBe(0);
  });
  it('ignores a flare below 3 and clears old flares on restart', () => {
    const r = renderer(), stage = new GrooveStage(r.scene);
    stage.show(2, 0); stage.flare(1);
    expect(stage.update(1.1, null, false).scale).toBe(1);
    stage.show(3, 2); stage.flare(3);
    expect(stage.update(3.1, null, false).scale).toBeGreaterThan(1);
    stage.reset();
    expect(stage.update(3.15, null, false).scale).toBe(1);
  });
  it('relayouts all lighting and redraws trim without replacing any objects', () => {
    const r = renderer(), stage = new GrooveStage(r.scene);
    stage.layout({ full: { x: 0, y: 0, width: 393, height: 852 } } as Viewport);
    const x = r.images[1]!.setPosition!.mock.lastCall![0];
    stage.show(3, 0);
    stage.layout({ full: { x: 10, y: 20, width: 720, height: 1150 } } as Viewport);
    expect(r.images[1]!.setPosition!.mock.lastCall![0]).toBeGreaterThan(x);
    expect(r.images[2]!.setDisplaySize).toHaveBeenLastCalledWith(720 * 0.48, 1150 * 0.56);
    expect(stage.update(1, null, true).sides).toBeGreaterThan(0);
    expect(r.add.image).toHaveBeenCalledTimes(3);
    expect(r.add.graphics).toHaveBeenCalledTimes(1);
    expect(r.graphics.clear).toHaveBeenCalledTimes(2);
    stage.destroy(); stage.destroy();
    expect(r.graphics.destroy).toHaveBeenCalledTimes(1);
  });
  it('keeps the heard beat through null plans and waits for the next tempo to start', () => {
    const stage = new GrooveStage(renderer().scene);
    stage.show(3, 0);
    const before = { ...stage.update(2.04, { origin: 0, bpm: 120 }, false) };
    expect(stage.update(2.04, null, false)).toEqual(before);
    expect(stage.update(2.04, { origin: 2.5, bpm: 150, from: 2.5 }, false)).toEqual(before);
    expect(stage.update(2.54, { origin: 2.5, bpm: 150, from: 2.5 }, false).scale).toBeGreaterThan(1);
  });
});

describe('optional material reactions', () => {
  for (const material of ['booth', 'porch', 'snare', 'hob', 'glass', 'bench'] as const) {
    it(`${material}: fades, stays still in Reduced Motion, and reuses its Graphics`, () => {
      const r = renderer();
      const parent = { add: vi.fn() } as unknown as Phaser.GameObjects.Container;
      const reaction = new GrooveReaction(r.scene, parent, material);
      reaction.show(3, 0); reaction.update(1, null, true);
      const first = r.graphics.lineStyle!.mock.calls.map(args => [...args]);
      r.graphics.lineStyle!.mockClear();
      reaction.perfect(2); reaction.update(2.1, null, true);
      expect(r.graphics.lineStyle!.mock.calls).toEqual(first);
      reaction.show(2, 3); reaction.update(3.1, null, false);
      reaction.show(0, 4); r.graphics.lineStyle!.mockClear(); reaction.update(4, null, false);
      expect(r.graphics.lineStyle).not.toHaveBeenCalled();
      expect(r.add.graphics).toHaveBeenCalledTimes(1);
      expect(parent.add).toHaveBeenCalledTimes(1);
    });
  }
});

describe('scored task and scene contracts', () => {
  it('denies mastery for Perfect targets with extra taps, without changing the score', () => {
    const judge = createJudge([1, 1.5]);
    const marks = [judgeTap(judge, 1), judgeTap(judge, 1.5)].map(markFor);
    judgeTap(judge, 1.5);
    const result = scoreRound(judge);
    const state = advanceGroove(GROOVE_START, { flawless: isFlawless(marks) && result.extras === 0 });
    expect(state.flawlessTasks).toBe(0);
    expect(isMastered(state, 1, true)).toBe(false);
    expect(scoreRound(judge)).toEqual(result);
    expect(source('scenes/PlayScene.ts')).toContain('isFlawless(this.outcomes) && result.extras === 0');
  });
  it('queues the shaker after the scheduler resets and cancels a pending handoff on interruption', () => {
    const scene = source('scenes/PlayScene.ts');
    const start = scene.indexOf('this.beginTask(transition.next)');
    expect(scene.slice(start, start + 380)).toContain('this.audio.playStinger(transition.next, this.grooveVoices.shaker');
    expect(scene.slice(scene.indexOf('private interrupt()'))).toContain('this.grooveHandoff = false');
    expect(scene).not.toContain('playStinger(ending.next');
  });
  it('gates duplicate completions, hooks, Perfect reactions, and the single mastery strike', () => {
    const scene = source('scenes/PlayScene.ts');
    expect(scene).toContain('if (this.results[this.taskIndex] !== undefined) return;');
    expect(scene).toContain('if (changed) this.vignette.onGroove?.(next.level, this.now());');
    expect(scene).toContain("!this.intro && !this.teach && this.controller?.phase === 'respond'");
    expect(scene.match(/voices.sting/g)).toHaveLength(1);
    expect(scene).toContain('if (mastery && !this.masteryStruck)');
    expect(scene).toContain('this.masteryStruck = true');
  });
});

describe('audio reuse and result hierarchy', () => {
  it('builds three buffers once per shared context, including across scene recreation', () => {
    const make = () => ({ sampleRate: 8000, createBuffer: vi.fn((_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) })) });
    const a = make(), b = make();
    const first = createGrooveVoices(a as unknown as BaseAudioContext);
    expect(createGrooveVoices(a as unknown as BaseAudioContext)).toBe(first);
    expect(a.createBuffer).toHaveBeenCalledTimes(3);
    expect(createGrooveVoices(b as unknown as BaseAudioContext)).not.toBe(first);
  });
  it('gives the complete area fanfare room before mastery starts', () => {
    const fanfareSeconds = synthesizeFinale(8000, 'fanfare').length / 8000;
    expect(MASTERY.finaleDelay).toBeGreaterThan(1 + fanfareSeconds);
    expect(MASTERY.finaleDelay).toBeLessThan(3);
  });
});
