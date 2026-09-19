import type Phaser from 'phaser';
import { STYLE } from '@/config/style';
import { reducedMotion } from '@/core/motionPreference';
import type { Viewport } from '@/core/Viewport';
import type { Phase } from '@/game/RoundController';
import type { RoundPlan } from '@/rhythm/RhythmScheduler';
import type { Judgement } from '@/rhythm/judge';
import { MaterialKey } from '@/textures/materials';
import { Backdrop } from '@/ui/backdrop';
import { shade } from '@/ui/colour';
import { Feedback } from '@/ui/feedback';
import { castShadow, faces } from '@/ui/light';
import { fillContour, paintedContour, traceContour } from '@/ui/illustration';
import type { Vignette } from './Vignette';
import {
  advanceBite, acceptDemoBeat, BLADE, bladeBackLine, bladeOutline, bladeSpan, bladeVisibleDepth, clamp01, drawBack, dustFall, dustPile,
  easeOut, kerfDepth, REFERENCE_BEAT, SAW_MOTION, sawDirection, sawRock, sawTiming, strokeTravel,
} from './sawMotion';
import { handoverAt } from '@/game/beatTrack';
import { isPlayerTurn, turnOpen } from './motion';

/** Cold linen and slate. Sawdust is the only warm note, so the accent doubles as the reward. */
export const TIMBER = {
  paper: 0xe6e9e4, ink: 0x22303a, sapwood: 0xcbb999, lit: 0xe4d8c0,
  grain: 0xa89070, kerf: 0x544a39, steel: 0xaab6bd, grip: 0x3f5a63, sawdust: 0xd8a24a,
  /** The hand on the saw: a canvas work glove and a rolled shirt sleeve, both in the cool range. */
  glove: 0x6b7f88, sleeve: 0x2f4650, pencil: 0x4d5257,
} as const;

// The board crosses the frame at about -6.5 degrees. Both sawhorses sit left of the
// cut, so the offcut is unsupported and the fall is telegraphed before it happens.
const TILT = -0.1134;
const BOARD_LEFT = -560;
const BOARD_RIGHT = 540;
const CUT_X = 150;
const KERF_HALF = 7;
const HORSE_X = [-320, -110] as const;
const GROUND_Y = 250;
const TIMBER_X = 0;
const TIMBER_Y = -140;
const THICK = SAW_MOTION.boardThickness;

/** A sapwood grain tile, laid over a plank's painted faces at the treatment's strength. */
function grainTile(scene: Phaser.Scene, x: number, y: number, width: number, height: number): Phaser.GameObjects.TileSprite {
  const tile = scene.add.tileSprite(x, y, width, height, MaterialKey.wood).setOrigin(0)
    .setTint(TIMBER.sapwood).setAlpha(0.45 * STYLE.current.grain);
  tile.setTileScale(0.42, 0.42);
  return tile;
}
/** Where the offcut lands in the successful coda, in stage space; the puff of dust rises here. */
const LANDING = { x: TIMBER_X + (CUT_X + 180) * Math.cos(TILT), y: GROUND_Y - 2 } as const;
// Graphics re-tessellate every frame, so the dust plume is a fixed small budget.
const DUST_MOTES = 9;

/** A convex polygon as a triangle fan. `fillPoints` wants Vector2 instances, which would
    mean building throwaway objects for a shape that is redrawn every frame. */
function fan(g: Phaser.GameObjects.Graphics, points: readonly (readonly [number, number])[]): void {
  const first = points[0];
  if (!first) return;
  for (let i = 1; i + 1 < points.length; i++) {
    const a = points[i]!, b = points[i + 1]!;
    g.fillTriangle(first[0], first[1], a[0], a[1], b[0], b[1]);
  }
}

/** The same fan for a shape whose four corners are already to hand. */
function quad(
  g: Phaser.GameObjects.Graphics,
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number,
): void {
  fan(g, [[ax, ay], [bx, by], [cx, cy], [dx, dy]]);
}

