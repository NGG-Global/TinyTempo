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
import type { Vignette } from './Vignette';
import {
  advanceBite, acceptDemoBeat, bladeVisibleDepth, clamp01, drawBack, dustFall,
  easeOut, kerfDepth, REFERENCE_BEAT, SAW_MOTION, sawDirection, sawTiming, strokeTravel,
} from './sawMotion';
import { isPlayerTurn, TURN_OPEN_SEC } from './motion';

/** Cold linen and slate. Sawdust is the only warm note, so the accent doubles as the reward. */
export const TIMBER = {
  paper: 0xe6e9e4, ink: 0x22303a, sapwood: 0xcbb999, lit: 0xe4d8c0,
  grain: 0xa89070, kerf: 0x544a39, steel: 0xaab6bd, grip: 0x3f5a63, sawdust: 0xd8a24a,
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
// Half the blade reaches past the kerf at the bite; the rest carries the handle.
const BLADE_BACK = 430;
const BLADE_TIP = -170;
const TOOTH_STEP = 22;
// Graphics re-tessellate every frame, so the dust plume is a fixed small budget.
const DUST_MOTES = 9;

/** A convex quad as two triangles. `fillPoints` wants Vector2 instances, which would
    mean importing Phaser at runtime for four corners. */
function quad(
  g: Phaser.GameObjects.Graphics,
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number,
): void {
  g.fillTriangle(ax, ay, bx, by, cx, cy);
  g.fillTriangle(ax, ay, cx, cy, dx, dy);
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
  /** When the player's turn began; the stage light opens toward them from here. */
  private respondAt = -100;
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
      if (line > 0) h.lineStyle(line, slate.edge, 1).strokeRoundedRect(x - 78, y - 9, 156, 18, 5);
      h.fillStyle(slate.face).fillRoundedRect(x - 78, y - 9, 156, 18, 5);
      h.fillStyle(slate.lit).fillRoundedRect(x - 78, y - 9, 156, 7, 5);
    }
  }

  public reset(plan: RoundPlan): void {
    this.plan = plan;
    this.phase = 'prepare';
    this.lastDemo = -Infinity;
    this.strokes = this.bites = 0;
    this.strokeAt = -100;
    this.kerf = this.kerfFrom = this.kerfTo = 0;
    this.respondAt = -100;
    this.kerfAt = -100;
    this.drift = 0;
    this.scuffs = [];
    this.judderAt = -100;
    this.finishAt = null;
    this.finished = false;
    this.successful = false;
  }

  public onPhase(phase: Phase, now: number): void {
    this.phase = phase;
    // The demonstration strokes the board without cutting it, so the player starts on the
    // board they watched and nothing has to be swapped in the instant before their turn.
    // Keep the last demonstration stroke on the blade. Zeroing strokeAt here parked it
    // at rest in the same instant the player's first bite had to start, and a half-beat
    // gap is shorter than the follow-through.
    if (phase === 'respond') { this.setKerf(0, now); this.respondAt = now; }
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
    const offered = this.phase === 'respond' || this.phase === 'result';
    this.backdrop.open(offered ? easeOut((now - this.respondAt) / TURN_OPEN_SEC) : 0);
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
    this.drawSaw(slide + judder);
  }

  private drawSaw(slide: number): void {
    const g = this.sawG.clear();
    const tip = Math.max(0, BLADE_TIP + slide);
    const heel = BLADE_BACK + slide;
    if (heel - tip < 40) return;
    const [tx, ty] = this.blade(tip, 0);
    const [hx, hy] = this.blade(heel, 0);
    const [hbx, hby] = this.blade(heel, 58);
    const [tbx, tby] = this.blade(tip, 34);
    const steel = faces(TIMBER.steel);
    const line = STYLE.current.outline * 1.4;
    const drop = castShadow(8);
    g.fillStyle(TIMBER.ink, drop.alpha);
    quad(g, tx + drop.dx, ty + drop.dy, hx + drop.dx, hy + drop.dy, hbx + drop.dx, hby + drop.dy, tbx + drop.dx, tby + drop.dy);
    if (line > 0) {
      g.lineStyle(line, shade(TIMBER.steel, -0.6), 1).beginPath()
        .moveTo(tx, ty).lineTo(hx, hy).lineTo(hbx, hby).lineTo(tbx, tby).closePath().strokePath();
    }
    g.fillStyle(steel.face);
    quad(g, tx, ty, hx, hy, hbx, hby, tbx, tby);
    // A lit line down the blade's back keeps a flat polygon reading as sheet steel.
    const [l1x, l1y] = this.blade(tip, 40);
    const [l2x, l2y] = this.blade(heel, 50);
    g.lineStyle(3, 0xd6dee2, 0.75).lineBetween(l1x, l1y, l2x, l2y);
    g.lineStyle(2, TIMBER.ink, 0.35).lineBetween(tx, ty, hx, hy);
    g.fillStyle(TIMBER.ink, 0.8);
    for (let a = tip + 4; a < heel - 30; a += TOOTH_STEP) {
      const [ax, ay] = this.blade(a, 0);
      const [bx, by] = this.blade(a + TOOTH_STEP * 0.55, 0);
      const [cx, cy] = this.blade(a + TOOTH_STEP * 0.28, -7);
      g.fillTriangle(ax, ay, bx, by, cx, cy);
    }
    // Handle: a slate grip with two brass nuts, the only warm note besides the dust.
    const [gx, gy] = this.blade(heel + 42, 30);
    const grip = faces(TIMBER.grip);
    if (line > 0) g.lineStyle(line, grip.edge, 1).strokeRoundedRect(gx - 46, gy - 52, 96, 104, 26);
    g.fillStyle(grip.shade).fillRoundedRect(gx - 46, gy - 52, 96, 104, 26);
    g.fillStyle(grip.face).fillRoundedRect(gx - 46, gy - 52, 96, 92, 26);
    g.fillStyle(grip.lit, 0.8).fillRoundedRect(gx - 36, gy - 48, 72, 10, 5);
    g.fillStyle(TIMBER.paper, 0.14).fillRoundedRect(gx - 34, gy - 40, 70, 22, 11);
    g.fillStyle(TIMBER.paper).fillRoundedRect(gx - 22, gy - 26, 42, 52, 15);
    g.fillStyle(TIMBER.sawdust);
    const [n1x, n1y] = this.blade(heel - 26, 26);
    const [n2x, n2y] = this.blade(heel - 70, 34);
    g.fillCircle(n1x, n1y, 6).fillCircle(n2x, n2y, 6);
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
    if (depth <= 0) {
      g.fillStyle(TIMBER.lit).fillRect(CUT_X - KERF_HALF, 0, KERF_HALF * 2, 7);
      return;
    }
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
    if (bite <= 0 || this.kerf <= 0) return;
    const age = now - this.strokeAt;
    const beat = this.beat();
    const fall = dustFall(age, beat);
    const spread = easeOut(age / sawTiming(beat).dustSec) * 96;
    const dir = sawDirection(this.strokes - 1);
    const c = Math.cos(TILT);
    const s = Math.sin(TILT);
    // The plume is thrown in stage space, so it keeps falling straight down while
    // the board itself is tilted.
    const ox = TIMBER_X + CUT_X * c;
    const oy = TIMBER_Y + CUT_X * s;
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
    } else {
      // A splintered hinge takes the weight and the offcut swings from it.
      const swing = Math.sin(age * 5.4) * Math.exp(-age * 1.5) * 0.36 + easeOut(age / 0.5) * 0.3;
      this.offcut.setPosition(CUT_X + KERF_HALF, THICK).setRotation(this.reducedMotion ? 0.3 : swing);
    }
  }

  public translate(offset: number): void { this.stage.x += this.reducedMotion ? 0 : offset; }
  public destroy(): void { this.bursts.destroy(); this.stage.destroy(true); this.backdrop.destroy(); }
}
