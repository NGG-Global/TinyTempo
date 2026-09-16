import Phaser from 'phaser';
import { STYLE } from '@/config/style';
import { PALETTE } from '@/config/theme';
import type { Viewport } from '@/core/Viewport';
import { MaterialKey } from '@/textures/materials';
import { mix } from './colour';
import { FxKey } from './feedback';

/**
 * The shared stage behind a vignette. The acts each filled the screen with their
 * own paper colour and one of them laid a grain over it; this is that, once: the ground
 * colour, a soft pool of warmer light from the shared light's side, and the paper fibre
 * over the whole frame so every surface in the game is on the same sheet.
 *
 * Every full-screen pass costs fill rate, which is the budget on a phone, so this uses
 * as few as possible: a paper that matches the game's clear colour costs nothing at all,
 * any other paper is the camera's background rather than a drawn rectangle, and the pool
 * is one large tinted soft-disc image rather than a gradient shader — a third of the
 * shader's cost under software rendering, and a plain textured quad on any GPU.
 */
export interface BackdropOptions {
  /** Where the pool of light sits, as fractions of the full frame. Defaults to the key light's side. */
  readonly glowAt?: { readonly x: number; readonly y: number };
  /** Strength of the pool. */
  readonly glowAlpha?: number;
}

const DEFAULT_GLOW_AT = { x: 0.38, y: 0.34 } as const;
/** How far the pool is tinted from the paper toward the light's own colour, at rest. */
const POOL_TINT = 0.7;

export class Backdrop {
  private readonly glow: Phaser.GameObjects.Image;
  private readonly fibre: Phaser.GameObjects.TileSprite;
  private readonly glowAt: { readonly x: number; readonly y: number };
  private readonly base: { x: number; y: number; size: number } = { x: 0, y: 0, size: 0 };
  private readonly baseAlpha: number;
  /** Travel of the pool when the turn passes to the player: down the frame and in toward it. */
  private readonly travel = { x: 0, y: 0 };
  private opened = 0;
  private destroyed = false;

  public constructor(private readonly scene: Phaser.Scene, private readonly paper: number, private readonly glowColour: number, options: BackdropOptions = {}) {
    this.glowAt = options.glowAt ?? DEFAULT_GLOW_AT;
    this.baseAlpha = options.glowAlpha ?? 0.85;
    this.ground();
    this.glow = scene.add.image(0, 0, FxKey.glow).setTint(mix(paper, this.glowColour, POOL_TINT)).setAlpha(this.baseAlpha).setDepth(-19);
    this.fibre = scene.add.tileSprite(0, 0, 1, 1, MaterialKey.paper).setOrigin(0).setDepth(-9).setAlpha(0.32 * STYLE.current.grain);
  }

  public layout(viewport: Viewport): void {
    const { full } = viewport;
    this.ground();
    this.base.size = Math.max(full.width, full.height) * 1.25;
    this.base.x = full.x + full.width * this.glowAt.x;
    this.base.y = full.y + full.height * this.glowAt.y;
    this.travel.x = (full.x + full.width * 0.5 - this.base.x) * 0.45;
    this.travel.y = full.height * 0.13;
    this.fibre.setPosition(full.x, full.y).setSize(full.width, full.height);
    this.open(this.opened);
  }

  /**
   * Open the pool toward the player, `amount` running 0 to 1 as their turn arrives. The
   * light is the second half of the handover: the headline and the beat track say whose
   * turn it is in words and marks, and the stage says it without either.
   *
   * A pure function of the amount, like every other motion here, so a caller can sample it
   * from the audio clock and a dropped frame costs nothing but that frame.
   */
  public open(amount: number): void {
    const t = Math.min(1, Math.max(0, amount));
    const size = this.base.size * (1 + 0.14 * t);
    // Every vignette samples this every frame. After the handover the amount is 0 or 1
    // forever, and rewriting tint/size/alpha on a full-screen quad is fill-rate waste.
    if (t === this.opened && this.glow.displayWidth === size) return;
    this.opened = t;
    // Warmed as well as moved: on a pale stage another tenth of alpha on an already-open
    // pool is invisible, and it is the change in colour that reads as a light coming up.
    this.glow.setTint(mix(this.paper, this.glowColour, POOL_TINT + 0.28 * t))
      .setPosition(this.base.x + this.travel.x * t, this.base.y + this.travel.y * t)
      .setDisplaySize(size, size)
      .setAlpha(Math.min(1, this.baseAlpha + 0.15 * t));
  }

  private ground(): void {
    if (this.paper !== PALETTE.paper) this.scene.cameras?.main?.setBackgroundColor(this.paper);
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    // A scene's camera outlives its vignette: the next one must not inherit this paper.
    if (this.paper !== PALETTE.paper) this.scene.cameras?.main?.setBackgroundColor(PALETTE.paper);
    this.glow.destroy();
    this.fibre.destroy();
  }
}
