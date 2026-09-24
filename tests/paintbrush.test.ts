import { describe, expect, it, vi } from 'vitest';
import type { VoiceName } from '../src/audio/AudioEngine';
import { synthesizeCanvas } from '../src/audio/canvasSounds';
import { actLevel, levelSpec } from '../src/game/levels';
import { TaskSequence } from '../src/game/TaskSequence';
import { CANVAS_LOOKS, canvasLook } from '../src/vignettes/canvasLooks';
import { CANVAS_MOTION, CANVAS_REVEAL_SEC, brushTravel, canvasFinale, strokePose, strokeTimes, strokesLaid } from '../src/vignettes/canvasMotion';
import { VIGNETTES } from '../src/vignettes/registry';
import { definitionForLap } from '../src/vignettes/Vignette';

vi.mock('phaser', () => ({ default: {} }));

const VOICES: readonly VoiceName[] = ['action', 'success', 'rough', 'scrape', 'judder'];

describe('paintbrush act', () => {
  it('is the twenty-ninth act, and first plays level 107', () => {
    expect(VIGNETTES[28]?.id).toBe('paintbrush');
    expect(VIGNETTES).toHaveLength(29);
    expect(levelSpec(107)).toMatchObject({ vignette: 'paintbrush', lap: 0 });
    expect(actLevel('paintbrush', 1)).toBe(136);
    const definition = VIGNETTES[28]!;
    expect(definition.endingHoldBeats).toBe(5);
    expect(definition.endingSec).toBe(CANVAS_REVEAL_SEC);
    expect(definition.looks).toHaveLength(CANVAS_LOOKS.length);
    for (const bpm of [120, 136, 150]) {
      const end = new TaskSequence(bpm, 0).ending(10, definition.endingHoldBeats);
      expect(end.slide - end.contact).toBeGreaterThan(CANVAS_REVEAL_SEC);
    }
  });

  it('names each painting, and leaves the first one as the act itself', () => {
    const definition = VIGNETTES.find(act => act.id === 'paintbrush')!;
    expect(definitionForLap(definition, 0).title).toBe('Paintbrush');
    expect(definitionForLap(definition, 1).title).toBe('Sailboat');
    expect(definitionForLap(definition, 2).title).toBe('Tabby');
    expect(definitionForLap(definition, 3).title).toBe('Flower');
    expect(definitionForLap(definition, 4).title).toBe('Paintbrush');
    expect(canvasLook(0).id).toBe('sunset');
    expect(canvasLook(1).id).not.toBe(canvasLook(0).id);
  });

  it('lays strokes in order and keeps the last of every painting for the finish', () => {
    for (const look of CANVAS_LOOKS) {
      expect(look.strokes).toHaveLength(CANVAS_MOTION.strokes);
      for (const stroke of look.strokes) {
        expect(stroke.points.length).toBeGreaterThanOrEqual(2);
        expect(stroke.width).toBeGreaterThan(0);
      }
    }
    for (const targets of [2, 4, 8, 12]) {
      let previous = 0;
      for (let hits = 0; hits <= targets; hits++) {
        const laid = strokesLaid(hits, targets);
        expect(laid).toBeGreaterThanOrEqual(previous);
        expect(laid).toBeLessThan(CANVAS_MOTION.strokes);
        previous = laid;
      }
      const hits = Array.from({ length: targets }, (_, i) => 10 + i * 0.5);
      expect(strokeTimes(hits, targets, 20, false).filter(Number.isFinite)).toHaveLength(strokesLaid(targets, targets));
      const all = strokeTimes(hits, targets, 20, true);
      expect(all.every(Number.isFinite)).toBe(true);
      expect(Math.max(...all)).toBeLessThanOrEqual(20 + CANVAS_MOTION.flurry.at(-1)!);
      for (let k = 1; k < CANVAS_MOTION.strokes; k++) expect(all[k]!).toBeGreaterThanOrEqual(all[k - 1]!);
    }
  });

  it('travels a stroke and is finished before a half-beat pair at the fastest tempo', () => {
    expect(brushTravel(-0.01)).toBe(0);
    const beat = 60 / 150;
    expect(brushTravel(CANVAS_MOTION.travelBeats * beat, beat)).toBe(1);
    expect(CANVAS_MOTION.travelBeats).toBeLessThan(0.5);
    const points = CANVAS_LOOKS[0]!.strokes[4]!.points;
    const start = strokePose(points, 0);
    const end = strokePose(points, 1);
    expect(start.x).toBeCloseTo(points[0]![0]);
    expect(end.x).toBeCloseTo(points.at(-1)![0]);
    expect(end.y).toBeCloseTo(points.at(-1)![1]);
    const mid = strokePose(points, 0.5);
    expect(Number.isFinite(mid.angle)).toBe(true);
  });

  it('signs a clean round and smears a rough one, inside the hold', () => {
    for (const still of [false, true]) {
      expect(canvasFinale(-1, true, still)).toEqual({ lift: 0, sign: 0, smear: 0, drip: 0 });
      const clean = canvasFinale(CANVAS_REVEAL_SEC, true, still);
      expect(clean).toMatchObject({ lift: 1, sign: 1, smear: 0, drip: 0 });
      const rough = canvasFinale(CANVAS_REVEAL_SEC, false, still);
      expect(rough).toMatchObject({ lift: 0, sign: 0, smear: 1, drip: 1 });
    }
  });

  it('synthesizes every voice, with the chime on the signature and the splat at the smear', () => {
    const rate = 8000;
    for (const voice of VOICES) {
      const data = synthesizeCanvas(rate, voice);
      expect(data.length).toBeGreaterThan(0);
      expect(data.some(sample => sample !== 0)).toBe(true);
    }
    const success = synthesizeCanvas(rate, 'success');
    const signAt = Math.round(CANVAS_MOTION.signFrom * rate);
    const aroundSign = success.slice(signAt, signAt + 400);
    expect(Math.max(...aroundSign.map(Math.abs))).toBeGreaterThan(0.05);
    const rough = synthesizeCanvas(rate, 'rough');
    let loudest = 0, at = 0;
    rough.forEach((sample, i) => {
      if (Math.abs(sample) > loudest) { loudest = Math.abs(sample); at = i; }
    });
    expect(at / rate).toBeLessThan(CANVAS_MOTION.dripFrom);
  });
});
