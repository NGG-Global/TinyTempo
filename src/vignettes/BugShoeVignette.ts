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
import { clamp01, easeOut, isPlayerTurn, TURN_OPEN_SEC } from './motion';

export const GARDEN = { paper: 0xe4e7ce, ink: 0x303f43, tile: 0xb8c2a0, plum: 0x8b6085, cream: 0xfff5dc, coral: 0xd87d62 };
export function shoeLift(age: number): number { return 245 * easeOut((age - 0.035) / 0.28); }

/**
 * A rubbery fictional insect, never injury or gore. No input or scoring ownership.
 *
 * The floor is woven matting under the shared light, the sneaker a solid with a sole,
 * a lit upper and the treatment outline. The drop, its anticipation and the squash on
 * contact are unchanged.
 */
export class BugShoeVignette implements Vignette {
  private readonly backdrop: Backdrop;
  private readonly stage: Phaser.GameObjects.Container;
  private readonly ground: Phaser.GameObjects.Graphics;
  private readonly matting: Phaser.GameObjects.TileSprite;
  private readonly floor: Phaser.GameObjects.Graphics;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly bug: Phaser.GameObjects.Graphics;
  private readonly shoe: Phaser.GameObjects.Container;
  private readonly accents: Phaser.GameObjects.Graphics;
  private readonly bursts: Feedback;
  private plan: RoundPlan | null = null;
  private phase: Phase = 'idle';
  /** When the player's turn began; the stage light opens toward them from here. */
  private respondAt = -100;
  private lastDemo = -Infinity;
  private strikeAt = -100;
  private finishAt: number | null = null;
  private finished = false;
  private successful = false;
  private hit = false;
  private lastNow = 0;
  private baseX = 0;
  private baseY = 0;
  private scale = 1;
  private contactX = 0;
  private previousX = 0;
  private steps = 0;
  /** Read per use, so a preference change applies mid-scene. */
  private get reducedMotion(): boolean { return reducedMotion(); }
  public constructor(scene: Phaser.Scene) {
    // The pool of light replaces the cream disc this scene used to draw for itself.
    this.backdrop = new Backdrop(scene, GARDEN.paper, GARDEN.cream, { glowAt: { x: 0.58, y: 0.42 } });
    this.stage = scene.add.container(0, 0).setDepth(-10);
    this.ground = scene.add.graphics();
    // The weave lies over the ground colour at low strength. Tinted opaque and full
    // strength it read as a pattern rather than as a floor, and swallowed the grout.
    this.matting = scene.add.tileSprite(-2500, 0, 5000, 2500, MaterialKey.cloth).setOrigin(0)
      .setTint(GARDEN.tile).setAlpha(0.45 * STYLE.current.grain);
    this.matting.setTileScale(0.85, 0.85);
    this.floor = scene.add.graphics();
    this.shadow = scene.add.ellipse(0, 7, 365, 30, GARDEN.ink, 0.12);
    this.shoe = scene.add.container(0, -245);
    this.drawShoe(scene);
    this.bug = scene.add.graphics();
    this.accents = scene.add.graphics();
    this.stage.add([this.ground, this.matting, this.floor, this.shadow, this.shoe, this.bug, this.accents]);
    this.bursts = new Feedback(scene, -10, this.stage);
  }

