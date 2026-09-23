import { describe, expect, it, vi } from 'vitest';
import { PALETTE, SHELL } from '../src/config/theme';
import { KEEPSAKES } from '../src/game/scrapbook';
import { drawKeepsake, hasKeepsakeArt, silhouetteTone, type KeepsakeSurface } from '../src/ui/keepsakes';

// `ui/panel.ts`, which owns the brass colour, touches `Phaser.Geom` as it loads.
vi.mock('phaser', () => ({ default: { Geom: { Rectangle: class {} } } }));

/** A drawing surface that records every colour used and every point touched. */
function recorder() {
  const colours = new Set<number>();
  const points: { x: number; y: number }[] = [];
  let calls = 0;
  const at = (x: number, y: number, r = 0) => { points.push({ x: x - r, y: y - r }, { x: x + r, y: y + r }); calls++; };
  const surface: KeepsakeSurface = {
    fillStyle: c => { colours.add(c); },
    lineStyle: (_w, c) => { colours.add(c); },
    fillCircle: (x, y, r) => at(x, y, r),
    strokeCircle: (x, y, r) => at(x, y, r),
    fillEllipse: (x, y, w, h) => { at(x - w / 2, y - h / 2); at(x + w / 2, y + h / 2); },
    strokeEllipse: (x, y, w, h) => { at(x - w / 2, y - h / 2); at(x + w / 2, y + h / 2); },
    fillRoundedRect: (x, y, w, h) => { at(x, y); at(x + w, y + h); },
    strokeRoundedRect: (x, y, w, h) => { at(x, y); at(x + w, y + h); },
    fillPoints: pts => { for (const p of pts) at(p.x, p.y); },
    strokePoints: pts => { for (const p of pts) at(p.x, p.y); },
  };
  return { surface, colours, points, get calls() { return calls; } };
}

describe('every keepsake’s drawing', () => {
  it('exists, so a keepsake cannot ship as an empty card', () => {
    for (const keepsake of KEEPSAKES) expect(hasKeepsakeArt(keepsake.id), keepsake.id).toBe(true);
  });

  it('stays inside its slot', () => {
    // Authored in a 100-unit box; nothing may reach past the card it is mounted on.
    for (const keepsake of KEEPSAKES) {
      const r = recorder();
      drawKeepsake(r.surface, keepsake.id, 0, 0, 100, false);
      expect(r.calls, keepsake.id).toBeGreaterThan(2);
      for (const p of r.points) {
        expect(Math.abs(p.x), `${keepsake.id} x`).toBeLessThanOrEqual(50);
        expect(Math.abs(p.y), `${keepsake.id} y`).toBeLessThanOrEqual(50);
      }
    }
  });

  it('has a silhouette of one flat tone, which gives nothing away but its shape', () => {
    const tone = silhouetteTone(SHELL.cream, PALETTE.ink);
    for (const keepsake of KEEPSAKES) {
      const found = recorder(), shadow = recorder();
      drawKeepsake(found.surface, keepsake.id, 0, 0, 100, false);
      drawKeepsake(shadow.surface, keepsake.id, 0, 0, 100, true);
      expect([...shadow.colours], keepsake.id).toEqual([tone]);
      // Less drawn than the found one: the detail stays hidden until it is earned.
      expect(shadow.calls, keepsake.id).toBeLessThanOrEqual(found.calls);
      expect(found.colours.size, keepsake.id).toBeGreaterThan(1);
    }
  });

  it('draws nothing for an id it does not know', () => {
    const r = recorder();
    drawKeepsake(r.surface, 'no-such-keepsake', 0, 0, 100, false);
    expect(r.calls).toBe(0);
  });
});
