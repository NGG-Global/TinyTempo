import type Phaser from 'phaser';
import { STYLE } from '@/config/style';

/**
 * Particle feedback from generated textures. Bursts are decorative — they answer a
 * moment that has already been judged — so, like the scene curtain, they may run on
 * Phaser's frame delta. Nothing a player is asked to hit is timed by them.
 *
 * One persistent emitter per preset per scene, fired with `explode`, so a burst costs
 * no allocation and the scene destroys them once at shutdown.
 */
export const FxKey = Object.freeze({ dot: 'fx-dot', chip: 'fx-chip', glow: 'fx-glow' });

export function generateFeedbackTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(FxKey.dot)) {
    const size = 32;
    const texture = scene.textures.createCanvas(FxKey.dot, size, size);
    if (texture) {
      const ctx = texture.getContext();
      const glow = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      glow.addColorStop(0, 'rgba(255,255,255,1)');
      glow.addColorStop(0.55, 'rgba(255,255,255,0.85)');
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size, size);
      texture.refresh();
    }
  }
  // A large soft disc for pools of light. One tinted Image gives a true radial falloff on
  // both renderers, where the previous flat circle or a stack of banded circles did not.
  if (!scene.textures.exists(FxKey.glow)) {
    const size = 512;
    const texture = scene.textures.createCanvas(FxKey.glow, size, size);
    if (texture) {
      const ctx = texture.getContext();
      const pool = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      pool.addColorStop(0, 'rgba(255,255,255,1)');
      pool.addColorStop(0.5, 'rgba(255,255,255,0.8)');
      pool.addColorStop(0.82, 'rgba(255,255,255,0.22)');
      pool.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = pool;
      ctx.fillRect(0, 0, size, size);
      texture.refresh();
    }
  }
  if (!scene.textures.exists(FxKey.chip)) {
    const texture = scene.textures.createCanvas(FxKey.chip, 16, 10);
    if (texture) {
      const ctx = texture.getContext();
      ctx.fillStyle = 'rgba(255,255,255,1)';
      ctx.fillRect(0, 0, 16, 10);
      texture.refresh();
    }
  }
}

type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;
type Preset = 'dust' | 'chips' | 'sparks' | 'confetti' | 'water';

export class Feedback {
  private readonly emitters = new Map<Preset, Emitter>();
  /** With a `parent`, emitters live in that container and burst in its local space. */
  public constructor(private readonly scene: Phaser.Scene, private readonly depth: number, private readonly parent?: Phaser.GameObjects.Container) {}

  private emitter(preset: Preset, tint: number | number[]): Emitter {
    const existing = this.emitters.get(preset);
    // An array is a palette Phaser picks from per particle. Keeping only the first
    // colour made every burst after the emitter was created a single flat tint, so a
    // later Perfect and the flawless sweep no longer matched the colours they asked for.
    if (existing) { existing.setParticleTint(tint); return existing; }
    const config: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig = { emitting: false, tint };
    switch (preset) {
      case 'dust':
        Object.assign(config, { speed: { min: 60, max: 190 }, angle: { min: 200, max: 340 }, gravityY: 420,
          lifespan: { min: 320, max: 620 }, scale: { start: 0.55, end: 0.05 }, alpha: { start: 0.9, end: 0 } });
        break;
      case 'chips':
        Object.assign(config, { speed: { min: 140, max: 320 }, angle: { min: 210, max: 330 }, gravityY: 900, rotate: { min: 0, max: 360 },
          lifespan: { min: 400, max: 800 }, scale: { start: 0.9, end: 0.5 }, alpha: { start: 1, end: 0.2 } });
        break;
      case 'sparks':
        Object.assign(config, { speed: { min: 180, max: 420 }, angle: { min: 0, max: 360 }, gravityY: 300, blendMode: 'ADD',
          lifespan: { min: 180, max: 420 }, scale: { start: 0.45, end: 0 }, alpha: { start: 1, end: 0 } });
        break;
      case 'confetti':
        Object.assign(config, { speed: { min: 200, max: 460 }, angle: { min: 230, max: 310 }, gravityY: 700, rotate: { start: 0, end: 540 },
          lifespan: { min: 900, max: 1500 }, scale: { start: 1, end: 0.7 }, alpha: { start: 1, end: 0.6 } });
        break;
      case 'water':
        // Droplets: thrown low and short, falling fast, gone before they read as confetti.
        Object.assign(config, { speed: { min: 40, max: 150 }, angle: { min: 20, max: 160 }, gravityY: 1100,
          lifespan: { min: 220, max: 420 }, scale: { start: 0.35, end: 0.12 }, alpha: { start: 0.9, end: 0 } });
        break;
    }
    const texture = preset === 'chips' || preset === 'confetti' ? FxKey.chip : FxKey.dot;
    const emitter = this.scene.add.particles(0, 0, texture, config).setDepth(this.depth);
    this.parent?.add(emitter);
    this.emitters.set(preset, emitter);
    return emitter;
  }

  /** Fire a burst at a point. Counts scale with the treatment's exaggeration. */
  public burst(preset: Preset, x: number, y: number, tint: number | number[], count: number): void {
    const n = Math.round(count * STYLE.current.exaggeration);
    if (n <= 0) return;
    this.emitter(preset, tint).explode(n, x, y);
  }

  public destroy(): void {
    for (const emitter of this.emitters.values()) emitter.destroy();
    this.emitters.clear();
  }
}