  /** Oversized canvas sneaker: cream foxing, coral heel tab, graphic laces. */
  private drawShoe(scene: Phaser.Scene): void {
    const s = scene.add.graphics();
    const line = STYLE.current.outline * 1.4;
    const ink = faces(GARDEN.ink), cream = faces(GARDEN.cream), coral = faces(GARDEN.coral);
    // Outlines first, under every fill, so no seam shows between the masses.
    if (line > 0) {
      s.lineStyle(line, ink.edge, 1);
      s.strokeRoundedRect(-200, -108, 350, 95, 40).strokeRoundedRect(46, -208, 111, 159, 19);
      s.lineStyle(line, shade(GARDEN.cream, -0.5), 1).strokeRoundedRect(-217, -57, 389, 57, 21);
    }
    // Upper and ankle collar: a shade body with a lit top where the light reaches.
    s.fillStyle(ink.shade).fillRoundedRect(-200, -108, 350, 95, 40);
    s.fillStyle(ink.face).fillRoundedRect(-200, -108, 350, 76, 40);
    s.fillStyle(ink.lit, 0.75).fillRoundedRect(-176, -104, 210, 16, 8);
    s.fillStyle(ink.shade).fillRoundedRect(46, -208, 111, 159, 19);
    s.fillStyle(ink.face).fillRoundedRect(46, -208, 111, 134, 19);
    s.fillStyle(ink.lit, 0.8).fillRoundedRect(56, -204, 88, 14, 7);
    s.fillStyle(0x516b69).fillRoundedRect(-148, -112, 197, 43, 18);
    s.fillStyle(shade(0x516b69, 0.22), 0.7).fillRoundedRect(-140, -108, 170, 10, 5);
    // Foxing and outsole: the part that meets the floor, so it carries the lit rim.
    s.fillStyle(cream.shade).fillRoundedRect(-217, -57, 389, 57, 21);
    s.fillStyle(cream.face).fillRoundedRect(-217, -57, 389, 44, 21);
    s.fillStyle(cream.rim, 0.8).fillRoundedRect(-206, -53, 360, 8, 4);
    s.fillStyle(shade(0xd3c7a8, -0.2)).fillRoundedRect(-213, -13, 381, 13, 5);
    if (line > 0) s.lineStyle(line * 0.7, coral.edge, 1).strokeRoundedRect(142, -188, 20, 66, 6);
    s.fillStyle(coral.face).fillRoundedRect(142, -188, 20, 66, 6);
    s.lineStyle(7, GARDEN.cream, 0.9);
    for (let i = 0; i < 4; i++) s.lineBetween(-83 + i * 29, -108 - i * 7, -65 + i * 29, -80 - i * 7);
    s.lineStyle(2, GARDEN.ink, 0.22).lineBetween(-197, -24, 148, -24);
    this.shoe.add(s);
  }
  public layout(viewport: Viewport): void {
    const { safe } = viewport;
    this.scale = Math.min(safe.width / 720, safe.height / 1080);
    this.baseX = safe.centerX; this.baseY = safe.top + safe.height * 0.7;
    this.stage.setPosition(this.baseX, this.baseY).setScale(this.scale);
    this.backdrop.layout(viewport);
    // The ground colour goes down first, the weave over it, the grout over that.
    const tile = faces(GARDEN.tile);
    this.ground.clear().fillStyle(GARDEN.tile).fillRect(-2500, 0, 5000, 2500);
    const g = this.floor.clear();
    g.lineStyle(2, GARDEN.ink, 0.12);
    for (let row = 0; row < 8; row++) g.lineBetween(-2000, 32 + row * 80, 2000, 32 + row * 80);
    for (let col = -5; col < 6; col++) g.lineBetween(col * 190, 0, col * 290, 900);
    if (STYLE.current.outline > 0) g.fillStyle(shade(GARDEN.tile, -0.6)).fillRect(-2500, -STYLE.current.outline * 0.7, 5000, STYLE.current.outline * 0.7);
    g.fillStyle(tile.lit).fillRect(-2500, 0, 5000, 9);
    g.fillStyle(tile.rim, 0.6).fillRect(-2500, 0, 5000, 3);
  }
  public reset(plan: RoundPlan): void {
    this.plan = plan; this.phase = 'prepare'; this.lastDemo = -Infinity;
    this.strikeAt = -100; this.finishAt = null; this.finished = false; this.hit = false;
    this.contactX = this.previousX = this.steps = 0;
    this.respondAt = -100;
  }
  public onPhase(phase: Phase, now: number): void {
    this.phase = phase;
    // The bug is never consumed, so this only returns the shoe to the first stop of its
    // cycle for the player's turn.
    // The next stomp starts the player's cycle. Leaving the shoe where the example
    // landed lets it travel to that first stop instead of teleporting mid-lift.
    if (phase === 'respond') { this.steps = 0; this.respondAt = now; }
  }
  private strike(time: number): void {
    this.previousX = this.contactX;
    this.contactX = [0, -95, 80, -45][this.steps++ % 4]!;
    this.strikeAt = time; this.hit = false;
    this.shoe.setPosition(this.contactX, 0).setRotation(0);
    this.scatter();
  }
  public onDemonstrationBeat(time: number): void {
    if (time <= this.lastDemo) return;
    this.lastDemo = time; this.strike(time); this.hit = true;
  }
  /** Grit thrown up where the sole lands. Decorative, so it may skip under reduced motion. */
  private scatter(): void {
    if (this.reducedMotion) return;
    this.bursts.burst('dust', this.contactX, -4, [GARDEN.cream, GARDEN.tile, shade(GARDEN.tile, -0.25)], 7);
  }
  public onPlayerHit(now: number): void {
    if (!isPlayerTurn(this.phase)) return;
    this.strike(now);
  }
  public onAccuracy(result: Judgement, _now: number): void { if (result.kind === 'hit') this.hit = true; }
  public finish(successful: boolean, time: number): void { this.successful = successful; this.finishAt = time; }
  public pause(): void { this.phase = 'paused'; this.finishAt = null; }
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
    if (this.phase === 'prepare' || this.phase === 'demonstrate') for (const cue of this.plan?.cues ?? []) {
      if (cue.kind === 'action' && cue.time <= now) this.onDemonstrationBeat(cue.time);
    }
    if (this.finishAt !== null && now >= this.finishAt && !this.finished) {
      this.finished = true; this.strike(this.finishAt); this.hit = this.successful;
    }
    const age = now - this.strikeAt;
    let lift = shoeLift(age);
    const next = this.finishAt !== null && !this.finished ? this.finishAt :
      this.phase === 'prepare' || this.phase === 'demonstrate' ? this.plan?.cues.find(c => c.kind === 'action' && c.time > now)?.time : undefined;
    if (next !== undefined && next !== null && next - now < 0.22) {
      const p = clamp01(1 - (next - now) / 0.22);
      lift = lift * (1 - p) + (245 + Math.sin(p * Math.PI) * 44 - p ** 5 * 245) * p;
    }
    if (this.finished) lift = 22 * easeOut(age / 0.45);
    const squash = age < 0.12 ? Math.sin(clamp01(age / 0.12) * Math.PI) * STYLE.current.exaggeration : 0;
    this.shoe.setPosition(this.contactX, -lift).setRotation(-0.12 * clamp01(lift / 245)).setScale(1 + squash * 0.035, 1 - squash * 0.035);
    this.shadow.setPosition(this.contactX, 7).setScale(1 - lift / 1000, 1).setAlpha(1 - lift / 400);
    this.stage.setPosition(this.baseX, this.baseY + (this.reducedMotion ? 0 : squash * 2 * this.scale));
    let x = this.previousX + (this.contactX - this.previousX) * easeOut(age / 0.18);
    let y = -24 - Math.abs(Math.sin(now * 9)) * (this.reducedMotion ? 0 : 3);
    if (!this.hit && age < 0.4) x += 150 * easeOut(age / 0.15);
    if (this.finished) {
      x = this.contactX + (this.successful ? -118 : 207) * easeOut(age / 0.5);
      y = -24 - (this.successful ? 110 : 0) * easeOut(age / 0.5) - Math.sin(clamp01(age / 0.5) * Math.PI) * 100;
    }
    const g = this.bug.clear();
    const compression = this.hit ? Math.min(0.9, squash * 0.72) : 0;
    g.setPosition(x, y).setScale(1 + compression, 1 - compression);
    g.lineStyle(4, GARDEN.ink);
    for (let i = -1; i <= 1; i++) {
      const wiggle = Math.sin(now * 14 + i) * 5;
      g.lineBetween(i * 15, 10, i * 23 - 7, 22 + wiggle);
      g.lineBetween(i * 15, -2, i * 23 + 5, -16 - wiggle);
    }
    const plum = faces(GARDEN.plum);
    const line = STYLE.current.outline * 1.4;
    if (line > 0) g.lineStyle(line, plum.edge, 1).strokeEllipse(0, 0, 72, 40);
    g.fillStyle(plum.shade).fillEllipse(0, 2, 72, 40);
    g.fillStyle(plum.face).fillEllipse(0, 0, 72, 40);
    g.fillStyle(0xb68da2).fillEllipse(-10, -6, 33, 20);
    g.lineStyle(2, GARDEN.ink, 0.5).lineBetween(-4, -17, -4, 18);
    for (const eyeX of [20, 35]) {
      g.fillStyle(GARDEN.cream).fillCircle(eyeX, -14, 11);
      g.fillStyle(GARDEN.ink).fillCircle(eyeX + Math.sin(now * 2) * 2, -16, 4);
    }
    g.lineStyle(2, GARDEN.ink).lineBetween(26, -22, 22 + Math.sin(now * 7) * 5, -42);
    const a = this.accents.clear();
    // The bug's own contact shadow, drawn here rather than into its Graphics so the
    // squash on impact does not squash the shadow with it.
    const bugDrop = castShadow(5);
    a.fillStyle(GARDEN.ink, bugDrop.alpha * (1 - clamp01(-y / 160))).fillEllipse(x + bugDrop.dx, 6, 66, 12, 10);
    if (age >= 0 && age < 0.22) {
      const p = age / 0.22;
      this.accents.lineStyle(3, GARDEN.cream, 1 - p).strokeEllipse(this.contactX, 2, 210 + p * 180, 14 + p * 22);
    }
  }
  public translate(offset: number): void { this.stage.x += this.reducedMotion ? 0 : offset; }
  public destroy(): void { this.bursts.destroy(); this.stage.destroy(true); this.backdrop.destroy(); }
}
