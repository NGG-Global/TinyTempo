import type Phaser from 'phaser';
import type { Viewport } from '@/core/Viewport';
import { reducedMotion } from '@/core/motionPreference';
import type { Phase } from '@/game/RoundController';
import type { RoundPlan } from '@/rhythm/RhythmScheduler';
import type { Judgement } from '@/rhythm/judge';
import { Backdrop } from '@/ui/backdrop';
import type { Vignette } from './Vignette';
import { handoverAt } from '@/game/beatTrack';
import { acceptDemoBeat, turnOpen } from './motion';

/** Lifecycle only. Each act owns its art; the round controller owns every verdict. */
export abstract class HouseholdVignette implements Vignette {
  protected readonly stage: Phaser.GameObjects.Container;
  protected readonly art: Phaser.GameObjects.Graphics;
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
  protected get still(): boolean { return reducedMotion(); }
  protected get watching(): boolean { return this.phase === 'prepare' || this.phase === 'demonstrate'; }
  protected get strokes(): number { return this.watching ? this.demoTimes.length : this.taps; }

  public constructor(scene: Phaser.Scene, paper: number, glow: number) {
    this.backdrop = new Backdrop(scene, paper, glow, { glowAlpha: 0.45 });
    this.stage = scene.add.container(0, 0).setDepth(-10);
    this.art = scene.add.graphics();
    this.stage.add(this.art);
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
  }
  protected abstract draw(now: number, ending: number): void;
  public translate(offset: number): void { if (!this.still) this.stage.x += offset; }
  public destroy(): void { this.stage.destroy(true); this.backdrop.destroy(); }
}
