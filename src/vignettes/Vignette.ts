import type Phaser from 'phaser';
import type { Viewport } from '@/core/Viewport';
import type { Phase } from '@/game/RoundController';
import type { RoundPlan } from '@/rhythm/RhythmScheduler';
import type { Judgement } from '@/rhythm/judge';
import type { VignetteSounds } from '@/audio/AudioEngine';

export interface Vignette {
  layout(viewport: Viewport): void;
  reset(plan: RoundPlan): void;
  onPhase(phase: Phase, now: number): void;
  onDemonstrationBeat(time: number): void;
  onPlayerHit(now: number): void;
  /** Includes successful hits, omissions, and extra taps. */
  onAccuracy(result: Judgement, now: number): void;
  finish(successful: boolean, contactSec: number, accuracy?: number): void;
  pause(): void;
  update(now: number): void;
  /**
   * The between-task table slide. PlayScene calls this right after `update`, every frame
   * of the slide, with an absolute offset from the act's laid-out home — not a step. So
   * `update` must put the stage back at that home first, or the offsets compound and the
   * act walks off screen.
   */
  translate(offset: number): void;
  destroy(): void;
}
export interface VignetteDefinition {
  readonly id: string;
  readonly title: string;
  readonly intro: string;
  readonly ink: number;
  readonly success: readonly [string, string];
  readonly rough: readonly [string, string];
  /** Optional middle ending, based on the authoritative round accuracy. */
  readonly partial?: { readonly minAccuracy: number; readonly copy: readonly [string, string] };
  /** Beats to show the ending before the table slides; defaults to one. */
  readonly endingHoldBeats?: number;
  readonly endingSec: number;
  readonly successAccuracy: number;
  /**
   * The action voice is scheduled on every response target as well as the demonstration.
   * Only the trombone: every other act must keep the player's turn silent until they tap,
   * or the ghost note would give the answer away.
   */
  readonly gridAction?: boolean;
  /**
   * `lap` is how many times the rotation has come round before this level. An act with
   * several looks picks one from it; an act with a single look ignores it.
   */
  create(scene: Phaser.Scene, lap: number): Vignette;
  sounds(context: AudioContext): VignetteSounds;
}
