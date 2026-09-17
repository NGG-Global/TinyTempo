import { describe, expect, it, vi } from 'vitest';
import {
  hex, mix, shade, contrastRatio, OUTLINE_CONTRAST, relativeLuminance, typeStroke, starColour,
} from '../src/ui/colour';
import { PALETTE, SHELL } from '../src/config/theme';
import { AREAS } from '../src/game/levels';
import { VIGNETTES } from '../src/vignettes/registry';
import { pressAmount } from '../src/ui/spring';
import { dashes, pathLength, smoothPath, type Point } from '../src/ui/path';

// The registry reaches the acts, and the acts import Phaser; the inks are plain numbers.
vi.mock('phaser', () => ({ default: {} }));

describe('colour helpers', () => {
  it('blends channel-wise and clamps the ratio', () => {
    expect(mix(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(mix(0x000000, 0xffffff, 1)).toBe(0xffffff);
    expect(mix(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    // Callers pass unbounded ratios (a band index over a band count), so clamping matters.
    expect(mix(0x102030, 0xffffff, -3)).toBe(0x102030);
    expect(mix(0x102030, 0xffffff, 9)).toBe(0xffffff);
    expect(mix(0xff0000, 0x0000ff, 0.5)).toBe(0x800080);
  });
  it('shades toward white and black without leaving the byte range', () => {
    expect(shade(0x336699, 0)).toBe(0x336699);
    expect(shade(0x336699, 1)).toBe(0xffffff);
    expect(shade(0x336699, -1)).toBe(0x000000);
    expect(shade(0xffffff, 0.4)).toBe(0xffffff);
    expect(shade(0x000000, -0.4)).toBe(0x000000);
    for (const amount of [-1, -0.5, 0, 0.5, 1]) {
      const c = shade(0x8899aa, amount);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(0xffffff);
    }
  });
  it('formats six hex digits', () => {
    expect(hex(0x000000)).toBe('#000000');
    expect(hex(0x2c4629)).toBe('#2c4629');
    expect(hex(0xff)).toBe('#0000ff');
  });
});

describe('road path helpers', () => {
  const line: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }];
  it('keeps the authored nodes and smooths between them', () => {
    const path = smoothPath(line, 8);
    // Endpoints are exact, so nodes still sit on the road they are drawn over.
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[path.length - 1]).toEqual({ x: 200, y: 0 });
    expect(path.length).toBe(8 * 2 + 1);
    // A straight run stays straight rather than bulging.
    for (const p of path) expect(p.y).toBeCloseTo(0);
    // Monotone along the run: no backtracking that would double the stroke.
    for (let i = 1; i < path.length; i++) expect(path[i]!.x).toBeGreaterThan(path[i - 1]!.x);
  });
  it('degrades safely on short and degenerate input', () => {
    expect(smoothPath([], 10)).toEqual([]);
    expect(smoothPath([{ x: 3, y: 4 }], 10)).toEqual([{ x: 3, y: 4 }]);
    expect(smoothPath(line, 0).length).toBeGreaterThan(1);
    expect(pathLength([])).toBe(0);
    expect(pathLength(line)).toBeCloseTo(200);
  });
  it('bends through an offset node instead of cornering', () => {
    // Largest direction change between consecutive segments, in degrees.
    const sharpest = (path: readonly Point[]): number => {
      let worst = 0;
      for (let i = 1; i < path.length - 1; i++) {
        const ax = path[i]!.x - path[i - 1]!.x, ay = path[i]!.y - path[i - 1]!.y;
        const bx = path[i + 1]!.x - path[i]!.x, by = path[i + 1]!.y - path[i]!.y;
        const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
        if (la === 0 || lb === 0) continue;
        const cos = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)));
        worst = Math.max(worst, Math.acos(cos) * 180 / Math.PI);
      }
      return worst;
    };
    const nodes: Point[] = [{ x: 0, y: 0 }, { x: 50, y: 100 }, { x: 0, y: 200 }, { x: 60, y: 300 }];
    // Stroking the nodes directly folds the road; the spline spreads the turn out.
    expect(sharpest(nodes)).toBeGreaterThan(45);
    const bend = smoothPath(nodes, 12);
    expect(sharpest(bend)).toBeLessThan(sharpest(nodes) * 0.35);
    // Denser sampling keeps flattening it, which is what lets the scene trade cost for smoothness.
    expect(sharpest(smoothPath(nodes, 24))).toBeLessThan(sharpest(bend));
    // It still passes through the authored nodes, so a node sits on its own road.
    for (const node of nodes) {
      expect(Math.min(...bend.map(p => Math.hypot(p.x - node.x, p.y - node.y)))).toBeLessThan(1);
    }
    expect(pathLength(bend)).toBeGreaterThan(pathLength(nodes) * 0.98);
  });
  it('lays dashes at an even pitch along the whole path', () => {
    const spans = dashes(line, 20, 20);
    expect(spans.length).toBe(5);
    for (const [from, to] of spans) expect(Math.hypot(to.x - from.x, to.y - from.y)).toBeCloseTo(20);
    // Pitch is continuous across the join at x=100, not restarted per segment.
    expect(spans[2]![0].x).toBeCloseTo(80);
    expect(dashes(line, 0, 10)).toEqual([]);
    expect(dashes([{ x: 0, y: 0 }], 10, 10)).toEqual([]);
    // A gapless dash covers the line exactly once.
    expect(pathLength(dashes(line, 50, 0).flat())).toBeCloseTo(200);
  });
});

