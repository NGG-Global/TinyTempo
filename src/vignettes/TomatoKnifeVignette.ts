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
  acceptDemoBeat, advanceSlice, clamp01, cutFraction, easeOut, juiceFall, knifeLift, knifeWindup,
  REFERENCE_BEAT, sliceTumble, TOMATO_MOTION, tomatoTiming,
} from './tomatoMotion';
import { isPlayerTurn, TURN_OPEN_SEC } from './motion';

/** A white-tiled kitchen. The tomato is the only saturated thing in it, so it is the subject. */
export const KITCHEN = {
  paper: 0xf6f7f2, ink: 0x33402f, grout: 0xc9d8cc, counter: 0x9fb3a6,
  board: 0xe3cfa6, boardEdge: 0xb8965f, boardLine: 0xcdb383,
  tomato: 0xd94a3a, tomatoLit: 0xee7c6a, flesh: 0xe35f4a, fleshRing: 0xf0a08e, seed: 0xf5d98a,
  stem: 0x4d7c3a, stemLit: 0x6f9c4c,
  steel: 0xd3dadd, steelLit: 0xf4f7f8, steelDark: 0x9aa5aa, handle: 0x2b2b30, rivet: 0xb9c2c6,
} as const;

// The board's top face is y = 0 in stage space; everything on it sits above that line.
const BOARD_LEFT = -370;
const BOARD_RIGHT = 470;
const BOARD_THICK = 42;
const TOMATO_X = -70;
const RX = TOMATO_MOTION.radiusX;
const RY = TOMATO_MOTION.radiusY;
// Slices come off the right side of the tomato and lean against each other to its right,
// which keeps the knife's descent over cleared board rather than through uncut fruit.
const PILE_X = 168;
const PILE_STEP = 30;
const SLICE_RX = 64;
const SLICE_RY = 118;
const LEAN = 0.42;
const BLADE_LEN = 266;
const HANDLE_LEN = 136;
// Graphics re-tessellate every frame, so curves use a fixed small point budget.
const ARC_STEPS = 26;
const JUICE_DROPS = 6;

/** Fills a convex polygon as a fan of triangles: `fillPoints` wants Vector2 instances. */
function fan(g: Phaser.GameObjects.Graphics, pts: readonly number[]): void {
  for (let i = 2; i + 1 < pts.length; i += 2) {
    g.fillTriangle(pts[0]!, pts[1]!, pts[i]!, pts[i + 1]!, pts[i + 2] ?? pts[0]!, pts[i + 3] ?? pts[1]!);
  }
}

/** Points of an ellipse rotated by `tilt`, as a flat x,y list. */
function disc(cx: number, cy: number, a: number, b: number, tilt: number): number[] {
  const pts: number[] = [];
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  for (let i = 0; i < ARC_STEPS; i++) {
    const t = i / ARC_STEPS * Math.PI * 2;
    const x = a * Math.cos(t);
    const y = b * Math.sin(t);
    pts.push(cx + x * c - y * s, cy + x * s + y * c);
  }
  return pts;
}

