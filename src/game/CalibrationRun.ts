import { calibrationFrom, CALIBRATION_TAPS } from './settings';

/** Slower than gameplay so common Bluetooth delays cannot wrap onto a neighbouring beat. */
export const CALIBRATION = {
  bpm: 60,
  leadBeats: 4,
  measureBeats: 12,
  startLeadSec: 0.6,
  acceptanceRatio: 0.4,
  maxJitterMs: 45,
  /**
   * A residual this small on a run after Keep means the kept offset is right: the taps are
   * landing where the clock now expects them, and the screen says so rather than offering a
   * number a few milliseconds different to keep again.
   */
  spotOnMs: 15,
} as const;

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

/**
 * Where one tap went. `landed` is a sample; `early` and `late` are taps outside the
 * acceptance window of their nearest measured beat; `repeat` is a second tap on a beat
 * already sampled; `outside` is the count-in, after the last measured beat, or after the
 * run is complete. Only `landed` counts, and the screen says why the others did not.
 */
export type TapOutcome = 'landed' | 'early' | 'late' | 'repeat' | 'outside';

/**
 * What a finished run found. `measured` carries the offset to keep and how tightly the taps
 * agreed; `few` is a run that ended with too few taps landed; `uneven` eight taps that
 * disagreed too much to trust. The two failures are different advice — tap on every beat,
 * and tap more evenly — so they are told apart rather than both reading "unclear".
 */
export type CalibrationVerdict =
  | { readonly kind: 'measured'; readonly offsetMs: number; readonly residualMs: number; readonly spreadMs: number }
  | { readonly kind: 'few'; readonly landed: number }
  | { readonly kind: 'uneven'; readonly spreadMs: number };

/** Pure calibration state. Audio, persistence and presentation stay in the scene. */
export class CalibrationRun {
  public readonly period = 60 / CALIBRATION.bpm;
  private readonly beats = new Set<number>();
  private readonly residuals: number[] = [];

  public constructor(public readonly origin: number, private readonly currentMs: number) {}

  public get count(): number { return this.residuals.length; }
  public get complete(): boolean { return this.count >= CALIBRATION_TAPS; }
  public get end(): number { return this.origin + (CALIBRATION.leadBeats + CALIBRATION.measureBeats) * this.period; }
  public beatAt(now: number): number { return (now - this.origin) / this.period; }
  /** Every landed tap's residual against the clock's current offset, in order, signed (negative early). */
  public get residualsMs(): readonly number[] { return this.residuals; }
  /** How far the taps disagree with each other: the median distance from their median, in ms. */
  public get spreadMs(): number {
    if (this.residuals.length === 0) return 0;
    const centre = median(this.residuals);
    return median(this.residuals.map(value => Math.abs(value - centre)));
  }

  /** At most one sample per beat: rapid tapping cannot manufacture a result. */
  public tap(correctedSec: number): boolean {
    return this.place(correctedSec) === 'landed';
  }

  /** `tap`, and where a tap that did not land went. */
  public place(correctedSec: number): TapOutcome {
    if (!Number.isFinite(correctedSec) || this.complete) return 'outside';
    const beat = Math.round(this.beatAt(correctedSec));
    if (beat < CALIBRATION.leadBeats || beat >= CALIBRATION.leadBeats + CALIBRATION.measureBeats) return 'outside';
    if (this.beats.has(beat)) return 'repeat';
    const residual = (correctedSec - (this.origin + beat * this.period)) * 1000;
    if (Math.abs(residual) > this.period * 1000 * CALIBRATION.acceptanceRatio) return residual < 0 ? 'early' : 'late';
    this.beats.add(beat);
    this.residuals.push(residual);
    return 'landed';
  }

  public verdict(): CalibrationVerdict {
    if (!this.complete) return { kind: 'few', landed: this.count };
    const spreadMs = this.spreadMs;
    if (spreadMs > CALIBRATION.maxJitterMs) return { kind: 'uneven', spreadMs };
    const residualMs = median(this.residuals);
    // `calibrationFrom` clamps; it returns null only below eight taps, which `complete` rules out.
    return { kind: 'measured', offsetMs: calibrationFrom(this.currentMs, this.residuals) ?? this.currentMs, residualMs, spreadMs };
  }

  public result(): number | null {
    const verdict = this.verdict();
    return verdict.kind === 'measured' ? verdict.offsetMs : null;
  }
}
