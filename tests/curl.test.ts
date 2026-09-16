import { describe, expect, it } from 'vitest';
import {
  acceptDemoBeat, advanceRep, bicepBulge, chalkDraw, CURL_MOTION, curlFlex, curlLift, curlTiming,
  DROP_LANDING_SEC, dropHeight, forearmAngle, holdTremor, pumpLevel, REFERENCE_BEAT,
} from '../src/vignettes/curlMotion';
import { synthesizeCurl } from '../src/audio/curlSounds';
import { CURL_LOOKS, curlLook } from '../src/vignettes/curlLooks';

describe('curl presentation curves', () => {
  it('squeezes on the beat and is hanging again before the next possible hit', () => {
    const t = curlTiming();
    expect(REFERENCE_BEAT).toBe(0.5);
    expect(curlFlex(0)).toBe(1);
    expect(curlFlex(t.squeezeSec)).toBe(1);
    expect(curlFlex(t.lowerSec)).toBeCloseTo(0);
    expect(curlFlex(100)).toBe(0);
    // Before any rep the arm hangs; it does not start at the top.
    expect(curlFlex(-1)).toBe(0);
    // Lowered under control: still most of the way up just after the squeeze.
    expect(curlFlex(t.squeezeSec + (t.lowerSec - t.squeezeSec) * 0.2)).toBeGreaterThan(0.85);
    // The tightest authored interval is a half beat at every tempo.
    expect(CURL_MOTION.lowerBeats).toBeLessThan(0.5);
    for (const bpm of [120, 136, 150]) {
      const beat = 60 / bpm;
      expect(curlTiming(beat).lowerSec).toBeLessThan(beat / 2);
      expect(curlFlex(curlTiming(beat).lowerSec, 1, beat)).toBeCloseTo(0);
    }
  });
  it('lifts from wherever the arm is to exactly the top on the beat', () => {
    const t = curlTiming();
    expect(curlLift(t.liftSec)).toBeCloseTo(0);
    expect(curlLift(t.liftSec * 0.5)).toBeGreaterThan(0);
    expect(curlLift(t.liftSec * 0.5)).toBeLessThan(0.5);
    expect(curlLift(0)).toBeCloseTo(1);
    // A quick pair starts its lift from an arm that is still lowering.
    expect(curlLift(t.liftSec, 0.6)).toBeCloseTo(0.6);
    expect(curlLift(t.liftSec * 0.5, 0.6)).toBeGreaterThan(0.6);
    expect(curlLift(0, 0.6)).toBeCloseTo(1);
    expect(curlLift(0, 0, 60 / 150)).toBeCloseTo(1);
    // The lift never overshoots and never goes below where it started.
    for (let i = 0; i <= 10; i++) {
      const v = curlLift(t.liftSec * i / 10, 0.3);
      expect(v).toBeGreaterThanOrEqual(0.3);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
  it('sweeps the forearm from hanging to in front of the shoulder', () => {
    expect(forearmAngle(0)).toBeCloseTo(Math.PI / 2);
    expect(forearmAngle(1)).toBeCloseTo(Math.PI / 2 - CURL_MOTION.sweepRad);
    // Past vertical at the top, so the weight ends in front rather than over the shoulder.
    expect(forearmAngle(1)).toBeLessThan(0);
    expect(forearmAngle(1)).toBeGreaterThan(-Math.PI / 2);
    expect(forearmAngle(2)).toBe(forearmAngle(1));
    expect(forearmAngle(-1)).toBe(forearmAngle(0));
    // A half rep is well short of the top, so it can never be mistaken for one.
    expect(CURL_MOTION.halfRep).toBeLessThan(0.6);
  });
  it('pops the bicep late and pumps it only for accurate reps', () => {
    expect(bicepBulge(0)).toBe(0);
    expect(bicepBulge(0.5)).toBeLessThan(0.5);
    expect(bicepBulge(1)).toBe(1);
    expect(bicepBulge(3)).toBe(1);
    expect(pumpLevel(0, 3)).toBe(0);
    expect(pumpLevel(3, 3)).toBeCloseTo(CURL_MOTION.pumpAtFullResponse);
    // A flawless response leaves one rep in the set; the unscored coda takes it.
    expect(pumpLevel(3, 3)).toBeLessThan(1);
    expect(pumpLevel(9, 3)).toBe(pumpLevel(3, 3));
    expect(pumpLevel(-1, 3)).toBe(0);
    expect(pumpLevel(1, 0)).toBe(CURL_MOTION.pumpAtFullResponse);
    expect(advanceRep(2, 'hit')).toBe(3);
    // A half rep and a tremble both leave the count exactly where it was.
    expect(advanceRep(2, 'extra')).toBe(2);
    expect(advanceRep(2, 'omission')).toBe(2);
    expect(acceptDemoBeat(4, 4)).toBeNull();
    expect(acceptDemoBeat(4, 4.5)).toBe(4.5);
  });
  it('drops the weight to the mat, bounces it smaller each time and leaves it there', () => {
    expect(dropHeight(-1, 500)).toBe(500);
    expect(dropHeight(0, 500)).toBe(500);
    expect(dropHeight(DROP_LANDING_SEC / 2, 500)).toBeLessThan(500);
    expect(dropHeight(DROP_LANDING_SEC / 2, 500)).toBeGreaterThan(250);
    expect(dropHeight(DROP_LANDING_SEC, 500)).toBeCloseTo(0);
    const first = dropHeight(DROP_LANDING_SEC + 0.15, 500);
    const second = dropHeight(DROP_LANDING_SEC + 0.3 + 0.09, 500);
    expect(first).toBeGreaterThan(second);
    expect(second).toBeGreaterThan(0);
    expect(dropHeight(5, 500)).toBe(0);
    // The fall is gravity: faster at the end than the start.
    const early = 500 - dropHeight(DROP_LANDING_SEC * 0.25, 500);
    const late = dropHeight(DROP_LANDING_SEC * 0.75, 500) - dropHeight(DROP_LANDING_SEC, 500);
    expect(late).toBeGreaterThan(early);
  });
  it('keeps the held pose and the chalk bounded', () => {
    expect(holdTremor(0)).toBe(0);
    expect(holdTremor(-1)).toBe(0);
    expect(Math.abs(holdTremor(0.05))).toBeLessThan(0.04);
    expect(Math.abs(holdTremor(3))).toBeLessThan(0.001);
    expect(chalkDraw(-1)).toBe(0);
    expect(chalkDraw(0)).toBe(0);
    expect(chalkDraw(0.42)).toBeCloseTo(1);
    expect(chalkDraw(100)).toBe(1);
  });
  it.each(['action', 'success', 'rough', 'scrape', 'judder'] as const)('synthesizes a bounded deterministic %s buffer', kind => {
    const samples = synthesizeCurl(48000, kind);
    expect(samples.length).toBeGreaterThan(8000);
    expect(samples[0]).toBe(0);
    expect(Array.from(samples.subarray(1, 96)).some(value => Math.abs(value) > 0.01)).toBe(true);
    expect(samples.every(value => Number.isFinite(value) && Math.abs(value) <= 1)).toBe(true);
    expect(samples.some(value => Math.abs(value) > 0.1)).toBe(true);
    expect(synthesizeCurl(48000, kind)).toEqual(samples);
  });
  it('lands the dropped weight where the rough sound puts its thud', () => {
    // The thud is the loudest thing in the rough buffer, and it must sit at the landing.
    const rate = 48000;
    const samples = synthesizeCurl(rate, 'rough');
    let peakAt = 0;
    for (let i = Math.floor(rate * 0.15); i < samples.length; i++) if (Math.abs(samples[i]!) > Math.abs(samples[peakAt]!)) peakAt = i;
    expect(peakAt / rate).toBeGreaterThan(DROP_LANDING_SEC);
    expect(peakAt / rate).toBeLessThan(DROP_LANDING_SEC + 0.03);
  });
  it('puts a different person at the bench on each lap of the rotation', () => {
    expect(CURL_LOOKS.length).toBeGreaterThanOrEqual(3);
    expect(new Set(CURL_LOOKS.map(l => l.id)).size).toBe(CURL_LOOKS.length);
    // The kit is the one saturated colour in the room, so no two people may share it.
    expect(new Set(CURL_LOOKS.map(l => l.kit)).size).toBe(CURL_LOOKS.length);
    expect(new Set(CURL_LOOKS.map(l => l.hairStyle)).size).toBe(CURL_LOOKS.length);
    // The first visit keeps the original coach.
    expect(curlLook(0).id).toBe('coach');
    expect(curlLook(0).hairStyle).toBe('quiff');
    expect(curlLook(1)).not.toBe(curlLook(0));
    expect(curlLook(CURL_LOOKS.length)).toBe(curlLook(0));
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) expect(curlLook(bad)).toBe(curlLook(0));
    expect(curlLook(1.7)).toBe(curlLook(1));
    for (const look of CURL_LOOKS) {
      for (const key of ['skin', 'flush', 'crease', 'kit', 'kitShade', 'kitTrim', 'kitSeam', 'hair', 'hairSheen'] as const) {
        expect(Number.isInteger(look[key]) && look[key] >= 0 && look[key] <= 0xffffff).toBe(true);
      }
    }
  });
});
