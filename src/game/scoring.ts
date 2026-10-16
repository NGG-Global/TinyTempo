import { RHYTHM } from '../config/rhythm';
import type { JudgeState } from '../rhythm/judge';

export interface RoundResult {
  readonly perfect: number;
  readonly good: number;
  readonly missed: number;
  readonly extras: number;
  readonly accuracy: number;
  readonly meanAbsoluteErrorMs: number | null;
  /**
   * Every judged hit's signed error, in target order: negative early, positive late. The
   * absolute mean above cannot tell a player who is always 30 ms early from one who is
   * 30 ms either side at random, and those two need opposite advice. Extras and misses
   * have no place here: an extra answered no beat and a miss has no tap to measure.
   */
  readonly deltasMs: readonly number[];
}

/**
 * The best accuracy a task could still finish on: every beat not yet judged answered
 * Perfect, every one already judged kept as it was, every extra already charged.
 *
 * A pause mid-task replays that task from its count-in, and without a ceiling the replay
 * would be a free second go at it — a bad task wiped by backgrounding the app. With one,
 * an interruption can only ever cost a task, never improve it: whatever the replay
 * scores, the task is credited at most what the interrupted pass could still have made.
 */
export function scoreCeiling(state: JudgeState): number {
  let points = 0;
  for (const outcome of state.outcomes) {
    if (outcome === null) points += 100;
    else if (outcome.kind === 'hit') points += outcome.grade === 'Perfect' ? 100 : RHYTHM.goodPoints;
  }
  return Math.max(0, points - state.extras.length * RHYTHM.extraPenalty) / state.targets.length;
}

/** A result held to a ceiling. Only ever lowers the accuracy; the marks stay as played. */
export function capRound(result: RoundResult, ceiling: number): RoundResult {
  if (!Number.isFinite(ceiling) || result.accuracy <= ceiling) return result;
  return { ...result, accuracy: Math.max(0, ceiling) };
}

export function scoreRound(state: JudgeState): RoundResult {
  const hits = state.outcomes.filter(result => result?.kind === 'hit');
  const perfect = hits.filter(result => result?.grade === 'Perfect').length;
  const good = hits.length - perfect;
  const deltasMs = hits.map(result => result?.deltaMs).filter((delta): delta is number => typeof delta === 'number' && Number.isFinite(delta));
  return {
    perfect, good, missed: state.targets.length - hits.length, extras: state.extras.length,
    accuracy: Math.max(0, perfect * 100 + good * RHYTHM.goodPoints - state.extras.length * RHYTHM.extraPenalty) / state.targets.length,
    meanAbsoluteErrorMs: hits.length ? hits.reduce((sum, result) => sum + Math.abs(result?.deltaMs ?? 0), 0) / hits.length : null,
    deltasMs,
  };
}
