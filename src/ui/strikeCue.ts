import type Phaser from 'phaser';
import { STYLE } from '../config/style';
import { PALETTE, SHELL } from '../config/theme';
import { CALIBRATION } from '../game/CalibrationRun';
import { shade } from './colour';
import { faces } from './light';

/**
 * The calibration screen's strike cue: a ball that lands on a ring on every click, so the
 * beat can be seen coming rather than only heard.
 *
 * The screen used to show four beads, one lighting as each click sounded. A bead that
 * lights *on* the beat says nothing about when the next one is due — it is a report, not a
 * cue — and the player had to find the pulse by ear while being asked to hold it for twelve
 * beats. This is the game's own answer to "when": the pulse ball that lands on a socket in a
 * level (`docs/TURN_CUE.md`), here landing on one ring. The ball leaves the ring after a
 * click, rises, and falls back to meet the next one; the fall says where the beat is before
 * it arrives, and the landing — a squash and a ripple — is the moment to tap. Under the
 * ring, the count-in's words follow the clicks: *Listen* for the first, then 3, 2, 1, then
 * *Tap!* from the first measured beat on, kicked on every landing.
 *
 * Every pose is a pure function of the run's beat position, read from the heard clock as the
 * beads were, so the landing is on the click as the player hears it, on any route.
 */
export const STRIKE = Object.freeze({
  /** The ring's radius and the ball's, in design units at `s` 1. */
  ringRadius: 40,
  ballRadius: 19,
  /** How high the ball rises between beats, in design units at `s` 1. */
  hop: 92,
  /** The share of a beat the ball rests on the ring after landing before it rises again. */
  restShare: 0.14,
  /** How long the landing's ripple and squash last, in seconds. */
  landingSec: 0.26,
  /** How far the ripple grows past the ring, as a share of the ring's radius. */
  rippleGrowth: 0.8,
});

export interface StrikePose {
  /** 0 on the ring, 1 at the top of the hop. */
  readonly height: number;
  /** 1 on the instant of landing, settling to 0 over `landingSec`: squash and ripple. */
  readonly landing: number;
}

/**
 * Where the ball is at `beat` (a fractional beat count from the run's origin) at `period`
 * seconds a beat. Before the origin it rests on the ring. `still` keeps it on the ring
 * throughout and leaves only the landing, which then reads as a blink.
 */
export function strikePose(beat: number, period: number, still = false): StrikePose {
  if (!Number.isFinite(beat) || beat < 0 || !(period > 0)) return { height: 0, landing: 0 };
  const phase = beat - Math.floor(beat);
  const sinceLanding = phase * period;
  const landing = Math.max(0, 1 - sinceLanding / STRIKE.landingSec);
  if (still || phase < STRIKE.restShare) return { height: 0, landing };
  // A parabola from the ring back to the ring: fastest at both ends, so the arrival reads
  // as a hit rather than a float.
  const t = (phase - STRIKE.restShare) / (1 - STRIKE.restShare);
  return { height: Math.max(0, 1 - (2 * t - 1) ** 2), landing };
}

/**
 * The word under the ring for whole beat `beat`: *Listen* while the first click sets the
 * tempo, then the count down to the first measured beat, and *Tap!* from it on — kept up
 * through every measured beat and pulsed on each landing, because the question this screen
 * was failing to answer was exactly "now?".
 */
export function strikeWord(beat: number, leadBeats: number = CALIBRATION.leadBeats): string | null {
  if (!Number.isFinite(beat)) return null;
  const whole = Math.floor(beat);
  if (whole < 0) return 'Listen';
  const remaining = leadBeats - whole;
  if (remaining > 3) return 'Listen';
  if (remaining > 0) return String(remaining);
  return 'Tap!';
}

/** Draw the ring and the ball at `pose`, the ring centred on (`x`, `y`). */
export function drawStrikeCue(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, pose: StrikePose, armed: boolean): void {
  const ring = STRIKE.ringRadius * s;
  const outline = STYLE.current.outline * s * 0.5;
  // The ring is a socket: a sunk dish, lit coral once the measured beats have begun.
  const dish = armed ? shade(PALETTE.coral, 0.55) : shade(SHELL.puck, -0.14);
  g.fillStyle(shade(dish, -0.25), 1).fillCircle(x, y + 3 * s, ring);
  g.fillStyle(dish, 1).fillCircle(x, y, ring);
  g.lineStyle(outline, armed ? shade(PALETTE.coral, -0.3) : shade(SHELL.puck, -0.45), 1).strokeCircle(x, y, ring);
  if (pose.landing > 0) {
    const grown = ring * (1 + STRIKE.rippleGrowth * (1 - pose.landing));
    g.lineStyle(4 * s * pose.landing, PALETTE.coral, 0.7 * pose.landing).strokeCircle(x, y, grown);
  }
  // The ball, squashed into the ring as it lands and round again a moment later.
  const squash = 1 + 0.35 * pose.landing * (pose.height === 0 ? 1 : 0);
  const r = STRIKE.ballRadius * s;
  const by = y - pose.height * STRIKE.hop * s - r * (1 - 0.5 * (squash - 1)) + 2 * s;
  const f = faces(PALETTE.coral);
  g.fillStyle(0x1a1410, 0.14 * (1 - pose.height * 0.7)).fillEllipse(x, y + 4 * s, r * 1.7 * (1 - pose.height * 0.35), r * 0.5);
  g.fillStyle(f.edge, 1).fillEllipse(x, by + 3 * s, r * 2 * squash, r * 2 / squash);
  g.fillStyle(f.face, 1).fillEllipse(x, by, r * 2 * squash, r * 2 / squash);
  g.fillStyle(f.rim, 0.75).fillEllipse(x - r * 0.3, by - r * 0.4 / squash, r * 0.7, r * 0.45);
  g.lineStyle(outline, shade(PALETTE.coral, -0.55), 1).strokeEllipse(x, by, r * 2 * squash, r * 2 / squash);
}
