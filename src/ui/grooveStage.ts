import Phaser from 'phaser';
import { PALETTE, SHELL } from '@/config/theme';
import type { Viewport } from '@/core/Viewport';
import type { GrooveLevel } from '@/game/groove';
import { mix, shade } from './colour';
import { FxKey } from './feedback';
import { BRASS } from './panel';
import { beatPulse, GrooveEnvelope, grooveActivation, groovePose, type GroovePose } from './groove';

/**
 * The generic groove treatment every act gets: a warm pool of light behind the stage that
 * breathes with the bar, and a brass edge on the block's face. PlayScene tells it the
 * level and the bar; it decides nothing about the level and adds no cue.
 *
 * Three reused soft-disc Images, a static corner trim, and strokes on the block's own
 * Graphics: no emitters, filters, or per-frame pose allocations. Light sits just over
 * the act's backdrop and under the act itself, so the room
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
  private readonly envelope = new GrooveEnvelope();
  private readonly pulse = { beat: 0, phase: 0, strength: 0 };
  private readonly pose = groovePose(0, this.pulse, Infinity);
  private to: GrooveLevel = 0;
  private activationAt = -Infinity;
  private activationLevel: GrooveLevel = 0;
  private readonly left: Phaser.GameObjects.Image;
  private readonly right: Phaser.GameObjects.Image;
  private readonly trim: Phaser.GameObjects.Graphics;
  private width = 0;
  private barOrigin = NaN;
  private bpm = 0;
  private flareAt = -Infinity;
  private lastAlpha = -1;
  private destroyed = false;

  public constructor(scene: Phaser.Scene) {
    this.glow = scene.add.image(0, 0, FxKey.glow).setTint(GLOW_TINT).setAlpha(0).setDepth(GLOW_DEPTH).setVisible(false);
    this.left = scene.add.image(0, 0, FxKey.glow).setTint(SHELL.cream).setDepth(GLOW_DEPTH).setAlpha(0);
    this.right = scene.add.image(0, 0, FxKey.glow).setTint(SHELL.sun).setDepth(GLOW_DEPTH).setAlpha(0);
    this.trim = scene.add.graphics().setDepth(-8).setAlpha(0);
  }

  public layout(viewport: Viewport): void {
    const { full } = viewport;
    // Over the act's own middle, where the pool of the backdrop's key light already is.
    this.base.size = Math.max(full.width, full.height) * 1.1;
    this.base.x = full.x + full.width * 0.5;
    this.base.y = full.y + full.height * 0.42;
    this.width = full.width;
    this.left.setPosition(full.x + full.width * 0.08, this.base.y).setDisplaySize(full.width * 0.48, full.height * 0.56);
    this.right.setPosition(full.x + full.width * 0.92, this.base.y).setDisplaySize(full.width * 0.48, full.height * 0.56);
    // Brass corner catches on the room's sides. Draw once per layout; only light changes.
    const s = Math.min(full.width / 720, full.height / 1150);
    const x = full.x + full.width * 0.06, y = this.base.y - full.height * 0.08;
    const right = full.x + full.width * 0.94, bottom = this.base.y + full.height * 0.12;
    this.trim.clear().lineStyle(2.5 * s, BRASS, 0.75).beginPath()
      .moveTo(x, y + 48 * s).lineTo(x, y + 12 * s).lineTo(x + 12 * s, y).lineTo(x + 42 * s, y)
      .moveTo(right, bottom - 48 * s).lineTo(right, bottom - 12 * s).lineTo(right - 12 * s, bottom).lineTo(right - 42 * s, bottom).strokePath();
    this.trim.fillStyle(SHELL.cream, 0.9).fillCircle(x, y + 60 * s, 2 * s).fillCircle(right, bottom - 60 * s, 2 * s);
    this.lastAlpha = -1;
  }

  /** The level the room should show. A change starts the blend from wherever it was. */
  public show(level: GrooveLevel, now: number, activateAt?: number): void {
    if (!this.envelope.show(level, now)) return;
    if (level > this.to && level >= 2 && activateAt !== undefined) {
      this.activationAt = activateAt;
      this.activationLevel = level;
    } else this.activationAt = -Infinity;
    this.to = level;
  }

  /** A Perfect hit: at level 3 the pool answers it. */
  public flare(now: number): void { if (this.to === 3) this.flareAt = now; }

  /** A fresh attempt: the room at rest, at once. */
  public reset(): void {
    this.envelope.reset();
    this.to = 0;
    this.activationAt = this.flareAt = -Infinity;
    this.barOrigin = NaN;
    this.bpm = 0;
    this.lastAlpha = -1;
    if (!this.destroyed) { this.glow.setAlpha(0).setVisible(false); this.left.setAlpha(0); this.right.setAlpha(0); this.trim.setAlpha(0); }
  }

  /**
   * One frame. `bar` is any bar line of the running plan and its tempo, or null when
   * between plans, in which case the last heard clock continues. Returns the pose so the
   * scene can draw the rim on the block it is already drawing.
   */
  public update(now: number, bar: { readonly origin: number; readonly bpm: number; readonly from?: number } | null, still: boolean): GroovePose {
    const amount = this.envelope.amount(now);
    // The next plan is installed during the slide, before its tempo is audible.
    // Keep the previous clock through that gap and through a temporarily null plan.
    if (bar && now >= (bar.from ?? -Infinity)) { this.barOrigin = bar.origin; this.bpm = bar.bpm; }
    const pulse = beatPulse(now, this.barOrigin, this.bpm, still || this.to === 0, this.pulse);
    const pose = groovePose(amount, pulse, now - this.flareAt, still, this.pose);
    if (this.destroyed) return pose;
    const activation = grooveActivation(now - this.activationAt, this.activationLevel, still);
    const alpha = pose.glow * GLOW_GAIN + activation * 0.1;
    this.left.setAlpha(pose.sides * 0.34 + activation * 0.07);
    this.right.setAlpha(pose.sides * 0.3 + activation * 0.07);
    this.trim.setAlpha(pose.sides * 0.85 + activation * 0.1);
    if (alpha <= 0.002) {
      if (this.lastAlpha !== 0) { this.glow.setAlpha(0).setVisible(false); this.lastAlpha = 0; }
      return pose;
    }
    const size = this.base.size * (pose.scale + (still ? 0 : activation * 0.065));
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
    // At 3 the brass catches a second light. Fixed corner inlays, never moving sockets.
    if (pose.glint > 0.01) {
      const span = Math.min(face.width * 0.18, this.width * 0.09);
      g.lineStyle(3 * s, SHELL.cream, pose.glint);
      g.lineBetween(face.x + radius, face.y - inset, face.x + radius + span, face.y - inset);
      g.lineBetween(face.x + face.width - radius - span, face.y + face.height + inset, face.x + face.width - radius, face.y + face.height + inset);
    }
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.glow.destroy();
    this.left.destroy();
    this.right.destroy();
    this.trim.destroy();
  }
}
