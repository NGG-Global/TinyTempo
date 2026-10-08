import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BOUNDS_FRINGE, drawingBounds, GRAPHICS_COMMAND as C, sameDrawing } from '../src/ui/graphicsBounds';

/**
 * A baked layer is exactly as large as `drawingBounds` says, so a bound that is short clips
 * the drawing on screen. These pin the walker to Phaser's own command encoding and check
 * each primitive the game draws with.
 */

const require = createRequire(import.meta.url);
// By path: the package's `exports` do not list its sources.
const PHASER_COMMANDS = require(fileURLToPath(new URL('../node_modules/phaser/src/gameobjects/graphics/Commands.js', import.meta.url))) as Record<string, number>;

describe('the command ids', () => {
  it('are Phaser\'s', () => {
    const pairs: Array<[keyof typeof C, string]> = [
      ['arc', 'ARC'], ['beginPath', 'BEGIN_PATH'], ['closePath', 'CLOSE_PATH'], ['fillRect', 'FILL_RECT'],
      ['lineTo', 'LINE_TO'], ['moveTo', 'MOVE_TO'], ['lineStyle', 'LINE_STYLE'], ['fillStyle', 'FILL_STYLE'],
      ['fillPath', 'FILL_PATH'], ['strokePath', 'STROKE_PATH'], ['fillTriangle', 'FILL_TRIANGLE'],
      ['strokeTriangle', 'STROKE_TRIANGLE'], ['save', 'SAVE'], ['restore', 'RESTORE'], ['translate', 'TRANSLATE'],
      ['scale', 'SCALE'], ['rotate', 'ROTATE'], ['gradientFillStyle', 'GRADIENT_FILL_STYLE'], ['gradientLineStyle', 'GRADIENT_LINE_STYLE'],
    ];
    for (const [ours, theirs] of pairs) expect(C[ours], ours).toBe(PHASER_COMMANDS[theirs]);
    // Nothing Phaser can push is missing from the walker's table.
    expect(Object.keys(PHASER_COMMANDS).sort()).toEqual(pairs.map(([, theirs]) => theirs).sort());
  });
});

describe('the bounds', () => {
  const f = BOUNDS_FRINGE;

  it('cover a filled rectangle and its fringe', () => {
    expect(drawingBounds([C.fillStyle, 0xff0000, 1, C.fillRect, 10, 20, 30, 40])).toEqual({ x: 10 - f, y: 20 - f, width: 30 + 2 * f, height: 40 + 2 * f });
  });

  it('cover a path, a triangle and an arc', () => {
    const path = drawingBounds([C.beginPath, C.moveTo, 5, 5, C.lineTo, 50, 8, C.lineTo, 20, 60, C.closePath, C.fillPath]);
    expect(path).toEqual({ x: 5 - f, y: 5 - f, width: 45 + 2 * f, height: 55 + 2 * f });
    const triangle = drawingBounds([C.fillTriangle, 0, 0, 10, -4, 3, 9]);
    expect(triangle).toEqual({ x: -f, y: -4 - f, width: 10 + 2 * f, height: 13 + 2 * f });
    // An arc command is bounded by its whole circle: generous, never short.
    const arc = drawingBounds([C.beginPath, C.arc, 100, 100, 12, 0, 1, 0, 0, C.fillPath]);
    expect(arc).toEqual({ x: 88 - f, y: 88 - f, width: 24 + 2 * f, height: 24 + 2 * f });
  });

  it('pad a stroke by half the widest line', () => {
    const b = drawingBounds([C.lineStyle, 8, 0, 1, C.beginPath, C.moveTo, 0, 0, C.lineTo, 100, 0, C.strokePath])!;
    expect(b.y).toBe(-4 - f);
    expect(b.height).toBe(8 + 2 * f);
    expect(b.x).toBe(-4 - f);
    expect(b.width).toBe(108 + 2 * f);
  });

  it('round outward to whole pixels', () => {
    const b = drawingBounds([C.fillRect, 0.4, 0.6, 10.2, 10.1])!;
    expect(Number.isInteger(b.x) && Number.isInteger(b.y) && Number.isInteger(b.width) && Number.isInteger(b.height)).toBe(true);
    expect(b.x).toBeLessThanOrEqual(0.4 - f);
    expect(b.x + b.width).toBeGreaterThanOrEqual(10.6 + f);
    expect(b.y + b.height).toBeGreaterThanOrEqual(10.7 + f);
  });

  it('are cut to a clip rectangle', () => {
    expect(drawingBounds([C.fillRect, -50, 0, 900, 10], { x: 0, y: 0, width: 720, height: 1000 })).toEqual({ x: 0, y: 0, width: 720, height: 10 + f });
    // Wholly outside it, there is nothing to bake.
    expect(drawingBounds([C.fillRect, 0, 2000, 10, 10], { x: 0, y: 0, width: 720, height: 1000 })).toBeNull();
  });

  it('are nothing for an empty drawing, or one with only styles', () => {
    expect(drawingBounds([])).toBeNull();
    expect(drawingBounds([C.fillStyle, 0, 1, C.lineStyle, 2, 0, 1, C.beginPath, C.fillPath])).toBeNull();
  });

  it('ignore a coordinate that is not a number', () => {
    expect(drawingBounds([C.fillRect, 0, 0, 10, 10, C.lineTo, Number.NaN, 5, C.lineTo, 3, Infinity])).toEqual({ x: -f, y: -f, width: 10 + 2 * f, height: 10 + 2 * f });
  });

  it('refuse what a baked copy would not reproduce', () => {
    // The canvas renderer skips gradients, and a transform moves the points off their numbers.
    expect(drawingBounds([C.gradientFillStyle, 1, 1, 1, 1, 0, 0, 0, 0, C.fillRect, 0, 0, 10, 10])).toBeNull();
    expect(drawingBounds([C.save, C.translate, 5, 5, C.fillRect, 0, 0, 10, 10, C.restore])).toBeNull();
    expect(drawingBounds([C.rotate, 0.3, C.fillRect, 0, 0, 10, 10])).toBeNull();
    expect(drawingBounds([99, C.fillRect, 0, 0, 10, 10])).toBeNull();
  });
});

describe('an unchanged redraw', () => {
  it('is recognised, so it keeps its raster', () => {
    const drawing = [C.fillStyle, 0xff0000, 1, C.fillRect, 10, 20, 30, 40];
    expect(sameDrawing(drawing, [...drawing])).toBe(true);
    expect(sameDrawing([], [])).toBe(true);
  });

  it('is told apart from a moved, recoloured or longer one', () => {
    const drawing = [C.fillStyle, 0xff0000, 1, C.fillRect, 10, 20, 30, 40];
    expect(sameDrawing(drawing, [C.fillStyle, 0xff0000, 1, C.fillRect, 10, 21, 30, 40])).toBe(false);
    expect(sameDrawing(drawing, [C.fillStyle, 0xff0001, 1, C.fillRect, 10, 20, 30, 40])).toBe(false);
    expect(sameDrawing(drawing, [...drawing, C.fillRect, 0, 0, 1, 1])).toBe(false);
    // A press that sinks a puck by a fraction of a unit is a change.
    expect(sameDrawing([C.lineTo, 5, 5.25], [C.lineTo, 5, 5.2500001])).toBe(false);
  });
});