describe('workshop contrast', () => {
  it('keeps supporting ink readable on the paper', () => {
    expect(contrastRatio(PALETTE.muted, PALETTE.paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(PALETTE.ink, PALETTE.paper)).toBeGreaterThanOrEqual(7);
  });
  it('outlines cream paint in a darker ink rather than a muddy self-shade', () => {
    const stroke = typeStroke(SHELL.cream);
    expect(stroke).not.toBeNull();
    expect(relativeLuminance(stroke!)).toBeLessThan(relativeLuminance(PALETTE.ink));
    expect(contrastRatio(stroke!, SHELL.wood)).toBeGreaterThan(4.5);
    // The fill alone is not enough on the timber; that is why the outline exists.
    expect(contrastRatio(SHELL.cream, SHELL.wood)).toBeLessThan(3);
  });
  it('keeps a darker self-shade on a saturated mid-tone', () => {
    const stroke = typeStroke(PALETTE.coral);
    expect(stroke).not.toBeNull();
    expect(relativeLuminance(stroke!)).toBeLessThan(relativeLuminance(PALETTE.coral));
    expect(contrastRatio(stroke!, PALETTE.paper)).toBeGreaterThan(4.5);
  });
  it('refuses an outline the letter cannot carry', () => {
    // The defect this rule exists for: dark green ink with a near-black border, which
    // reads as a thicker, muddier stem rather than as a silhouette.
    expect(typeStroke(PALETTE.ink)).toBeNull();
    expect(typeStroke(PALETTE.muted)).toBeNull();
    // A light or mid-tone fill still gets one, and it still clears the bar.
    for (const fill of [SHELL.cream, SHELL.wood, PALETTE.coral, 0xd4a54a, 0xf3e7d8]) {
      const stroke = typeStroke(fill);
      expect(stroke).not.toBeNull();
      expect(contrastRatio(fill, stroke!)).toBeGreaterThanOrEqual(OUTLINE_CONTRAST);
    }
  });
  it('gives every ink in the game an outline that reads, or none at all', () => {
    // App-wide, not screen by screen: an act's ink and an area's ink are display fills
    // wherever a headline, a value or a verdict is set in them, so a new act or area
    // cannot reintroduce the border this rule removed.
    let refused = 0;
    for (const ink of [...VIGNETTES.map(v => v.ink), ...AREAS.map(a => a.ink)]) {
      const stroke = typeStroke(ink);
      if (stroke === null) { refused += 1; continue; }
      // Dusk's ink is a light cream on a dark sky, so it keeps a border — and earns it.
      expect(relativeLuminance(ink)).toBeGreaterThan(0.45);
      expect(contrastRatio(ink, stroke)).toBeGreaterThanOrEqual(OUTLINE_CONTRAST);
    }
    // Every dark one loses it; each used to carry a near-black border at under 2:1.
    expect(refused).toBe(VIGNETTES.length + AREAS.length - 1);
  });
  it('keeps empty stars readable on their plate', () => {
    const areas = [
      { name: 'Grass', ground: 0xb0bb91, ink: 0x2c4629, paper: 0xf4f0e2 },
      { name: 'Pavement', ground: 0xbdb7ae, ink: 0x35322f, paper: 0xf5f2ee },
      { name: 'Sand', ground: 0xe3c88f, ink: 0x5a4224, paper: 0xfff7e6 },
      { name: 'Snow', ground: 0xdfe8f0, ink: 0x2d4759, paper: 0xffffff },
      { name: 'Dusk', ground: 0x433856, ink: 0xf3e7d8, paper: 0x2a2236 },
    ] as const;
    for (const area of areas) {
      const plate = shade(area.paper, -0.03);
      expect(contrastRatio(starColour(false, shade(area.ink, 0.1), plate), plate), area.name).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(starColour(true, shade(area.ink, 0.1), plate), plate), area.name).toBeGreaterThan(4.5);
    }
    expect(contrastRatio(starColour(false, PALETTE.ink, SHELL.puck), SHELL.puck)).toBeGreaterThanOrEqual(3);
  });

  it('keeps preview level numbers readable on every area', () => {
    const areas = [
      { name: 'Grass', ground: 0xb0bb91, ink: 0x2c4629, paper: 0xf4f0e2 },
      { name: 'Pavement', ground: 0xbdb7ae, ink: 0x35322f, paper: 0xf5f2ee },
      { name: 'Sand', ground: 0xe3c88f, ink: 0x5a4224, paper: 0xfff7e6 },
      { name: 'Snow', ground: 0xdfe8f0, ink: 0x2d4759, paper: 0xffffff },
      { name: 'Dusk', ground: 0x433856, ink: 0xf3e7d8, paper: 0x2a2236 },
    ] as const;
    for (const area of areas) {
      const fill = mix(area.paper, area.ground, 0.62);
      const number = mix(area.ink, area.ground, 0.38);
      expect(contrastRatio(number, fill), area.name).toBeGreaterThan(3);
    }
  });

  it('keeps locked level numbers readable on every area', () => {
    // Copied from AREAS so this file never loads the vignette registry (Phaser).
    const areas = [
      { name: 'Grass', ground: 0xb0bb91, ink: 0x2c4629, paper: 0xf4f0e2 },
      { name: 'Pavement', ground: 0xbdb7ae, ink: 0x35322f, paper: 0xf5f2ee },
      { name: 'Sand', ground: 0xe3c88f, ink: 0x5a4224, paper: 0xfff7e6 },
      { name: 'Snow', ground: 0xdfe8f0, ink: 0x2d4759, paper: 0xffffff },
      { name: 'Dusk', ground: 0x433856, ink: 0xf3e7d8, paper: 0x2a2236 },
    ] as const;
    for (const area of areas) {
      const fill = mix(area.paper, area.ground, 0.42);
      const number = mix(area.ink, area.ground, 0.12);
      expect(contrastRatio(number, fill), area.name).toBeGreaterThan(3);
    }
  });
});

describe('chrome press', () => {
  it('is fully down at the tap and at rest after the window', () => {
    expect(pressAmount(1, 1)).toBeCloseTo(1);
    expect(pressAmount(2, 1)).toBe(0);
    expect(pressAmount(1, Number.NEGATIVE_INFINITY)).toBe(0);
  });
});
