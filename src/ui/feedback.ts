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
export const FxKey = Object.freeze({
  dot: 'fx-dot', chip: 'fx-chip', glow: 'fx-glow', vignette: 'fx-vignette',
  // Material bits: what a struck thing actually throws, rather than one dot for everything.
  splinter: 'fx-splinter', droplet: 'fx-droplet', ring: 'fx-ring', flake: 'fx-flake',
});

/** A white texture drawn once by `paint`, tinted per particle like the others. */
function materialTexture(scene: Phaser.Scene, key: string, width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void): void {
  if (scene.textures.exists(key)) return;
  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) return;
  const ctx = texture.getContext();
  ctx.fillStyle = 'rgba(255,255,255,1)';
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  paint(ctx);
  texture.refresh();
}

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
  // The glow's inverse: clear across the middle, darkening toward the edges and wholly so
  // in the corners. One tinted image stretched over the frame is the handover's dim — the
  // room's edges step back and the act and the block stay in the light — for the same
  // reason the pool is an image: a true falloff, one textured quad, no gradient drawn per
  // frame and no shader pass.
  if (!scene.textures.exists(FxKey.vignette)) {
    const size = 256;
    const texture = scene.textures.createCanvas(FxKey.vignette, size, size);
    if (texture) {
      const ctx = texture.getContext();
      const edge = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      edge.addColorStop(0, 'rgba(255,255,255,0)');
      edge.addColorStop(0.5, 'rgba(255,255,255,0)');
      edge.addColorStop(0.78, 'rgba(255,255,255,0.45)');
      edge.addColorStop(1, 'rgba(255,255,255,1)');
      ctx.fillStyle = edge;
      ctx.fillRect(0, 0, size, size);
      texture.refresh();
    }
  }
  // A thin sliver tapering at both ends: wood, not a square chip.
  materialTexture(scene, FxKey.splinter, 24, 6, ctx => {
    ctx.beginPath();
    ctx.moveTo(0, 3); ctx.quadraticCurveTo(8, 0.5, 24, 2.4); ctx.lineTo(24, 3.6); ctx.quadraticCurveTo(8, 5.5, 0, 3);
    ctx.fill();
  });
  // A teardrop, round end down, as a drop falls.
  materialTexture(scene, FxKey.droplet, 16, 22, ctx => {
    ctx.beginPath();
    ctx.moveTo(8, 0.5); ctx.bezierCurveTo(9.5, 6, 15.5, 10, 15.5, 14.5); ctx.arc(8, 14.5, 7.5, 0, Math.PI); ctx.bezierCurveTo(0.5, 10, 6.5, 6, 8, 0.5);
    ctx.fill();
  });
  // A hollow ring for a puff of air: it grows rather than flies.
  materialTexture(scene, FxKey.ring, 32, 32, ctx => {
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(16, 16, 13.5, 0, Math.PI * 2);
    ctx.stroke();
  });
  // An irregular flake: plaster, paint, shell — something brittle that tumbles.
  materialTexture(scene, FxKey.flake, 14, 14, ctx => {
    ctx.beginPath();
    ctx.moveTo(3, 1); ctx.lineTo(12, 3); ctx.lineTo(13, 9); ctx.lineTo(6, 13); ctx.lineTo(1, 8);
    ctx.closePath();
    ctx.fill();
  });
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
export type Preset = 'dust' | 'chips' | 'sparks' | 'confetti' | 'water' | 'splinters' | 'droplets' | 'rings' | 'flakes';

/** Which texture each preset throws. */
const PRESET_TEXTURE: Readonly<Record<Preset, string>> = {
  dust: FxKey.dot, chips: FxKey.chip, sparks: FxKey.dot, confetti: FxKey.chip, water: FxKey.dot,
  splinters: FxKey.splinter, droplets: FxKey.droplet, rings: FxKey.ring, flakes: FxKey.flake,
};

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
      case 'splinters':
        // Chips' throw, lighter and longer-lived: a sliver spins and floats a moment.
        Object.assign(config, { speed: { min: 120, max: 280 }, angle: { min: 205, max: 335 }, gravityY: 760, rotate: { min: 0, max: 360 },
          lifespan: { min: 420, max: 780 }, scale: { start: 1, end: 0.7 }, alpha: { start: 1, end: 0.15 } });
        break;
      case 'droplets':
        // Juice off a blade: up and out, then straight down, gone before it can bounce.
        Object.assign(config, { speed: { min: 70, max: 210 }, angle: { min: 215, max: 325 }, gravityY: 1250,
          lifespan: { min: 280, max: 520 }, scale: { start: 0.62, end: 0.3 }, alpha: { start: 0.95, end: 0.1 } });
        break;
      case 'rings':
        // A burst bubble's air: barely moving, opening out and fading.
        Object.assign(config, { speed: { min: 8, max: 40 }, angle: { min: 0, max: 360 },
          lifespan: { min: 260, max: 420 }, scale: { start: 0.35, end: 1.25 }, alpha: { start: 0.85, end: 0 } });
        break;
      case 'flakes':
        Object.assign(config, { speed: { min: 60, max: 180 }, angle: { min: 200, max: 340 }, gravityY: 520, rotate: { start: 0, end: 300 },
          lifespan: { min: 420, max: 760 }, scale: { start: 0.8, end: 0.55 }, alpha: { start: 1, end: 0.1 } });
        break;
    }
    const texture = PRESET_TEXTURE[preset];
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