/** Owns an illustration and its motion. Judgement arrives already decided; it is never computed here. */
export class SawTimberVignette implements Vignette {
  private readonly backdrop: Backdrop;
  private readonly stage: Phaser.GameObjects.Container;
  private readonly horses: Phaser.GameObjects.Graphics;
  private readonly timber: Phaser.GameObjects.Container;
  private readonly board: Phaser.GameObjects.Graphics;
  private readonly kerfG: Phaser.GameObjects.Graphics;
  private readonly marks: Phaser.GameObjects.Graphics;
  private readonly offcut: Phaser.GameObjects.Container;
  private readonly offcutArt: Phaser.GameObjects.Graphics;
  private readonly sawRoot: Phaser.GameObjects.Container;
  private readonly sawG: Phaser.GameObjects.Graphics;
  private readonly dust: Phaser.GameObjects.Graphics;
  private readonly boardSurface: Phaser.GameObjects.TileSprite;
  private readonly offcutSurface: Phaser.GameObjects.TileSprite;
  private readonly bursts: Feedback;
  private plan: RoundPlan | null = null;
  private phase: Phase = 'idle';
  /**
   * When the turn starts changing hands: two beats before the player's first target,
   * inside the demonstration's own bar. Only the stage light moves this early.
   */
  private handoverAt = Infinity;
  private lastDemo = -Infinity;
  private strokes = 0;
  private bites = 0;
  private strokeAt = -100;
  private kerf = 0;
  private kerfFrom = 0;
  private kerfTo = 0;
  private kerfAt = -100;
  /** Off strokes walk the cut off the line. Presentation of outcomes, never a grade. */
  private drift = 0;
  private scuffs: number[] = [];
  private judderAt = -100;
  /** 1 while the teeth are in the kerf, 0 while the saw is held clear of the board. */
  private engaged = 1;
  private finishAt: number | null = null;
  private finished = false;
  private successful = false;
  /** The dropped offcut has hit the floor and thrown its one puff of dust. */
  private landed = false;
  private lastNow = 0;
  private baseX = 0;
  private baseY = 0;
  private scale = 1;
  /** Read per use, so a preference change applies mid-scene. */
  private get reducedMotion(): boolean { return reducedMotion(); }

  public constructor(scene: Phaser.Scene) {
    // The pool of light sits over the cut, which is what the eye is meant to follow.
    this.backdrop = new Backdrop(scene, TIMBER.paper, TIMBER.lit, { glowAt: { x: 0.45, y: 0.4 } });
    this.stage = scene.add.container(0, 0).setDepth(-10);
    this.horses = scene.add.graphics();
    this.timber = scene.add.container(TIMBER_X, TIMBER_Y).setRotation(TILT);
    this.board = scene.add.graphics();
    // The grain tile rides inside the tilted container, so it runs along the board.
    this.boardSurface = grainTile(scene, BOARD_LEFT, 0, CUT_X - KERF_HALF - BOARD_LEFT, THICK);
    this.kerfG = scene.add.graphics();
    this.marks = scene.add.graphics();
    this.offcutArt = scene.add.graphics();
    this.offcutSurface = grainTile(scene, 0, -THICK, BOARD_RIGHT - CUT_X - KERF_HALF, THICK);
    // The hinge is the bottom of the kerf, so a rough cut can swing from it.
    this.offcut = scene.add.container(CUT_X + KERF_HALF, THICK);
    this.offcut.add([this.offcutArt, this.offcutSurface]);
    this.timber.add([this.board, this.boardSurface, this.offcut, this.kerfG, this.marks]);
    this.sawRoot = scene.add.container(TIMBER_X, TIMBER_Y).setRotation(TILT);
    this.sawG = scene.add.graphics();
    this.sawRoot.add(this.sawG);
    this.dust = scene.add.graphics();
    this.stage.add([this.horses, this.timber, this.sawRoot, this.dust]);
    this.bursts = new Feedback(scene, -10, this.stage);
  }

  /**
   * A point on the blade. `axis` runs along the teeth from the kerf toward the handle;
   * `off` rises perpendicular to them, so the tooth edge is always the lower boundary
   * and off zero is exactly the line that meets the wood.
   */
  private blade(axis: number, off: number): [number, number] {
    const c = Math.cos(-SAW_MOTION.bladeTiltRad);
    const s = Math.sin(-SAW_MOTION.bladeTiltRad);
    return [CUT_X + axis * c + off * s, axis * s - off * c];
  }

