import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';

import { DESIGN_HEIGHT, DESIGN_WIDTH, RENDER_SCALE_MAX, currentRenderScale, renderScale, setRenderScale } from '../src/config/design';

afterEach(() => setRenderScale(1));

describe('the render scale', () => {
  it('is the upscale the compositor would otherwise apply, on the axis that pins the zoom', () => {
    // The audit's phone: 393x851 CSS at 2.75x. Width pins the zoom (393/720 < 851/1280),
    // so the frame is drawn 2.75 * 393/720 = 1.50x: one logical pixel per device pixel.
    expect(renderScale(2.75, 393, 851)).toBe(1.5);
    // A 16:9 phone at 2x: 2 * 375/720 = 1.04.
    expect(renderScale(2, 375, 667)).toBe(1.04);
    // A 4:3 tablet at 2x: height pins (1024/1280 < 768/720), 2 * 0.8 = 1.6, capped.
    expect(renderScale(2, 768, 1024)).toBe(RENDER_SCALE_MAX);
  });

  it('never draws the frame smaller than the design box, and never past the cap', () => {
    // A desktop window at 1x, taller than wide: 1 * min(500/720, 900/1280) < 1.
    expect(renderScale(1, 500, 900)).toBe(1);
    // A 3x flagship: 3 * 412/720 = 1.72, held at the cap.
    expect(renderScale(3, 412, 915)).toBe(RENDER_SCALE_MAX);
    // The cap is the one number to tune; 1 gives the previous behaviour back.
    expect(renderScale(3, 412, 915, 1)).toBe(1);
    expect(renderScale(3, 412, 915, 2)).toBe(1.72);
  });

  it('falls back to 1 on anything it cannot read', () => {
    expect(renderScale(0, 393, 851)).toBe(1);
    expect(renderScale(NaN, 393, 851)).toBe(1);
    expect(renderScale(2, 0, 851)).toBe(1);
    expect(renderScale(2, 393, -1)).toBe(1);
  });

  it('is recorded once for the sizes that do not go through a scene scale', () => {
    expect(currentRenderScale()).toBe(1);
    setRenderScale(1.5);
    expect(currentRenderScale()).toBe(1.5);
  });

  it('is what the game config draws the design box with', () => {
    const config = readFileSync('src/config/game.ts', 'utf8');
    expect(config).toContain('width: Math.round(DESIGN_WIDTH * scale)');
    expect(config).toContain('height: Math.round(DESIGN_HEIGHT * scale)');
    expect(config).toContain('setRenderScale(scale)');
    expect(DESIGN_WIDTH).toBe(720);
    expect(DESIGN_HEIGHT).toBe(1280);
  });

  it('scales the particle presets, which are the one thing sized outside a scene scale', () => {
    const feedback = readFileSync('src/ui/feedback.ts', 'utf8');
    expect(feedback).toContain('scalePreset(config, currentRenderScale())');
    for (const key of ["'speed'", "'gravityY'", "'gravityX'", "'scale'"]) expect(feedback).toContain(key);
  });
});
