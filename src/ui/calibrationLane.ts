import Phaser from 'phaser';
import { STYLE } from '../config/style';
import { PALETTE, SHELL } from '../config/theme';
import { mix, shade } from './colour';

/**
 * The calibration screen's lane: where each tap landed against the beat, as it happens.
 *
 * The run used to show a count going up and nothing else, so a player could not see
 * whether they were early, late or all over the place until the end, and a failed run had
 * nothing to point at. The lane is a horizontal strip with the beat at its centre: every
 * landed tap drops a tick at its residual — early to the left, late to the right — and
 * the ticks build a cluster the eye reads at once. A tap that did not land flashes the
 * edge it fell past. Nothing here judges: the lane shows the acceptance window and the
 * beat, never the game's Perfect band, because this screen measures and does not grade.
 *
 * Every pose is a pure function of the residuals and the clock, so the lane can be tested
 * without Phaser and drawn without state.
 */
export const LANE = Object.freeze({
  /** Milliseconds from the centre to either edge: the run's acceptance window, so a landed tap always fits. */
  halfMs: 400,
  /** A tick's height and width, in design units at `s` 1. */
  tickHeight: 34,
  tickWidth: 6,
  /** The newest tick is taller and brighter; older ones settle to this share. */
  settleSec: 0.6,
  /** How long the edge glows after a tap fell past it. */
  flashSec: 0.5,
});

/** A tick's position across the lane, −1 (early edge) to 1 (late edge), clamped. */
export function tickAt(residualMs: number, halfMs: number = LANE.halfMs): number {
  if (!Number.isFinite(residualMs)) return 0;
  return Math.max(-1, Math.min(1, residualMs / halfMs));
}

/** How far a tick has settled since it landed: 1 fresh, 0 at rest. */
export function tickFresh(age: number, settleSec: number = LANE.settleSec): number {
  if (!Number.isFinite(age) || age < 0) return 1;
  return Math.max(0, 1 - age / settleSec);
}

/** The edge flash's strength after a tap fell past it: 1 at once, 0 when over. */
export function edgeFlash(age: number, flashSec: number = LANE.flashSec): number {
  if (!Number.isFinite(age) || age < 0) return 0;
  return Math.max(0, 1 - age / flashSec);
}

export interface LaneTick {
  readonly residualMs: number;
  /** Seconds since the tap landed, on the frame clock. */
  readonly age: number;
}

export interface LaneFlash {
  readonly side: 'early' | 'late';
  readonly age: number;
}

/**
 * Draw the lane into `rect`. `still` leaves out the settle and the flash's fade, for
 * reduced motion: the ticks are drawn at rest and a flash is a plain edge mark.
 */
export function drawCalibrationLane(
  g: Phaser.GameObjects.Graphics, rect: Phaser.Geom.Rectangle, s: number,
  ticks: readonly LaneTick[], flash: LaneFlash | null, still: boolean,
): void {
  const outline = STYLE.current.outline * s * 0.4;
  const radius = Math.min(rect.height / 2, 22 * s);
  // A recessed strip, the same tone as a turn block's shelf.
  g.fillStyle(shade(SHELL.puck, -0.18), 1).fillRoundedRect(rect.x, rect.y, rect.width, rect.height, radius);
  g.fillStyle(shade(SHELL.puck, -0.08), 1).fillRoundedRect(rect.x, rect.y + 3 * s, rect.width, rect.height - 3 * s, radius);
  g.lineStyle(outline, shade(SHELL.puck, -0.42), 1).strokeRoundedRect(rect.x, rect.y, rect.width, rect.height, radius);
  const cx = rect.centerX, cy = rect.centerY;
  const half = rect.width / 2 - 18 * s;
  // The beat: a line down the centre, and faint marks every 100 ms either side.
  for (let ms = 100; ms < LANE.halfMs; ms += 100) {
    for (const side of [-1, 1]) {
      const x = cx + side * tickAt(ms) * half;
      g.fillStyle(shade(SHELL.puck, -0.3), 1).fillRect(x - s, cy - 6 * s, 2 * s, 12 * s);
    }
  }
  g.fillStyle(PALETTE.ink, 1).fillRect(cx - 2 * s, rect.y + 8 * s, 4 * s, rect.height - 16 * s);
  if (flash !== null) {
    const strength = still ? (flash.age < LANE.flashSec ? 1 : 0) : edgeFlash(flash.age);
    if (strength > 0) {
      const x = flash.side === 'early' ? rect.x : rect.right - 14 * s;
      g.fillStyle(PALETTE.coral, 0.8 * strength).fillRoundedRect(x, rect.y, 14 * s, rect.height, { tl: flash.side === 'early' ? radius : 0, bl: flash.side === 'early' ? radius : 0, tr: flash.side === 'late' ? radius : 0, br: flash.side === 'late' ? radius : 0 });
    }
  }
  // Ticks, oldest first so the newest draws on top; the newest is taller while it settles.
  ticks.forEach((tick, i) => {
    const fresh = still ? 0 : tickFresh(tick.age);
    const newest = i === ticks.length - 1;
    const h = LANE.tickHeight * s * (1 + fresh * 0.35);
    const w = LANE.tickWidth * s;
    const x = cx + tickAt(tick.residualMs) * half;
    const colour = newest ? PALETTE.coral : mix(PALETTE.coral, SHELL.puck, 0.35);
    g.fillStyle(shade(colour, -0.5), 1).fillRoundedRect(x - w / 2, cy - h / 2 + 2 * s, w, h, w / 2);
    g.fillStyle(colour, 1).fillRoundedRect(x - w / 2, cy - h / 2, w, h, w / 2);
  });
}
