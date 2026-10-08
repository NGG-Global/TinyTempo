/**
 * What a Graphics' drawing covers, read from its command buffer.
 *
 * `ui/bakedLayer.ts` rasterises a Graphics into a texture once and shows the texture in its
 * place, so the texture has to be exactly as large as the drawing: too small clips it, too
 * large costs memory for nothing. Phaser keeps no bounds for a Graphics, so this walks the
 * buffer the way Phaser's own canvas renderer does (`GraphicsCanvasRenderer`), command by
 * command, with the same argument counts.
 *
 * A drawing the canvas renderer would not reproduce is refused rather than bounded: a
 * gradient (the canvas renderer skips it, so a baked copy would lose its colour) and a
 * canvas transform (the points are no longer where they are written). Refused means "leave
 * it live", never "draw it wrong". No Phaser import, so it is tested under node.
 */

/**
 * Whether two command buffers draw the same thing. A layout redraws its chrome whether or
 * not anything moved — once per frame of an Android URL-bar collapse — and an identical
 * redraw keeps its raster rather than paying for another.
 */
export function sameDrawing(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Phaser 4's command ids (`gameobjects/graphics/Commands.js`). Pinned by `tests/graphicsBounds.test.ts`. */
export const GRAPHICS_COMMAND = {
  arc: 0,
  beginPath: 1,
  closePath: 2,
  fillRect: 3,
  lineTo: 4,
  moveTo: 5,
  lineStyle: 6,
  fillStyle: 7,
  fillPath: 8,
  strokePath: 9,
  fillTriangle: 10,
  strokeTriangle: 11,
  save: 14,
  restore: 15,
  translate: 16,
  scale: 17,
  rotate: 18,
  gradientFillStyle: 21,
  gradientLineStyle: 22,
} as const;

export interface DrawingBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Room for the antialiased fringe outside the geometry. Canvas coverage falls off over one
 * pixel either side of an edge, so two keeps the faintest of it.
 */
export const BOUNDS_FRINGE = 2;

const C = GRAPHICS_COMMAND;

/**
 * The integer rectangle the drawing covers, strokes and fringe included, cut to `clip` when
 * one is given; or null when there is nothing to draw, or the drawing is one a baked copy
 * would not reproduce (see the module note).
 *
 * Every stroke is padded by half the widest line in the buffer rather than its own: a
 * stroke's corners never reach further than half its width from the points it joins (the
 * bake joins with bevels, as Phaser's WebGL stroke does), and a texture a few pixels too
 * tall is cheaper than tracking which style each path was stroked in.
 */
export function drawingBounds(commands: readonly number[], clip?: DrawingBounds): DrawingBounds | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let widest = 0;
  const include = (x: number, y: number, r = 0): void => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x - r < minX) minX = x - r;
    if (y - r < minY) minY = y - r;
    if (x + r > maxX) maxX = x + r;
    if (y + r > maxY) maxY = y + r;
  };
  for (let i = 0; i < commands.length; i++) {
    switch (commands[i]) {
      case C.arc:
        include(commands[i + 1]!, commands[i + 2]!, Math.abs(commands[i + 3]!));
        i += 7;
        break;
      case C.beginPath: case C.closePath: case C.fillPath: case C.strokePath:
        break;
      case C.fillRect: {
        const x = commands[i + 1]!, y = commands[i + 2]!, w = commands[i + 3]!, h = commands[i + 4]!;
        include(x, y);
        include(x + w, y + h);
        i += 4;
        break;
      }
      case C.lineTo: case C.moveTo:
        include(commands[i + 1]!, commands[i + 2]!);
        i += 2;
        break;
      case C.lineStyle:
        if (Number.isFinite(commands[i + 1]!)) widest = Math.max(widest, commands[i + 1]!);
        i += 3;
        break;
      case C.fillStyle:
        i += 2;
        break;
      case C.fillTriangle: case C.strokeTriangle:
        include(commands[i + 1]!, commands[i + 2]!);
        include(commands[i + 3]!, commands[i + 4]!);
        include(commands[i + 5]!, commands[i + 6]!);
        i += 6;
        break;
      default:
        // A transform, a gradient, or a command this walker has never seen.
        return null;
    }
  }
  if (minX > maxX || minY > maxY) return null;
  const pad = widest / 2 + BOUNDS_FRINGE;
  let left = Math.floor(minX - pad), top = Math.floor(minY - pad);
  let right = Math.ceil(maxX + pad), bottom = Math.ceil(maxY + pad);
  if (clip) {
    left = Math.max(left, Math.floor(clip.x));
    top = Math.max(top, Math.floor(clip.y));
    right = Math.min(right, Math.ceil(clip.x + clip.width));
    bottom = Math.min(bottom, Math.ceil(clip.y + clip.height));
  }
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}
