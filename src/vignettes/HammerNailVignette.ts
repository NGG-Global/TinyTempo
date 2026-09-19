import Phaser from 'phaser';
import { STYLE } from '@/config/style';
import { reducedMotion } from '@/core/motionPreference';
import type { Viewport } from '@/core/Viewport';
import type { Phase } from '@/game/RoundController';
import type { RoundPlan } from '@/rhythm/RhythmScheduler';
import type { Judgement } from '@/rhythm/judge';
import { MaterialKey } from '@/textures/materials';
import { Backdrop } from '@/ui/backdrop';
import { shade } from '@/ui/colour';
import { Feedback, FxKey } from '@/ui/feedback';
import { faces } from '@/ui/light';
import type { Vignette } from './Vignette';
import { anticipation, clamp01, easeOut, HAMMER_MOTION, nailHeight, recoil } from './hammerMotion';
import { handoverAt } from '@/game/beatTrack';
import { isPlayerTurn, turnOpen } from './motion';

export const WORKSHOP = {
  paper: 0xeee8d8, ink: 0x243e35, muted: 0x788074, sun: 0xdfc37f,
  wood: 0xc99460, woodDark: 0x936542, red: 0xcf5134, cream: 0xfff9e8,
} as const;

/**
 * Owns an illustration and its motion. It cannot capture input or judge a rhythm.
 *
 * Everything here is a solid under the shared light: the bench is timber with a top
 * face, the hammer's handle and head have a lit side and a shade side, and the
 * treatment decides how heavy the outline round each is. The motion — the swing, the
 * contact hold, the recoil and the nail's flush contract — is `hammerMotion.ts` and is
 * not touched by any of this.
 */
export class HammerNailVignette implements Vignette {
  private readonly stage: Phaser.GameObjects.Container;
  private readonly backdrop: Backdrop;
  private readonly disc: Phaser.GameObjects.Image;
  private readonly bench: Phaser.GameObjects.TileSprite;
  private readonly wood: Phaser.GameObjects.Graphics;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly nail: Phaser.GameObjects.Graphics;
  private readonly hammer: Phaser.GameObjects.Container;
  private readonly dust: Phaser.GameObjects.Graphics;
  private readonly bursts: Feedback;
  private phase: Phase = 'idle';
  private plan: RoundPlan | null = null;
  private depth = 0;
  private depthFrom = 0;
  private depthTo = 0;
  private depthAt = -100;
  private strikeAt = -100;
  private impactX = 310;
  private impactY = -203;
  private strength = 1;
  private finishAt: number | null = null;
  private finishDone = false;
  private successful = false;
  private bend = 0;
  private baseX = 0;
  private baseY = 0;
  private scale = 1;
  private lastNow = 0;
  private lastDemoStrike = -Infinity;
  /**
   * When the turn starts changing hands: two beats before the player's first target,
   * inside the demonstration's own bar. Only the stage light moves this early.
   */
  private handoverAt = Infinity;
  /** Read per use, so a preference change applies mid-scene. */
  private get reducedMotion(): boolean { return reducedMotion(); }

  public constructor(private readonly scene: Phaser.Scene, private readonly cover = false) {
    this.backdrop = new Backdrop(scene, WORKSHOP.paper, WORKSHOP.sun);
    this.stage = scene.add.container(0, 0).setDepth(-10);
    // The pool of light is one soft-edged image: a real falloff, one draw.
    this.disc = scene.add.image(270, -285, FxKey.glow).setDisplaySize(620, 620).setTint(WORKSHOP.sun).setAlpha(0.5);
    this.bench = scene.add.tileSprite(-2500, 0, 5700, 2500, MaterialKey.wood).setOrigin(0).setTint(WORKSHOP.wood);
    this.bench.setTileScale(1.5, 1.5);
    this.wood = scene.add.graphics();
    this.shadow = scene.add.ellipse(340, 8, 142, 22, WORKSHOP.ink, 0.12);
    this.nail = scene.add.graphics();
    this.hammer = scene.add.container(0, 0);
    this.drawHammer();
    this.dust = scene.add.graphics();
    this.stage.add([this.disc, this.bench, this.wood, this.shadow, this.nail, this.hammer, this.dust]);
    this.bursts = new Feedback(scene, -10, this.stage);
  }

