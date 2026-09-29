import type Phaser from 'phaser';
import { STYLE } from '@/config/style';
import { PALETTE, SHELL } from '@/config/theme';
import { shade } from './colour';
import { faces } from './light';

/**
 * A level, as a length: a sunk track, a fill up to the value, and a knob that sits on it.
 *
 * The knob is the handle and the fill is the reading, so the level is there for someone
 * who does not parse a percent. `live` is false while the master mute is holding the
 * level back — the length stays, and it stops looking like sound that is coming out.
 */
export const SLIDER = { height: 36, knobInset: 3 } as const;

/** What the geometry needs of a track, so it can be tested without Phaser. */
export interface SliderBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function travel(r: SliderBounds): { left: number; span: number; radius: number; y: number } {
  const inset = SLIDER.knobInset * (r.height / SLIDER.height);
  const radius = r.height / 2 - inset;
  const left = r.x + inset + radius;
  const right = r.x + r.width - inset - radius;
  return { left, span: Math.max(0, right - left), radius, y: r.y + r.height / 2 };
}

/** 0 at the left rest, 1 at the right. A point outside the travel clamps to the nearer end. */
export function sliderValue(r: SliderBounds, x: number): number {
  const { left, span } = travel(r);
  if (span <= 0) return 0;
  return Math.max(0, Math.min(1, (x - left) / span));
}

/** Centre of the knob at `value` 0–1. The inverse of `sliderValue`. */
export function sliderKnob(r: SliderBounds, value: number): { x: number; y: number; radius: number } {
  const { left, span, radius, y } = travel(r);
  const t = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  return { x: left + span * t, y, radius };
}

export function drawSlider(
  g: Phaser.GameObjects.Graphics, r: Phaser.Geom.Rectangle, s: number, value: number, live = true,
): void {
  const track = shade(SHELL.bench, -0.06);
  const t = faces(track);
  const radius = r.height / 2;
  const knob = sliderKnob(r, value);
  const outline = STYLE.current.outline * s * 0.5;
  g.fillStyle(t.edge, 1).fillRoundedRect(r.x, r.y, r.width, r.height, radius);
  g.fillStyle(t.face, 1).fillRoundedRect(r.x, r.y + 3 * s, r.width, r.height - 3 * s, radius);
  const shown = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  const fillW = Math.max(0, knob.x - r.x);
  // At zero the knob already sits on the left rest. A fill there is a stub behind it.
  if (shown > 0 && fillW > 2) {
    const fill = live ? PALETTE.coral : PALETTE.muted;
    g.fillStyle(fill, 1).fillRoundedRect(r.x, r.y + 3 * s, fillW, r.height - 3 * s, Math.min(radius, fillW / 2));
  }
  g.lineStyle(outline, shade(track, -0.55), 1).strokeRoundedRect(r.x, r.y, r.width, r.height, radius);
  const k = faces(SHELL.cream);
  g.fillStyle(k.edge, 1).fillCircle(knob.x, knob.y + 3.5 * s, knob.radius);
  g.fillStyle(k.face, 1).fillCircle(knob.x, knob.y, knob.radius);
  g.fillStyle(k.rim, 0.7).fillEllipse(knob.x, knob.y - knob.radius * 0.5, knob.radius * 1.05, knob.radius * 0.3);
  g.lineStyle(outline, shade(SHELL.cream, -0.5), 1).strokeCircle(knob.x, knob.y, knob.radius);
}
