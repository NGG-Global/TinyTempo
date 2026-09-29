import { describe, expect, it } from 'vitest';
import { sliderKnob, sliderValue, SLIDER, type SliderBounds } from '../src/ui/slider';

const track = (width = 280): SliderBounds => ({ x: 40, y: 100, width, height: SLIDER.height });

describe('the volume slider', () => {
  it('rests the knob inside the track at both ends', () => {
    const r = track();
    for (const value of [0, 1]) {
      const knob = sliderKnob(r, value);
      expect(knob.y).toBe(r.y + r.height / 2);
      expect(knob.x - knob.radius).toBeGreaterThanOrEqual(r.x);
      expect(knob.x + knob.radius).toBeLessThanOrEqual(r.x + r.width);
    }
  });
  it('reads the knob back as the value that placed it', () => {
    const r = track();
    for (const value of [0, 0.25, 0.5, 1]) {
      expect(sliderValue(r, sliderKnob(r, value).x)).toBeCloseTo(value, 6);
    }
    // A thumb that misses past either end lands on that end, not past it.
    expect(sliderValue(r, r.x - 40)).toBe(0);
    expect(sliderValue(r, r.x + r.width + 40)).toBe(1);
  });
  it('keeps the same proportions at any scale, since layout scales the rect', () => {
    const small = { x: 0, y: 0, width: 140, height: SLIDER.height * 0.5 };
    const large = { x: 0, y: 0, width: 560, height: SLIDER.height * 2 };
    const ratio = (r: SliderBounds): number => sliderKnob(r, 1).radius / r.height;
    expect(ratio(small)).toBeCloseTo(ratio(large), 6);
    expect(sliderValue(small, sliderKnob(small, 0.4).x)).toBeCloseTo(0.4, 6);
  });
});