  private plank(g: Phaser.GameObjects.Graphics, left: number, right: number, top: number): void {
    const wood = faces(TIMBER.sapwood);
    const line = STYLE.current.outline * 1.4;
    if (line > 0) g.lineStyle(line, shade(TIMBER.sapwood, -0.6), 1).strokeRect(left, top, right - left, THICK);
    g.fillStyle(wood.face).fillRect(left, top, right - left, THICK);
    g.fillStyle(wood.lit).fillRect(left, top, right - left, 9);
    g.fillStyle(wood.rim, 0.6).fillRect(left, top, right - left, 3);
    g.fillStyle(wood.shade).fillRect(left, top + THICK - 8, right - left, 8);
    // Deterministic growth lines, baked once. No texture download and no per-frame sampling.
    g.lineStyle(1.5, TIMBER.grain, 0.34);
    for (let row = 0; row < 5; row++) {
      const y = top + 15 + row * 15;
      g.beginPath();
      for (let x = left; x <= right; x += 40) {
        const wave = Math.sin(x / 155 + row * 0.8) * 3.4 + Math.sin(x / 61 + row) * 1.5;
        if (x === left) g.moveTo(x, y + wave); else g.lineTo(x, y + wave);
      }
      g.strokePath();
    }
  }

  public layout(viewport: Viewport): void {
    const { safe } = viewport;
    // The blade rises to the right, so the cut sits left of centre to leave the handle
    // room inside the frame. The board is meant to run off both edges; the handle is not.
    this.scale = Math.min(safe.width / 980, safe.height / 1380);
    this.baseX = safe.centerX - 110 * this.scale;
    this.baseY = safe.top + safe.height * 0.6;
    this.stage.setPosition(this.baseX, this.baseY).setScale(this.scale);
    this.backdrop.layout(viewport);
    this.plank(this.board.clear(), BOARD_LEFT, CUT_X - KERF_HALF, 0);
    this.plank(this.offcutArt.clear(), 0, BOARD_RIGHT - CUT_X - KERF_HALF, -THICK);
    const h = this.horses.clear();
    // The floor now lives in stage space rather than on the backdrop, so it stays
    // anchored to the sawhorses' own ground line however the stage is scaled.
    h.fillStyle(TIMBER.grip, 0.06).fillRect(-3000, GROUND_Y, 6000, 3000);
    const slate = faces(TIMBER.ink);
    const line = STYLE.current.outline * 1.4;
    for (const lx of HORSE_X) {
      const c = Math.cos(TILT);
      const s = Math.sin(TILT);
      const x = TIMBER_X + lx * c - THICK * s;
      const y = TIMBER_Y + lx * s + THICK * c;
      const drop = castShadow(9);
      h.fillStyle(TIMBER.ink, drop.alpha).fillEllipse(x + drop.dx, GROUND_Y + 8, 250, 22);
      // Legs first, then the bar over them, so the joint reads as a lap rather than a cross.
      if (line > 0) {
        h.lineStyle(13 + line, slate.edge);
        h.lineBetween(x - 58, y + 4, x - 86, GROUND_Y);
        h.lineBetween(x + 58, y + 4, x + 86, GROUND_Y);
      }
      h.lineStyle(13, slate.face);
      h.lineBetween(x - 58, y + 4, x - 86, GROUND_Y);
      h.lineBetween(x + 58, y + 4, x + 86, GROUND_Y);
      h.lineStyle(9, slate.shade, 0.85).lineBetween(x - 72, y + 96, x + 72, y + 96);
      // A diagonal brace, so the trestle reads as joinery rather than two propped sticks.
      h.lineStyle(7, slate.shade, 0.8).lineBetween(x - 64, y + 30, x + 74, y + 96);
      if (line > 0) h.lineStyle(line, slate.edge, 1).strokeRoundedRect(x - 78, y - 9, 156, 18, 5);
      h.fillStyle(slate.face).fillRoundedRect(x - 78, y - 9, 156, 18, 5);
      h.fillStyle(slate.lit).fillRoundedRect(x - 78, y - 9, 156, 7, 5);
      // A sacrificial timber cap under the board, the one place the trestle borrows the board's colour.
      const cap = faces(TIMBER.sapwood);
      if (line > 0) h.lineStyle(line * 0.7, shade(TIMBER.sapwood, -0.6), 1).strokeRoundedRect(x - 84, y - 20, 168, 12, 3);
      h.fillStyle(cap.face).fillRoundedRect(x - 84, y - 20, 168, 12, 3);
      h.fillStyle(cap.lit).fillRoundedRect(x - 84, y - 20, 168, 4, 2);
    }
  }

  public reset(plan: RoundPlan): void {
    this.plan = plan;
    this.phase = 'prepare';
    this.lastDemo = -Infinity;
    this.strokes = this.bites = 0;
    this.strokeAt = -100;
    this.kerf = this.kerfFrom = this.kerfTo = 0;
    this.handoverAt = handoverAt(plan);
    this.kerfAt = -100;
    this.drift = 0;
    this.scuffs = [];
    this.judderAt = -100;
    this.finishAt = null;
    this.finished = false;
    this.successful = false;
    this.landed = false;
  }

