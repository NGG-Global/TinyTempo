import type Phaser from 'phaser';
import { STYLE } from '@/config/style';
import { PALETTE, SHELL } from '@/config/theme';
import { shade } from './colour';
import { faces } from './light';

/**
 * A two-state switch: a sunk track with a raised knob that slides across it.
 *
 * Settings used to state the state in words and label the control with its opposite —
 * "Sound on" beside a button reading "Mute" — which needs a sentence read before the
 * thumb knows what will happen. A switch states both at once: the knob's side is the
 * state and the track's colour is whether it is on.
 */
export const SWITCH = { width: 124, height: 68, knobInset: 5 } as const;

/** What `switchKnob` needs of a rectangle, so the geometry is testable without Phaser. */
export interface SwitchBounds {
  readonly centerX: number;
  readonly centerY: number;
  readonly width: number;
  readonly height: number;
}

/** Centre of the knob at `on` 0 or 1, for a hit area or a light that follows it. */
export function switchKnob(r: SwitchBounds, on: number): { x: number; y: number; radius: number } {
  const radius = r.height / 2 - SWITCH.knobInset * (r.height / SWITCH.height);
  const travel = r.width / 2 - radius - SWITCH.knobInset * (r.height / SWITCH.height);
  return { x: r.centerX + (on * 2 - 1) * travel, y: r.centerY, radius };
}

/**
 * `on` is a 0–1 position, not a boolean, so the knob can be drawn mid-slide.
 * `dim` greys the whole control for a switch the device cannot honour.
 */
export function drawSwitch(g: Phaser.GameObjects.Graphics, r: Phaser.Geom.Rectangle, s: number, on: number, dim = false): void {
  const track = dim ? shade(SHELL.bench, -0.08) : on > 0.5 ? PALETTE.coral : shade(SHELL.bench, -0.06);
  const t = faces(track);
  const radius = r.height / 2;
  const knob = switchKnob(r, on);
  const outline = STYLE.current.outline * s * 0.5;
  // The track is a hollow, so its thickness reads downward: the dark edge is on top.
  g.fillStyle(t.edge, 1).fillRoundedRect(r.x, r.y, r.width, r.height, radius);
  g.fillStyle(t.face, 1).fillRoundedRect(r.x, r.y + 3 * s, r.width, r.height - 3 * s, radius);
  g.fillStyle(t.rim, 0.35).fillRoundedRect(r.x + radius * 0.5, r.bottom - 5 * s, r.width - radius, 3 * s, 2 * s);
  g.lineStyle(outline, shade(track, -0.55), 1).strokeRoundedRect(r.x, r.y, r.width, r.height, radius);
  const k = faces(dim ? shade(SHELL.cream, -0.12) : SHELL.cream);
  g.fillStyle(k.edge, 1).fillCircle(knob.x, knob.y + 3.5 * s, knob.radius);
  g.fillStyle(k.face, 1).fillCircle(knob.x, knob.y, knob.radius);
  g.fillStyle(k.rim, 0.7).fillEllipse(knob.x, knob.y - knob.radius * 0.5, knob.radius * 1.05, knob.radius * 0.3);
  g.lineStyle(outline, shade(SHELL.cream, -0.5), 1).strokeCircle(knob.x, knob.y, knob.radius);
}
