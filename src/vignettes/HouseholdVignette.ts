import type Phaser from 'phaser';
import type { Viewport } from '@/core/Viewport';
import { reducedMotion } from '@/core/motionPreference';
import type { Phase } from '@/game/RoundController';
import type { RoundPlan } from '@/rhythm/RhythmScheduler';
import type { Judgement } from '@/rhythm/judge';
import { Backdrop } from '@/ui/backdrop';
import { Feedback, type Preset } from '@/ui/feedback';
import type { Vignette } from './Vignette';
import { handoverAt } from '@/game/beatTrack';
import { acceptDemoBeat, turnOpen } from './motion';
import type { GrooveLevel } from '@/game/groove';
import { GrooveReaction, type GrooveMaterial } from '@/ui/grooveReaction';
import { drawCardLight, drawGround, roomBelowCard, shelfFor, type StagingOptions } from './staging';

/** Lifecycle only. Each act owns its art; the round controller owns every verdict. */
export abstract class HouseholdVignette implements Vignette {
  private grooveReaction: GrooveReaction | null = null;
  protected lightMaterial(scene: Phaser.Scene, material: GrooveMaterial): void {
    this.grooveReaction = new GrooveReaction(scene, this.stage, material);
  }
  public onGroove(level: GrooveLevel, now: number): void { this.grooveReaction?.show(level, now); }
  protected readonly stage: Phaser.GameObjects.Container;
  protected readonly art: Phaser.GameObjects.Graphics;
  /** Under the art: the shelf the card rests on and the shadows it throws. Drawn in `layout`. */
  private readonly shelfLayer: Phaser.GameObjects.Graphics;
  /** Over the art: the card's lit rim and its falloff away from the light. Drawn in `layout`. */
  private readonly lightLayer: Phaser.GameObjects.Graphics;
  private readonly backdrop: Backdrop;
  protected plan: RoundPlan | null = null;
  protected phase: Phase = 'idle';
  protected strikeAt = -Infinity;
  protected errorAt = -Infinity;
  protected demoTimes: number[] = [];
  protected hitTimes: number[] = [];
  protected taps = 0;
  protected finishAt: number | null = null;
  protected successful = false;
  /**
   * When the turn starts changing hands: two beats before the player's first target,
   * inside the demonstration's own bar. Only the stage light moves this early.
   */
  private handoverAt = Infinity;
  private lastNow = 0;
  /**
   * Where `layout` put the stage. `translate` is an absolute per-frame offset from this
   * home, not a step, so `update` has to restore it before the next one lands.
   */
  private baseX = 0;
  private baseY = 0;
  /** Material particles in the stage's own space, made on an act's first burst. */
  private bursts: Feedback | null = null;
  private readonly fxScene: Phaser.Scene;
  protected get still(): boolean { return reducedMotion(); }
  protected get watching(): boolean { return this.phase === 'prepare' || this.phase === 'demonstrate'; }
  protected get strokes(): number { return this.watching ? this.demoTimes.length : this.taps; }

  /**
   * `staging` names the act's card, which the base class grounds on a shelf and lights
   * from the shared key light (`vignettes/staging.ts`, `docs/STAGING.md`). An act with
   * no card gets neither; one that stands on a surface of its own passes `ground: false`.
   * Nothing is drawn here: the stage's layers are created now, in order, and painted by
   * `layout`, once per viewport, never per frame.
   */
  public constructor(scene: Phaser.Scene, private readonly paper: number, private readonly glow: number, private readonly staging: StagingOptions = {}) {
    this.fxScene = scene;
    this.backdrop = new Backdrop(scene, paper, glow, { glowAlpha: 0.45 });
    this.stage = scene.add.container(0, 0).setDepth(-10);
    this.shelfLayer = scene.add.graphics();
    this.art = scene.add.graphics();
    this.lightLayer = scene.add.graphics();
    this.stage.add([this.shelfLayer, this.art, this.lightLayer]);
  }