  private drawHammer(): void {
    const g = this.scene.add.graphics();
    const t = STYLE.current;
    const line = t.outline * 1.4;
    const red = faces(WORKSHOP.red), ink = faces(WORKSHOP.ink);
    // The grip is the rotation pivot. The striking face is exactly (-290, 36).
    // Contact shadow the handle throws on the bench when it lies flat.
    g.fillStyle(WORKSHOP.ink, 0.08).fillRoundedRect(-256, -14, 275, 52, 16);
    // Handle: shade face, lit face, then the highlight along the top edge.
    if (line > 0) g.lineStyle(line, shade(WORKSHOP.red, -0.65), 1).strokeRoundedRect(-270, -25, 286, 48, 14);
    g.fillStyle(red.shade).fillRoundedRect(-270, -25, 286, 48, 14);
    g.fillStyle(red.face).fillRoundedRect(-270, -25, 286, 36, 14);
    g.fillStyle(red.lit).fillRoundedRect(-248, -24, 220, 8, 4);
    g.fillStyle(red.rim, 0.7).fillRoundedRect(-240, -22, 120, 3, 1.5);
    // Grip: wrapped dark tape.
    if (line > 0) g.lineStyle(line, ink.edge, 1).strokeRoundedRect(-45, -26, 68, 51, 13);
    g.fillStyle(ink.face).fillRoundedRect(-45, -26, 68, 51, 13);
    g.fillStyle(ink.lit).fillRoundedRect(-45, -26, 68, 14, 13);
    g.lineStyle(2, 0x698075, 0.42);
    for (let x = -34; x < 11; x += 9) { g.lineBetween(x, -15, x + 6, 14); }
    // Forged head, poll on the left and a deliberately graphic split claw on the right.
    const claw = [[-210, -52], [-158, -44], [-139, -3], [-167, -18], [-196, -23], [-209, -16]].map(([x, y]) => new Phaser.Math.Vector2(x!, y!));
    if (line > 0) {
      g.lineStyle(line, ink.edge, 1);
      g.strokeRoundedRect(-322, -63, 78, 101, 8).strokeRect(-247, -52, 42, 36).strokePoints(claw, true);
    }
    g.fillStyle(ink.face);
    g.fillRoundedRect(-322, -63, 78, 101, 8);
    g.fillRect(-247, -52, 42, 36);
    g.fillPoints(claw, true);
    // The lit top face of the head, its bright edge, and the darker striking face.
    g.fillStyle(ink.lit).fillRoundedRect(-322, -63, 78, 16, 5);
    g.fillStyle(ink.rim, 0.6).fillRect(-316, -60, 66, 3);
    g.fillStyle(ink.lit, 0.7).fillRect(-247, -52, 42, 7);
    g.fillStyle(ink.shade).fillRect(-322, -8, 78, 46);
    g.fillStyle(ink.edge).fillRoundedRect(-327, 25, 88, 13, 4);
    g.fillStyle(0xa9b6a1).fillRoundedRect(-327, 33, 88, 5, 2);
    g.fillStyle(WORKSHOP.paper).fillCircle(-275, -34, 4);
    this.hammer.add(g);
  }

  public layout(viewport: Viewport, benchY?: number): void {
    const { safe } = viewport;
    const t = STYLE.current;
    // The cover reserves the sign above the tool; gameplay retains its large pose.
    this.scale = this.cover ? Math.min(safe.width / 720, safe.height / 1550) : Math.min(safe.width / 650, safe.height / 1000);
    this.baseX = safe.centerX - 350 * this.scale;
    // The tutorial reserves space below the tool for its labelled rhythm beads.
    this.baseY = benchY ?? safe.top + safe.height * 0.68;
    this.stage.setPosition(this.baseX, this.baseY).setScale(this.scale);
    this.backdrop.layout(viewport);
    const wood = faces(WORKSHOP.wood);
    const g = this.wood.clear();
    // The bench top: a lit face along the edge, its rim, and the shade line beneath it
    // where the top meets the front. The material carries the grain.
    g.fillStyle(wood.lit).fillRect(-2500, 0, 5700, 22);
    g.fillStyle(wood.rim, 0.55).fillRect(-2500, 0, 5700, 4);
    g.fillStyle(wood.shade, 0.7).fillRect(-2500, 22, 5700, 6);
    if (t.outline > 0) g.fillStyle(shade(WORKSHOP.wood, -0.6)).fillRect(-2500, -t.outline * 0.7, 5700, t.outline * 0.7);
    // One knot, so the plank reads as a plank and not a texture swatch.
    g.lineStyle(2.5, WORKSHOP.woodDark, 0.35).strokeEllipse(538, 124, 58, 16).strokeEllipse(538, 124, 26, 6);
  }

