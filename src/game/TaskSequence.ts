import { secondsPerBeat } from '../rhythm/patterns';

/** One round is a fixed playlist of nail tasks, all on one audio-clock grid. */
export class TaskSequence {
  public index = 0;
  public readonly results: number[] = [];
  public constructor(public readonly bpm: number, public readonly origin: number, public readonly taskCount = 3) {
    secondsPerBeat(bpm);
    if (!Number.isFinite(origin) || !Number.isInteger(taskCount) || taskCount < 1) throw new Error('Invalid sequence.');
  }
  public get last(): boolean { return this.index === this.taskCount - 1; }
  public get accuracy(): number { return this.results.length ? this.results.reduce((a, b) => a + b, 0) / this.results.length : 0; }
  public complete(accuracy: number): void { this.results[this.index] = accuracy; }
  public advance(): void { if (!this.last) this.index++; }
  public ending(end: number, holdBeats = 1): { contact: number; slide: number; swap: number; next: number } {
    // Contact and both halves of the table slide use three beats; the hold completes whole bars.
    if (!Number.isInteger(holdBeats) || holdBeats < 1 || (holdBeats + 3) % 4 !== 0) throw new Error('Ending hold must complete whole bars.');
    const beat = secondsPerBeat(this.bpm);
    return { contact: end + beat, slide: end + (1 + holdBeats) * beat, swap: end + (2 + holdBeats) * beat, next: end + (3 + holdBeats) * beat };
  }
}

/**
 * Whether the next task can still be placed on the grid, given the context clock at the
 * moment its swap beat is reached.
 *
 * The scene reaches the swap on the audible clock, because a level's phases, judgements
 * and visuals all run on the sample the player is currently hearing. The cues it then
 * schedules are placed on the context clock, which sits the device's output latency ahead
 * of that. Through a speaker the two readings are milliseconds apart; through Bluetooth
 * they are 200-400 ms apart, which is most of the single beat between `swap` and `next`.
 *
 * So the deadline is the next task's own downbeat, read on the clock the cues are
 * scheduled against. Before it every cue still lands where the grid wants it, and a fixed
 * cushion held back on top of it is charged to the headphones rather than to the stall it
 * is there to catch — which interrupted the level at every task change on a headset.
 */
export function canPlaceNextTask(contextNow: number, next: number): boolean {
  return Number.isFinite(contextNow) && Number.isFinite(next) && contextNow < next;
}
