import { describe, expect, it } from 'vitest';
import { switchKnob, SWITCH, type SwitchBounds } from '../src/ui/switch';

/** Phaser stays out of the node tests; the drawer only reads these four numbers. */
const bounds = (x: number, y: number, width: number, height: number): SwitchBounds & { x: number; right: number } =>
  ({ x, right: x + width, centerX: x + width / 2, centerY: y + height / 2, width, height });

const track = () => bounds(100, 200, SWITCH.width, SWITCH.height);

describe('the settings switch', () => {
  it('seats the knob inside the track at both ends', () => {
    const r = track();
    for (const on of [0, 1]) {
      const knob = switchKnob(r, on);
      expect(knob.y).toBe(r.centerY);
      expect(knob.x - knob.radius).toBeGreaterThanOrEqual(r.x);
      expect(knob.x + knob.radius).toBeLessThanOrEqual(r.right);
      // The knob has to be the tallest thing in the track, or the control reads as a pill.
      expect(knob.radius).toBeGreaterThan(r.height * 0.35);
      expect(knob.radius).toBeLessThan(r.height / 2);
    }
  });
  it('slides across, and a mid-flip position is between the two ends', () => {
    const r = track();
    const off = switchKnob(r, 0).x, on = switchKnob(r, 1).x;
    expect(on).toBeGreaterThan(off);
    const half = switchKnob(r, 0.5).x;
    expect(half).toBeCloseTo((off + on) / 2, 6);
    expect(half).toBeCloseTo(r.centerX, 6);
  });
  it('keeps the same proportions at any scale, since layout scales the rect', () => {
    const small = bounds(0, 0, SWITCH.width * 0.5, SWITCH.height * 0.5);
    const large = bounds(0, 0, SWITCH.width * 2, SWITCH.height * 2);
    const ratio = (r: SwitchBounds): number => switchKnob(r, 1).radius / r.height;
    expect(ratio(small)).toBeCloseTo(ratio(large), 6);
  });
});
