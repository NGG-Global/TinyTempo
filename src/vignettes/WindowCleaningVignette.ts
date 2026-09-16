import Phaser from 'phaser';
import { STYLE } from '@/config/style';
import { reducedMotion } from '@/core/motionPreference';
import type { Viewport } from '@/core/Viewport';
import type { Phase } from '@/game/RoundController';
import type { RoundPlan } from '@/rhythm/RhythmScheduler';
import type { Judgement } from '@/rhythm/judge';
import { Backdrop } from '@/ui/backdrop';
import { shade } from '@/ui/colour';
import { Feedback } from '@/ui/feedback';
import { castShadow, faces } from '@/ui/light';
import type { Vignette } from './Vignette';
import { easeOut, isPlayerTurn, TURN_OPEN_SEC } from './motion';

export const GLASS = { paper: 0xe9e4e7, ink: 0x49394e, frame: 0x82718a, blue: 0xb7d9db, light: 0xfff5df, glove: 0xdc9775, sill: 0xd1c1cd };
export const strokeProgress = (age: number): number => easeOut(age / 0.23);
// Graphics re-tessellate every frame; ~400 grime marks at Phaser's default 32 segments were
// the slice's heaviest per-frame JS cost. Eight segments are indistinguishable at this size.
const GRIME_SEGMENTS = 8;
/** The window's bounding box in stage units, which the painted-wood tile covers. */
const FRAME = { x: -272, y: -286, width: 544, height: 606, radius: 108 } as const;

/**
 * All cleaning is presentation of existing outcomes; taps are never interpreted as swipes.
 *
 * The frame is painted wood under the shared light, the pane is the one thing in the
 * game with no material on it, and the wall behind is the same sheet every other scene
 * stands on. The lateral stroke and its timing are unchanged.
 */
export class WindowCleaningVignette implements Vignette {
  private readonly backdrop: Backdrop;
  private readonly stage: Phaser.GameObjects.Container;
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly glass: Phaser.GameObjects.Graphics;
  private readonly dirt: Phaser.GameObjects.Graphics;
  private readonly gleam: Phaser.GameObjects.Graphics;
  private readonly tool: Phaser.GameObjects.Container;
  private readonly bursts: Feedback;
  private plan: RoundPlan | null = null;
  private phase: Phase = 'idle';
  /** When the player's turn began; the stage light opens toward them from here. */
  private respondAt = -100;
  private cleanAt: number[] = [];
  private strokeAt = -100;
  private lane = 0;
  private strokes = 0;
  private lastDemo = -Infinity;
  private finishAt: number | null = null;
  private finished = false;
  private successful = false;
  private lastNow = 0;
  private baseX = 0;
  private baseY = 0;
  private scale = 1;
  /** Grime is static for the whole demonstration; skip the ~300 ellipses until a wipe. */
  private dirtDirty = true;
  /** Read per use, so a preference change applies mid-scene. */
  private get reducedMotion(): boolean { return reducedMotion(); }

  public constructor(scene: Phaser.Scene) {
    // The pool of light sits where the pane's own sun already is, upper right.
    this.backdrop = new Backdrop(scene, GLASS.paper, GLASS.light, { glowAt: { x: 0.6, y: 0.3 } });
    this.stage = scene.add.container(0, 0).setDepth(-10);
    this.frame = scene.add.graphics();
    this.glass = scene.add.graphics();
    this.dirt = scene.add.graphics();
    this.gleam = scene.add.graphics();
    this.tool = scene.add.container(0, 0);
    this.drawSqueegee(scene);
    this.stage.add([this.frame, this.glass, this.dirt, this.gleam, this.tool]);
    this.bursts = new Feedback(scene, -10, this.stage);
  }

