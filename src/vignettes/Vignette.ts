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
/** The words an act's look may replace: the name on the map, the intro and the two endings. */
export type LookCopy = Partial<Pick<VignetteDefinition, 'title' | 'intro' | 'success' | 'rough'>>;

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
   * The action voice is scheduled on every response target as well as the demonstration,
   * whatever the output route. Only the trombone: every other act keeps the player's turn
   * silent until they tap, or the ghost note would give the answer away — except on a
   * route that delays sound past the tap's own judgement, where PlayScene voices every
   * act this way (`RHYTHM.gridVoiceLagMs`).
   */
  readonly gridAction?: boolean;
  /**
   * `lap` is how many times the rotation has come round before this level. An act with
   * several looks picks one from it; an act with a single look ignores it.
   */
  create(scene: Phaser.Scene, lap: number): Vignette;
  sounds(context: AudioContext): VignetteSounds;
  /**
   * Wording per look, indexed like the act's own look list (`lap % looks.length`). Only
   * for an act whose look changes what the subject *is* — a donut is not an apple — so
   * the map, the intro and the verdict name the thing on the plate. Entry 0 should be
   * empty: lap 0 keeps the definition's own words.
   */
  readonly looks?: readonly LookCopy[];
}

const withLooks = new WeakMap<VignetteDefinition, VignetteDefinition[]>();

/** The definition as a given lap presents it. Memoized, since PlayScene reads it per frame. */
export function definitionForLap(definition: VignetteDefinition, lap: number): VignetteDefinition {
  const looks = definition.looks;
  if (!looks?.length) return definition;
  const index = Number.isFinite(lap) ? Math.max(0, Math.floor(lap)) % looks.length : 0;
  if (Object.keys(looks[index] ?? {}).length === 0) return definition;
  let cache = withLooks.get(definition);
  if (!cache) withLooks.set(definition, cache = []);
  return cache[index] ??= { ...definition, ...looks[index] };
}
