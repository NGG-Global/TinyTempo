/**
 * How much floor an open-table act has to lay, in its stage's own units.
 *
 * The hammer's bench and the bug's matting are tiled sprites under a stage that is scaled
 * and slid. They used to be a fixed 5700 x 2500 and 5000 x 2500, sized once to cover any
 * screen, and under WebGL that costs nothing: a tile sprite repeats its texture. Under the
 * canvas renderer — what a tablet with a blocklisted GPU falls back to — Phaser gives each
 * one a canvas of its full size, 57 MB and 50 MB, and the bench is on the title screen.
 *
 * So each is sized to what the screen can reveal: one frame's width either side of it,
 * because the between-task slide carries the whole stage up to a frame's width off and
 * back on (`Vignette.translate`), and down to the frame's foot. Lengths are rounded up to
 * `STEP` so a URL bar collapsing a few units a frame does not reallocate a canvas each time.
 */
export const FLOOR_STEP = 128;

export interface FloorSpan {
  /** The left edge, in stage units. */
  readonly x: number;
  readonly width: number;
  /** From the floor's top edge, at the stage's origin, down past the frame's foot. */
  readonly height: number;
}

export interface FloorFrame {
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * The span for a stage placed at (`originX`, `originY`) and drawn at `scale`, in a frame
 * whose edges are given in screen units. `below` is extra depth for the stage's own give
 * (a punch, a bench pressed under the blow).
 */
export function floorSpan(frame: FloorFrame, originX: number, originY: number, scale: number, below = 64): FloorSpan {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const width = (frame.right - frame.left) / s;
  const left = (frame.left - originX) / s - width;
  const right = (frame.right - originX) / s + width;
  const depth = Math.max(0, (frame.bottom - originY) / s) + below;
  const x = Math.floor(left / FLOOR_STEP) * FLOOR_STEP;
  return {
    x,
    width: Math.ceil((right - x) / FLOOR_STEP) * FLOOR_STEP,
    height: Math.ceil(depth / FLOOR_STEP) * FLOOR_STEP,
  };
}