  /** Vertical rubber blade and a warm mitten: lateral motion, not a hammer reskin. */
  private drawSqueegee(scene: Phaser.Scene): void {
    const hand = scene.add.graphics();
    const line = STYLE.current.outline * 1.4;
    const ink = faces(GLASS.ink), glove = faces(GLASS.glove), frame = faces(GLASS.frame);
    // The contact shadow the blade throws on the pane behind it.
    const drop = castShadow(8);
    hand.fillStyle(GLASS.ink, drop.alpha).fillRoundedRect(-8 + drop.dx, -66 + drop.dy, 27, 148, 7);
    // The blade's back, its rubber edge and the ferrule.
    if (line > 0) hand.lineStyle(line, ink.edge, 1).strokeRoundedRect(-13, -70, 16, 140, 4);
    hand.fillStyle(ink.face).fillRoundedRect(-13, -70, 16, 140, 4);
    hand.fillStyle(ink.lit).fillRoundedRect(-13, -70, 16, 26, 4);
    if (line > 0) hand.lineStyle(line, shade(0xd3e1db, -0.55), 1).strokeRoundedRect(0, -66, 12, 132, 5);
    hand.fillStyle(0xd3e1db).fillRoundedRect(0, -66, 12, 132, 5);
    hand.fillStyle(GLASS.light, 0.8).fillRoundedRect(2, -60, 4, 118, 2);
    if (line > 0) hand.lineStyle(line, frame.edge, 1).strokeRoundedRect(8, -9, 55, 18, 7);
    hand.fillStyle(frame.face).fillRoundedRect(8, -9, 55, 18, 7);
    hand.fillStyle(frame.lit).fillRoundedRect(8, -9, 55, 7, 7);
    // Glove, cuff, forearm and handle, each with a lit top face.
    if (line > 0) hand.lineStyle(line, glove.edge, 1).strokeRoundedRect(41, -26, 61, 54, 17);
    hand.fillStyle(glove.shade).fillRoundedRect(41, -26, 61, 54, 17);
    hand.fillStyle(glove.face).fillRoundedRect(41, -26, 61, 42, 17);
    hand.fillStyle(glove.lit).fillRoundedRect(46, -24, 48, 10, 5);
    hand.fillStyle(0xf0bb95).fillRoundedRect(36, -31, 42, 22, 10);
    hand.fillStyle(0xc27c63).fillRoundedRect(85, -20, 50, 43, 10);
    if (line > 0) hand.lineStyle(line, ink.edge, 1).strokeRoundedRect(114, -26, 82, 56, 6);
    hand.fillStyle(ink.shade).fillRoundedRect(114, -26, 82, 56, 6);
    hand.fillStyle(ink.face).fillRoundedRect(114, -26, 82, 44, 6);
    hand.fillStyle(ink.rim, 0.5).fillRoundedRect(127, -19, 50, 4, 2);
    this.tool.add(hand);
  }

