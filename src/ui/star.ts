import Phaser from 'phaser';
import { mix, shade } from './colour';
import { faces } from './light';
import type { StarPose } from './starReveal';

/** Prize brass for an earned star, wherever it is shown: plaque, road plate, tally and flight. */
export const STAR_PRIZE = 0xe0b34a;

const INNER = 0.45;

/** Five-point star drawn with Graphics, so it needs no glyph the device font might lack. */
export function drawStar(g: Phaser.GameObjects.Graphics, x: number, y: number, radius: number, color: number, alpha = 1): void {
  const points = starPoints(x, y, radius, 0, 1, 1);
  g.fillStyle(color, alpha).fillPoints(points, true);
  // Same cartoon edge the pucks and plaques carry; a fill with no outline read as a sticker
  // from a different game.
  g.lineStyle(Math.max(1.8, radius * 0.22), shade(color, -0.55), alpha).strokePoints(points, true);
}

/**
 * An empty seat on a plate: the plate's own tone ringed in faded ink, so what is missing
 * reads as a hole where a star would go rather than as a duller star. That is the
 * distinction the road needs once earned stars are brass — on the dark Dusk plate a
 * brass fill and a faded seat sit at nearly the same luminance, and full against hollow
 * is legible where a difference of tone is not.
 */
export function drawStarSeat(g: Phaser.GameObjects.Graphics, x: number, y: number, radius: number, plate: number, ring: number): void {
  const points = starPoints(x, y, radius, 0, 1, 1);
  g.fillStyle(shade(plate, -0.06), 1).fillPoints(points, true);
  g.lineStyle(Math.max(1.5, radius * 0.18), ring, 0.9).strokePoints(points, true);
}

export interface StarMarkSpec {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly color: number;
  readonly pose: StarPose;
  readonly impactAge?: number;
  readonly chorus?: number;
}

/**
 * Result-screen star: thickness, key light, bloom and a stamp shockwave.
 * Pose is `f(t)` from `starReveal.ts`; this only paints.
 */
export function drawStarMark(g: Phaser.GameObjects.Graphics, spec: StarMarkSpec): void {
  const pose = spec.pose;
  if (pose.alpha <= 0.01) return;
  const radius = spec.radius;
  const x = spec.x;
  const y = spec.y + pose.drop * radius;
  const glow = pose.glow + (spec.chorus ?? 0) * 0.7;
  const impactAge = spec.impactAge ?? -1;
  const f = faces(spec.color);
  const a = pose.alpha;

  if (glow > 0.04) {
    const bloom = radius * (1.22 + glow * 0.28);
    g.fillStyle(0xffe7a0, Math.min(0.55, glow * 0.28) * a).fillCircle(x, y, bloom);
    g.fillStyle(0xdfc37f, Math.min(0.4, glow * 0.22) * a).fillCircle(x, y, bloom * 0.62);
  }

  const shadePts = starPoints(x, y + radius * (0.07 + pose.lift * 0.14), radius, pose.spin, pose.scaleX, pose.scaleY);
  const facePts = starPoints(x, y, radius, pose.spin, pose.scaleX, pose.scaleY);
  g.fillStyle(0x1a1410, 0.22 * a).fillPoints(
    starPoints(x + radius * 0.05, y + radius * (0.12 + pose.lift * 0.2), radius, pose.spin, pose.scaleX, pose.scaleY),
    true,
  );
  g.fillStyle(f.shade, a).fillPoints(shadePts, true);
  g.fillStyle(spec.color, a).fillPoints(facePts, true);
  g.lineStyle(Math.max(1.8, radius * 0.2), f.edge, a).strokePoints(facePts, true);

  if (pose.fill > 0.05) {
    const sheen = pose.fill * (0.18 + pose.shine * 0.5 + pose.twinkle * 0.1);
    g.fillStyle(0xffffff, sheen * a).fillPoints(
      starPoints(x - radius * 0.07, y - radius * 0.11, radius * 0.5, pose.spin, pose.scaleX, pose.scaleY),
      true,
    );
    g.fillStyle(0xffffff, pose.fill * (0.22 + pose.shine * 0.38 + pose.twinkle * 0.14) * a)
      .fillEllipse(x - radius * 0.16, y - radius * 0.26, radius * 0.26, radius * 0.16);
  }

  if (pose.twinkle > 0.55) {
    for (const tip of [0, 1, 4]) {
      const angle = -Math.PI / 2 + tip * (Math.PI * 2 / 5) + pose.spin;
      const tx = x + Math.cos(angle) * radius * 0.94 * pose.scaleX;
      const ty = y + Math.sin(angle) * radius * 0.94 * pose.scaleY;
      const spark = pose.twinkle * (0.45 + (tip % 3) * 0.18) * a;
      const arm = radius * 0.16;
      g.lineStyle(Math.max(1.2, radius * 0.06), 0xffffff, spark);
      g.lineBetween(tx, ty - arm, tx, ty + arm);
      g.lineBetween(tx - arm, ty, tx + arm, ty);
    }
  }

  if (impactAge >= 0 && impactAge < 0.38) {
    g.lineStyle(Math.max(2, 6 - impactAge * 14), 0xffe7a0, Math.max(0, 0.65 - impactAge * 1.7) * a)
      .strokeCircle(x, y, radius * (1.05 + impactAge * 3.8));
  }
}

function starPoints(
  x: number, y: number, radius: number, spin: number, scaleX: number, scaleY: number,
): Phaser.Math.Vector2[] {
  const c = Math.cos(spin), s = Math.sin(spin);
  const points: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? radius * INNER : radius;
    const angle = -Math.PI / 2 + i * Math.PI / 5;
    const lx = Math.cos(angle) * r * scaleX;
    const ly = Math.sin(angle) * r * scaleY;
    points.push(new Phaser.Math.Vector2(x + lx * c - ly * s, y + lx * s + ly * c));
  }
  return points;
}

/** Blend an empty seat colour toward prize brass by `fill`. */
export function prizeColour(empty: number, fill: number): number {
  return mix(empty, STAR_PRIZE, fill);
}