  public reset(plan: RoundPlan): void {
    this.plan = plan;
    this.depth = this.depthFrom = this.depthTo = 0;
    this.depthAt = this.strikeAt = -100;
    this.bend = 0;
    this.finishAt = null;
    this.finishDone = false;
    this.handoverAt = handoverAt(plan);
    this.lastDemoStrike = -Infinity;
    this.phase = 'prepare';
  }
  public onPhase(phase: Phase, now: number): void {
    this.phase = phase;
    // The demonstration strikes the nail without sinking it, so the player's nail is
    // already standing proud when their turn arrives; this only anchors the spotlight.
    if (phase === 'respond') {
      this.setDepth(0, now);
    }
  }
  private setDepth(value: number, now: number): void {
    this.depthFrom = this.depth;
    this.depthTo = clamp01(value);
    this.depthAt = now;
  }
  public onDemonstrationBeat(time: number): void {
    if (time <= this.lastDemoStrike) return;
    this.lastDemoStrike = time;
    // The swing, the impact and its sound all play; only the nail is left where it was.
    // There is no bar between the demonstration and the response in which to reset it.
    this.strike(time, 0.8);
  }
  public onPlayerHit(now: number): void {
    if (!isPlayerTurn(this.phase)) return;
    this.strike(now, 1);
  }
  public onAccuracy(result: Judgement, now: number): void {
    if (result.kind === 'hit') this.setDepth(this.depthTo + 0.75 / (this.plan?.targets.length ?? 4), now);
    else if (result.kind === 'extra') this.strength = 0.4;
  }
  public finish(successful: boolean, contactSec: number): void {
    this.successful = successful;
    this.finishAt = contactSec;
  }
  public pause(): void {
    this.phase = 'paused';
    this.finishAt = null;
    this.strikeAt = -100;
  }
  private strike(now: number, strength: number): void {
    this.strikeAt = now;
    this.strength = strength;
    this.impactX = 310;
    this.impactY = -nailHeight(this.depth) - 10;
    // Input callbacks can render contact immediately, independently of the next frame.
    this.pose(0, this.depth);
    // Sawdust off the bench. Decorative, so it may skip under reduced motion.
    if (!this.reducedMotion) this.bursts.burst('dust', this.impactX, this.impactY + 6, [WORKSHOP.cream, WORKSHOP.sun, WORKSHOP.wood], Math.round(8 * strength));
  }
  private pose(angle: number, depth: number): void {
    this.hammer.setPosition(600, -nailHeight(depth) - 48).setRotation(angle);
  }

