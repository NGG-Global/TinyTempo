import {
  track, type AnalyticsEvent, type AnalyticsPayloads, type AttemptMode, type FinaleParams, type Flag, type GridName, type LevelParams,
  type RestartCost, type RestartParams, type RestartSheet,
} from '../monetization/analytics';
import { finaleTreatment } from './finale';
import { doneCount, stampWeek, type ObjectivesUpdate } from './objectives';
import { isCleared } from './health';
import type { Concept } from './conceptIntro';
import { debutsOn, familyOf, type LevelSpec } from './levels';
import type { MasteryResult } from './mastery';
import type { LevelOutcome, Progress } from './progress';
import type { AudioRoute } from './routeCalibration';
import type { RoundResult } from './scoring';
import { median } from './timingReport';
import { areaIndexOf, firstLevelOfArea, gateFor, levelStars, totalStars } from './stars';

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

/** How the task was heard: the route it played through, and whether that route has a Tap offset. */
export interface TaskListening {
  readonly route: AudioRoute;
  readonly offsetSet: boolean;
}
const UNHEARD: TaskListening = Object.freeze({ route: 'unknown', offsetSet: false });

export function taskParams(
  spec: LevelSpec, index: number, result: RoundResult, mode: AttemptMode, listening: TaskListening = UNHEARD,
): AnalyticsPayloads['task_completed'] {
  const task = spec.tasks[index]!;
  const error = result.meanAbsoluteErrorMs;
  const lean = median(result.deltasMs.filter(Number.isFinite));
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
    // Every beat Perfect and no extra tap: the scene's own test (`isFlawless` on the marks and
    // no extras), so the dashboard counts the celebrations the player saw, and the tasks
    // mastery is made of. It used to ignore extras, and disagreed with the game.
    flawless: flag(result.missed === 0 && result.good === 0 && result.perfect > 0 && result.extras === 0),
    ...(error !== null && Number.isFinite(error) ? { error_ms: Math.round(error) } : {}),
    pattern: task.pattern.id,
    // The task carries a rhythm the road meets for the first time on this level.
    debut: flag(debutsOn(spec.level).includes(familyOf(task) ?? '')),
    ...(lean !== null ? { lean_ms: Math.round(lean) } : {}),
    route: listening.route,
    offset_set: flag(listening.offsetSet),
  };
}

/** The facts a restart was decided on: today's count, the legacy Premium, and a running timer. */
export interface RestartFlags {
  readonly restartsLeft: number;
  readonly premium: boolean;
  readonly timer: boolean;
}

function restartParams(level: number, flags: RestartFlags): RestartParams {
  return { level, area: areaNumber(level), placement: 'restart', restarts_left: flags.restartsLeft, premium: flag(flags.premium), timer: flag(flags.timer) };
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
  /**
   * Resume picked the attempt up at the task it stopped in, keeping every task already
   * finished: the run goes on, rather than going round again from its first task.
   */
  readonly continuing?: boolean;
}

/** One attempt at a level, from its first downbeat to its result or the player leaving. */
export class LevelRun {
  private readonly tasks = new Set<number>();
  private results: number[] = [];
  private startedAt: number;
  private restarts = 0;
  private closed = false;
  /** Groove levels this attempt has reported reaching: 2 and 3 at most, once each. */
  private readonly grooveReported = new Set<number>();

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
  public task(index: number, result: RoundResult, listening?: TaskListening): void {
    guard(undefined, () => {
      if (this.closed || this.tasks.has(index) || !this.spec.tasks[index]) return;
      this.tasks.add(index);
      this.results[index] = result.accuracy;
      this.ledger.emit('task_completed', taskParams(this.spec, index, result, this.params.mode, listening));
    });
  }

  /**
   * The groove level a scored task's verdict reached (`game/groove.ts`). Only 2 and 3 are
   * milestones, and each is reported once per attempt however many times the level
   * climbs back to it: what the dashboard needs is whether the treatment is reached, not
   * the shape of every climb.
   */
  public groove(level: number, taskIndex: number): void {
    guard(undefined, () => {
      if (this.closed || level < 2 || this.grooveReported.has(level)) return;
      this.grooveReported.add(level);
      this.ledger.emit('groove_reached', {
        level: this.spec.level, area: this.params.area, vignette: this.spec.vignette, mode: this.params.mode,
        groove: level, task_index: taskIndex + 1, task_count: this.spec.tasks.length,
      });
    });
  }

