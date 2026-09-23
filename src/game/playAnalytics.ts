import {
  track, type AnalyticsEvent, type AnalyticsPayloads, type AttemptMode, type FinaleParams, type Flag, type GridName, type LevelParams,
} from '../monetization/analytics';
import { finaleTreatment } from './finale';
import { isCleared } from './health';
import type { LevelSpec } from './levels';
import type { LevelOutcome, Progress } from './progress';
import type { RoundResult } from './scoring';
import { areaIndexOf, gateFor, levelStars, totalStars } from './stars';

/**
 * Gameplay analytics: what the scenes report, and the rules that keep each report single.
 *
 * Pure — no Phaser, no vendor — so every guarantee below is tested under node. Scenes hold
 * a run object and tell it what happened; the run decides what, if anything, is worth an
 * event. Nothing here stores anything: the session state is in memory and dies with the
 * process, which is why `retry_count` and the gate dedupe are per app session.
 *
 * **One finished attempt is one result event.** A level's attempt is keyed on the heart
 * attempt id PlayScene already mints, so Resume after a pause and the restart puck — the
 * same attempt, by the heart rules — continue the run rather than starting a second one,
 * and a finished id is never reopened. A scene rebuilt for a second visit gets a new id,
 * so its first start is a new attempt and never a duplicate of the last one.
 *
 * **Analytics cannot stop the game.** Every public method swallows its own failure; the
 * bus already swallows the sink's. A throw here would otherwise land inside a Phaser
 * callback, which is the one place a rhythm game cannot afford one.
 */

type Emit = <K extends AnalyticsEvent>(event: K, payload: AnalyticsPayloads[K]) => void;

/** Finished attempt ids kept for dedupe. Far more than a session produces; bounds a leak. */
const CLOSED_KEEP = 64;

function guard<T>(fallback: T, body: () => T): T {
  try { return body(); } catch { return fallback; }
}

const flag = (value: boolean): Flag => (value ? 1 : 0);

/** 1-based, so a dashboard's "area 1" is levels 1–10. */
export function areaNumber(level: number): number {
  return areaIndexOf(level) + 1;
}

/** The finest grid a level asks for anywhere in it. */
export function levelGrid(spec: LevelSpec): GridName {
  if (spec.tasks.some(task => task.grid === 'sixteenth')) return 'sixteenth';
  if (spec.tasks.some(task => task.grid === 'triplet')) return 'triplet';
  return 'eighth';
}

/** Whether an attempt on this level counts toward progress, from the save as it stood. */
export function attemptMode(progress: Progress, level: number): AttemptMode {
  return isCleared(progress, level) ? 'replay' : 'frontier';
}

export function levelParams(spec: LevelSpec, progress: Progress, retryCount: number, heartSpent: boolean): LevelParams {
  return {
    level: spec.level,
    area: areaNumber(spec.level),
    role: spec.role,
    task_count: spec.tasks.length,
    bpm: spec.peakBpm,
    pattern_tier: Math.max(0, ...spec.tasks.map(task => task.tier)),
    grid: levelGrid(spec),
    clear_accuracy: spec.clearAccuracy,
    mode: attemptMode(progress, spec.level),
    previous_stars: levelStars(progress, spec.level),
    retry_count: retryCount,
    heart_cost: flag(heartSpent),
  };
}

export function taskParams(
  spec: LevelSpec, index: number, result: RoundResult, mode: AttemptMode,
): AnalyticsPayloads['task_completed'] {
  const task = spec.tasks[index]!;
  const error = result.meanAbsoluteErrorMs;
  return {
    level: spec.level,
    area: areaNumber(spec.level),
    mode,
    task_index: index + 1,
    task_count: spec.tasks.length,
    bpm: task.bpm,
    pattern_tier: task.tier,
    grid: task.grid ?? 'eighth',
    accuracy: Math.round(result.accuracy),
    perfect: result.perfect,
    good: result.good,
    miss: result.missed,
    extra: result.extras,
    // Every beat Perfect: the test `isFlawless` applies to the marks, so the event agrees
    // with the strike the player saw. Extra taps do not cancel it there, so not here either.
    flawless: flag(result.missed === 0 && result.good === 0 && result.perfect > 0),
    ...(error !== null && Number.isFinite(error) ? { error_ms: Math.round(error) } : {}),
  };
}

