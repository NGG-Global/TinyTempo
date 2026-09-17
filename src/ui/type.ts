import type Phaser from 'phaser';
import { STYLE, type Treatment } from '@/config/style';
import { PALETTE, SHELL } from '@/config/theme';
import { hex, relativeLuminance, shade, typeStroke } from './colour';

/**
 * The type system. One display face and one body face per treatment, both bundled and
 * registered by `load.font()` before the menu builds, replacing Georgia headlines and
 * sixteen letter-spaced monospace eyebrows — the pairing that read most as a web page,
 * and one that was not even stable across devices, since Android ships no Georgia.
 *
 * Dressing scales with the size, so a headline and a caption in the same treatment
 * carry the same weight of stroke and shadow relative to their letterforms.
 */

type TextStyle = Phaser.Types.GameObjects.Text.TextStyle;

/** A hard drop under the letter and its outline: the printed-sticker look. Dark and close. */
function shadowFor(colour: number, size: number): NonNullable<TextStyle['shadow']> {
  const drop = relativeLuminance(colour) > 0.45 ? shade(PALETTE.ink, -0.25) : shade(colour, -0.7);
  return { offsetX: 0, offsetY: Math.max(1, size * 0.07), color: hex(drop), blur: 0, fill: true, stroke: true };
}

/** Below this the outline is tapered; a headline at or above it carries its full weight. */
const FULL_WEIGHT_SIZE = 44;

function strokeFor(t: Treatment, size: number): number {
  // The outline weight tracks the treatment's silhouette weight so type and object agree.
  // It tapers below headline size, though: a stroke that stays proportional all the way
  // down fills in Fredoka's counters, and a 28px value reads as a smudge rather than a
  // word. The outline is there to give a large letter a cartoon silhouette, and a small
  // one has no silhouette to give.
  if (t.outline === 0) return 0;
  // Squared, because the stroke is laid on the outside of a stem that is itself only
  // linear in the size: proportional weight costs a 28px letter well over half its stem
  // again, and Fredoka's counters close up. A headline keeps every bit of its outline.
  const taper = Math.min(1, size / FULL_WEIGHT_SIZE) ** 2;
  return Math.max(1.5, size * 0.02 * t.outline * taper);
}

/** Room for the outline and the drop shadow, so a dressed glyph is not clipped on one side. */
function dressPad(size: number, stroke: number): { left: number; right: number; top: number; bottom: number } {
  const inset = Math.ceil(stroke + 1);
  const drop = Math.max(1, Math.ceil(size * 0.07));
  // Equal on opposite sides so origin 0.5 is the letter, not a point shifted by the drop.
  const y = inset + drop;
  return { left: inset, right: inset, top: y, bottom: y };
}

export interface TypeSpec {
  readonly size: number;
  readonly colour: number;
  /** Defaults to a dark shade of the fill. */
  readonly outline?: number;
  readonly align?: 'left' | 'center' | 'right';
  readonly wrap?: number;
}

function styleFor(t: Treatment, family: string, weight: number, spec: TypeSpec, dress: boolean): TextStyle {
  const strokeThickness = dress ? strokeFor(t, spec.size) : 0;
  const s: TextStyle = {
    // Quoted, because Phaser assembles the canvas font shorthand verbatim and an unquoted
    // "Baloo 2" is not a valid family there: the canvas falls back to 10px sans-serif.
    fontFamily: `"${family}"`,
    fontStyle: String(weight),
    fontSize: `${spec.size}px`,
    color: hex(spec.colour),
    align: spec.align ?? 'left',
  };
  if (strokeThickness > 0) { s.stroke = hex(spec.outline ?? typeStroke(spec.colour)); s.strokeThickness = strokeThickness; }
  if (dress) {
    s.shadow = shadowFor(spec.colour, spec.size);
    s.padding = dressPad(spec.size, strokeThickness);
  }
  if (spec.wrap !== undefined) s.wordWrap = { width: spec.wrap, useAdvancedWrap: true };
  return s;
}

/** A headline or a value: the display face, fully dressed. */
export function display(scene: Phaser.Scene, text: string, spec: TypeSpec, t = STYLE.current): Phaser.GameObjects.Text {
  return scene.add.text(0, 0, text, styleFor(t, t.display, t.displayWeight, spec, true));
}

/**
 * A headline on paper: the display face with no outline, lifted off the sheet by a pale
 * drop instead. The full dressing is built for cream type on timber or coral, where a
 * dark stroke is what gives the letter its silhouette; ink on cream already has one, and
 * the stroke only fills in Fredoka's counters and turns a word into a logo.
 */
export function embossed(scene: Phaser.Scene, text: string, spec: TypeSpec, t = STYLE.current): Phaser.GameObjects.Text {
  const style = { ...styleFor(t, t.display, t.displayWeight, spec, false) };
  style.shadow = embossFor(spec.size);
  style.padding = { left: 2, right: 2, top: 2, bottom: Math.max(2, Math.ceil(spec.size * 0.09)) };
  return scene.add.text(0, 0, text, style);
}

/** Re-emboss after a size change, the way `resize` re-dresses. */
export function reemboss(text: Phaser.GameObjects.Text, size: number, colour: number): void {
  text.setFontSize(size);
  text.setColor(hex(colour));
  text.setStroke('#000000', 0);
  const sh = embossFor(size);
  text.setShadow(sh.offsetX, sh.offsetY, sh.color, 0, false, true);
  text.setPadding({ left: 2, right: 2, top: 2, bottom: Math.max(2, Math.ceil(size * 0.09)) });
}

function embossFor(size: number): NonNullable<TextStyle['shadow']> {
  return { offsetX: 0, offsetY: Math.max(1, size * 0.05), color: hex(SHELL.cream), blur: 0, fill: true, stroke: false };
}

/** Running copy: the body face, undressed, so it sits back behind the display. */
export function body(scene: Phaser.Scene, text: string, spec: TypeSpec, t = STYLE.current): Phaser.GameObjects.Text {
  return scene.add.text(0, 0, text, styleFor(t, t.body, t.bodyWeight, spec, false));
}

/** A control or a small tag: the body face, heavier, uppercase, no tracking. */
export function label(scene: Phaser.Scene, text: string, spec: TypeSpec, t = STYLE.current): Phaser.GameObjects.Text {
  return scene.add.text(0, 0, text.toUpperCase(), styleFor(t, t.body, Math.min(900, t.bodyWeight + 200), spec, false));
}

/**
 * Re-dress a display text after a size change. `setFontSize` alone would leave the stroke
 * and shadow at the old size's proportions.
 */
export function resize(text: Phaser.GameObjects.Text, size: number, colour: number, t = STYLE.current, dress = true): void {
  text.setFontSize(size);
  // Fill used to stay on whatever the text was created with, so "Your turn" kept the
  // vignette ink while only its outline shifted — the colour argument was a no-op.
  text.setColor(hex(colour));
  if (!dress) {
    // A previous dressed size would otherwise leave a headline stroke on a caption.
    text.setStroke('#000000', 0);
    text.setShadow(0, 0, '#000000', 0, false, false);
    text.setPadding(0);
    return;
  }
  const stroke = strokeFor(t, size);
  text.setStroke(hex(typeStroke(colour)), stroke);
  const sh = shadowFor(colour, size);
  text.setShadow(sh.offsetX, sh.offsetY, sh.color, sh.blur, sh.stroke, sh.fill);
  text.setPadding(dressPad(size, stroke));
}