  public layout(viewport: Viewport): void {
    const { safe } = viewport;
    const ui = Math.min(safe.width / 720, safe.height / 1150);
    const top = safe.top + 320 * ui, bottom = safe.bottom - 410 * ui;
    const scale = Math.min(safe.width / 800, (bottom - top) / 520);
    this.baseX = safe.centerX;
    this.baseY = (top + bottom) / 2;
    this.stage.setPosition(this.baseX, this.baseY).setScale(scale);
    this.backdrop.layout(viewport);
    const card = this.staging.card;
    if (card) {
      const shelf = this.staging.ground === false ? null : shelfFor(card, roomBelowCard(card, this.baseY, scale, safe.bottom, ui));
      const framed = this.staging.framed !== false;
      if (this.staging.ground !== false) drawGround(this.shelfLayer, card, shelf, this.paper, this.glow, framed);
      if (framed) drawCardLight(this.lightLayer, card, this.glow);
    }
  }

  public reset(plan: RoundPlan): void {
    this.plan = plan;
    this.phase = 'prepare';
    this.strikeAt = this.errorAt = -Infinity;
    this.demoTimes = [];
    this.hitTimes = [];
    this.taps = 0;
    this.finishAt = null;
    this.successful = false;
    this.handoverAt = handoverAt(plan);
  }

  public onPhase(phase: Phase, _now: number): void {
    this.phase = phase;
    if (phase === 'respond') {
      // The example has its own temporary state, and never consumes the player's subject.
      this.strikeAt = -Infinity;
    }
  }
  public onDemonstrationBeat(time: number): void {
    if (!this.watching || acceptDemoBeat(this.demoTimes.at(-1) ?? -Infinity, time) === null) return;
    this.demoTimes.push(time);
    this.strikeAt = time;
  }
  public onPlayerHit(now: number): void {
    if (this.phase !== 'respond') return;
    this.strikeAt = now;
    this.taps++;
  }
  public onAccuracy(result: Judgement, now: number): void {
    if (this.phase !== 'respond') return;
    if (result.kind === 'hit' && result.grade === 'Perfect') this.grooveReaction?.perfect(now);
    if (result.kind === 'hit') this.hitTimes.push(now);
    else this.errorAt = now;
  }
  public finish(successful: boolean, contactSec: number): void {
    this.successful = successful;
    this.finishAt = contactSec;
  }
  public pause(): void { this.phase = 'paused'; }
  public update(now: number): void {
    if (this.phase === 'paused') now = this.lastNow;
    else this.lastNow = now;
    // PlayScene slides the table by calling `translate` after this, every frame of the
    // transition. Without this line those offsets compound and the act walks off screen.
    this.stage.setPosition(this.baseX, this.baseY);
    if (this.watching) {
      for (const cue of this.plan?.cues ?? []) {
        if (cue.kind === 'action' && cue.time <= now) this.onDemonstrationBeat(cue.time);
      }
    }
    this.backdrop.open(turnOpen(now, this.handoverAt, this.phase));
    const ending = this.finishAt === null ? -Infinity : now - this.finishAt;
    this.draw(now, ending);
    this.grooveReaction?.update(now, this.plan, this.still);
  }
  protected abstract draw(now: number, ending: number): void;
  /**
   * A burst of material bits at a point in the art's own units, fired by a judged contact.
   * Over the art and under the card light, so the light falls on what was thrown. Nothing
   * under reduced motion; counts stay in the range the presets were tuned for.
   */
  protected throwBits(preset: Preset, x: number, y: number, tint: number | number[], count: number): void {
    if (this.still) return;
    if (!this.bursts) {
      this.bursts = new Feedback(this.fxScene, 0, this.stage);
      // `Feedback` adds each emitter to the stage as it is made, at the top; under the light.
      this.stage.bringToTop(this.lightLayer);
    }
    this.bursts.burst(preset, x, y, tint, count);
    this.stage.bringToTop(this.lightLayer);
  }
  public translate(offset: number): void { if (!this.still) this.stage.x += offset; }
  public punch(dy: number): void { if (!this.still) this.stage.y += dy; }
  public destroy(): void { this.bursts?.destroy(); this.bursts = null; this.stage.destroy(true); this.backdrop.destroy(); }
}
