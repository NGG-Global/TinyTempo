/** Keep the same relative stretch of the road in view when the phone changes size. */
export function resizedScroll(scroll: number, previousScale: number, nextScale: number,
  oldHeader: number, newHeader: number, oldHeight: number, newHeight: number): number {
  if (previousScale <= 0) return 0;
  const anchor = oldHeader + (oldHeight - oldHeader) * 0.5;
  return (scroll + anchor - oldHeader) * nextScale / previousScale
    + newHeader - (newHeader + (newHeight - newHeader) * 0.5);
}

/** Critical damping without a frame-dependent lerp; also stable after a backgrounded frame. */
export function scrollStep(velocity: number, deltaMs: number, friction: number): { distance: number; velocity: number } {
  const seconds = Math.min(64, Math.max(0, deltaMs)) / 1000;
  const decay = Math.exp(-friction * seconds);
  return { distance: velocity * (1 - decay) / friction, velocity: velocity * decay };
}

/** One baked slice of the map: the node indices it owns and the world band it covers. */
export interface StripBounds {
  readonly from: number;
  readonly to: number;
  /** The smaller y. The road climbs, so `top` is further up the world than `bottom`. */
  readonly top: number;
  readonly bottom: number;
}

/**
 * How the map's bake is cut into strips, so a strip the camera cannot see need not be
 * drawn. Pure, because the property that matters is arithmetic: the strips must **tile**
 * the world — abutting exactly, covering it end to end, with no gap and no overlap.
 *
 * A gap is a band of missing ground the width of the screen. An overlap is every
 * half-alpha shape in it painted twice. Neither shows up until the one scroll position
 * that reveals it, which is why it is pinned here rather than left to the eye.
 *
 * Seams fall on the midpoint between two nodes — the same line the terrain already
 * changes on at an area boundary — and the outermost strips run to the ends of the world
 * so the road leaves the frame rather than stopping at a seam.
 */
export function stripBounds(count: number, levels: number, worldHeight: number, nodeY: (i: number) => number,
  step: number): StripBounds[] {
  if (count <= 0 || levels <= 0) return [];
  return Array.from({ length: Math.ceil(count / levels) }, (_, j) => {
    const from = j * levels;
    const to = Math.min(count, from + levels);
    return {
      from, to,
      top: to >= count ? 0 : nodeY(to - 1) - step / 2,
      bottom: from === 0 ? worldHeight : nodeY(from) + step / 2,
    };
  });
}

/**
 * Whether a strip is close enough to the camera to be worth drawing. `margin` has to
 * clear the tallest thing a strip can stand past its own edge, or that thing pops in.
 */
export function stripInView(strip: Pick<StripBounds, 'top' | 'bottom'>, scrollY: number, height: number, margin: number): boolean {
  return strip.bottom > scrollY - margin && strip.top < scrollY + height + margin;
}
