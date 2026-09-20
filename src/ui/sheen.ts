import Phaser from 'phaser';
import { reducedMotion } from '@/core/motionPreference';

/**
 * A band of light travelling across a brass surface, clipped to the panel face.
 *
 * The premium offers are the only objects in the game that are meant to catch the eye
 * on their own, and brass with no highlight moving over it reads as a brown card. The
 * band is drawn into the same Graphics as the glint and clipped to the panel rectangle
 * — not masked. Phaser 4 dropped WebGL geometry masks (`setMask` warns and no-ops), and
 * `FilterList#addMask` on a Graphics with no bounds is a full-screen DynamicTexture,
 * which is the cost Settings already refused for a clip. A square clip misses the last
 * few pixels of the corner radius; a mask that does not run is worse. It stops entirely
 * under reduced motion, where a repeating animation with no player input is exactly
 * what the preference asks about.
 */
export class Sheen {
  private readonly band: Phaser.GameObjects.Graphics;
  private readonly rect = new Phaser.Geom.Rectangle();
  private period = 4.6;

  public constructor(scene: Phaser.Scene, depth: number) {
    this.band = scene.add.graphics().setDepth(depth).setVisible(false);
  }

  /** The band itself, so a caller can add it to a container that scrolls or moves. */
  public get node(): Phaser.GameObjects.Graphics { return this.band; }

  /** Lay the sheen over a panel face. Call from `layout`, or wherever the panel moves. */
  public place(r: Phaser.Geom.Rectangle, _radius: number, period = 4.6): void {
    this.rect.setTo(r.x, r.y, r.width, r.height);
    this.period = period;
  }

  /** Redraw at `now` seconds. Hidden while the panel has no size or motion is reduced. */
  public update(now: number, visible = true): void {
    const on = visible && this.rect.width > 0 && !reducedMotion();
    this.band.setVisible(on);
    if (!on) return;
    // Rests off the left edge for most of the cycle, then crosses: a slow glint, not a strobe.
    const phase = (now % this.period) / this.period;
    const travel = Math.min(1, phase / 0.42);
    const width = this.rect.width * 0.22;
    const x = this.rect.x - width * 2 + travel * (this.rect.width + width * 4);
    const lean = this.rect.height * 0.3;
    const g = this.band.clear();
    const fade = 1 - Math.abs(travel - 0.5) * 0.6;
    for (const [offset, alpha] of [[-width * 0.5, 0.16], [0, 0.34], [width * 0.5, 0.16]] as const) {
      const clipped = clipQuadToRect(
        [
          x + offset + lean, this.rect.y,
          x + offset + lean + width * 0.5, this.rect.y,
          x + offset - lean + width * 0.5, this.rect.bottom,
          x + offset - lean, this.rect.bottom,
        ],
        this.rect,
      );
      if (clipped.length < 6) continue;
      g.fillStyle(0xffffff, alpha * fade);
      const points: Phaser.Math.Vector2[] = [];
      for (let i = 0; i < clipped.length; i += 2) points.push(new Phaser.Math.Vector2(clipped[i]!, clipped[i + 1]!));
      g.fillPoints(points, true);
    }
  }

  public setVisible(visible: boolean): void {
    this.band.setVisible(visible && this.rect.width > 0 && !reducedMotion());
  }

  public destroy(): void {
    this.band.destroy();
  }
}

/**
 * Sutherland–Hodgman clip of a convex quad (x,y pairs) against an axis-aligned rect.
 * Pure so a missing Phaser mask cannot take the glint off the brass.
 */
export function clipQuadToRect(points: readonly number[], rect: { x: number; y: number; width: number; height: number; right: number; bottom: number }): number[] {
  const edges: readonly (readonly [number, number, number, number])[] = [
    [rect.x, rect.y, rect.right, rect.y],
    [rect.right, rect.y, rect.right, rect.bottom],
    [rect.right, rect.bottom, rect.x, rect.bottom],
    [rect.x, rect.bottom, rect.x, rect.y],
  ];
  let output = points.slice();
  for (const [ax, ay, bx, by] of edges) {
    const input = output;
    output = [];
    if (input.length < 2) return [];
    for (let i = 0; i < input.length; i += 2) {
      const px = input[i]!, py = input[i + 1]!;
      const qx = input[(i + 2) % input.length]!, qy = input[(i + 3) % input.length]!;
      const pIn = inside(px, py, ax, ay, bx, by);
      const qIn = inside(qx, qy, ax, ay, bx, by);
      if (pIn && qIn) output.push(qx, qy);
      else if (pIn && !qIn) output.push(...intersect(px, py, qx, qy, ax, ay, bx, by));
      else if (!pIn && qIn) output.push(...intersect(px, py, qx, qy, ax, ay, bx, by), qx, qy);
    }
  }
  return output;
}

function inside(px: number, py: number, ax: number, ay: number, bx: number, by: number): boolean {
  return (bx - ax) * (py - ay) - (by - ay) * (px - ax) >= 0;
}

function intersect(
  px: number, py: number, qx: number, qy: number,
  ax: number, ay: number, bx: number, by: number,
): readonly [number, number] {
  const dx = qx - px, dy = qy - py, ex = bx - ax, ey = by - ay;
  const denom = dx * ey - dy * ex;
  if (denom === 0) return [qx, qy];
  const t = ((ax - px) * ey - (ay - py) * ex) / denom;
  return [px + t * dx, py + t * dy];
}