  public layout(viewport: Viewport): void {
    const { safe } = viewport;
    const uiScale = Math.min(safe.width / 720, safe.height / 1150);
    const top = safe.top + 320 * uiScale, bottom = safe.bottom - 330 * uiScale;
    // The pane and its sill share the space between the phase sign and beat track on tablets too.
    this.scale = Math.min(safe.width / 700, safe.height / 1120, (bottom - top) / 646);
    this.baseX = safe.centerX;
    this.baseY = Math.max(top + 286 * this.scale, Math.min(safe.top + safe.height * 0.54, bottom - 360 * this.scale));
    this.stage.setPosition(this.baseX, this.baseY).setScale(this.scale);
    this.backdrop.layout(viewport);
    const line = STYLE.current.outline * 1.4;
    const frame = faces(GLASS.frame), ink = faces(GLASS.ink), sill = faces(GLASS.sill);
    // The frame: cast shadow on the wall, the painted face, its lit top edge.
    const f = this.frame.clear();
    const drop = castShadow(14);
    f.fillStyle(GLASS.ink, drop.alpha).fillRoundedRect(FRAME.x + drop.dx, FRAME.y + drop.dy, FRAME.width, FRAME.height, FRAME.radius);
    if (line > 0) f.lineStyle(line, shade(GLASS.frame, -0.6), 1).strokeRoundedRect(FRAME.x, FRAME.y, FRAME.width, FRAME.height, FRAME.radius);
    f.fillStyle(frame.shade).fillRoundedRect(FRAME.x, FRAME.y, FRAME.width, FRAME.height, FRAME.radius);
    f.fillStyle(frame.face).fillRoundedRect(FRAME.x, FRAME.y, FRAME.width, FRAME.height - 14, FRAME.radius);
    f.lineStyle(5, frame.rim, 0.6).strokeRoundedRect(FRAME.x + 9, FRAME.y + 9, FRAME.width - 18, FRAME.height - 30, FRAME.radius - 9);
    // Painted grain, drawn rather than tiled: a material tile is a rectangle, and its
    // square corners would show past the frame's 108-unit radius. The lines run the full
    // width as if the frame were cut from one board; the pane covers their middles.
    f.lineStyle(2.5, shade(GLASS.frame, -0.14), 0.45);
    for (let i = 0; i < 9; i++) {
      const y = FRAME.y + 34 + i * (FRAME.height - 68) / 8;
      f.beginPath();
      for (let x = FRAME.x + 22; x <= FRAME.x + FRAME.width - 22; x += 48) {
        const wobble = Math.sin(x / 90 + i * 1.7) * 4;
        if (x === FRAME.x + 22) f.moveTo(x, y + wobble); else f.lineTo(x, y + wobble);
      }
      f.strokePath();
    }
    // The reveal: the dark inside edge of the opening, which is what gives the frame depth.
    f.fillStyle(ink.face).fillRoundedRect(-252, -267, 504, 560, 94);
    f.lineStyle(3, frame.rim, 0.6).strokeRoundedRect(-245, -259, 490, 547, 89);
    for (const x of [-258, 258]) for (const y of [-136, 184]) {
      f.fillStyle(ink.shade, 0.5).fillCircle(x, y + 2, 5);
      f.fillStyle(0xd5c4ae).fillCircle(x, y, 4);
      f.lineStyle(1.5, GLASS.ink, 0.7).lineBetween(x - 2, y - 2, x + 2, y + 2);
    }

    const g = this.glass.clear();
    g.fillStyle(GLASS.blue).fillRoundedRect(-236, -251, 472, 529, 82);
    // A small garden view is the reward for a clean pane: sun, clouds, hills and a cottage.
    g.fillStyle(GLASS.light, 0.18).fillCircle(108, -155, 65);
    g.fillStyle(0xf7de9e).fillCircle(108, -155, 40);
    const cloud = (x: number, y: number, s: number): void => {
      g.fillStyle(GLASS.light, 0.82).fillEllipse(x, y, 97 * s, 24 * s)
        .fillCircle(x - 18 * s, y - 10 * s, 21 * s).fillCircle(x + 10 * s, y - 16 * s, 27 * s);
    };
    cloud(-115, -160, 0.95); cloud(39, -69, 0.68);
    g.fillStyle(0xa2c2b9).fillRoundedRect(-231, 88, 462, 186, { tl: 0, tr: 0, bl: 78, br: 78 });
    const hill = (points: number[][], colour: number): void => {
      g.fillStyle(colour).fillPoints(points.map(p => new Phaser.Math.Vector2(p[0]!, p[1]!)), true);
    };
    hill([[-231, 89], [-188, 55], [-136, 39], [-73, 64], [11, 127], [102, 191], [-231, 191]], 0x9bbbae);
    hill([[-100, 192], [-27, 117], [63, 50], [140, 40], [231, 96], [231, 209], [-100, 209]], 0x7fa99d);
    g.fillStyle(0x78a48b).fillRoundedRect(-227, 185, 454, 87, { tl: 0, tr: 0, bl: 71, br: 71 });
    // A winding path and a tiny house, simple enough to read through the dirt.
    hill([[33, 188], [48, 188], [34, 217], [89, 271], [40, 271], [9, 218]], 0xc7c7a2);
    g.fillStyle(0xece3c6).fillRoundedRect(1, 127, 83, 67, 4);
    g.fillStyle(0xb67a65).fillTriangle(-11, 131, 43, 85, 98, 131);
    g.lineStyle(3, 0x826c60).lineBetween(-11, 131, 43, 85).lineBetween(43, 85, 98, 131);
    g.fillStyle(0x537e74).fillRoundedRect(32, 154, 21, 40, 3);
    for (const x of [12, 61]) {
      g.fillStyle(0xf5d594).fillRect(x, 145, 13, 17);
      g.lineStyle(2, 0x9b977d).strokeRect(x, 145, 13, 17);
    }
    for (const [x, y, s] of [[-155, 184, 1], [160, 179, 0.8]] as const) {
      g.fillStyle(0x627f70).fillRoundedRect(x - 4, y - 36 * s, 8, 48 * s, 3);
      g.fillStyle(0x5e907f).fillCircle(x, y - 65 * s, 31 * s).fillCircle(x - 18 * s, y - 42 * s, 30 * s).fillCircle(x + 19 * s, y - 39 * s, 27 * s);
      g.fillStyle(0x83ae90, 0.65).fillEllipse(x - 12 * s, y - 69 * s, 24 * s, 16 * s);
    }
    g.fillStyle(GLASS.light, 0.3).fillTriangle(-218, -169, -127, -239, -218, 8);
    g.fillStyle(GLASS.light, 0.16).fillTriangle(-185, 97, 22, -239, 49, -239);
    g.lineStyle(3, GLASS.light, 0.55).lineBetween(-251, 277, 251, 277);
    // The ledge, a solid with a lit top and a shadow under it.
    const ledgeDrop = castShadow(10);
    g.fillStyle(GLASS.ink, ledgeDrop.alpha).fillEllipse(13 + ledgeDrop.dx, 344 + ledgeDrop.dy, 500, 25);
    if (line > 0) g.lineStyle(line, shade(GLASS.sill, -0.6), 1).strokeRoundedRect(-291, 291, 582, 33, 6);
    g.fillStyle(sill.shade).fillRoundedRect(-291, 291, 582, 33, 6);
    g.fillStyle(sill.face).fillRoundedRect(-291, 291, 582, 22, 6);
    g.fillStyle(sill.rim, 0.7).fillRoundedRect(-282, 293, 565, 6, 3);
  }
  public reset(plan: RoundPlan): void {
    this.plan = plan; this.phase = 'prepare'; this.cleanAt = plan.targets.map(() => Infinity);
    this.strokeAt = -100; this.strokes = 0; this.lane = 0; this.lastDemo = -Infinity;
    this.finishAt = null; this.finished = false; this.successful = false;
    this.respondAt = -100;
    this.dirtDirty = true;
  }
  public onPhase(phase: Phase, now: number): void {
    this.phase = phase;
    // The demonstration wipes without clearing the grime, so the pane the player is given
    // is the one they watched and nothing has to be re-dirtied in the instant before
    // their turn.
    if (phase === 'respond') {
      this.cleanAt.fill(Infinity);
      this.respondAt = now;
      this.dirtDirty = true;
    }
  }
  public onDemonstrationBeat(time: number): void {
    if (time <= this.lastDemo) return;
    this.lastDemo = time;
    // The blade travels its lane and sounds; only the glass is left dirty. There is no
    // bar between the demonstration and the response in which to restore it.
    this.stroke(time);
  }
  private stroke(now: number): void {
    this.lane = this.strokes++ % (this.plan?.targets.length ?? 4);
    this.strokeAt = now;
    this.positionTool(now);
    // Water flicked off the blade. Decorative, so it may skip under reduced motion.
    if (!this.reducedMotion) this.bursts.burst('water', this.tool.x - 10, this.tool.y + 40, [GLASS.light, 0xd3e1db], 5);
  }
  public onPlayerHit(now: number): void {
    if (!isPlayerTurn(this.phase)) return;
    this.stroke(now);
  }
  public onAccuracy(result: Judgement, now: number): void {
    if (result.kind === 'hit' && result.index !== null) {
      this.lane = result.index;
      this.cleanAt[this.lane] = now;
      this.positionTool(now);
      this.dirtDirty = true;
    }
  }
  public finish(successful: boolean, contactSec: number): void { this.successful = successful; this.finishAt = contactSec; }
  public pause(): void { this.phase = 'paused'; this.finishAt = null; }
  private positionTool(now: number): void {
    const age = now - this.strokeAt;
    const p = strokeProgress(age);
    const direction = this.lane % 2 ? -1 : 1;
    const ex = STYLE.current.exaggeration;
    const y = -184 + (this.lane + 0.5) * 430 / (this.plan?.targets.length ?? 4);
    const x = direction * (-212 + 424 * p);
    this.tool.setPosition(age > 0.5 ? x : x + direction * Math.sin(p * Math.PI) * 9 * ex, y);
    this.tool.setRotation(direction * Math.sin(p * Math.PI) * 0.08 * ex);
    // Keep the hand behind the stroke, so it finishes inside the frame rather than off-screen.
    this.tool.setScale(-direction, 1 - Math.sin(p * Math.PI) * 0.06 * ex);
    if (age > 0.5) this.tool.y += Math.sin(now * 1.6) * (this.reducedMotion ? 0 : 2);
    if (age > 0.5 && (this.phase === 'idle' || this.phase === 'prepare' || this.finished)) {
      this.tool.setPosition(-180, this.finished ? 237 : 165).setRotation(-0.15).setScale(1);
    }
  }
  /**
   * The stage light opens toward the player the instant their turn starts, and holds open
   * through the ending. It is the handover said without words, now that no bar separates
   * the demonstration from the response.
   */
  private openStage(now: number): void {
    const offered = this.phase === 'respond' || this.phase === 'result';
    this.backdrop.open(offered ? easeOut((now - this.respondAt) / TURN_OPEN_SEC) : 0);
  }
  public update(now: number): void {
    if (this.phase === 'paused') now = this.lastNow; else this.lastNow = now;
    this.openStage(now);
    this.stage.setPosition(this.baseX, this.baseY);
    if (this.phase === 'prepare' || this.phase === 'demonstrate') {
      for (const cue of this.plan?.cues ?? []) if (cue.kind === 'action' && cue.time <= now) this.onDemonstrationBeat(cue.time);
    }
    if (this.finishAt !== null && now >= this.finishAt && !this.finished) {
      this.finished = true;
      this.stroke(this.finishAt);
      if (this.successful) {
        this.cleanAt = this.cleanAt.map(time => Math.min(time, this.finishAt!));
        this.dirtDirty = true;
      }
    }
    this.positionTool(now);
    const wiping = this.cleanAt.some(time => Number.isFinite(time) && strokeProgress(now - time) < 1);
    if (this.dirtDirty || wiping) {
      this.drawDirt(now);
      this.dirtDirty = wiping;
    }
    const shine = this.gleam.clear();
    const count = this.plan?.targets.length ?? 4;
    const clean = this.cleanAt.reduce((sum, time) => sum + strokeProgress(now - time), 0) / count;
    shine.lineStyle(4, GLASS.light, 0.15 + clean * 0.65).lineBetween(-192, 76, -34, -185);
    shine.lineStyle(12, GLASS.light, clean * 0.3).lineBetween(-169, 82, -12, -179);
    if (this.finished && this.finishAt !== null) {
      const p = easeOut((now - this.finishAt) / 0.45);
      if (this.successful) {
        // The reflected sun becomes a crisp little four-point glint.
        shine.fillStyle(GLASS.light, p).fillTriangle(106, -188, 98, -144, 114, -144);
        shine.fillStyle(GLASS.light, p).fillTriangle(106, -100, 98, -144, 114, -144);
        shine.fillStyle(GLASS.light, p).fillTriangle(69, -144, 106, -151, 106, -137);
        shine.fillStyle(GLASS.light, p).fillTriangle(143, -144, 106, -151, 106, -137);
        for (const [x, y, size] of [[-145, 84, 17], [168, 188, 13]] as const) {
          shine.fillStyle(GLASS.light, p).fillTriangle(x, y - size, x - 3, y, x + 3, y)
            .fillTriangle(x, y + size, x - 3, y, x + 3, y)
            .fillTriangle(x - size, y, x, y - 3, x, y + 3).fillTriangle(x + size, y, x, y - 3, x, y + 3);
        }
      } else {
        shine.lineStyle(5, GLASS.light, 0.75).strokeEllipse(93, 16, 36, 53);
        shine.lineBetween(93, 44, 95, 44 + p * 29);
      }
    }
  }
  private drawDirt(now: number): void {
    const g = this.dirt.clear();
    const count = this.plan?.targets.length ?? 4;
    // Fixed deterministic marks, no per-hit objects or texture/mask allocations.
    for (let row = 0; row < 22; row++) {
      for (let col = 0; col < 15; col++) {
        const seed = (row * 43 + col * 29) % 19;
        const x = -208 + col * 29 + Math.sin(row * 13 + col * 7) * 9;
        const y = -214 + row * 22 + Math.cos(row * 7 + col * 11) * 6;
        if ((y < -180 && Math.abs(x) > 177) || (y > 226 && Math.abs(x) > 171)) continue;
        const lane = Math.min(count - 1, Math.max(0, Math.floor((y + 184) / (430 / count))));
        const p = strokeProgress(now - (this.cleanAt[lane] ?? Infinity));
        const covered = p >= 1 || (p > 0 && (lane % 2 ? x > 212 - 424 * p : x < -212 + 424 * p));
        if (covered) continue;
        const alpha = 0.11 + seed / 110;
        g.fillStyle(seed % 3 ? 0x8c9d94 : 0xc0b799, alpha).fillEllipse(x, y, 35 + seed, 23 + seed % 17, GRIME_SEGMENTS);
        if (seed < 5) {
          g.fillStyle(GLASS.light, 0.36).fillEllipse(x + 5, y - 3, 5, 9, 6);
          g.lineStyle(2, GLASS.ink, 0.12).lineBetween(x, y + 5, x - 3, y + 23);
        }
      }
    }
  }
  public translate(offset: number): void { this.stage.x += this.reducedMotion ? 0 : offset; }
  public destroy(): void { this.bursts.destroy(); this.stage.destroy(true); this.backdrop.destroy(); }
}