  public onPhase(phase: Phase, now: number): void {
    this.phase = phase;
    // The demonstration strokes the board without cutting it, so the player starts on the
    // board they watched and nothing has to be swapped in the instant before their turn.
    // Keep the last demonstration stroke on the blade. Zeroing strokeAt here parked it
    // at rest in the same instant the player's first bite had to start, and a half-beat
    // gap is shorter than the follow-through.
    if (phase === 'respond') { this.setKerf(0, now); }
  }

  private setKerf(value: number, now: number): void {
    this.kerfFrom = this.kerf;
    this.kerfTo = clamp01(value);
    this.kerfAt = now;
  }

  private stroke(now: number): void {
    this.strokes++;
    this.strokeAt = now;
  }

  public onDemonstrationBeat(time: number): void {
    const accepted = acceptDemoBeat(this.lastDemo, time);
    if (accepted === null) return;
    this.lastDemo = accepted;
    // The stroke, the teeth and the dust all play; only the cut itself is withheld. There
    // is no bar between the demonstration and the response in which to replace the board.
    this.stroke(time);
  }

  public onPlayerHit(now: number): void {
    if (!isPlayerTurn(this.phase)) return;
    this.stroke(now);
  }

  /**
   * Chips thrown off the teeth. The falling plume stays hand drawn beside this: it is
   * scaled by the task's own tempo, which a particle's fixed lifetime cannot follow.
   */
  private chips(): void {
    if (this.reducedMotion) return;
    const c = Math.cos(TILT), s = Math.sin(TILT);
    this.bursts.burst('chips', TIMBER_X + CUT_X * c, TIMBER_Y + CUT_X * s - 6, [TIMBER.sawdust, TIMBER.lit], 6);
  }

  public onAccuracy(result: Judgement, now: number): void {
    const bites = advanceBite(this.bites, result.kind);
    if (bites !== this.bites) {
      this.bites = bites;
      this.setKerf(kerfDepth(bites, this.plan?.targets.length ?? 3), now);
      this.chips();
      return;
    }
    // An extra tap skids across the face and leaves a scuff; an omission leaves the
    // kerf exactly where it was and judders. Neither invents a stroke.
    if (result.kind === 'extra') this.scuffs.push(sawDirection(this.strokes - 1) * (40 + this.scuffs.length * 26));
    else this.judderAt = now;
    this.drift = Math.min(22, this.drift + 4);
  }

  public finish(successful: boolean, contactSec: number): void {
    this.successful = successful;
    this.finishAt = contactSec;
  }
  public pause(): void { this.phase = 'paused'; this.finishAt = null; this.strokeAt = -100; }

  /** Only known beats are anticipated: the demonstration's, and the coda's contact. */
  private upcoming(now: number): number | null {
    if (this.finishAt !== null && !this.finished) return this.finishAt;
    if (this.phase !== 'prepare' && this.phase !== 'demonstrate') return null;
    return this.plan?.cues.find(cue => cue.kind === 'action' && cue.time > now)?.time ?? null;
  }

  /** Seconds per beat of the task in progress; the stroke's phases are fractions of it. */
  private beat(): number { return this.plan ? 60 / this.plan.bpm : REFERENCE_BEAT; }

  /** Travel along the blade in board units. The bite is at zero; direction alternates. */
  private offset(now: number): number {
    const beat = this.beat();
    const current = sawDirection(this.strokes - 1) * strokeTravel(now - this.strokeAt, beat);
    const next = this.upcoming(now);
    if (next === null || next - now >= sawTiming(beat).drawBackSec) return current * SAW_MOTION.travel;
    // The next stroke reverses, so blend into its frame rather than snapping back.
    const dir = sawDirection(this.strokes);
    return dir * drawBack(next - now, current * dir, beat) * SAW_MOTION.travel;
  }

