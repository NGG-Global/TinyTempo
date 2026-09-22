import { RHYTHM } from '../config/rhythm';
import { secondsPerBeat, validatePattern, type Pattern } from './patterns';

export type SoundKind = 'count' | 'ready' | 'action';
export interface ScheduledCue { readonly time: number; readonly kind: SoundKind }
export interface RoundPlan {
  readonly id: number;
  readonly pattern: Pattern;
  readonly bpm: number;
  readonly start: number;
  readonly demo: number;
  readonly response: number;
  readonly end: number;
  readonly targets: readonly number[];
  readonly cues: readonly ScheduledCue[];
}
export interface SoundSink {
  play(time: number, kind: SoundKind): void;
  cancel(): void;
}

/**
 * One task on the shared grid: an optional lead-in, the demonstration phrase, then the
 * player's response on the very next downbeat. There is no bar between the two — the
 * demonstration ends on a bar line and the response begins there, so a task is
 * call-and-response rather than call, wait, response.
 *
 * `leadBeats` is whole beats of lead-in before the demonstration, and it is the only
 * thing that ever separates two tasks: one bar to open a level so the player finds the
 * pulse, four bars for a long level's breather, and nothing at all in between.
 */
export function createRoundPlan(id: number, pattern: Pattern, bpm: number, start: number, leadBeats = 0): RoundPlan {
  validatePattern(pattern);
  if (!Number.isFinite(start)) throw new Error('Invalid round origin.');
  if (!Number.isInteger(leadBeats) || leadBeats < 0) throw new Error('Lead-in must be whole beats.');
  const beat = secondsPerBeat(bpm);
  const demo = start + leadBeats * beat;
  const phraseBeats = Math.ceil(pattern.lengthBeats / RHYTHM.beatsPerBar) * RHYTHM.beatsPerBar;
  const response = demo + phraseBeats * beat;
  return Object.freeze({
    id, pattern, bpm, start, demo, response, end: response + phraseBeats * beat,
    targets: Object.freeze(pattern.hits.map(hit => response + hit * beat)),
    cues: Object.freeze([
      // The last lead beat is a distinct readiness tick rather than another count: it is
      // the one that says the demonstration starts next, and it is never a target.
      ...Array.from({ length: leadBeats }, (_, i) => ({
        time: start + i * beat, kind: (i === leadBeats - 1 ? 'ready' : 'count') as SoundKind,
      })),
      ...pattern.hits.map(hit => ({ time: demo + hit * beat, kind: 'action' as const })),
    ]),
  });
}

/** Entire short phrase is submitted ahead of time; no JS callback starts a demo beat. */
export class RhythmScheduler {
  public constructor(private readonly sound: SoundSink) {}
  /**
   * `gridAction` also voices every response target on the grid. Most acts must not:
   * a ghost action during the player's turn would give the answer away. The trombone
   * is the exception — its note is the plan, not the tap.
   */
  public schedule(plan: RoundPlan, gridAction = false): void {
    this.cancel();
    for (const cue of plan.cues) this.sound.play(cue.time, cue.kind);
    if (gridAction) for (const time of plan.targets) this.sound.play(time, 'action');
  }
  public cancel(): void { this.sound.cancel(); }
}
