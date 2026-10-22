/**
 * Design-space constants.
 *
 * The game is authored against a fixed portrait "design resolution" and the
 * Scale Manager maps that onto whatever the device actually reports. Scene
 * code must never read these numbers to position anything — it lays out
 * against the live {@link import('../core/Viewport').Viewport}, which accounts
 * for the device's real aspect ratio and safe-area insets. These values only
 * define the reference frame and the limits of it.
 */

/**
 * Authoring resolution: 720x1280 (9:16).
 *
 * Chosen deliberately over a 1080p design box. Under `Phaser.Scale.EXPAND` the
 * canvas backing store tracks the logical game size, so a smaller design box
 * means fewer fragments per frame. On a mid-range Android handset the GPU, not
 * the CPU, is usually the constraint, and 720p upscaled by the compositor is
 * visually indistinguishable from 1080p at phone viewing distance while
 * costing roughly half the fill rate.
 */
export const DESIGN_WIDTH = 720;
export const DESIGN_HEIGHT = 1280;

/** Design-space aspect ratio (width / height), ~0.5625. */
export const DESIGN_ASPECT = DESIGN_WIDTH / DESIGN_HEIGHT;

/**
 * Render scale: how many logical units the design box is drawn with per design unit.
 *
 * The canvas backing store tracks the logical game size, and the browser stretches it
 * to the screen. At scale 1 a 393 CSS-pixel phone at 2.75x draws 720 logical pixels
 * across 1,081 device pixels: a 1.5x upscale of every outline, letter and edge, which
 * is the softness `docs/VISUAL_AUDIT.md` records against a native app. Drawing the
 * design box larger by exactly that ratio lands one logical pixel on one device pixel.
 *
 * Every scene lays out from `s = min(safe.width / 720, safe.height / 1150)` and the
 * Viewport, so a larger logical frame scales the whole game on its own. The only things
 * sized outside `s` are the particle presets in `ui/feedback.ts`, which read
 * {@link renderScale} directly.
 *
 * The cap is the one number to tune from a handset. 1.5 makes a 2.75x phone sharp at
 * about 2.25x the fill of scale 1; a 3x flagship stops there rather than paying for 3x.
 * Set it to 1 to get the previous behaviour back exactly.
 */
export const RENDER_SCALE_MAX = 1.5;

/**
 * The render scale for a device: the upscale the compositor would otherwise apply,
 * from device pixels per CSS pixel and how far the parent is from the design box,
 * clamped to [1, {@link RENDER_SCALE_MAX}]. Pure, so it is testable without a browser.
 *
 * Under `Phaser.Scale.EXPAND` the parent's smaller axis against the design box sets the
 * zoom, so that axis is what the device pixel ratio is applied to. A desktop window or a
 * tablet wider than the box never goes below 1: the frame is never drawn smaller than
 * the design box.
 */
export function renderScale(devicePixelRatio: number, parentWidth: number, parentHeight: number, max = RENDER_SCALE_MAX): number {
  if (!(devicePixelRatio > 0) || !(parentWidth > 0) || !(parentHeight > 0)) return 1;
  const zoom = Math.min(parentWidth / DESIGN_WIDTH, parentHeight / DESIGN_HEIGHT);
  const upscale = devicePixelRatio * zoom;
  // Two decimals: a fractional scale is fine (the frame is rounded by `autoRound`), but
  // a long tail would only show up as a different number in every bug report.
  return Math.min(max, Math.max(1, Math.round(upscale * 100) / 100));
}

let activeRenderScale = 1;

/** Records the scale the running game was built with; `createGameConfig` sets it once. */
export function setRenderScale(scale: number): void {
  activeRenderScale = scale;
}

/** The scale the running game was built with, for the few sizes that do not go through `s`. */
export function currentRenderScale(): number {
  return activeRenderScale;
}

/**
 * Layout metrics in design units. Scene code scales these through the
 * Viewport rather than using raw pixel numbers inline.
 */
export const LAYOUT = {
  /** Minimum gap between interactive content and the screen edge. */
  screenPadding: 28,
  /**
   * Minimum touch target, in design units. 88 design units is ~48 CSS px on a
   * 720-wide design box rendered to a typical phone width, which is the
   * Material Design accessible minimum. Anything the player taps should meet
   * this even when its art is smaller.
   */
  minTouchTarget: 88,
  /** Vertical space reserved for the diagnostics header. */
  headerHeight: 190,
  /** Distance from the bottom safe edge to the drag track's centre line. */
  trackOffsetFromBottom: 260,
} as const;

/** Fixed z-ordering for the play scene. Keeps depth values in one place. */
export const DEPTH = {
  background: 0,
  track: 10,
  player: 20,
  hud: 30,
  debug: 40,
} as const;
