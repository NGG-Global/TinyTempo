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

/**
 * The furthest output lag this will believe from the platform, in seconds.
 *
 * The same ceiling `clampCalibration` puts on a measured offset, and for the same reason:
 * past half a second the player is not hearing the beat they are tapping, and a number
 * that large is far likelier to be a broken report than a real device.
 */
const MAX_REPORTED_LAG_SEC = 0.5;

/**
 * How far behind `currentTime` the sample being heard right now is.
 *
 * `baseLatency` is the graph's own buffering and `outputLatency` is the path from there to
 * the speaker; **they add**. Measured in Chrome across eight samples: `getOutputTimestamp`
 * reported the heard sample lagging `currentTime` by 40–43 ms while `baseLatency` was 10
 * and `outputLatency` 32 — a sum of 42, not the 32 that `outputLatency` alone would give.
 * Subtracting only one of them would leave a third of the error in place.
 *
 * Both are optional, and a context that reports neither returns 0, which is exactly the
 * behaviour this replaced.
 */
export function reportedOutputLag(context: Pick<AudioContext, 'baseLatency' | 'outputLatency'>): number {
  const parts = [context.baseLatency, context.outputLatency];
  let total = 0;
  for (const part of parts) {
    if (typeof part === 'number' && Number.isFinite(part) && part > 0) total += part;
  }
  return Math.min(total, MAX_REPORTED_LAG_SEC);
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
  /** What the platform claims its output lag is, for the support report and Tap offset. */
  public get reportedLagMs(): number { return Math.round(reportedOutputLag(this.context) * 1000); }
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
    // `currentTime` is the sample being *written*, not the one being *heard* — they differ
    // by the device's output lag, which on Bluetooth is a fifth of a second. Mapping a tap
    // onto the written sample therefore judged every tap that much late, with nothing to
    // correct it but the manual Tap offset, which defaults to zero. The output-stamp path
    // above already reports the heard sample, so this is the only branch that needs it.
    this.audioSec = this.context.currentTime - reportedOutputLag(this.context);
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
