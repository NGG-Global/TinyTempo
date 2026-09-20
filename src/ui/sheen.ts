import Phaser from 'phaser';
import { reducedMotion } from '@/core/motionPreference';

/**
 * A band of light travelling across a brass surface, clipped to its rounded corners.
 *
 * The premium offers are the only objects in the game that are meant to catch the eye
 * on their own, and brass with no highlight moving over it reads as a brown card. The
 * band is a masked Graphics rather than a tinted image so it costs one quad and takes
 * the panel's exact corner radius; it stops entirely under reduced motion, where a
 * repeating animation with no player input is exactly what the preference asks about.
 */
export class Sheen {
  private readonly band: Phaser.GameObjects.Graphics;
  private readonly shape: Phaser.GameObjects.Graphics;
  private readonly rect = new Phaser.Geom.Rectangle();
  private period = 4.6;

  public constructor(scene: Phaser.Scene, depth: number) {
    this.shape = scene.make.graphics({}, false);
    this.band = scene.add.graphics().setDepth(depth).setVisible(false);
    // Phaser 4 dropped WebGL geometry masks: `setMask` warns and leaves `mask` null, so
    // the glint ran off the rounded brass. The filter list renders this shape to a
    // DynamicTexture; on canvas, where geometry masks still work, keep the cheap path.
    this.band.enableFilters();
    const filters = this.band.filters;
    if (filters) filters.internal.addMask(this.shape);
    else this.band.setMask(this.shape.createGeometryMask());
  }

  /** The band itself, so a caller can add it to a container that scrolls or moves. */
  public get node(): Phaser.GameObjects.Graphics { return this.band; }

  /** Lay the sheen over a panel face. Call from `layout`, or wherever the panel moves. */
  public place(r: Phaser.Geom.Rectangle, radius: number, period = 4.6): void {
    this.rect.setTo(r.x, r.y, r.width, r.height);
    this.period = period;
    // The mask lives in the same space as the band, including a map footer that does
    // not scroll: a default scroll factor of 1 would slide the clip off the brass.
    this.shape.setScrollFactor(this.band.scrollFactorX, this.band.scrollFactorY);
    this.shape.clear().fillStyle(0xffffff, 1).fillRoundedRect(r.x, r.y, r.width, r.height, radius);
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
    for (const [offset, alpha] of [[-width * 0.5, 0.16], [0, 0.34], [width * 0.5, 0.16]] as const) {
      g.fillStyle(0xffffff, alpha * (1 - Math.abs(travel - 0.5) * 0.6));
      g.fillPoints([
        new Phaser.Math.Vector2(x + offset + lean, this.rect.y),
        new Phaser.Math.Vector2(x + offset + lean + width * 0.5, this.rect.y),
        new Phaser.Math.Vector2(x + offset - lean + width * 0.5, this.rect.bottom),
        new Phaser.Math.Vector2(x + offset - lean, this.rect.bottom),
      ], true);
    }
  }

  public setVisible(visible: boolean): void {
    this.band.setVisible(visible && this.rect.width > 0 && !reducedMotion());
  }

  public destroy(): void {
    this.band.filters?.internal.clear();
    this.band.clearMask(true);
    this.band.destroy();
    this.shape.destroy();
  }
}
