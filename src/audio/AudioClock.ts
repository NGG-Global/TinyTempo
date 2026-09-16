import { RHYTHM } from '../config/rhythm';

export function normalizeTimestamp(timestamp: number, nowMs: number, originMs: number): number {
  const normalized = timestamp > originMs ? timestamp - originMs : timestamp;
  return Number.isFinite(normalized) && normalized > 0 && normalized <= nowMs + 1
    && nowMs - normalized < RHYTHM.inputStampMaxAgeMs ? normalized : nowMs;
}

export function mapTimestamp(eventMs: number, performanceMs: number, audioSec: number): number {
  return audioSec + (eventMs - performanceMs) / 1000;
}

/**
 * Whether a `getOutputTimestamp()` pair can be used to map input onto the audible stream.
 *
 * Chrome on Bluetooth often reports `performanceTime` slightly in the future (the sample
 * about to emerge from the headphones) and refreshes the pair slower than a speaker
 * device. Rejecting either of those sent the clock onto `currentTime`, which is ahead of
 * what the player hears — so `now()` expired their targets while `input()` still treated
 * the tap as late.
 */
export function stampUsable(
  stamp: AudioTimestamp | null | undefined,
  nowMs: number,
  currentTime: number,
): stamp is { contextTime: number; performanceTime: number } {
  const contextTime = stamp?.contextTime, performanceTime = stamp?.performanceTime;
  if (contextTime === undefined || performanceTime === undefined) return false;
  if (!(contextTime > 0) || !(performanceTime > 0)) return false;
  if (!Number.isFinite(contextTime) || !Number.isFinite(performanceTime)) return false;
  // A predictive stamp can sit a hair ahead of currentTime; a Bluetooth pair can sit
  // hundreds of milliseconds behind it. Either is still the output stream.
  if (contextTime > currentTime + 0.05) return false;
  const ageMs = nowMs - performanceTime;
  return ageMs > -RHYTHM.clockStampMaxAgeMs && ageMs < RHYTHM.clockStampMaxAgeMs;
}

export class AudioClock {
  /**
   * Milliseconds the device's output lags the schedule, subtracted from every judged tap.
   * Owned by whoever constructs the clock rather than read from a store here: the clock
   * is the single funnel for judged timestamps and has no business knowing about storage.
   */
  public calibrationMs = 0;
  private performanceMs = 0;
  private audioSec = 0;
  public mode: 'output' | 'estimated' = 'estimated';
  public constructor(private readonly context: AudioContext) {}

  public refresh(): void {
    const now = performance.now();
    const stamp = this.context.getOutputTimestamp?.();
    if (stampUsable(stamp, now, this.context.currentTime)) {
      this.audioSec = stamp.contextTime;
      this.performanceMs = stamp.performanceTime;
      this.mode = 'output';
      return;
    }
    if (this.mode === 'output') {
      // Keep extrapolating the last audible pair. Replacing it with currentTime would
      // jump the scene forward by the headphone delay and miss every waiting target.
      return;
    }
    this.audioSec = this.context.currentTime;
    this.performanceMs = now;
    this.mode = 'estimated';
  }
  public reset(): void {
    this.mode = 'estimated';
    this.performanceMs = 0;
    this.audioSec = 0;
    this.refresh();
  }
  public now(): number {
    return mapTimestamp(performance.now(), this.performanceMs, this.audioSec);
  }
  public input(timestamp: number): number {
    const time = normalizeTimestamp(timestamp, performance.now(), performance.timeOrigin);
    // Input only. If output is delayed by L the player hears late and taps late, so
    // removing L from their timestamp is the correction; visuals are not delayed by the
    // device, and shifting those would introduce an error rather than remove one.
    return mapTimestamp(time, this.performanceMs, this.audioSec) - this.calibrationMs / 1000;
  }
}
