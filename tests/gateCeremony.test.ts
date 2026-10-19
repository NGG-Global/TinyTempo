import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { synthesizeUnlock } from '../src/audio/gateSounds';
import { BADGE_STAMP_AT, ceremonyPose, GATE_CEREMONY, GATE_CEREMONY_SEC, GATE_CLEARED_AT, readyPose } from '../src/ui/gateCeremony';

const src = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('the gate unlock', () => {
  it('runs in order: the press, the pop, the bar off the road, the badge, the banner gone', () => {
    const C = GATE_CEREMONY;
    const at = (age: number) => ceremonyPose(age, false);
    // Under the thumb before the pop: pressed, lock shut, plate up, bar down.
    expect(at(C.pressSec * 0.9).press).toBeGreaterThan(0.5);
    expect(at(C.popAt - 0.01).lockOpen).toBe(0);
    expect(at(C.popAt - 0.01).plateAlpha).toBe(1);
    expect(at(C.liftDelay - 0.01).lift).toBeCloseTo(0, 6);
    // After the pop the hasp springs and the plate falls away.
    expect(at(C.popAt + 0.18).lockOpen).toBeGreaterThan(0.9);
    expect(at(C.popAt + C.plateSec).plateAlpha).toBe(0);
    // The bar swings up and fades, and only then is the road clear.
    expect(at(C.liftDelay + C.liftSec * 0.6).lift).toBeGreaterThan(0.8);
    expect(at(GATE_CLEARED_AT - 0.01).cleared).toBe(false);
    expect(at(GATE_CLEARED_AT).cleared).toBe(true);
    expect(at(GATE_CLEARED_AT).bar).toBeCloseTo(0, 6);
    // The badge drops in large and stamps to size, after the banner has arrived.
    expect(at(C.bannerAt - 0.01).banner.alpha).toBe(0);
    expect(at(BADGE_STAMP_AT - 0.2).badge.scale).toBeGreaterThan(1.2);
    expect(at(C.bannerAt + C.badgeAfter + C.badgeSec).badge.scale).toBeCloseTo(1, 1);
    expect(at(C.bannerAt + C.bannerInSec + 0.5).banner.alpha).toBeCloseTo(1, 5);
    // And it is all over in a few seconds.
    expect(GATE_CEREMONY_SEC).toBeLessThan(4);
    expect(at(GATE_CEREMONY_SEC).done).toBe(true);
    expect(at(GATE_CEREMONY_SEC).banner.alpha).toBe(0);
    expect(BADGE_STAMP_AT).toBeGreaterThan(C.bannerAt);
  });

  it('keeps reduced motion to fades: no squash, no shake, no swing', () => {
    for (let age = 0; age <= GATE_CEREMONY_SEC; age += 0.05) {
      const pose = ceremonyPose(age, true);
      expect(pose.press).toBe(0);
      expect(pose.lockShake).toBe(0);
      expect(pose.plateDrop).toBe(0);
      expect(pose.lift === 0 || pose.lift === 1).toBe(true);
      expect(pose.badge.scale).toBe(1);
      expect(pose.banner.rise).toBe(0);
    }
    expect(readyPose(3.3, true)).toEqual({ glow: 0.7, bob: 0, wiggle: 0, ring: 0 });
  });

  it('breathes while it waits, and nudges its lock now and then rather than all the time', () => {
    const glows = Array.from({ length: 24 }, (_, i) => readyPose(i * 0.05, false).glow);
    expect(Math.max(...glows) - Math.min(...glows)).toBeGreaterThan(0.4);
    expect(readyPose(1.0, false).wiggle).toBe(0);
    expect(Math.abs(readyPose(0.1, false).wiggle)).toBeGreaterThan(0);
  });

  it('has a deterministic, bounded unlock voice', () => {
    const a = synthesizeUnlock(8000);
    expect(a).toEqual(synthesizeUnlock(8000));
    expect(a.every(v => Number.isFinite(v) && Math.abs(v) < 1)).toBe(true);
    expect(a.some(v => v !== 0)).toBe(true);
    expect(Math.abs(a.at(-1)!)).toBeLessThan(1e-3);
  });

  it('is the only way a met gate opens on the map, from the gate, its held puck or the bench', () => {
    const map = src('src/scenes/MapScene.ts');
    // The landing star that meets the ask makes the gate ready; it no longer lifts the bar.
    expect(map).not.toContain('gateLiftAt');
    expect(map).toContain("this.gateAt(this.liveGate, this.tallyShown) === 'ready'");
    expect(map).toContain('this.gateHit.contains(x, worldY)) { this.openGate(this.liveGate)');
    expect(map).toContain('if (held.short === 0) { this.openGate(held.area); return; }');
    expect(map).toContain('this.openGate(holding.area)');
    // Written before the unlock plays.
    expect(map.indexOf('this.gateRecord = openArea(area, this.progress).record;')).toBeLessThan(map.indexOf('this.ceremony = { area, at: now'));
    // The baseline is taken at boot, before any level can be played.
    expect(src('src/scenes/PreloadScene.ts')).toContain('recordGateBaseline(loadProgress())');
  });
});