/** What an area finale's events share, from the level's own parameters. */
export function finaleParams(spec: LevelSpec, params: LevelParams): FinaleParams {
  return { level: spec.level, area: params.area, treatment: finaleTreatment(spec.level).id, mode: params.mode };
}

/** The task that cost the most: lowest accuracy, earliest on a tie. 1-based; zero when none finished. */
export function weakestTask(results: readonly (number | undefined)[]): { readonly task: number; readonly accuracy: number } {
  let task = 0;
  let accuracy = 0;
  results.forEach((value, index) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    if (task === 0 || value < accuracy) { task = index + 1; accuracy = value; }
  });
  return { task, accuracy: Math.round(accuracy) };
}

export interface LevelStart {
  readonly spec: LevelSpec;
  /** The save as it stood before this attempt. */
  readonly progress: Progress;
  readonly attemptId: string;
  readonly heartSpent: boolean;
}

/** One attempt at a level, from its first downbeat to its result or the player leaving. */
export class LevelRun {
  private readonly tasks = new Set<number>();
  private results: number[] = [];
  private startedAt: number;
  private restarts = 0;
  private closed = false;

  public constructor(
    private readonly ledger: PlayAnalytics,
    public readonly attemptId: string,
    private readonly spec: LevelSpec,
    private readonly before: Progress,
    private readonly params: LevelParams,
  ) {
    this.startedAt = ledger.clockMs();
  }

  public get finished(): boolean { return this.closed; }

  /** The same attempt back at its first task. Its tasks will be played, and reported, again. */
  public restart(): void {
    guard(undefined, () => {
      if (this.closed) return;
      this.restarts++;
      this.startedAt = this.ledger.clockMs();
      this.tasks.clear();
      this.results = [];
    });
  }

  /** A task was judged to its end. Once per task per pass through the level. */
  public task(index: number, result: RoundResult): void {
    guard(undefined, () => {
      if (this.closed || this.tasks.has(index) || !this.spec.tasks[index]) return;
      this.tasks.add(index);
      this.results[index] = result.accuracy;
      this.ledger.emit('task_completed', taskParams(this.spec, index, result, this.params.mode));
    });
  }

  /**
   * The level was scored. Exactly one of `level_completed` and `level_failed`, however
   * often the scene reaches its own record step, followed by what the result changed.
   */
  public finish(outcome: LevelOutcome, accuracy: number): void {
    guard(undefined, () => {
      if (this.closed) return;
      this.closed = true;
      this.ledger.closeRun(this.attemptId, this.spec.level, outcome.cleared);
      const weakest = weakestTask(this.results);
      const result = {
        ...this.params,
        accuracy: Math.round(accuracy),
        duration_ms: this.elapsed(),
        restarts: this.restarts,
        weakest_task: weakest.task,
        weakest_accuracy: weakest.accuracy,
      };
      if (outcome.cleared) this.ledger.emit('level_completed', { ...result, stars: outcome.stars });
      else this.ledger.emit('level_failed', result);
      // Once per finished finale attempt, from the same single close as the result above.
      if (this.spec.finale) {
        const finale = finaleParams(this.spec, this.params);
        if (outcome.cleared) this.ledger.emit('area_finale_completed', { ...finale, stars: outcome.stars, accuracy: result.accuracy });
        else this.ledger.emit('area_finale_failed', { ...finale, accuracy: result.accuracy });
      }
      const after = outcome.progress;
      // An improvement is a replay beating its own stars. A first clear is a completion,
      // already counted above, and would otherwise read as "improved from nothing".
      if (outcome.cleared && this.params.previous_stars > 0 && outcome.stars > this.params.previous_stars) {
        this.ledger.emit('star_improved', {
          level: this.spec.level,
          area: this.params.area,
          stars: outcome.stars,
          previous_stars: this.params.previous_stars,
          accuracy: Math.round(accuracy),
          gate_have: totalStars(after),
        });
      }
      // A gate opens for a player only when it was holding them: the frontier stood in
      // front of it before this run and does not now. Areas opened far ahead of the
      // frontier by a strong player never held anyone and are not an event.
      const held = gateFor(this.before, this.before.unlocked);
      const still = gateFor(after, after.unlocked);
      if (held !== null && (still === null || still.area !== held.area)) {
        this.ledger.emit('star_gate_opened', {
          area: held.area + 1,
          level: held.level,
          gate_required: held.required,
          gate_have: totalStars(after),
        });
      }
    });
  }