/** Owns an illustration and its motion. Judgement arrives already decided; it is never computed here. */
export class TomatoKnifeVignette implements Vignette {
  private readonly backdrop: Backdrop;
  private readonly wall: Phaser.GameObjects.Graphics;
  private readonly boardSurface: Phaser.GameObjects.TileSprite;
  private readonly bursts: Feedback;
  private readonly stage: Phaser.GameObjects.Container;
  private readonly boardG: Phaser.GameObjects.Graphics;
  private readonly produce: Phaser.GameObjects.Container;
  private readonly tomatoG: Phaser.GameObjects.Graphics;
  private readonly slicesG: Phaser.GameObjects.Graphics;
  private readonly marks: Phaser.GameObjects.Graphics;
  private readonly juice: Phaser.GameObjects.Graphics;
  private readonly knife: Phaser.GameObjects.Container;
  private readonly rings: Phaser.GameObjects.Graphics;
  private plan: RoundPlan | null = null;
  private phase: Phase = 'idle';
  /** When the player's turn began; the stage light opens toward them from here. */
  private respondAt = -100;
  private lastDemo = -Infinity;
  private strikes = 0;
  private strikeAt = -100;
  /** Where the edge meets the board. A hit lands at the cut; an extra lands on bare board. */
  private strikeX = 0;
  private slices = 0;
  private sliceAt: number[] = [];
  private sliceFrom: number[] = [];
  private sliceWobble: number[] = [];
  private cut = 0;
  private cutFrom = 0;
  private cutTo = 0;
  private cutAt = -100;
  /** Off chops make later slices uneven. Presentation of outcomes, never a grade. */
  private uneven = 0;
  private nicks: number[] = [];
  private judderAt = -100;
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
    // The pool of light sits over the board, where the work happens. It is barely warm
    // and weak: this kitchen is deliberately cool, with the fruit the only saturated
    // thing in frame, and a paper-on-paper pool at full strength simply bleached it.
    this.backdrop = new Backdrop(scene, KITCHEN.paper, KITCHEN.board, { glowAt: { x: 0.42, y: 0.42 }, glowAlpha: 0.45 });
    // The tiled wall and the counter, under the pool so the light falls across them.
    this.wall = scene.add.graphics().setDepth(-20);
    this.stage = scene.add.container(0, 0).setDepth(-10);
    this.boardG = scene.add.graphics();
    this.boardSurface = scene.add.tileSprite(BOARD_LEFT + 14, 8, BOARD_RIGHT - BOARD_LEFT - 28, BOARD_THICK - 14, MaterialKey.wood)
      .setOrigin(0).setTint(KITCHEN.board).setAlpha(0.5 * STYLE.current.grain);
    this.boardSurface.setTileScale(0.3, 0.3);
    this.produce = scene.add.container(0, 0);
    this.tomatoG = scene.add.graphics();
    this.slicesG = scene.add.graphics();
    this.marks = scene.add.graphics();
    this.juice = scene.add.graphics();
    this.produce.add([this.marks, this.tomatoG, this.slicesG, this.juice]);
    this.knife = scene.add.container(0, 0);
    this.knife.add(this.drawKnife(scene));
    this.rings = scene.add.graphics();
    this.stage.add([this.boardG, this.boardSurface, this.produce, this.rings, this.knife]);
    this.bursts = new Feedback(scene, -10, this.stage);
    this.cut = this.cutFrom = this.cutTo = this.cutStart();
  }

  /** The cut begins at the tomato's right edge and advances left as slices come off. */
  private cutStart(): number { return TOMATO_X + RX; }
  private cutFor(fraction: number): number { return this.cutStart() - 2 * RX * fraction; }

  private drawKnife(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
    // The tip is the origin and the pivot: a rocking chop keeps it near the board.
    const g = scene.add.graphics();
    const line = STYLE.current.outline * 1.4;
    const blade = [0, 0, BLADE_LEN, 0, BLADE_LEN, -72, 210, -74, 120, -62, 40, -34, 8, -8];
    const drop = castShadow(8);
    g.fillStyle(KITCHEN.ink, drop.alpha);
    fan(g, blade.map((v, i) => v + (i % 2 ? drop.dy : drop.dx)));
    if (line > 0) {
      g.lineStyle(line, shade(KITCHEN.steel, -0.55), 1).beginPath();
      for (let i = 0; i < blade.length; i += 2) g[i === 0 ? 'moveTo' : 'lineTo'](blade[i]!, blade[i + 1]!);
      g.closePath().strokePath();
    }
    g.fillStyle(KITCHEN.steel);
    fan(g, blade);
    // A brushed face and a broad bevel give the blade a readable plane under the key light.
    g.fillStyle(KITCHEN.steelLit, 0.7);
    fan(g, [22, -9, 128, -55, 178, -65, 97, -11]);
    g.fillStyle(KITCHEN.steelDark, 0.55);
    fan(g, [8, -3, BLADE_LEN, -3, BLADE_LEN, -15, 39, -13]);
    g.lineStyle(3, KITCHEN.steelLit, 0.9).lineBetween(6, -3, BLADE_LEN - 4, -3);
    g.lineStyle(2, KITCHEN.steelDark, 0.6).lineBetween(40, -33, BLADE_LEN - 2, -71);
    g.fillStyle(KITCHEN.steelDark).fillRoundedRect(BLADE_LEN - 8, -76, 22, 82, 5);
    const handle = faces(KITCHEN.handle);
    if (line > 0) g.lineStyle(line, handle.edge, 1).strokeRoundedRect(BLADE_LEN + 8, -64, HANDLE_LEN, 58, 16);
    g.fillStyle(handle.shade).fillRoundedRect(BLADE_LEN + 8, -64, HANDLE_LEN, 58, 16);
    g.fillStyle(handle.face).fillRoundedRect(BLADE_LEN + 8, -64, HANDLE_LEN, 46, 16);
    g.fillStyle(KITCHEN.paper, 0.12).fillRoundedRect(BLADE_LEN + 22, -56, HANDLE_LEN - 40, 14, 7);
    g.fillStyle(KITCHEN.rivet);
    for (const x of [BLADE_LEN + 36, BLADE_LEN + 72, BLADE_LEN + 108]) {
      g.fillCircle(x, -35, 6);
      g.fillStyle(KITCHEN.steelLit, 0.85).fillCircle(x - 1, -37, 2);
      g.fillStyle(KITCHEN.rivet);
    }
    return g;
  }

  public layout(viewport: Viewport): void {
    const { full, safe } = viewport;
    this.scale = Math.min(safe.width / 900, safe.height / 1300);
    this.baseX = safe.centerX - 40 * this.scale;
    this.baseY = safe.top + safe.height * 0.62;
    this.stage.setPosition(this.baseX, this.baseY).setScale(this.scale);
    this.backdrop.layout(viewport);
    const bg = this.wall.clear();
    // Tile grout, faint and regular: a kitchen wall without a warm note in it.
    const tile = 160 * this.scale;
    const counterY = this.baseY + BOARD_THICK * this.scale;
    bg.lineStyle(2 * this.scale, KITCHEN.grout, 0.4);
    for (let y = counterY - tile; y > full.y - tile; y -= tile) bg.lineBetween(full.x, y, full.right, y);
    for (let x = this.baseX % tile; x < full.right + tile; x += tile) bg.lineBetween(x, full.y, x, counterY);
    bg.fillStyle(KITCHEN.counter, 0.35).fillRect(full.x, counterY, full.width, full.bottom - counterY);
    bg.fillStyle(KITCHEN.ink, 0.08).fillRect(full.x, counterY, full.width, 6 * this.scale);
    const b = this.boardG.clear();
    const board = faces(KITCHEN.board);
    const line = STYLE.current.outline * 1.4;
    const boardDrop = castShadow(10);
    b.fillStyle(KITCHEN.ink, boardDrop.alpha).fillRect(BOARD_LEFT + 10 + boardDrop.dx, BOARD_THICK + boardDrop.dy, BOARD_RIGHT - BOARD_LEFT - 20, 14);
    if (line > 0) b.lineStyle(line, shade(KITCHEN.board, -0.6), 1).strokeRoundedRect(BOARD_LEFT, 0, BOARD_RIGHT - BOARD_LEFT, BOARD_THICK, 14);
    b.fillStyle(board.face).fillRoundedRect(BOARD_LEFT, 0, BOARD_RIGHT - BOARD_LEFT, BOARD_THICK, 14);
    b.fillStyle(shade(KITCHEN.boardEdge, -0.1)).fillRoundedRect(BOARD_LEFT + 2, BOARD_THICK - 16, BOARD_RIGHT - BOARD_LEFT - 4, 16, { tl: 0, tr: 0, bl: 12, br: 12 });
    b.fillStyle(board.lit).fillRect(BOARD_LEFT + 4, 0, BOARD_RIGHT - BOARD_LEFT - 8, 7);
    b.fillStyle(board.rim, 0.7).fillRect(BOARD_LEFT + 4, 0, BOARD_RIGHT - BOARD_LEFT - 8, 3);
    b.lineStyle(1.5, KITCHEN.boardLine, 0.7);
    for (const y of [11, 19]) b.lineBetween(BOARD_LEFT + 30, y, BOARD_RIGHT - 30, y + 1);
    b.lineStyle(2, shade(KITCHEN.boardEdge, -0.1), 0.4).strokeEllipse(BOARD_LEFT + 72, 18, 65, 13).strokeEllipse(BOARD_LEFT + 72, 18, 31, 6);
    for (let x = BOARD_LEFT + 125; x < BOARD_RIGHT - 35; x += 73) {
      b.lineStyle(1.5, KITCHEN.boardLine, 0.5).lineBetween(x, 7, x + 29, 11);
    }
  }

  public reset(plan: RoundPlan): void {
    this.plan = plan;
    this.phase = 'prepare';
    this.lastDemo = -Infinity;
    this.strikes = this.slices = 0;
    this.strikeAt = -100;
    this.strikeX = this.cutStart();
    this.respondAt = -100;
    this.sliceAt = [];
    this.sliceFrom = [];
    this.sliceWobble = [];
    this.cut = this.cutFrom = this.cutTo = this.cutStart();
    this.cutAt = -100;
    this.uneven = 0;
    this.nicks = [];
    this.judderAt = -100;
    this.finishAt = null;
    this.finished = false;
    this.successful = false;
  }

  public onPhase(phase: Phase, now: number): void {
    this.phase = phase;
    // The demonstration rocks the knife over the fruit without cutting it, so the player
    // starts on the tomato they watched. The last chop is left on the blade — zeroing
    // strikeAt here parked it at rest in the half-beat before the first response.
    if (phase === 'respond') { this.setCut(0, now); this.respondAt = now; }
  }

  private setCut(fraction: number, now: number): void {
    this.cutFrom = this.cut;
    this.cutTo = this.cutFor(clamp01(fraction));
    this.cutAt = now;
  }

  private strike(now: number): void {
    this.strikes++;
    this.strikeAt = now;
    this.strikeX = this.cutTo;
  }

  private takeSlice(now: number, targets: number): void {
    // Pulp thrown off the blade. The falling juice beside this stays hand drawn: it is
    // scaled by the task's own tempo, which a particle's fixed lifetime cannot follow.
    if (!this.reducedMotion) this.bursts.burst('dust', this.cutTo, -RY, [KITCHEN.flesh, KITCHEN.fleshRing, KITCHEN.seed], 6);
    this.sliceAt.push(now);
    this.sliceFrom.push(this.cutTo);
    // Off chops so far decide how crooked this slice lands; deterministic per slice.
    this.sliceWobble.push(this.uneven * (((this.slices * 7 + 3) % 5) / 5 - 0.5));
    this.setCut(cutFraction(this.slices, targets), now);
  }

  public onDemonstrationBeat(time: number): void {
    const accepted = acceptDemoBeat(this.lastDemo, time);
    if (accepted === null) return;
    this.lastDemo = accepted;
    // The rock, the board contact and its sound all play; only the slice is withheld.
    // There is no bar between the demonstration and the response in which to replace
    // the fruit.
    this.strike(time);
  }

  public onPlayerHit(now: number): void {
    if (!isPlayerTurn(this.phase)) return;
    this.strike(now);
  }

  public onAccuracy(result: Judgement, now: number): void {
    const slices = advanceSlice(this.slices, result.kind);
    if (slices !== this.slices) {
      this.slices = slices;
      this.takeSlice(now, this.plan?.targets.length ?? 3);
      return;
    }
    // An extra tap lands the knife on bare board beside the fruit and nicks it; an
    // omission leaves the knife hovering with a tremble. Neither takes a slice.
    if (result.kind === 'extra') {
      this.strikeX = this.cutTo + 96 + this.nicks.length * 12;
      this.nicks.push(this.strikeX);
    } else {
      this.judderAt = now;
    }
    this.uneven = Math.min(1, this.uneven + 0.22);
  }

  public finish(successful: boolean, contactSec: number): void {
    this.successful = successful;
    this.finishAt = contactSec;
  }
  public pause(): void { this.phase = 'paused'; this.finishAt = null; this.strikeAt = -100; }

  private beat(): number { return this.plan ? 60 / this.plan.bpm : REFERENCE_BEAT; }

  /** Only known beats are anticipated: the demonstration's, and the coda's contact. */
  private upcoming(now: number): number | null {
    if (this.finishAt !== null && !this.finished) return this.finishAt;
    if (this.phase !== 'prepare' && this.phase !== 'demonstrate') return null;
    return this.plan?.cues.find(cue => cue.kind === 'action' && cue.time > now)?.time ?? null;
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
    this.cut = this.cutFrom + (this.cutTo - this.cutFrom) * easeOut((now - this.cutAt) / 0.09);
    if (this.finishAt !== null && now >= this.finishAt && !this.finished) {
      this.finished = true;
      this.strike(this.finishAt);
      // The unscored finishing chop takes the heel. It never changes the result.
      this.slices++;
      this.sliceAt.push(this.finishAt);
      this.sliceFrom.push(this.cutTo);
      this.sliceWobble.push(this.successful ? 0 : 0.5);
      this.setCut(1, this.finishAt);
      if (!this.successful) this.uneven = Math.max(this.uneven, 0.6);
    }
    const beat = this.beat();
    const age = now - this.strikeAt;
    const press = age >= 0 && age < 0.14 ? Math.sin(age / 0.14 * Math.PI) * STYLE.current.exaggeration : 0;
    const shake = this.reducedMotion || age < 0 || age > 0.16 ? 0 : Math.sin(age * 120) * Math.exp(-age * 24) * 1.8 * STYLE.current.exaggeration;
    this.stage.setPosition(this.baseX + shake * this.scale, this.baseY + shake * this.scale * 0.5);
    this.produce.setPosition(0, this.reducedMotion ? 0 : press * 1.4);
    this.poseKnife(now, beat, age);
    this.drawTomato();
    this.drawSlices(now, beat);
    this.drawMarks(now);
    this.drawJuice(beat, age);
    this.drawRings(age);
  }

  private poseKnife(now: number, beat: number, age: number): void {
    const parked = age > 0.5 && (this.phase === 'idle' || this.phase === 'prepare');
    let lift = knifeLift(age, beat);
    const next = this.upcoming(now);
    if (next !== null && next - now < tomatoTiming(beat).windupSec) lift = knifeWindup(next - now, lift, beat);
    let tremble = 0;
    if (now - this.judderAt < 0.24 && !this.finished) {
      tremble = Math.sin((now - this.judderAt) * 92) * Math.exp(-(now - this.judderAt) * 12) * 0.035;
    }
    let x = this.strikeX + 6;
    if (parked) {
      lift = 1;
      x = this.cutTo + 10;
      if (!this.reducedMotion) lift += Math.sin(now * 1.6) * 0.02;
    }
    // A rocking chop: the tip stays close to the board while the heel lifts and drops.
    this.knife.setPosition(x, -lift * TOMATO_MOTION.lift);
    this.knife.setRotation(-0.12 - 0.42 * Math.min(1.12, lift) + tremble);
  }

  /** The uncut fruit: an ellipse clipped to the left of the cut, with the cut face edge-on. */
  private drawTomato(): void {
    const g = this.tomatoG.clear();
    const k = Math.max(-1, Math.min(1, (this.cut - TOMATO_X) / RX));
    if (k <= -0.999) return;
    const th0 = Math.acos(k);
    const pts: number[] = [];
    for (let i = 0; i <= ARC_STEPS; i++) {
      const a = th0 + (Math.PI * 2 - 2 * th0) * i / ARC_STEPS;
      pts.push(TOMATO_X + RX * Math.cos(a), -RY + RY * Math.sin(a));
    }
    g.fillStyle(KITCHEN.ink, 0.1);
    fan(g, disc(TOMATO_X + 8, 6, Math.min(RX, (this.cut - (TOMATO_X - RX)) / 2 + 4), 16, 0));
    const line = STYLE.current.outline * 1.4;
    if (line > 0) {
      g.lineStyle(line, shade(KITCHEN.tomato, -0.55), 1).beginPath();
      for (let i = 0; i < pts.length; i += 2) g[i === 0 ? 'moveTo' : 'lineTo'](pts[i]!, pts[i + 1]!);
      g.closePath().strokePath();
    }
    g.fillStyle(shade(KITCHEN.tomato, -0.16));
    fan(g, pts);
    // Concentric, offset flesh tones stay clipped to the same cut plane as the fruit.
    // The shaded rim survives every slice instead of becoming a flat red circle.
    const layer = (cx: number, cy: number, a: number, b: number, colour: number): void => {
      const edge = Math.max(-1, Math.min(1, (this.cut - 3 - cx) / a));
      if (edge <= -1) return;
      const start = Math.acos(edge), points: number[] = [];
      for (let i = 0; i <= ARC_STEPS; i++) {
        const t = start + (Math.PI * 2 - start * 2) * i / ARC_STEPS;
        points.push(cx + Math.cos(t) * a, cy + Math.sin(t) * b);
      }
      g.fillStyle(colour); fan(g, points);
    };
    layer(TOMATO_X - 6, -RY - 9, RX - 9, RY - 12, KITCHEN.tomato);
    layer(TOMATO_X - 17, -RY - 26, RX - 27, RY - 36, 0xe15c47);
    if (this.cut > TOMATO_X - 60) {
      g.fillStyle(KITCHEN.tomatoLit, 0.75);
      fan(g, disc(Math.min(TOMATO_X - 58, this.cut - 30), -RY - 58, 34, 22, -0.5));
      g.fillStyle(0xffb79a, 0.75);
      fan(g, disc(Math.min(TOMATO_X - 67, this.cut - 38), -RY - 64, 13, 7, -0.5));
    }
    // The cut face is edge-on from the side; a strip of flesh says it is open fruit.
    const half = RY * Math.sin(th0);
    g.fillStyle(KITCHEN.flesh).fillRect(this.cut - 7, -RY - half, 8, half * 2);
    g.fillStyle(KITCHEN.seed, 0.8);
    for (let i = -1; i <= 1; i++) g.fillEllipse(this.cut - 3, -RY + i * half * 0.45, 4, 9, 6);
    if (this.cut > TOMATO_X + 12) {
      const crown = -2 * RY + 14;
      g.fillStyle(shade(KITCHEN.tomato, -0.38), 0.5).fillEllipse(TOMATO_X, crown + 8, 89, 25);
      for (const [dx, dy] of [[-62, 10], [-40, -16], [1, -21], [43, -13], [59, 16]] as const) {
        g.fillStyle(KITCHEN.stem).fillTriangle(TOMATO_X - 14, crown + 4, TOMATO_X + dx, crown + dy, TOMATO_X + 16, crown + 12);
        g.lineStyle(2, KITCHEN.stemLit, 0.9).lineBetween(TOMATO_X, crown + 5, TOMATO_X + dx * 0.75, crown + dy * 0.75);
      }
      g.lineStyle(11, shade(KITCHEN.stem, -0.2)).beginPath().moveTo(TOMATO_X, crown + 4).lineTo(TOMATO_X + 4, crown - 17).lineTo(TOMATO_X + 16, crown - 29).strokePath();
      g.lineStyle(4, KITCHEN.stemLit).beginPath().moveTo(TOMATO_X - 2, crown + 1).lineTo(TOMATO_X + 2, crown - 17).lineTo(TOMATO_X + 14, crown - 27).strokePath();
    }
  }

  /** Each slice is a disc that topples from the cut and leans on the last one. */
  private drawSlices(now: number, beat: number): void {
    const g = this.slicesG.clear();
    for (let i = 0; i < this.sliceAt.length; i++) {
      const p = sliceTumble(now - this.sliceAt[i]!, beat);
      const wobble = this.sliceWobble[i] ?? 0;
      const step = Math.min(PILE_STEP, 170 / Math.max(1, this.plan?.targets.length ?? 4));
      const restX = PILE_X + i * step;
      const restLean = LEAN + wobble * 0.5;
      const squash = this.finished && !this.successful && i === this.sliceAt.length - 1 ? 0.55 : 1;
      const x = this.sliceFrom[i]! + (restX - this.sliceFrom[i]!) * p;
      const lean = restLean * p;
      const b = SLICE_RY * squash;
      const cy = -b * Math.cos(lean) + 6;
      const a = 5 + (SLICE_RX - 5) * Math.sin(Math.min(1, p) * Math.PI / 2);
      g.fillStyle(KITCHEN.ink, 0.1);
      fan(g, disc(x + 10, 6, a * 0.9 + 8, 12, 0));
      const outline = STYLE.current.outline * 1.4;
      if (outline > 0 && a > 12) {
        const ring = disc(x, cy, a, b, lean);
        g.lineStyle(outline, shade(KITCHEN.tomato, -0.55), 1).beginPath();
        for (let i = 0; i < ring.length; i += 2) g[i === 0 ? 'moveTo' : 'lineTo'](ring[i]!, ring[i + 1]!);
        g.closePath().strokePath();
      }
      g.fillStyle(KITCHEN.tomato);
      fan(g, disc(x, cy, a, b, lean));
      g.fillStyle(KITCHEN.fleshRing);
      fan(g, disc(x, cy, a * 0.84, b * 0.86, lean));
      g.fillStyle(KITCHEN.flesh);
      fan(g, disc(x, cy, a * 0.72, b * 0.76, lean));
      if (a > 20) {
        const c = Math.cos(lean), sn = Math.sin(lean);
        for (let s = 0; s < 4; s++) {
          const t = s * Math.PI / 2 + 0.6;
          const sx = a * 0.43 * Math.cos(t), sy = b * 0.43 * Math.sin(t);
          const gx = x + sx * c - sy * sn, gy = cy + sx * sn + sy * c;
          g.fillStyle(0xc95536, 0.9); fan(g, disc(gx, gy, a * 0.23, b * 0.22, lean));
          g.fillStyle(0xeaa15b, 0.82); fan(g, disc(gx - 1, gy - 3, a * 0.17, b * 0.17, lean));
          for (let seed = 0; seed < 3; seed++) {
            const angle = t + (seed - 1) * 0.95;
            g.fillStyle(KITCHEN.seed);
            fan(g, disc(gx + Math.cos(angle) * a * 0.095, gy + Math.sin(angle) * b * 0.075, 3 + a / 32, 7, lean + angle * 0.4));
          }
          g.lineStyle(2, KITCHEN.fleshRing, 0.65).lineBetween(x, cy, x + sx * 0.58 * c - sy * 0.58 * sn, cy + sx * 0.58 * sn + sy * 0.58 * c);
        }
        g.fillStyle(KITCHEN.fleshRing); fan(g, disc(x, cy, a * 0.13, b * 0.15, lean));
      }
    }
  }

  private drawMarks(now: number): void {
    const g = this.marks.clear();
    for (const x of this.nicks) {
      g.lineStyle(3, KITCHEN.boardEdge, 0.7).lineBetween(x - 28, 5, x + 30, 5);
      g.lineStyle(1.5, KITCHEN.ink, 0.25).lineBetween(x - 22, 7, x + 26, 7);
    }
    if (this.finished && this.successful && this.finishAt !== null) {
      // One late seed, after everything else has settled.
      const p = clamp01((now - this.finishAt - 0.9) / 0.32);
      if (p > 0 && p < 1) {
        g.fillStyle(KITCHEN.seed, 1 - p * 0.5);
        g.fillEllipse(this.cutFor(1) + 22, -70 + p * 68, 5, 10, 6);
      }
    }
  }

  private drawJuice(beat: number, age: number): void {
    const g = this.juice.clear();
    const { juiceSec } = tomatoTiming(beat);
    if (age < 0 || age > juiceSec || this.sliceAt.length === 0) return;
    // Juice only leaves a cut that happened on this chop, never a knock on bare board.
    if (Math.abs((this.sliceAt[this.sliceAt.length - 1] ?? -100) - this.strikeAt) > 0.001) return;
    const fall = juiceFall(age, beat);
    const spread = easeOut(age / juiceSec) * 70;
    const life = 1 - age / juiceSec;
    for (let i = 0; i < JUICE_DROPS; i++) {
      const seed = (i * 29 + 7) % 17;
      const x = this.strikeX + (seed / 17 - 0.5) * spread * 1.4;
      const y = -RY - 20 - Math.sin(i * 1.9) * spread * 0.6 + fall * (0.7 + seed / 34);
      g.fillStyle(i % 3 ? KITCHEN.flesh : KITCHEN.seed, life * 0.9);
      g.fillEllipse(x, y, 4 + seed % 3, 6 + seed % 4, 6);
    }
  }

  private drawRings(age: number): void {
    const g = this.rings.clear();
    if (age < 0 || age > 0.2) return;
    const p = age / 0.2;
    g.lineStyle(3, KITCHEN.paper, 1 - p).strokeEllipse(this.strikeX + 60, 3, 150 + p * 160, 12 + p * 18);
  }

  public translate(offset: number): void { this.stage.x += this.reducedMotion ? 0 : offset; }
  public destroy(): void { this.bursts.destroy(); this.wall.destroy(); this.stage.destroy(true); this.backdrop.destroy(); }
}
