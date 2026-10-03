/**
 * Curves with as many points as their size needs, rather than a hundred each.
 *
 * Phaser 4's WebGL Graphics renderer turns every `arc` command into a fixed 100 points on
 * every frame it renders, whatever the radius or sweep (`iterStep = 0.01` in
 * `GraphicsWebGLRenderer`). A 2-unit highlight costs what a 200-unit sun does, and each
 * corner of a rounded rectangle is a full hundred, so one rounded card is 404 points
 * computed, allocated and transformed again 60 times a second. The acts draw hundreds of
 * them a frame: on the light switch and the DJ booth this was 37–46% of the render's main-
 * thread time.
 *
 * `arc` is rewritten here to emit the same curve as `lineTo` points: enough that no chord
 * strays more than `ARC_TOLERANCE` from the true circle, never more than Phaser's own
 * hundred. The geometry is pure and tested under node; `installArcDetail` puts it on the
 * Graphics prototype once, before the game is constructed, so every scene draws through it
 * and nothing at a call site changes.
 */

/**
 * The most a chord may fall inside the true curve, in the Graphics' own units. Graphics
 * here are drawn at or near their on-screen size (the largest stage scale is a tablet's
 * ~1.3), so this is about a fifth of a device pixel on a 2.75× phone: under what the
 * antialiased edge can show.
 */
export const ARC_TOLERANCE = 0.1;
/** The fewest points a full circle gets, so a dot stays round wherever it lands. */
export const ARC_MIN_FULL = 12;
/** Phaser's own count for one arc command, whatever its sweep: never exceeded. */
export const ARC_PHASER_POINTS = 100;

const TAU = Math.PI * 2;

/**
 * The signed sweep Phaser's renderer draws for an arc command, normalized exactly as
 * `GraphicsWebGLRenderer` does it, so a rewritten arc runs the same way round.
 */
export function arcSweep(startAngle: number, endAngle: number, anticlockwise: boolean): number {
  let sweep = endAngle - startAngle;
  if (anticlockwise) {
    if (sweep < -TAU) sweep = -TAU;
    else if (sweep > 0) sweep = -TAU + sweep % TAU;
  } else if (sweep > TAU) sweep = TAU;
  else if (sweep < 0) sweep = TAU + sweep % TAU;
  return sweep;
}

/** How many chords a full circle of `radius` needs to stay within the tolerance. */
export function fullCircleSegments(radius: number, tolerance = ARC_TOLERANCE): number {
  const r = Math.abs(radius);
  if (!(r > tolerance)) return ARC_MIN_FULL;
  // A chord across angle θ sits r·(1 − cos θ/2) inside the circle.
  return Math.max(ARC_MIN_FULL, Math.ceil(Math.PI / Math.acos(1 - tolerance / r)));
}

/** Chords for an arc of `sweep` radians, running on by `overshoot` as Phaser's does. */
export function arcSegments(radius: number, sweep: number, overshoot = 0): number {
  const extent = 1 + Math.max(0, overshoot);
  const needed = Math.ceil(fullCircleSegments(radius) * extent * Math.abs(sweep) / TAU);
  return Math.max(1, Math.min(Math.ceil(ARC_PHASER_POINTS * extent), needed));
}

/** The structural slice of a Graphics that the rewritten `arc` draws through. */
interface ArcTarget {
  lineTo(x: number, y: number): unknown;
}

/**
 * Draw an arc as chords onto `target`. The first point is the arc's start, which joins the
 * path already open just as Phaser's arc does (or opens one, when none is); an overshoot
 * runs past the end and comes back to it, as Phaser's renderer does.
 */
export function drawArc(target: ArcTarget, x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise = false, overshoot = 0): void {
  const sweep = arcSweep(startAngle, endAngle, anticlockwise);
  const extent = 1 + Math.max(0, overshoot);
  const n = arcSegments(radius, sweep, overshoot);
  for (let i = 0; i <= n; i++) {
    const angle = startAngle + sweep * extent * (i / n);
    target.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  }
  if (extent > 1) {
    const end = startAngle + sweep;
    target.lineTo(x + Math.cos(end) * radius, y + Math.sin(end) * radius);
  }
}

/**
 * Put `drawArc` on a Graphics prototype. Takes the prototype rather than importing Phaser,
 * so the module stays testable under node; `main.ts` passes Phaser's.
 */
export function installArcDetail(proto: { arc: (...args: never[]) => unknown }): void {
  const replacement = function (this: ArcTarget, x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise?: boolean, overshoot?: number) {
    drawArc(this, x, y, radius, startAngle, endAngle, anticlockwise ?? false, overshoot ?? 0);
    return this;
  };
  (proto as unknown as { arc: typeof replacement }).arc = replacement;
}
