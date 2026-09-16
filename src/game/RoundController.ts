import { RHYTHM } from '../config/rhythm';
import { createJudge, expireTargets, judgeTap, type JudgeState, type Judgement } from '../rhythm/judge';
import { createRoundPlan, RhythmScheduler, type RoundPlan, type ScheduledCue, type SoundSink } from '../rhythm/RhythmScheduler';
import type { Pattern } from '../rhythm/patterns';
import { scoreRound, type RoundResult } from './scoring';

export type Phase = 'idle' | 'prepare' | 'demonstrate' | 'respond' | 'result' | 'paused';
export interface RoundEvents {
  phase(phase: Phase): void;
  cue(cue: ScheduledCue): void;
  tap(): void;
  judgement(result: Judgement): void;
  complete(result: RoundResult): void;
  interrupted(reason: string): void;
}

/** Pure coordinator: callers supply clock readings. No Phaser, DOM or animation dependency. */
export class RoundController {
  public phase: Phase = 'idle';
  public plan: RoundPlan | null = null;
  public result: RoundResult | null = null;
  private judge: JudgeState | null = null;
  private generation = 0;
  private cueIndex = 0;
  private lastPumpMs = 0;
  /**
   * A tap that scored in the early window before the response downbeat. The example is
   * still on the tool, so the action voice and the vignette wait for `respond`.
   */
  private heldHit: { readonly renderNow: number } | null = null;
  private readonly scheduler: RhythmScheduler;

  public constructor(private readonly sound: SoundSink, private readonly events: RoundEvents) {
    this.scheduler = new RhythmScheduler(sound);
  }
  public get active(): boolean { return this.plan !== null && this.phase !== 'result' && this.phase !== 'paused'; }
  public start(pattern: Pattern, bpm: number, renderNow: number, wallMs: number, startAt = renderNow + RHYTHM.leadSec, leadBeats = 0): void {
    this.scheduler.cancel();
    this.plan = createRoundPlan(++this.generation, pattern, bpm, startAt, leadBeats);
    this.judge = createJudge(this.plan.targets);
    this.result = null;
    this.cueIndex = 0;
    this.lastPumpMs = wallMs;
    this.heldHit = null;
    this.scheduler.schedule(this.plan);
    this.setPhase('prepare');
  }
  /** Absolute time of the first demonstration beat, which is the first thing a stall can hide. */
  private firstBeat(): number {
    return this.plan?.cues.find(cue => cue.kind === 'action')?.time ?? Infinity;
  }
  private healthy(now: number, wallMs: number): boolean {
    if (wallMs - this.lastPumpMs > RHYTHM.stallMs) {
      // A stall that ends before the first demonstration beat has hidden nothing and delayed
      // no judgement; the swap into a task and its first heavy frames land exactly here.
      // Expressed against that beat rather than against the lead-in, because most tasks have
      // no lead-in at all now: only the first of a level and a long level's breather do.
      if (this.plan && now < this.firstBeat()) { this.lastPumpMs = wallMs; return true; }
      this.interrupt('Timing interrupted. Restart this round.');
      return false;
    }
    return true;
  }
  public tick(now: number, wallMs: number): void {
    if (!this.active || !this.plan || !this.judge || !this.healthy(now, wallMs)) return;
    this.lastPumpMs = wallMs;
    const plan = this.plan;
    // Demonstration cues first, while the rendered phase is still the example. A last
    // beat that sits inside the stall window of the response downbeat must land on the
    // tool before a held first tap, or it overwrites the player's strike.
    while (this.cueIndex < plan.cues.length && plan.cues[this.cueIndex]!.time <= now) {
      const cue = plan.cues[this.cueIndex++]!;
      if (now - cue.time < RHYTHM.stallMs / 1000) this.events.cue(cue);
    }
    this.setPhase(now < plan.demo ? 'prepare' : now < plan.response ? 'demonstrate' : 'respond');
    this.releaseHeldHit();
    for (const miss of expireTargets(this.judge, now)) this.events.judgement(miss);
    if (now > plan.end + (RHYTHM.goodMs + RHYTHM.deliveryGraceMs) / 1000) {
      this.result = scoreRound(this.judge);
      this.scheduler.cancel();
      this.setPhase('result');
      this.events.complete(this.result);
    }
  }
  public tap(inputSec: number, renderNow: number, wallMs: number): Judgement | null {
    if (!this.active || !this.plan || !this.judge || !this.healthy(inputSec, wallMs)) return null;
    if (inputSec < this.plan.response - RHYTHM.goodMs / 1000 || inputSec > this.plan.end + RHYTHM.goodMs / 1000) return null;
    const result = judgeTap(this.judge, inputSec);
    // The early window still scores the first response beat, but the demonstration is
    // still the rendered phase. Starting the player's strike there snaps the example
    // back to rest mid-recoil.
    if (inputSec >= this.plan.response) {
      this.emitHit(renderNow);
      this.events.judgement(result);
    } else {
      this.events.judgement(result);
      this.heldHit ??= { renderNow };
    }
    return result;
  }
  public interrupt(reason: string): void {
    if (!this.active) return;
    this.scheduler.cancel();
    this.judge = null;
    this.result = null;
    this.heldHit = null;
    this.setPhase('paused');
    this.events.interrupted(reason);
  }
  public dispose(): void {
    this.scheduler.cancel();
    this.plan = null;
    this.judge = null;
    this.result = null;
    this.heldHit = null;
    this.phase = 'idle';
  }
  private emitHit(renderNow: number): void {
    this.events.tap();
    this.sound.play(renderNow, 'action');
  }
  private releaseHeldHit(): void {
    if (this.phase !== 'respond' || !this.heldHit) return;
    this.emitHit(this.heldHit.renderNow);
    this.heldHit = null;
  }
  private setPhase(phase: Phase): void {
    if (this.phase !== phase) { this.phase = phase; this.events.phase(phase); }
  }
}
