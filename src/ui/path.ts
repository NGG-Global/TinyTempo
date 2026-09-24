export interface Point { readonly x: number; readonly y: number }

/**
 * Samples a Catmull-Rom spline through every point, `perSegment` samples per span.
 * The road is authored as one point per level; stroking those directly kinks at each
 * node, which is what made the old map read as a folded ribbon rather than a road.
 */
export function smoothPath(points: readonly Point[], perSegment = 10): Point[] {
  if (points.length < 2) return points.slice();
  const steps = Math.max(1, Math.floor(perSegment));
  const out: Point[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? p2;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(points[points.length - 1]!);
  return out;
}

/**
 * Walks a polyline and returns the drawn spans of a dashed line, so road markings
 * follow the curve at an even pitch instead of being spaced per node.
 */
export function dashes(path: readonly Point[], dash: number, gap: number): [Point, Point][] {
  const spans: [Point, Point][] = [];
  if (path.length < 2 || dash <= 0 || gap < 0) return spans;
  const period = dash + gap;
  let travelled = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length <= 0) continue;
    let cursor = travelled % period;
    // Walk this straight span, emitting the parts of it that land on a dash.
    for (let along = 0; along < length; ) {
      const remaining = cursor < dash ? dash - cursor : period - cursor;
      const end = Math.min(length, along + remaining);
      if (cursor < dash) {
        const t0 = along / length;
        const t1 = end / length;
        spans.push([
          { x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 },
          { x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1 },
        ]);
      }
      cursor = (cursor + (end - along)) % period;
      along = end;
    }
    travelled += length;
  }
  return spans;
}

/** Total length of a polyline. */
export function pathLength(path: readonly Point[]): number {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) total += Math.hypot(path[i + 1]!.x - path[i]!.x, path[i + 1]!.y - path[i]!.y);
  return total;
}

/**
 * A climbing path's x at a world y: the first sample at or above `y`, interpolated from
 * the one below it. For a path whose y only falls from its first point to its last — the
 * map's road — this is a binary search, clamped to the ends. The map used to invert a y
 * into a level by dividing by the step; a finale's extra room made the spacing uneven.
 */
export function pathXAt(path: readonly Point[], y: number): number {
  if (path.length === 0) return 0;
  if (y >= path[0]!.y) return path[0]!.x;
  if (y <= path[path.length - 1]!.y) return path[path.length - 1]!.x;
  let low = 0, high = path.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (path[mid]!.y > y) low = mid;
    else high = mid;
  }
  const a = path[low]!, b = path[high]!;
  const t = a.y === b.y ? 0 : (a.y - y) / (a.y - b.y);
  return a.x + (b.x - a.x) * t;
}

/** Index of the first sample of a climbing path at or above `y`, searched between `from` and `to`. */
export function pathIndexAt(path: readonly Point[], y: number, from = 0, to = path.length - 1): number {
  let low = Math.max(0, from), high = Math.min(path.length - 1, to);
  if (high < low) return low;
  if (path[low]!.y <= y) return low;
  if (path[high]!.y > y) return high;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (path[mid]!.y > y) low = mid;
    else high = mid;
  }
  return high;
}
