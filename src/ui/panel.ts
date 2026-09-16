import Phaser from 'phaser';
import { STYLE, type Treatment } from '@/config/style';
import { MaterialKey } from '@/textures/materials';
import { shade } from './colour';
import { castShadow, faces } from './light';

/**
 * The one panel drawer. Four separate call sites used to draw a rounded rectangle with
 * a hairline stroke at 20% alpha and a translucent copy of itself offset a few units
 * down — `box-shadow` and `border` transcribed into Graphics. A panel here is a solid
 * with thickness: a cast shadow from the shared light, a shade face that reads as the
 * side wall, a lit face, a catch of rim light along the top, and whatever the treatment
 * dresses it with: the workshop's thick cartoon outline, and a painted frame line on a hero.
 */
export interface PanelSpec {
  readonly fill: number;
  /** Thickness of the slab in design units at scale 1. */
  readonly depth?: number;
  /** 0 at rest, 1 fully pressed: the face sinks toward the side wall and the shadow tightens. */
  readonly press?: number;
  readonly radius?: number;
  /** Draw the painted accent frame inside the face, for the title and the one action. */
  readonly hero?: boolean;
}

export const BRASS = 0xd4a54a;

export function drawPanel(g: Phaser.GameObjects.Graphics, r: Phaser.Geom.Rectangle, s: number, spec: PanelSpec, t: Treatment = STYLE.current): void {
  const depth = (spec.depth ?? 10) * s;
  const press = spec.press ?? 0;
  const radius = Math.min(r.height / 2, (spec.radius ?? t.radius) * s);
  const f = faces(spec.fill);
  const sink = depth * press * 0.8;
  const shadow = castShadow((spec.depth ?? 10) * (1 - press * 0.6));

  g.fillStyle(0x1a1410, shadow.alpha);
  g.fillRoundedRect(r.x + shadow.dx * s, r.y + shadow.dy * s + depth, r.width, r.height, radius);
  // Side wall, then a contact strip along the bottom. The strip is a flat inset rather
  // than a full-width small-radius rounded rect: that older pair, plus a stroke around
  // the thickness, drew dark ticks out of the two bottom corners.
  g.fillStyle(f.shade, 1).fillRoundedRect(r.x, r.y + depth, r.width, r.height, radius);
  const edgeH = Math.max(2, 3 * s);
  const edgeInset = Math.max(radius * 0.55, 8 * s);
  g.fillStyle(f.edge, 1).fillRect(r.x + edgeInset, r.y + depth + r.height - edgeH, Math.max(0, r.width - edgeInset * 2), edgeH);
  // Face.
  g.fillStyle(f.face, 1).fillRoundedRect(r.x, r.y + sink, r.width, r.height, radius);
  // Rim light along the top of the face, where the shared light catches the edge.
  g.fillStyle(f.rim, 0.55 - press * 0.3).fillRoundedRect(r.x + radius * 0.6, r.y + sink + 2 * s, r.width - radius * 1.2, Math.max(2, 3.5 * s), 2 * s);
  if (t.outline > 0) g.lineStyle(t.outline * s * 0.55, shade(spec.fill, -0.6), 1).strokeRoundedRect(r.x, r.y + sink, r.width, r.height, radius);
  // A painted frame line inside the face of a hero.
  if (spec.hero) {
    const inset = 7 * s;
    g.lineStyle(2 * s, BRASS, 0.6).strokeRoundedRect(r.x + inset, r.y + sink + inset, r.width - inset * 2, r.height - inset * 2, Math.max(2, radius - inset));
  }
}

/** A round control: the same slab, as a puck. */
export function drawDisc(g: Phaser.GameObjects.Graphics, x: number, y: number, radius: number, s: number, spec: PanelSpec, t: Treatment = STYLE.current): void {
  const depth = (spec.depth ?? 8) * s;
  const press = spec.press ?? 0;
  const f = faces(spec.fill);
  const sink = depth * press * 0.8;
  const shadow = castShadow((spec.depth ?? 8) * (1 - press * 0.6));
  g.fillStyle(0x1a1410, shadow.alpha).fillEllipse(x + shadow.dx * s, y + shadow.dy * s + depth, radius * 2.1, radius * 2);
  g.fillStyle(f.shade, 1).fillCircle(x, y + depth, radius);
  if (t.outline > 0) g.lineStyle(t.outline * s * 0.55, f.edge, 1).strokeCircle(x, y + depth, radius);
  g.fillStyle(f.face, 1).fillCircle(x, y + sink, radius);
  g.fillStyle(f.rim, 0.5 - press * 0.3).fillEllipse(x, y + sink - radius * 0.62, radius * 1.1, radius * 0.22);
  if (t.outline > 0) g.lineStyle(t.outline * s * 0.55, shade(spec.fill, -0.6), 1).strokeCircle(x, y + sink, radius);
}

/**
 * A material laid over a panel face: a tinted tile, inset by the corner radius so the
 * flat corners of the rectangle stay under the rounded outline. Low alpha, because a
 * material on a control is a surface finish, not a picture of wood.
 */
export function surface(scene: Phaser.Scene, key: MaterialKey, r: Phaser.Geom.Rectangle, s: number, colour: number, alpha: number, t: Treatment = STYLE.current): Phaser.GameObjects.TileSprite {
  const inset = t.radius * s * 0.7;
  const tile = scene.add.tileSprite(r.x + inset, r.y + inset, Math.max(1, r.width - inset * 2), Math.max(1, r.height - inset * 2), key)
    .setOrigin(0).setTint(colour).setAlpha(alpha * t.grain);
  // Tiles are authored at 256 for a 3x display; at design scale they need to read at ~1.3x.
  tile.setTileScale(1.3 * s, 1.3 * s);
  return tile;
}

/** Keep a surface tile on its panel after a layout or a press. */
export function placeSurface(tile: Phaser.GameObjects.TileSprite, r: Phaser.Geom.Rectangle, s: number, sink = 0, t: Treatment = STYLE.current): void {
  const inset = t.radius * s * 0.7;
  tile.setPosition(r.x + inset, r.y + inset + sink).setSize(Math.max(1, r.width - inset * 2), Math.max(1, r.height - inset * 2));
  tile.setTileScale(1.3 * s, 1.3 * s);
}

export const Rect = Phaser.Geom.Rectangle;
