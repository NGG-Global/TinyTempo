import type Phaser from 'phaser';
import { STYLE } from '../config/style';
import { PALETTE, SHELL } from '../config/theme';
import { shade } from './colour';
import { drawPriceTag, drawSun } from './icons';
import { BRASS } from './panel';
import { dashes } from './path';

/**
 * One stopwatch token, four states, wherever a held or running replay timer is shown: the
 * store's shelf, the Daily card, the result's toast, the restart sheet. **A ring means
 * something is running out; no ring means it keeps.** A won timer wears an ink ring that
 * empties over its hour and a sun badge; a bought one a solid brass rim, a price-tag badge
 * and no ring; a running one the butter face with a brass ring counting down; an expired
 * one a dashed grey outline, greyed, on its way off the shelf. The geometry is pure; the
 * length on the face is the caller's Text, placed at the centre.
 */
export type TimerTokenState = 'won' | 'bought' | 'running' | 'expired';

export interface TimerTokenLook {
  readonly face: number;
  /** A solid rim all the way round, or null. */
  readonly rim: number | null;
  /** How much of the ring is left, 1 → 0, or null for no ring. */
  readonly ring: number | null;
  readonly ringColour: number | null;
  readonly badge: 'sun' | 'tag' | null;
  readonly dashed: boolean;
  readonly alpha: number;
}

const TOKEN = Object.freeze({
  /** The ring sits just inside the face's edge. */
  ringInset: 0.1,
  ringWidth: 0.13,
  crownWidth: 0.34,
  crownHeight: 0.16,
  badgeRadius: 0.34,
  dash: 0.26,
  dashGap: 0.2,
});

export function tokenLook(state: TimerTokenState, ring: number): TimerTokenLook {
  const left = Math.max(0, Math.min(1, Number.isFinite(ring) ? ring : 0));
  switch (state) {
    case 'won': return { face: SHELL.cream, rim: null, ring: left, ringColour: PALETTE.ink, badge: 'sun', dashed: false, alpha: 1 };
    case 'bought': return { face: SHELL.cream, rim: BRASS, ring: null, ringColour: null, badge: 'tag', dashed: false, alpha: 1 };
    case 'running': return { face: SHELL.sun, rim: null, ring: left, ringColour: BRASS, badge: null, dashed: false, alpha: 1 };
    case 'expired': return { face: shade(SHELL.puck, -0.12), rim: null, ring: null, ringColour: null, badge: null, dashed: true, alpha: 0.6 };
  }
}

/** A dashed circle, as the chips' dashed outlines are drawn: a polygon walked at an even pitch. */
function dashedCircle(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, width: number, colour: number, alpha: number): void {
  const points = Array.from({ length: 41 }, (_, i) => {
    const a = i / 40 * Math.PI * 2;
    return { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r };
  });
  g.lineStyle(width, colour, alpha);
  for (const [a, b] of dashes(points, r * TOKEN.dash, r * TOKEN.dashGap)) g.lineBetween(a.x, a.y, b.x, b.y);
}

/**
 * The token at `(x, y)`, radius `r` in screen units. `ring` is how much of a won timer's
 * window, or a running timer's span, is left. The length on the face is the caller's.
 */
export function drawTimerToken(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, state: TimerTokenState, ring: number, s: number): TimerTokenLook {
  const look = tokenLook(state, ring);
  const outline = STYLE.current.outline * s * 0.5;
  // The crown and its stem, behind the face.
  const crownW = r * TOKEN.crownWidth, crownH = r * TOKEN.crownHeight;
  g.fillStyle(look.dashed ? shade(SHELL.puck, -0.3) : PALETTE.ink, look.alpha).fillRoundedRect(x - crownW / 2, y - r - crownH * 1.6, crownW, crownH * 1.4, crownH * 0.4);
  g.fillRect(x - crownW * 0.3, y - r - crownH * 0.4, crownW * 0.6, crownH * 0.6);
  // The face, with its shadow and outline.
  g.fillStyle(shade(look.face, -0.45), 0.35 * look.alpha).fillCircle(x, y + 3 * s, r);
  g.fillStyle(look.face, look.alpha).fillCircle(x, y, r);
  if (look.dashed) dashedCircle(g, x, y, r, outline, shade(SHELL.puck, -0.4), look.alpha);
  else g.lineStyle(outline, look.rim ?? PALETTE.ink, look.alpha).strokeCircle(x, y, r);
  if (look.rim !== null) g.lineStyle(r * TOKEN.ringWidth, look.rim, look.alpha).strokeCircle(x, y, r * (1 - TOKEN.ringInset));
  // The ring: from the top, clockwise, as much as is left.
  if (look.ring !== null && look.ringColour !== null && look.ring > 0.005) {
    g.lineStyle(r * TOKEN.ringWidth, look.ringColour, look.alpha);
    g.beginPath();
    g.arc(x, y, r * (1 - TOKEN.ringInset), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * look.ring, false);
    g.strokePath();
  }
  // The badge at the lower right: the sun for a won timer, the tag for a bought one.
  const br = r * TOKEN.badgeRadius, bx = x + r * 0.72, by = y + r * 0.72;
  if (look.badge !== null) {
    g.fillStyle(SHELL.cream, 1).fillCircle(bx, by, br + 2 * s);
    g.lineStyle(outline * 0.8, PALETTE.ink, 1).strokeCircle(bx, by, br + 2 * s);
    if (look.badge === 'sun') drawSun(g, bx, by, br * 0.8, SHELL.sun);
    else drawPriceTag(g, bx, by, br * 0.78, BRASS, SHELL.cream);
  }
  return look;
}
