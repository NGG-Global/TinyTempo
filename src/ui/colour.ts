import { PALETTE } from '@/config/theme';

/**
 * Channel-wise colour helpers. Areas author five colours each (`levels.ts`); the map
 * derives every depth tone — shadows, hazed distance, bevels — from those rather than
 * adding fields, so a new area stays five values.
 */
export const hex = (colour: number): string => `#${(colour & 0xffffff).toString(16).padStart(6, '0')}`;

const byte = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

/** Linear blend in RGB. `t` is clamped, so callers can pass an unbounded ratio. */
export function mix(a: number, b: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  return (byte(ar + (br - ar) * k) << 16) | (byte(ag + (bg - ag) * k) << 8) | byte(ab + (bb - ab) * k);
}

/** Positive lightens toward white, negative darkens toward black. */
export function shade(colour: number, amount: number): number {
  return amount >= 0 ? mix(colour, 0xffffff, amount) : mix(colour, 0x000000, -amount);
}

/** WCAG relative luminance of a Phaser colour, in linear sRGB. */
export function relativeLuminance(colour: number): number {
  const chan = (value: number): number => {
    const s = value / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan((colour >> 16) & 0xff)
    + 0.7152 * chan((colour >> 8) & 0xff)
    + 0.0722 * chan(colour & 0xff);
}

/** Contrast ratio of two Phaser colours, 1–21, same definition as WCAG. */
export function contrastRatio(a: number, b: number): number {
  const l1 = relativeLuminance(a), l2 = relativeLuminance(b);
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * How far an empty star is washed toward the plate it sits on. Earned stars use the
 * full ink; empty ones stay filled (an outline-only star vanished on timber) but quieter.
 */
export const EMPTY_STAR_MIX = 0.68;

export function starColour(earned: boolean, ink: number, plate: number): number {
  return earned ? ink : mix(plate, ink, EMPTY_STAR_MIX);
}

/**
 * How far an outline has to be from its own letter before it reads as an outline rather
 * than as a thicker, muddier stem. Measured against the fills the game actually uses: a
 * cream headline on timber sits at 12.8:1 and the coral block's at 3.7:1, while the
 * game's ink and every area's ink land between 1.5 and 2.0 — the dark green with a
 * near-black border that closed up Fredoka's counters and turned a word into a smudge.
 */
export const OUTLINE_CONTRAST = 3;

/**
 * Outline for dressed type, or `null` when the fill cannot carry one.
 *
 * Light paint (cream on timber, cream on coral) used to self-shade into a muddy brown
 * halo that sat at about 2.5:1 on the wood; the workshop outline is the game's ink, the
 * same dark the props use. A saturated mid-tone — a coral "Your turn", the timber of a
 * sign — keeps a deeper self-shade so the stroke stays in the letter's family.
 *
 * A dark fill has no such shade left. The only tone below the game's ink is black, and
 * black on dark green is not a silhouette, it is a thicker stem: the outline is there to
 * separate a letter from what is behind it, and dark ink on the workshop's paper is
 * already separated. Those letters take no outline at all, and `ui/type.ts` lifts them
 * off the sheet with a pale drop instead.
 */
export function typeStroke(fill: number, ink = PALETTE.ink): number | null {
  // Cream on timber needs a step darker than the supporting ink to clear 4.5:1; the
  // ink itself is 4.2 on that orange. Saturated fills keep a self-shade.
  const stroke = relativeLuminance(fill) > 0.45 ? shade(ink, -0.22) : shade(fill, -0.72);
  return contrastRatio(fill, stroke) >= OUTLINE_CONTRAST ? stroke : null;
}