  /**
   * The stage light opens toward the player the instant their turn starts, and holds open
   * through the ending. It is the handover said without words, now that no bar separates
   * the demonstration from the response.
   */
  private openStage(now: number): void {
    this.backdrop.open(turnOpen(now, this.handoverAt, this.phase));
  }
  public update(now: number): void {
    if (this.phase === 'paused') now = this.lastNow; else this.lastNow = now;
    this.openStage(now);
    // Rendering may observe a beat before the controller's next pump. Contact is
    // sampled from the same absolute cue, so a throttled frame cannot shift it.
    if (this.phase === 'prepare' || this.phase === 'demonstrate') {
      for (const cue of this.plan?.cues ?? []) {
        if (cue.kind === 'action' && cue.time <= now) this.onDemonstrationBeat(cue.time);
      }
    }
    this.kerf = this.kerfFrom + (this.kerfTo - this.kerfFrom) * easeOut((now - this.kerfAt) / 0.09);
    if (this.finishAt !== null && now >= this.finishAt && !this.finished) {
      this.finished = true;
      this.stroke(this.finishAt);
      // An unscored finishing stroke severs the plank. It never changes the result.
      this.setKerf(1, this.finishAt);
      if (!this.successful) this.drift = Math.max(this.drift, 14);
    }
    const beat = this.beat();
    const age = now - this.strokeAt;
    const { dustSec } = sawTiming(beat);
    const bite = age >= 0 && age < dustSec ? 1 - age / dustSec : 0;
    const press = age >= 0 && age < 0.16 ? Math.sin(age / 0.16 * Math.PI) * STYLE.current.exaggeration : 0;
    // The offset is relative to the board's own anchor, which the flex adds to rather
    // than replaces.
    this.timber.setPosition(TIMBER_X, TIMBER_Y + (this.reducedMotion ? 0 : press * 1.8));
    const shake = this.reducedMotion || age < 0 || age > 0.19 ? 0 : Math.sin(age * 112) * Math.exp(-age * 21) * 2.2 * STYLE.current.exaggeration;
    this.stage.setPosition(this.baseX + shake * this.scale, this.baseY + shake * this.scale * 0.4);
    this.poseSaw(now);
    this.drawKerf();
    this.drawMarks(now);
    this.drawDust(now, bite);
    this.settleOffcut(now);
  }

  private poseSaw(now: number): void {
    const age = now - this.strokeAt;
    let lift = 0;
    const parked = age > 0.5 && (this.phase === 'idle' || this.phase === 'prepare');
    if (parked) lift = 30 + (this.reducedMotion ? 0 : Math.sin(now * 1.5) * 2.5);
    this.sawG.y = -lift;
    this.engaged = lift > 4 ? 0 : 1;
    const slide = parked ? -0.55 * SAW_MOTION.travel : this.offset(now);
    const judder = now - this.judderAt < 0.22 && !this.finished
      ? Math.sin((now - this.judderAt) * 96) * Math.exp(-(now - this.judderAt) * 14) * 5 : 0;
    // The saw rocks about the teeth in the kerf, so the pivot is the bite point, not the
    // container's origin: move the graphics so that point stays put under the rotation.
    const rock = this.reducedMotion || parked ? 0 : sawRock(slide);
    this.sawG.setRotation(rock);
    this.sawG.setPosition(CUT_X - CUT_X * Math.cos(rock), -lift - CUT_X * Math.sin(rock));
    this.drawSaw(slide + judder);
  }

  /** Points authored along and off the blade, mapped into the saw's frame as one flat list. */
  private along(points: readonly (readonly [number, number])[]): number[] {
    const out: number[] = [];
    for (const [axis, off] of points) out.push(...this.blade(axis, off));
    return out;
  }

