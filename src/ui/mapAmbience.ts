import type Phaser from 'phaser';
import { FxKey } from './feedback';

/**
 * One quiet ambient layer per area on the map: pollen over the grass, a breathing glow on
 * the street lamps, dust over the sand, snowfall, fireflies at dusk, petals in the garden,
 * mist over the swamp, leaves tumbling through the village and embers rising off the
 * castle's torches (which glow, as the lamps do). The frontier's hop and its ring used to be
 * the only life on the road.
 *
 * Bounded by construction: a fixed pool of `AMBIENCE.motes` images and `AMBIENCE.lamps`
 * glows, made once and never more, so nothing grows with the length of the road or the
 * time spent on it. Each mote's position is a pure function of its seed, the time and the
 * view (`motePose`), so nothing is stepped, nothing accumulates, and a dropped frame costs
 * that frame. Every mote is world-anchored: it keeps its place on the ground as the road
 * scrolls, and wraps round only outside the view, so none is ever seen to jump.
 *
 * It sits behind every stop, gate, plate and number — over the ground and under the props
 * — and is off entirely under reduced motion and while the window is not focused.
 */
export const AMBIENCE = Object.freeze({
  /** Motes in the pool. Every one is on screen; there is no off-screen work. */
  motes: 32,
  /** Glows for the lamps in view. A lamp past the eighth in view goes unlit. */
  lamps: 8,
  /** World units beyond the view a mote may wander before it wraps. */
  margin: 90,
  /** A mote fades out this far from its area's seam, so it never changes kind in view. */
  seamFade: 70,
  /** Between the ground layer (0) and the props and stops (1). */
  depth: 0.75,
});

/** Which ambience an area carries, by its index in `AREAS`: the same index the props use. */
export type AmbienceKind = 'pollen' | 'lamps' | 'dust' | 'snow' | 'fireflies' | 'petals' | 'mist' | 'leaves' | 'embers';
export const AMBIENCE_BY_AREA: readonly AmbienceKind[] = Object.freeze(['pollen', 'lamps', 'dust', 'snow', 'fireflies', 'petals', 'mist', 'leaves', 'embers']);

/** The rectangle of world the camera shows. */
export interface AmbienceView { readonly left: number; readonly top: number; readonly width: number; readonly height: number }

export interface MotePose {
  readonly x: number;
  readonly y: number;
  /** Before the seam fade. */
  readonly alpha: number;
  /** In units of the dot texture's 32 px. */
  readonly scale: number;
  readonly tint: number;
  /** Whether it glows (additive) rather than lies on the paint. */
  readonly glow: boolean;
  /** A tumbling leaf is the irregular flake, turned; everything else is the round dot. */
  readonly flake: boolean;
  readonly angle: number;
}

/** `value` wrapped into `[from, from + span)`. */
function wrap(value: number, from: number, span: number): number {
  return from + (((value - from) % span) + span) % span;
}

/** Three stable numbers in [0, 1) for mote `i`, so a mote is the same mote every frame. */
export function moteSeed(i: number): readonly [number, number, number] {
  const f = (k: number) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
  return [f(1), f(2), f(3)];
}

/**
 * Where mote `i` of `kind` is at time `t`. `s` is the scene's scale, so drift and size read
 * the same on every frame. Null for a kind that carries no motes (the lamps glow instead).
 */
export function motePose(kind: AmbienceKind, i: number, t: number, view: AmbienceView, s: number): MotePose | null {
  if (kind === 'lamps') return null;
  const [a, b, c] = moteSeed(i);
  const m = AMBIENCE.margin * s;
  const spanX = view.width + m * 2, spanY = view.height + m * 2;
  const fromX = view.left - m, fromY = view.top - m;
  const phase = c * Math.PI * 2;
  let dx = 0, dy = 0, alpha = 1, scale = 0.3, tint = 0xffffff, glow = false, flake = false, angle = 0;
  switch (kind) {
    case 'pollen':
      // Drifting down and across on a light breeze, turning as it goes.
      dx = 10 * s * t + Math.sin(t * 0.9 + phase) * 14 * s;
      dy = 7 * s * t + Math.cos(t * 0.7 + phase) * 6 * s;
      alpha = 0.55; scale = 0.18 + 0.14 * b; tint = c < 0.5 ? 0xf6e7a6 : 0xdfe9b6;
      break;
    case 'dust':
      // Low and sideways, as heat moves it.
      dx = 22 * s * t + Math.sin(t * 0.5 + phase) * 8 * s;
      dy = -2 * s * t + Math.sin(t * 1.1 + phase) * 5 * s;
      alpha = 0.5; scale = 0.16 + 0.12 * b; tint = 0xfbefd2;
      break;
    case 'snow':
      dx = Math.sin(t * 1.3 + phase) * 18 * s + 4 * s * t;
      dy = (22 + 12 * b) * s * t;
      alpha = 0.9; scale = 0.16 + 0.2 * b; tint = 0xffffff;
      break;
    case 'fireflies':
      // Wandering in place, and blinking rather than shining.
      dx = Math.sin(t * 0.37 + phase) * 42 * s;
      dy = Math.cos(t * 0.29 + phase * 1.3) * 30 * s;
      alpha = Math.max(0, Math.sin(t * (1.1 + b) + phase)) ** 1.5;
      scale = 0.26 + 0.12 * b; tint = 0xf4f0a0; glow = true;
      break;
    case 'petals':
      // Falling slower than leaves and swaying wider, pink and white.
      dx = 8 * s * t + Math.sin(t * 1.4 + phase) * 18 * s;
      dy = 9 * s * t + Math.cos(t * 1.1 + phase) * 5 * s;
      alpha = 0.75; scale = 0.2 + 0.12 * b; tint = c < 0.5 ? 0xf7b8c6 : 0xfff1f0;
      break;
    case 'mist':
      // Large, faint and slow: a bank drifting across the water, never a mote.
      dx = 6 * s * t + Math.sin(t * 0.13 + phase) * 30 * s;
      dy = Math.sin(t * 0.09 + phase) * 10 * s;
      alpha = 0.12 + 0.06 * (1 + Math.sin(t * 0.3 + phase)) / 2; scale = 1.1 + 1.0 * b; tint = 0xe8f0d8;
      break;
    case 'leaves':
      // Tumbling down on the wind, turning over as they go.
      dx = 14 * s * t + Math.sin(t * 1.2 + phase) * 22 * s;
      dy = 16 * s * t + Math.cos(t * 2.1 + phase) * 4 * s;
      alpha = 0.85; scale = 0.18 + 0.1 * b; tint = c < 0.34 ? 0xd9622b : c < 0.67 ? 0xe9a23b : 0xb8452f;
      flake = true; angle = t * (1.2 + b) + phase;
      break;
    case 'embers':
      // Rising off the torches, wavering, and going out.
      dx = Math.sin(t * 0.8 + phase) * 10 * s;
      dy = -(14 + 10 * b) * s * t;
      alpha = Math.max(0, Math.sin(t * (2.2 + b) + phase)) * 0.9;
      scale = 0.1 + 0.08 * b; tint = 0xffa64d; glow = true;
      break;
  }
  return {
    // Homes are laid out on the world, one per span, and wrapped into the view's span: the
    // view moving changes which copy is shown, never where on the ground it stands.
    x: wrap(a * spanX + dx, fromX, spanX),
    y: wrap(b * spanY + dy, fromY, spanY),
    alpha, scale, tint, glow, flake, angle,
  };
}

