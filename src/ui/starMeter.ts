/**
 * The Daily Tempo run's star meter: a bar from 0 to 100% with a notch at each star's
 * threshold, filled to the run's accuracy so far, and the three stars over it lit as the
 * fill passes them. Pure, so the scene only paints it.
 *
 * It moves **once per finished task**, from the mean of the tasks completed so far
 * (`meanAccuracy`), never per tap: the round's accuracy is not known until the round ends,
 * and a number that moved on every tap would move again on the next, which reads as the
 * game changing its mind. Before the first task has finished it shows no number.
 */
export interface StarMeterPose {
  /** 0 → 1 along the bar. */
  readonly fill: number;
  readonly lit: 0 | 1 | 2 | 3;
  /** The three thresholds as 0 → 1 along the bar. */
  readonly notches: readonly [number, number, number];
  /** The next threshold still above the fill, as a whole percent, or null with all three lit. */
  readonly next: number | null;
  /** "76%" once a task has finished, "—" before. */
  readonly label: string;
  /** "NEXT 84%", or "ALL THREE" once every star is lit. */
  readonly nextLabel: string;
}

export function starMeterPose(accuracy: number | null, thresholds: readonly [number, number, number]): StarMeterPose {
  const value = accuracy === null || !Number.isFinite(accuracy) ? null : Math.max(0, Math.min(100, accuracy));
  const fill = value === null ? 0 : value / 100;
  const lit = value === null ? 0 : value >= thresholds[2] ? 3 : value >= thresholds[1] ? 2 : value >= thresholds[0] ? 1 : 0;
  const next = lit === 3 ? null : thresholds[lit]!;
  return {
    fill, lit,
    notches: [thresholds[0] / 100, thresholds[1] / 100, thresholds[2] / 100],
    next,
    // Rounded down, as the result's score is (`scoreLabel`): a threshold is a whole percent.
    label: value === null ? '—' : `${Math.floor(value)}%`,
    nextLabel: next === null ? 'ALL THREE' : `NEXT ${next}%`,
  };
}