  /** The closed D-grip, its bolts, and the gloved hand and sleeve that carry the saw off frame. */
  private drawHandle(g: Phaser.GameObjects.Graphics, heel: number, line: number): void {
    const grip = faces(TIMBER.grip);
    const h = heel + 6;
    // Grip plate bolted over the heel, then the closed loop the hand goes through.
    const outer = this.along([
      [h - 14, 4], [h + 30, 2], [h + 70, 10], [h + 102, 30], [h + 118, 56], [h + 112, 84],
      [h + 92, 100], [h + 62, 100], [h + 34, 90], [h + 14, 66], [h - 6, 40],
    ]);
    paintedContour(g, outer, grip.face, grip.edge, line);
    g.fillStyle(grip.shade);
    fillContour(g, this.along([[h + 62, 100], [h + 92, 100], [h + 112, 84], [h + 118, 56], [h + 108, 60], [h + 100, 82], [h + 84, 94]]));
    g.fillStyle(grip.lit, 0.8);
    fillContour(g, this.along([[h + 8, 12], [h + 30, 8], [h + 70, 16], [h + 98, 34], [h + 92, 40], [h + 66, 24], [h + 30, 16], [h + 10, 18]]));
    // The hole is the paper behind the saw: the grip is a loop, not a slab.
    paintedContour(g, this.along([[h + 40, 34], [h + 70, 30], [h + 92, 48], [h + 90, 72], [h + 68, 84], [h + 44, 74], [h + 34, 54]]), TIMBER.paper, grip.edge, line * 0.7);
    g.fillStyle(TIMBER.sawdust);
    for (const [u, v] of [[heel - 22, 22], [heel - 62, 34]] as const) { const [x, y] = this.blade(u, v); g.fillCircle(x, y, 6); }
    // The glove wraps the far side of the loop: four fingers over the bar, thumb on top.
    const glove = faces(TIMBER.glove);
    paintedContour(g, this.along([
      [h + 48, 26], [h + 84, 22], [h + 112, 40], [h + 126, 66], [h + 118, 96], [h + 92, 112],
      [h + 60, 108], [h + 40, 92], [h + 36, 66], [h + 40, 44],
    ]), glove.face, glove.edge, line);
    g.fillStyle(glove.shade, 0.7);
    fillContour(g, this.along([[h + 40, 92], [h + 60, 108], [h + 92, 112], [h + 118, 96], [h + 110, 92], [h + 88, 102], [h + 62, 98], [h + 46, 86]]));
    g.lineStyle(3, glove.edge, 0.7);
    for (let i = 0; i < 3; i++) {
      const u = h + 58 + i * 16;
      const [ax, ay] = this.blade(u, 50), [bx, by] = this.blade(u + 4, 100);
      g.lineBetween(ax, ay, bx, by);
    }
    paintedContour(g, this.along([[h + 44, 30], [h + 70, 18], [h + 96, 22], [h + 100, 34], [h + 76, 36], [h + 52, 44]]), glove.lit, glove.edge, line * 0.8);
    // Cuff and sleeve: the arm runs along the blade's line and leaves the frame on the right.
    paintedContour(g, this.along([[h + 108, 32], [h + 136, 30], [h + 140, 100], [h + 114, 104]]), TIMBER.lit, shade(TIMBER.lit, -0.5), line * 0.8);
    const sleeve = faces(TIMBER.sleeve);
    paintedContour(g, this.along([[h + 132, 34], [h + 520, 20], [h + 520, 118], [h + 136, 100]]), sleeve.face, sleeve.edge, line);
    g.fillStyle(sleeve.lit, 0.6);
    fillContour(g, this.along([[h + 136, 40], [h + 520, 26], [h + 520, 40], [h + 138, 52]]));
  }

  /**
   * The blade, slid to `slide` board units from the bite and cut off where it enters the
   * wood. Both ends travel: the steel is rigid, and what changes is how much of it the
   * cut has swallowed, never how long it is.
   */
  private drawSaw(slide: number): void {
    const g = this.sawG.clear();
    const span = bladeSpan(slide);
    const { heel, toothCut } = span;
    if (heel - toothCut < 40) return;
    // The steel is cut off along the board's top face, so it goes into the wood rather
    // than ending in mid-air above it. The outline comes back with four corners for most
    // of the stroke and five at the end of a push.
    const steelPoints = bladeOutline(span).map(([axis, off]) => this.blade(axis, off));
    const [tx, ty] = this.blade(toothCut, 0);
    const [hx, hy] = this.blade(heel, 0);
    const steel = faces(TIMBER.steel);
    const line = STYLE.current.outline * 1.4;
    const drop = castShadow(8);
    g.fillStyle(TIMBER.ink, drop.alpha);
    fan(g, steelPoints.map(([x, y]) => [x + drop.dx, y + drop.dy] as const));
    if (line > 0) {
      g.lineStyle(line, shade(TIMBER.steel, -0.6), 1).beginPath();
      steelPoints.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
      g.closePath().strokePath();
    }
    g.fillStyle(steel.face);
    fan(g, steelPoints);
    // A lit line down the blade's back keeps a flat polygon reading as sheet steel. It
    // follows the taper, so it stays the same distance inside the back edge all the way.
    const lit = bladeBackLine(span, 8);
    if (lit) {
      const [l1x, l1y] = this.blade(lit[0][0], lit[0][1]);
      const [l2x, l2y] = this.blade(lit[1][0], lit[1][1]);
      g.lineStyle(3, 0xd6dee2, 0.75).lineBetween(l1x, l1y, l2x, l2y);
    }
    // A maker's etch mid-blade, faint, so the sheet reads as steel rather than a grey
    // polygon. It is stamped on the steel, so it travels with it and fades out as the cut
    // takes it rather than popping off at the clip.
    const etch = clamp01((span.mid - 60 - toothCut) / 40);
    if (etch > 0.01) {
      const mid = span.mid;
      g.lineStyle(1.5, TIMBER.ink, 0.22 * etch);
      traceContour(g, this.along([[mid - 60, 26], [mid - 20, 36], [mid + 40, 36], [mid + 70, 24], [mid + 40, 14], [mid - 20, 14]]));
      g.closePath().strokePath();
      const [e1x, e1y] = this.blade(mid - 40, 25), [e2x, e2y] = this.blade(mid + 50, 25);
      g.lineBetween(e1x, e1y, e2x, e2y);
    }
    g.lineStyle(2, TIMBER.ink, 0.35).lineBetween(tx, ty, hx, hy);
    // Set teeth: alternate teeth lean opposite ways, as a real crosscut saw's do. They are
    // phased to the blade, not to the cut, which is what makes the stroke read as a slide:
    // pinned to the kerf they stood still and simply multiplied.
    g.fillStyle(TIMBER.ink, 0.85);
    let parity = Math.round((span.firstTooth - span.toe - BLADE.toothInset) / BLADE.toothStep) & 1;
    for (let a = span.firstTooth; a < heel - 30; a += BLADE.toothStep, parity ^= 1) {
      const [ax, ay] = this.blade(a, 0);
      const [bx, by] = this.blade(a + BLADE.toothStep * 0.6, 0);
      const [cx, cy] = this.blade(a + BLADE.toothStep * (parity ? 0.42 : 0.18), -9);
      g.fillTriangle(ax, ay, bx, by, cx, cy);
    }
    this.drawHandle(g, heel, line);
  }

