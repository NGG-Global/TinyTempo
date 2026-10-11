import { RHYTHM } from '../config/rhythm';
import { createJudge, expireTargets, judgeTap, windowsFor, type JudgeState, type Judgement } from '../rhythm/judge';
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
   * The trombone's action voice is the plan, not the tap. When set, targets are
   * scheduled with the demonstration and `emitHit` does not play a second take.
   */
  private gridAction = false;
  private readonly scheduler: RhythmScheduler;

  public constructor(private readonly sound: SoundSink, private readonly events: RoundEvents) {
    this.scheduler = new RhythmScheduler(sound);
  }
  public get active(): boolean { return this.plan !== null && this.phase !== 'result' && this.phase !== 'paused'; }
  public start(
    pattern: Pattern, bpm: number, renderNow: number, wallMs: number,
    startAt = renderNow + RHYTHM.leadSec, leadBeats = 0, gridAction = false,
  ): void {
    this.scheduler.cancel();
    this.plan = createRoundPlan(++this.generation, pattern, bpm, startAt, leadBeats);
    this.judge = createJudge(this.plan.targets, windowsFor(this.plan.targets));
    this.result = null;
    this.cueIndex = 0;
    this.lastPumpMs = wallMs;
    this.gridAction = gridAction;
    this.scheduler.schedule(this.plan, gridAction);
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
    while (this.cueIndex < plan.cues.length && plan.cues[this.cueIndex]!.time <= now) {
      const cue = plan.cues[this.cueIndex++]!;
      // A demonstration beat that is due once the player's turn has begun — a dense
      // pattern's last subdivision, after an early first tap — is already sounding from
      // the schedule and must never start the example on the tool the player holds.
      if (cue.kind === 'action' && this.phase === 'respond') continue;
      if (now - cue.time < RHYTHM.stallMs / 1000) this.events.cue(cue);
    }
    this.setPhase(phaseAt(plan, now, this.phase));
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
    // A judged tap is the player's beat, and the response has begun with it — whether
    // it landed in the early window before the downbeat or in the moments after it that
    // the pump has not yet ticked through. It used to be held: an early first hit kept
    // its voice and its picture until the downbeat, and one just after it kept its
    // verdict until the next tap flushed it, so the first beat of every task answered
    // somewhere between 20 and 150 ms after the thumb and read as lag. The strike, the
    // voice and the verdict land on the tap now, as every later beat's always have.
    this.setPhase('respond');
    this.emitHit(renderNow);
    this.events.judgement(result);
    return result;
  }
  public interrupt(reason: string): void {
    if (!this.active) return;
    this.scheduler.cancel();
    this.judge = null;
    this.result = null;
    this.setPhase('paused');
    this.events.interrupted(reason);
  }
  public dispose(): void {
    this.scheduler.cancel();
    this.plan = null;
    this.judge = null;
    this.result = null;
    this.phase = 'idle';
  }
  private emitHit(renderNow: number): void {
    this.events.tap();
    // Grid-voiced acts already scheduled the take: playing again would double it and
    // walk the engine past the note the picture is showing.
    if (!this.gridAction) this.sound.play(renderNow, 'action');
  }
  private setPhase(phase: Phase): void {
    if (this.phase !== phase) { this.phase = phase; this.events.phase(phase); }
  }
}

/**
 * The phase the clock says a task is in. Phases only move forward inside a task: a tap
 * judged in the early window has already begun the response, and a tick read a few
 * milliseconds before the downbeat must not put the example back on the tool for a frame.
 */
export function phaseAt(plan: RoundPlan, now: number, current: Phase): Phase {
  const derived: Phase = now < plan.demo ? 'prepare' : now < plan.response ? 'demonstrate' : 'respond';
  return current === 'respond' && derived !== 'respond' ? current : derived;
}

/**
 * A pause after the last task has already been scored should reveal the plaque, not
 * "Resume". Between tasks the phase is also `result`, but nothing has been saved yet.
 */
export function pauseShouldShowSummary(phase: Phase, hasOutcome: boolean): boolean {
  return phase === 'result' && hasOutcome;
}