/** How strongly a lamp's glow breathes at `t`: a slow swell, each lamp on its own phase. */
export function lampBreath(t: number, i: number): number {
  return 0.22 + 0.12 * Math.sin(t * 1.6 + moteSeed(i)[2] * Math.PI * 2);
}

/** Fades a mote to nothing at its area's seams, so a change of kind is never seen. */
export function seamFade(y: number, top: number, bottom: number, s: number): number {
  const reach = AMBIENCE.seamFade * s;
  return Math.max(0, Math.min(1, (y - top) / reach, (bottom - y) / reach));
}

/** An area's band of world, top to bottom, and which ambience it carries. */
export interface AmbienceBand { readonly top: number; readonly bottom: number; readonly kind: AmbienceKind }

/** The pool, and the one call a frame that poses it. */
export class MapAmbience {
  private readonly motes: Phaser.GameObjects.Image[];
  private readonly glows: Phaser.GameObjects.Image[];
  private shown = true;

  public constructor(scene: Phaser.Scene) {
    this.motes = Array.from({ length: AMBIENCE.motes }, () => scene.add.image(0, 0, FxKey.dot).setDepth(AMBIENCE.depth).setVisible(false));
    this.glows = Array.from({ length: AMBIENCE.lamps }, () => scene.add.image(0, 0, FxKey.glow).setDepth(AMBIENCE.depth).setTint(0xf6e6bc).setVisible(false));
  }

  /** Off: every image hidden, and `update` does nothing until it is on again. */
  public setShown(shown: boolean): void {
    if (shown === this.shown) return;
    this.shown = shown;
    if (!shown) for (const image of [...this.motes, ...this.glows]) image.setVisible(false);
  }

  /**
   * Pose every mote for the view at time `t`. `bands` says which area holds which stretch of
   * world, and `lamps` where the street lamps' heads are, both from the map's bake.
   */
  public update(t: number, view: AmbienceView, s: number, bands: readonly AmbienceBand[], lamps: readonly { readonly x: number; readonly y: number; readonly k: number }[]): void {
    if (!this.shown) return;
    this.motes.forEach((image, i) => {
      // Which band the mote's home falls in decides what it is. Sampled at its pose under the
      // band's own kind, then faded at the seams, so the kind never flips in view.
      let posed: { pose: MotePose; band: AmbienceBand } | null = null;
      for (const band of bands) {
        const pose = motePose(band.kind, i, t, view, s);
        if (pose && pose.y >= band.top && pose.y < band.bottom) { posed = { pose, band }; break; }
      }
      if (!posed) { image.setVisible(false); return; }
      const { pose, band } = posed;
      const alpha = pose.alpha * seamFade(pose.y, band.top, band.bottom, s);
      if (alpha <= 0.01) { image.setVisible(false); return; }
      // The flake is 14 px against the dot's 32, so it is scaled up to the same size.
      const texture = pose.flake ? FxKey.flake : FxKey.dot;
      if (image.texture.key !== texture) image.setTexture(texture);
      image.setVisible(true).setPosition(pose.x, pose.y).setScale(pose.scale * s * 2 * (pose.flake ? 32 / 14 : 1)).setAlpha(alpha).setTint(pose.tint)
        .setRotation(pose.angle).setBlendMode(pose.glow ? 'ADD' : 'NORMAL');
    });
    let lit = 0;
    for (const lamp of lamps) {
      if (lit >= this.glows.length) break;
      if (lamp.y < view.top - AMBIENCE.margin * s || lamp.y > view.top + view.height + AMBIENCE.margin * s) continue;
      const size = 150 * lamp.k;
      this.glows[lit]!.setVisible(true).setPosition(lamp.x, lamp.y).setDisplaySize(size, size).setAlpha(lampBreath(t, lit));
      lit++;
    }
    for (let i = lit; i < this.glows.length; i++) if (this.glows[i]!.visible) this.glows[i]!.setVisible(false);
  }
}