  private drawKerf(): void {
    const g = this.kerfG.clear();
    const depth = Math.min(THICK, bladeVisibleDepth(this.kerf));
    const severed = this.kerf >= 1;
    // Wood still joining the two lengths below the cut.
    if (!severed) {
      g.fillStyle(TIMBER.sapwood).fillRect(CUT_X - KERF_HALF, depth, KERF_HALF * 2, THICK - depth);
      g.fillStyle(TIMBER.ink, 0.14).fillRect(CUT_X - KERF_HALF, THICK - 6, KERF_HALF * 2, 6);
    }
    // The pencilled line the cut is meant to follow, still showing below the kerf.
    if (depth < THICK - 6) {
      g.lineStyle(2, TIMBER.pencil, 0.55);
      for (let y = Math.max(4, depth + 4); y < THICK - 6; y += 12) g.lineBetween(CUT_X, y, CUT_X, Math.min(THICK - 6, y + 7));
    }
    if (depth <= 0) {
      g.fillStyle(TIMBER.lit).fillRect(CUT_X - KERF_HALF, 0, KERF_HALF * 2, 7);
      g.lineStyle(2, TIMBER.pencil, 0.7).lineBetween(CUT_X - 12, -6, CUT_X + 12, -6);
      return;
    }
    // Torn fibres at the mouth of the kerf, where the teeth break the top edge.
    g.fillStyle(TIMBER.grain, 0.9);
    g.fillTriangle(CUT_X - KERF_HALF - 6, 0, CUT_X - KERF_HALF, 0, CUT_X - KERF_HALF - 2, 5);
    g.fillTriangle(CUT_X + KERF_HALF, 0, CUT_X + KERF_HALF + 7, 0, CUT_X + KERF_HALF + 3, 6);
    g.fillTriangle(CUT_X - KERF_HALF - 2, 0, CUT_X - KERF_HALF + 2, 0, CUT_X - KERF_HALF - 1, -4);
    // The cut wanders off the line as off strokes accumulate; the kerf stays vertical.
    const skew = this.drift * (depth / THICK);
    g.fillStyle(TIMBER.kerf);
    quad(g, CUT_X - KERF_HALF, 0, CUT_X + KERF_HALF, 0, CUT_X + KERF_HALF + skew, depth, CUT_X - KERF_HALF + skew, depth);
    g.fillStyle(TIMBER.ink, 0.3).fillRect(CUT_X - KERF_HALF, 0, KERF_HALF * 2, 4);
    // The blade is only ever visible down to the depth it has actually sawn.
    if (this.engaged > 0) {
      g.fillStyle(TIMBER.steel, 0.9).fillRect(CUT_X - 4 + skew, 1, 8, depth - 1);
    }
  }