  /**
   * The level was scored. Exactly one of `level_completed` and `level_failed`, however
   * often the scene reaches its own record step, followed by what the result changed.
   * `mastery` says whether the run was flawless on every scored task and, if so, whether the
   * save already had the level mastered (`game/mastery.ts`). `level_mastered` is the first
   * only: a replay of a mastered level is not a new mastery, and a dashboard counting
   * masteries per level must not count one player's encores.
   */
  public finish(outcome: LevelOutcome, accuracy: number, mastery: MasteryResult = 'none'): void {
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
      if (outcome.cleared && mastery === 'first') {
        this.ledger.emit('level_mastered', {
          level: this.spec.level, area: this.params.area, vignette: this.spec.vignette, mode: this.params.mode,
          task_count: this.spec.tasks.length, accuracy: result.accuracy, stars: outcome.stars,
        });
      }
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
        const gained = outcome.stars - this.params.previous_stars;
        this.ledger.emit('star_improved', {
          level: this.spec.level,
          area: this.params.area,
          stars: outcome.stars,
          previous_stars: this.params.previous_stars,
          accuracy: Math.round(accuracy),
          gate_have: totalStars(after),
        });
        this.ledger.noteImprovement(gained);
      }
      // A gate opens for a player only when it was holding them: the frontier stood in
      // front of it before this run and does not now. Areas opened far ahead of the
      // frontier by a strong player never held anyone and are not an event.
      const held = gateFor(this.before, this.before.unlocked);
      const still = gateFor(after, after.unlocked);
      if (held !== null && (still === null || still.area !== held.area)) {
        const activity = this.ledger.takeGateActivity(held.area + 1);
        const opened = {
          area: held.area + 1,
          level: held.level,
          gate_required: held.required,
          gate_have: totalStars(after),
          unlocked: after.unlocked,
        };
        this.ledger.emit('star_gate_opened', activity === null ? opened : { ...opened, ...activity });
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
export type TutorialPass = AnalyticsPayloads['tutorial_step_started']['step'];
export type TutorialPassVerdict = AnalyticsPayloads['tutorial_step_ended']['verdict'];

/**
 * One visit to the tutorial. It ends once, by completing or by Skip, and reports each pass
 * on the way — its start and its end — so the funnel shows the step a player left on, even
 * when they left by closing the app and neither end was sent.
 */
export class TutorialVisit {
  private readonly startedAt: number;
  private closed = false;
  private readonly attempts = { watch: 0, along: 0, try: 0 };

  public constructor(private readonly ledger: PlayAnalytics, private readonly repeat: Flag) {
    this.startedAt = ledger.clockMs();
  }

  /** A pass began. A resumed pass is the interrupted attempt again, not a new one. */
  public stepStarted(step: TutorialPass, resumed = false): void {
    guard(undefined, () => {
      if (this.closed) return;
      if (!resumed || this.attempts[step] === 0) this.attempts[step] += 1;
      this.ledger.emit('tutorial_step_started', {
        step, attempt: this.attempts[step], resumed: flag(resumed), elapsed_ms: this.elapsed(), repeat: this.repeat,
      });
    });
  }

  /** A pass reached its end: the lesson's verdict on a judged pass, `watched` on the game's own. */
  public stepEnded(step: TutorialPass, verdict: TutorialPassVerdict, hits: number): void {
    guard(undefined, () => {
      if (this.closed) return;
      this.ledger.emit('tutorial_step_ended', {
        step, attempt: Math.max(1, this.attempts[step]), verdict, hits: Math.max(0, Math.round(hits)),
        elapsed_ms: this.elapsed(), repeat: this.repeat,
      });
    });
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

/** One showing of a concept's introduction. It finishes once; leaving part-way is not a finish. */
export class ConceptIntroVisit {
  private closed = false;

  public constructor(
    private readonly ledger: PlayAnalytics,
    private readonly concept: Concept,
    private readonly level: number,
  ) {}

  public complete(tries: number, accuracy: number, passed: boolean): void {
    guard(undefined, () => {
      if (this.closed) return;
      this.closed = true;
      this.ledger.emit('concept_intro_completed', {
        concept: this.concept, level: this.level, tries, accuracy: Math.round(accuracy), passed: flag(passed),
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
  /**
   * The one closed gate this session has reported, and what the ledger has seen since.
   * Three counters, dropped when the gate opens. Nothing is written down: a kill between
   * the two events simply has no "between", and the open then omits the counts.
   */
  private gateWatch: { area: number; replays: number; improvements: number; starsGained: number } | null = null;
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
   * already open is the same attempt going round again, or, `continuing`, carrying on from
   * the task it stopped in. A finished id is never reopened.
   */
  public beginLevel(start: LevelStart): LevelRun | null {
    return guard<LevelRun | null>(null, () => {
      if (this.closed.includes(start.attemptId)) return null;
      const existing = this.open.get(start.attemptId);
      if (existing) {
        if (start.continuing !== true) existing.restart();
        return existing;
      }
      const retries = this.failStreak.get(start.spec.level) ?? 0;
      const params = levelParams(start.spec, start.progress, retries, start.heartSpent);
      const run = new LevelRun(this, start.attemptId, start.spec, start.progress, params);
      this.open.set(start.attemptId, run);
      this.emit('level_started', params);
      if (start.spec.finale) {
        this.emit('area_finale_started', { ...finaleParams(start.spec, params), retry_count: params.retry_count, heart_cost: params.heart_cost });
      }
      if (retries > 0) this.emit('level_retried', params);
      if (params.mode === 'replay') {
        this.emit('level_replayed', params);
        this.noteReplay();
      }
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
   * A finished level moved the day's objectives. The update is already aggregated — one
   * change per objective per level — so this is at most three events and a stamp, and
   * nothing at all for a level that moved none of them.
   */
  public objectives(update: ObjectivesUpdate | null, now: number = Date.now()): void {
    guard(undefined, () => {
      if (!update) return;
      const { state } = update;
      for (const change of update.changes) {
        if (change.completed) {
          this.emit('objective_completed', {
            objective: change.id, slot: change.slot, target: change.target, completed: doneCount(state),
          });
        } else {
          this.emit('objective_progress', { objective: change.id, slot: change.slot, progress: change.after, target: change.target });
        }
      }
      if (update.allCompleted) {
        this.emit('daily_objectives_all_completed', {
          stamps: state.stamps,
          week: stampWeek(state, now).filter(d => d.stamped).length,
        });
      }
    });
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
      // First sight of this gate starts the counters. A later call returns above, so
      // coming back to the map does not wipe what happened in between.
      this.gateWatch = { area: gate.area + 1, replays: 0, improvements: 0, starsGained: 0 };
      this.emit('star_gate_reached', {
        area: gate.area + 1,
        level: gate.level,
        gate_required: gate.required,
        gate_have: gate.have,
        gate_short: gate.short,
        unlocked: progress.unlocked,
      });
    });
  }

  /** A replay began while a reported gate was still closed. */
  public noteReplay(): void {
    if (this.gateWatch) this.gateWatch.replays++;
  }

  /** A replay raised a level's stars while a reported gate was still closed. */
  public noteImprovement(gained: number): void {
    if (!this.gateWatch || !Number.isFinite(gained) || gained <= 0) return;
    this.gateWatch.improvements++;
    this.gateWatch.starsGained += gained;
  }

  /**
   * The counts for `area` (1-based), if this session reported it closed, then forgotten.
   * A different area's watch is left alone: opening gate 2 must not wipe a later one.
   */
  public takeGateActivity(area: number): { replays: number; improvements: number; stars_gained: number } | null {
    const watch = this.gateWatch;
    if (!watch || watch.area !== area) return null;
    this.gateWatch = null;
    return { replays: watch.replays, improvements: watch.improvements, stars_gained: watch.starsGained };
  }

  public beginTutorial(source: TutorialSource, repeat: boolean): TutorialVisit | null {
    return guard<TutorialVisit | null>(null, () => {
      const visit = new TutorialVisit(this, flag(repeat));
      this.emit('tutorial_started', { source, repeat: flag(repeat), since_launch_ms: Math.max(0, Math.round(this.clockMs())) });
      return visit;
    });
  }

  public beginConceptIntro(concept: Concept, level: number, mode: AttemptMode): ConceptIntroVisit | null {
    return guard<ConceptIntroVisit | null>(null, () => {
      const visit = new ConceptIntroVisit(this, concept, level);
      this.emit('concept_intro_shown', { concept, level, mode });
      return visit;
    });
  }

  public scrapbookOpened(source: 'menu' | 'map', owned: number, total: number): void {
    guard(undefined, () => this.emit('scrapbook_opened', { source, owned, total }));
  }

  /** The player tapped a ready gate open on the map (`game/areaGates.ts`). `area` is 0-based here, 1-based as sent. */
  public areaOpened(area: number, have: number): void {
    guard(undefined, () => this.emit('area_opened', { area: area + 1, level: firstLevelOfArea(area), gate_have: have }));
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

  /** The restart puck reached the restart flow (`docs/RESTART.md`). */
  public restartRequested(level: number, sheet: RestartSheet, flags: RestartFlags): void {
    guard(undefined, () => this.emit('restart_requested', { ...restartParams(level, flags), sheet }));
  }

  /** A restart is going ahead. One per restart: the scene calls this from the one place a restart commits. */
  public restartConfirmed(level: number, cost: RestartCost, flags: RestartFlags): void {
    guard(undefined, () => this.emit('restart_confirmed', { ...restartParams(level, flags), cost }));
  }

  public restartCancelled(
    level: number, sheet: Exclude<RestartSheet, 'none'>, reason: AnalyticsPayloads['restart_cancelled']['reason'], flags: RestartFlags,
  ): void {
    guard(undefined, () => this.emit('restart_cancelled', { ...restartParams(level, flags), sheet, reason }));
  }

  public rewardedRestartFailed(level: number, reason: AnalyticsPayloads['rewarded_restart_failed']['reason']): void {
    guard(undefined, () => this.emit('rewarded_restart_failed', { level, area: areaNumber(level), placement: 'restart', reason }));
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