  /** The player left before the result: the map puck, or the scene going away mid-run. */
  public abandon(): void {
    guard(undefined, () => {
      if (this.closed) return;
      this.closed = true;
      this.ledger.closeRun(this.attemptId, this.spec.level, null);
      this.ledger.emit('level_abandoned', {
        ...this.params,
        task_index: Math.min(this.spec.tasks.length, this.tasks.size + 1),
        duration_ms: this.elapsed(),
        restarts: this.restarts,
      });
    });
  }

  private elapsed(): number {
    return Math.max(0, Math.round(this.ledger.clockMs() - this.startedAt));
  }
}

export type TutorialSource = AnalyticsPayloads['tutorial_started']['source'];
export type TutorialStepName = AnalyticsPayloads['tutorial_skipped']['step'];

/** One visit to the tutorial. It ends once, by completing or by Skip. */
export class TutorialVisit {
  private readonly startedAt: number;
  private closed = false;

  public constructor(private readonly ledger: PlayAnalytics, private readonly repeat: Flag) {
    this.startedAt = ledger.clockMs();
  }

  public complete(tries: number, passed: boolean): void {
    guard(undefined, () => {
      if (this.closed) return;
      this.closed = true;
      this.ledger.emit('tutorial_completed', { tries, passed: flag(passed), duration_ms: this.elapsed(), repeat: this.repeat });
    });
  }

  public skip(step: TutorialStepName, tries: number): void {
    guard(undefined, () => {
      if (this.closed) return;
      this.closed = true;
      this.ledger.emit('tutorial_skipped', { step, tries, duration_ms: this.elapsed(), repeat: this.repeat });
    });
  }

  private elapsed(): number {
    return Math.max(0, Math.round(this.ledger.clockMs() - this.startedAt));
  }
}

/** One showing of a subdivision introduction. It finishes once; leaving part-way is not a finish. */
export class SubdivisionIntroVisit {
  private closed = false;

  public constructor(
    private readonly ledger: PlayAnalytics,
    private readonly grid: 'triplet' | 'sixteenth',
    private readonly level: number,
  ) {}

  public complete(tries: number, accuracy: number, passed: boolean): void {
    guard(undefined, () => {
      if (this.closed) return;
      this.closed = true;
      this.ledger.emit('subdivision_intro_completed', {
        grid: this.grid, level: this.level, tries, accuracy: Math.round(accuracy), passed: flag(passed),
      });
    });
  }
}

/** A practice run. No practice mode exists yet; this is its reporting, ready for it. */
export class PracticeRun {
  private readonly startedAt: number;
  private closed = false;

  public constructor(private readonly ledger: PlayAnalytics, private readonly level: number) {
    this.startedAt = ledger.clockMs();
  }

  public complete(accuracy: number): void {
    guard(undefined, () => {
      if (this.closed) return;
      this.closed = true;
      this.ledger.emit('practice_completed', {
        level: this.level,
        accuracy: Math.round(accuracy),
        duration_ms: Math.max(0, Math.round(this.ledger.clockMs() - this.startedAt)),
      });
    });
  }
}

/** The session's ledger: which attempts are open, which are finished, what has been said once. */
export class PlayAnalytics {
  private readonly open = new Map<string, LevelRun>();
  private readonly closed: string[] = [];
  private readonly failStreak = new Map<number, number>();
  private readonly gatesReported = new Set<number>();
  private readonly keepsakesReported = new Set<string>();

  public constructor(
    private readonly sink: Emit = track,
    private readonly clock: () => number = () => performance.now(),
  ) {}

  /** @internal Runs report through here, so a test's sink sees every event. */
  public emit<K extends AnalyticsEvent>(event: K, payload: AnalyticsPayloads[K]): void {
    try { this.sink(event, payload); } catch { /* a sink must never take the game down */ }
  }