  private drawMarks(now: number): void {
    const g = this.marks.clear();
    for (const at of this.scuffs) {
      g.lineStyle(3, TIMBER.grain, 0.5).lineBetween(CUT_X + at - 34, 12, CUT_X + at + 34, 15);
      g.lineStyle(1.5, TIMBER.kerf, 0.3).lineBetween(CUT_X + at - 26, 18, CUT_X + at + 30, 20);
    }
    if (this.finished && this.successful) {
      // One late mote of dust, after everything else has already settled.
      const p = clamp01((now - this.finishAt! - 0.95) / 0.34);
      if (p > 0 && p < 1) {
        g.fillStyle(TIMBER.sawdust, (1 - p) * 0.85);
        g.fillRect(CUT_X + 3, 6 + p * 74, 3.5, 4.5);
      }
    }
  }

  private drawDust(now: number, bite: number): void {
    const g = this.dust.clear();
    const c = Math.cos(TILT);
    const s = Math.sin(TILT);
    // The plume is thrown in stage space, so it keeps falling straight down while
    // the board itself is tilted.
    const ox = TIMBER_X + CUT_X * c;
    const oy = TIMBER_Y + CUT_X * s;
    // What has fallen so far lies in a heap on the floor under the cut. It follows the
    // kerf, so the demonstration's strokes leave the floor as clean as the board.
    const pile = dustPile(this.kerf);
    if (pile.height > 0) {
      g.fillStyle(TIMBER.ink, 0.1).fillEllipse(ox + 6, GROUND_Y + 4, pile.width * 1.1, pile.height * 0.5);
      g.fillStyle(shade(TIMBER.sawdust, -0.2)).fillEllipse(ox, GROUND_Y - pile.height / 2 + 2, pile.width, pile.height);
      g.fillStyle(TIMBER.sawdust).fillEllipse(ox - pile.width * 0.08, GROUND_Y - pile.height / 2 - 1, pile.width * 0.7, pile.height * 0.7);
      g.fillStyle(TIMBER.lit, 0.7).fillEllipse(ox - pile.width * 0.12, GROUND_Y - pile.height * 0.7, pile.width * 0.3, pile.height * 0.25);
    }
    if (bite <= 0 || this.kerf <= 0) return;
    const age = now - this.strokeAt;
    const beat = this.beat();
    const fall = dustFall(age, beat);
    const spread = easeOut(age / sawTiming(beat).dustSec) * 96;
    const dir = sawDirection(this.strokes - 1);
    for (let i = 0; i < DUST_MOTES; i++) {
      const seed = (i * 37 + 11) % 23;
      const x = ox + dir * (10 + seed * 3) + Math.cos(i * 1.7) * spread * 0.5;
      const y = oy - 6 - Math.sin(i * 2.3) * spread * 0.3 + fall * (0.6 + seed / 40);
      g.fillStyle(i % 3 ? TIMBER.sawdust : TIMBER.lit, bite * 0.9);
      g.fillRect(x, y, 2.5 + seed % 3, 3 + seed % 4);
    }
  }

  /** The offcut is unsupported, so the coda drops it. Rough cuts keep it by a hinge. */
  private settleOffcut(now: number): void {
    if (!this.finished || this.finishAt === null) {
      this.offcut.setPosition(CUT_X + KERF_HALF, THICK).setRotation(0);
      return;
    }
    const age = now - this.finishAt;
    if (this.successful) {
      const drop = easeOut(age / 0.42);
      const rock = Math.sin(age * 13) * Math.exp(-age * 5) * 0.03;
      this.offcut.setPosition(CUT_X + KERF_HALF + drop * 16, THICK + drop * 330);
      this.offcut.setRotation(age > 0.42 ? rock : -TILT * drop);
      if (age >= 0.42 && !this.landed) {
        this.landed = true;
        if (!this.reducedMotion) this.bursts.burst('dust', LANDING.x, LANDING.y, [TIMBER.sawdust, TIMBER.lit, TIMBER.grain], 9);
      }
    } else {
      // A splintered hinge takes the weight and the offcut swings from it.
      const swing = Math.sin(age * 5.4) * Math.exp(-age * 1.5) * 0.36 + easeOut(age / 0.5) * 0.3;
      this.offcut.setPosition(CUT_X + KERF_HALF, THICK).setRotation(this.reducedMotion ? 0.3 : swing);
    }
  }

  public translate(offset: number): void { this.stage.x += this.reducedMotion ? 0 : offset; }
  public destroy(): void { this.bursts.destroy(); this.stage.destroy(true); this.backdrop.destroy(); }
}