  public update(now: number): void {
    if (this.phase === 'paused') now = this.lastNow;
    else this.lastNow = now;
    // Rendering may observe a beat before the controller's next pump. Contact is
    // sampled from the same absolute cue, preventing a one-frame rebound/pop.
    if (this.phase === 'prepare' || this.phase === 'demonstrate') {
      for (const cue of this.plan?.cues ?? []) {
        if (cue.kind === 'action' && cue.time <= now) this.onDemonstrationBeat(cue.time);
      }
    }
    this.depth = this.depthFrom + (this.depthTo - this.depthFrom) * easeOut((now - this.depthAt) / 0.085);
    if (this.finishAt !== null && now >= this.finishAt && !this.finishDone) {
      this.finishDone = true;
      this.strike(this.finishAt, this.successful ? 1.6 : 0.7);
      this.setDepth(this.successful ? 1 : Math.max(0.5, this.depth), this.finishAt);
    }
    const age = now - this.strikeAt;
    let angle = age < HAMMER_MOTION.recoilSec ? recoil(age) : 0.55;
    const next = this.phase === 'demonstrate' || this.phase === 'prepare'
      ? this.plan?.cues.find(cue => cue.kind === 'action' && cue.time > now)?.time : undefined;
    const upcoming = this.finishAt !== null && !this.finishDone ? this.finishAt : next;
    if (upcoming !== undefined && upcoming !== null && upcoming - now < HAMMER_MOTION.anticipationSec) angle = anticipation(upcoming - now, angle);
    if (this.phase === 'idle') angle += Math.sin(now * 1.25) * 0.025;
    if (this.finishDone && !this.successful) {
      this.bend = easeOut((now - this.finishAt!) / 0.36);
      angle += Math.sin((now - this.finishAt!) * 14) * Math.exp(-(now - this.finishAt!) * 3) * 0.1;
    }
    this.pose(angle, this.depth);
    const exaggeration = STYLE.current.exaggeration;
    const squash = age >= 0 && age < 0.07 ? Math.sin(age / 0.07 * Math.PI) * 0.045 * this.strength * exaggeration : 0;
    this.hammer.setScale(1 + squash, 1 - squash);
    // Keep the striking face pinned while the handle compresses around it.
    this.hammer.x += (290 * Math.cos(angle) - 38 * Math.sin(angle)) * squash;
    this.hammer.y += (290 * Math.sin(angle) + 38 * Math.cos(angle)) * squash;
    const shake = this.reducedMotion || age < 0 || age > 0.2 ? 0 : Math.sin(age * 110) * Math.exp(-age * 20) * this.strength * 2.7 * exaggeration;
    this.stage.setPosition(this.baseX + shake * this.scale, this.baseY + shake * this.scale * 0.35);
    const pressure = age >= 0 && age < 0.18 ? Math.sin(age / 0.18 * Math.PI) * this.strength : 0;
    this.shadow.setPosition(340 - Math.sin(angle) * 25, 10).setScale(1 + pressure * 0.25, 1 - pressure * 0.2).setAlpha(0.8 + pressure * 0.2);
    this.wood.y = this.bench.y = this.reducedMotion ? 0 : pressure * 1.6;
    this.drawNail(now);
    this.drawDust(age);
    // The spotlight opens toward the player's side across the handover, so it has
    // finished moving before the downbeat it announces rather than starting there.
    const transfer = turnOpen(now, this.handoverAt, this.phase);
    this.disc.setPosition(270 + transfer * 40, -285 + transfer * 28);
    this.disc.setScale(1 + transfer * 0.09).setAlpha(0.5 + transfer * 0.22);
    // The stage behind the bench comes up with it. Level 1 is where the handover has to be
    // clearest, so it carries the same cue as the other four rather than a weaker one.
    this.backdrop.open(transfer);
  }
  private drawNail(now: number): void {
    const t = STYLE.current;
    const h = nailHeight(this.depth);
    const x = 310;
    const bentX = this.bend * 48;
    const wobble = this.phase === 'result' && this.bend > 0 ? Math.sin((now - (this.finishAt ?? now)) * 19) * Math.exp(-(now - (this.finishAt ?? now)) * 3) * 4 : 0;
    const ink = faces(WORKSHOP.ink);
    const line = t.outline * 1.4;
    const g = this.nail.clear();
    // A long, low-contrast cast shadow anchors the slender shaft to the timber.
    g.fillStyle(WORKSHOP.ink, 0.075).fillTriangle(x - 12, 5, x + 12, 5, x + Math.max(0, h) * 0.7, 34 + Math.max(0, h) * 0.14);
    g.fillStyle(WORKSHOP.ink, 0.2).fillEllipse(x + 7, 3, 72, 14);
    const tipX = x + bentX + wobble;
    if (h > 0) {
      if (line > 0) g.lineStyle(25 + line * 2, ink.edge).beginPath().moveTo(x, 0).lineTo(x, -h * 0.38).lineTo(tipX, -h).strokePath();
      g.lineStyle(25, ink.face).beginPath().moveTo(x, 0).lineTo(x, -h * 0.38).lineTo(tipX, -h).strokePath();
      g.lineStyle(6, ink.rim, 0.8).beginPath().moveTo(x - 6, -4).lineTo(x - 6, -h * 0.4).lineTo(tipX - 6, -h).strokePath();
    }
    if (line > 0) g.lineStyle(line, ink.edge).strokeRoundedRect(tipX - 38, -h - 10, 76, 15, 5);
    g.fillStyle(ink.face).fillRoundedRect(tipX - 38, -h - 10, 76, 15, 5);
    g.fillStyle(ink.lit).fillEllipse(tipX, -h - 10, 76, 13);
    g.lineStyle(2, WORKSHOP.cream, 0.8).lineBetween(x + bentX - 20, -h - 13, x + bentX + 11, -h - 13);
    if (this.finishDone && this.successful) {
      const p = clamp01((now - this.finishAt!) / 0.7);
      g.lineStyle(2, WORKSHOP.cream, 1 - p);
      g.lineBetween(x + 42, -25 - p * 20, x + 42, -9 - p * 20);
      g.lineBetween(x + 34, -17 - p * 20, x + 50, -17 - p * 20);
    }
  }
  /** The impact marks — the flash lines and the ring — stay hand drawn; the debris is particles. */
  private drawDust(age: number): void {
    const g = this.dust.clear();
    if (age < 0 || age > 0.17) return;
    const line = 3 + STYLE.current.outline * 0.4;
    if (age < 0.08) {
      g.lineStyle(line, WORKSHOP.cream, 1 - age / 0.08);
      g.lineBetween(this.impactX - 48, this.impactY - 10, this.impactX - 66, this.impactY - 25);
      g.lineBetween(this.impactX + 48, this.impactY - 10, this.impactX + 66, this.impactY - 25);
    }
    const ring = age / 0.17;
    g.lineStyle(2, WORKSHOP.cream, (1 - ring) * 0.55);
    g.strokeEllipse(this.impactX, this.impactY + 4, 78 + ring * 65, 12 + ring * 15);
  }
  public destroy(): void { this.bursts.destroy(); this.stage.destroy(true); this.backdrop.destroy(); }
  /** Scene supplies absolute musical slide progress; never owns a transition timer. */
  public translate(offset: number): void { this.stage.x += this.reducedMotion ? 0 : offset; }
}