  /** @internal */
  public clockMs(): number { return this.clock(); }

  /**
   * An attempt's first downbeat is ready. A new id starts a run — `level_started`, plus
   * `level_retried` after a failure and `level_replayed` on a finished level — and an id
   * already open is the same attempt going round again. A finished id is never reopened.
   */
  public beginLevel(start: LevelStart): LevelRun | null {
    return guard<LevelRun | null>(null, () => {
      if (this.closed.includes(start.attemptId)) return null;
      const existing = this.open.get(start.attemptId);
      if (existing) { existing.restart(); return existing; }
      const retries = this.failStreak.get(start.spec.level) ?? 0;
      const params = levelParams(start.spec, start.progress, retries, start.heartSpent);
      const run = new LevelRun(this, start.attemptId, start.spec, start.progress, params);
      this.open.set(start.attemptId, run);
      this.emit('level_started', params);
      if (start.spec.finale) {
        this.emit('area_finale_started', { ...finaleParams(start.spec, params), retry_count: params.retry_count, heart_cost: params.heart_cost });
      }
      if (retries > 0) this.emit('level_retried', params);
      if (params.mode === 'replay') this.emit('level_replayed', params);
      return run;
    });
  }

  /** @internal A run's result, or its abandonment (`cleared` null), closes it for good. */
  public closeRun(attemptId: string, level: number, cleared: boolean | null): void {
    this.open.delete(attemptId);
    this.closed.push(attemptId);
    if (this.closed.length > CLOSED_KEEP) this.closed.shift();
    if (cleared === true) this.failStreak.delete(level);
    else if (cleared === false) this.failStreak.set(level, (this.failStreak.get(level) ?? 0) + 1);
  }

  /**
   * The map opened on a frontier held by a star gate. Said once per gate per session: the
   * map is entered after every level, and a player working toward a gate passes it often.
   */
  public gateOnMap(progress: Progress): void {
    guard(undefined, () => {
      const gate = gateFor(progress, progress.unlocked);
      if (gate === null || this.gatesReported.has(gate.area)) return;
      this.gatesReported.add(gate.area);
      this.emit('star_gate_reached', {
        area: gate.area + 1,
        level: gate.level,
        gate_required: gate.required,
        gate_have: gate.have,
        gate_short: gate.short,
      });
    });
  }

  public beginTutorial(source: TutorialSource, repeat: boolean): TutorialVisit | null {
    return guard<TutorialVisit | null>(null, () => {
      const visit = new TutorialVisit(this, flag(repeat));
      this.emit('tutorial_started', { source, repeat: flag(repeat) });
      return visit;
    });
  }

  public beginSubdivisionIntro(grid: 'triplet' | 'sixteenth', level: number, mode: AttemptMode): SubdivisionIntroVisit | null {
    return guard<SubdivisionIntroVisit | null>(null, () => {
      const visit = new SubdivisionIntroVisit(this, grid, level);
      this.emit('subdivision_intro_shown', { grid, level, mode });
      return visit;
    });
  }

  public scrapbookOpened(source: 'menu' | 'map', owned: number, total: number): void {
    guard(undefined, () => this.emit('scrapbook_opened', { source, owned, total }));
  }

  /**
   * A keepsake was earned. Once per keepsake per session, whatever calls this: the scene
   * already reports from the one step a finished level passes once, and this is the
   * backstop that keeps "no duplicates" true in the data as well as on the page.
   */
  public collectibleUnlocked(keepsake: { readonly id: string; readonly vignette: string; readonly level: number }, first: boolean, owned: number): void {
    guard(undefined, () => {
      if (this.keepsakesReported.has(keepsake.id)) return;
      this.keepsakesReported.add(keepsake.id);
      this.emit('collectible_unlocked', {
        vignette: keepsake.vignette, collectible: keepsake.id, level: keepsake.level, first: flag(first), owned,
      });
    });
  }

  public beginPractice(level: number): PracticeRun | null {
    return guard<PracticeRun | null>(null, () => {
      const run = new PracticeRun(this, level);
      this.emit('practice_started', { level });
      return run;
    });
  }
}

/** The game's one ledger. Scenes come and go; the session's memory of attempts stays here. */
export const playAnalytics = new PlayAnalytics();
