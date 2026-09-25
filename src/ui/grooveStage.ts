import Phaser from 'phaser';
import { PALETTE, SHELL } from '@/config/theme';
import type { Viewport } from '@/core/Viewport';
import type { GrooveLevel } from '@/game/groove';
import { mix, shade } from './colour';
import { FxKey } from './feedback';
import { BRASS } from './panel';
import { beatPulse, grooveBlend, groovePose, type GroovePose } from './groove';

/**
 * The generic groove treatment every act gets: a warm pool of light behind the stage that
 * breathes with the bar, and a brass edge on the block's face. PlayScene tells it the
 * level and the bar; it decides nothing about the level and adds no cue.
 *
 * One tinted soft-disc Image, like the backdrop's own pool, and one stroke on a Graphics
 * the scene already clears each frame: no emitters, no filters, nothing allocated per
 * frame. It sits just over the act's backdrop and under the act itself, so the room
 * warms without anything in it being covered. The block stays the clearest thing on
 * screen: the rim is a line on its edge, never a tint over its sockets.
 */
const GLOW_DEPTH = -18;
/** The pool's colour: the workshop's sun leaning a little toward the coral. */
const GLOW_TINT = mix(SHELL.sun, PALETTE.coral, 0.18);
/** The pool's strength at full glow: the pose's alpha is scaled by this on the quad. */
const GLOW_GAIN = 0.6;

export class GrooveStage {
  private readonly glow: Phaser.GameObjects.Image;
  private readonly base = { x: 0, y: 0, size: 0 };
  private from: GrooveLevel = 0;
  private to: GrooveLevel = 0;
  private changedAt = -Infinity;
  private flareAt = -Infinity;
  private lastAlpha = -1;
  private destroyed = false;

  public constructor(scene: Phaser.Scene) {
    this.glow = scene.add.image(0, 0, FxKey.glow).setTint(GLOW_TINT).setAlpha(0).setDepth(GLOW_DEPTH).setVisible(false);
  }

  public layout(viewport: Viewport): void {
    const { full } = viewport;
    // Over the act's own middle, where the pool of the backdrop's key light already is.
    this.base.size = Math.max(full.width, full.height) * 1.1;
    this.base.x = full.x + full.width * 0.5;
    this.base.y = full.y + full.height * 0.42;
    this.lastAlpha = -1;
  }

  /** The level the room should show. A change starts the blend from wherever it was. */
  public show(level: GrooveLevel, now: number): void {
    if (level === this.to) return;
    this.from = Math.round(grooveBlend(this.from, this.to, now - this.changedAt)) as GrooveLevel;
    this.to = level;
    this.changedAt = now;
  }

  /** A Perfect hit: at level 3 the pool answers it. */
  public flare(now: number): void { this.flareAt = now; }

  /** A fresh attempt: the room at rest, at once. */
  public reset(): void {
    this.from = this.to = 0;
    this.changedAt = this.flareAt = -Infinity;
    this.lastAlpha = -1;
    if (!this.destroyed) this.glow.setAlpha(0).setVisible(false);
  }

  /**
   * One frame. `bar` is any bar line of the running plan and its tempo, or null when
   * nothing is playing, in which case the room does not breathe. Returns the pose so the
   * scene can draw the rim on the block it is already drawing.
   */
  public update(now: number, bar: { readonly origin: number; readonly bpm: number } | null, still: boolean): GroovePose {
    const amount = grooveBlend(this.from, this.to, now - this.changedAt, still);
    const pulse = beatPulse(now, bar?.origin ?? NaN, bar?.bpm ?? 0, still);
    const pose = groovePose(amount, pulse, now - this.flareAt, still);
    if (this.destroyed) return pose;
    const alpha = pose.glow * GLOW_GAIN;
    if (alpha <= 0.002) {
      if (this.lastAlpha !== 0) { this.glow.setAlpha(0).setVisible(false); this.lastAlpha = 0; }
      return pose;
    }
    const size = this.base.size * pose.scale;
    this.glow.setVisible(true).setAlpha(alpha).setPosition(this.base.x, this.base.y).setDisplaySize(size, size)
      .setTint(mix(GLOW_TINT, SHELL.sun, 1 - pose.warmth));
    this.lastAlpha = alpha;
    return pose;
  }

  /**
   * The brass edge on the block's face, drawn onto the block's own Graphics after the
   * block so it clears with it. A line on the outline, an inner highlight catching the
   * light: the face's colour and its sockets are untouched, so nothing on it is harder
   * to read for being lit.
   */
  public drawRim(
    g: Phaser.GameObjects.Graphics,
    face: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
    radius: number, s: number, pose: GroovePose,
  ): void {
    if (pose.rim <= 0.01) return;
    const inset = 1.5 * s;
    g.lineStyle(3.2 * s, BRASS, pose.rim * 0.9)
      .strokeRoundedRect(face.x - inset, face.y - inset, face.width + inset * 2, face.height + inset * 2, radius + inset);
    g.lineStyle(1.6 * s, shade(BRASS, 0.45), pose.rim * 0.55)
      .strokeRoundedRect(face.x + inset, face.y + inset, face.width - inset * 2, face.height - inset * 2, Math.max(2, radius - inset));
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.glow.destroy();
  }
}
