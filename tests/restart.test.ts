import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HEALTH, beginAttempt, canBeginAttempt, claimHeart, finishAttempt, type Health,
} from '../src/game/health';
import { levelSpec } from '../src/game/levels';
import { PlayAnalytics } from '../src/game/playAnalytics';
import type { Progress } from '../src/game/progress';
import {
  attemptForStart, ceilingFor, liveSheet, pauseTask, releaseAttempt, restartKind, resumeLeadBeats, resumeTask, scoredResponseBegins, sheetFor,
  ticketStillApplies, watchForHeart, watchForRestart, type RestartFacts, type StartMode,
} from '../src/game/restart';
import { RESTARTS, restartsLeft, spendRestart, type DailyRestarts } from '../src/game/dailyRestarts';
import { calendarDay } from '../src/game/health';
import { RHYTHM } from '../src/config/rhythm';
import type { JudgeState } from '../src/rhythm/judge';
import { capRound, scoreCeiling, scoreRound } from '../src/game/scoring';
import type { AnalyticsEvent } from '../src/monetization/analytics';
import type { RewardedResult } from '../src/monetization/types';
import { dailyNote, fromPrice, guardedSheetTap, RESTART_COPY, RESTART_SHEET_ARM_SEC, restartSheetHit, restartSheetLayout, sheetNote } from '../src/ui/restartSheet';
import { REPLAY_TIMERS } from '../src/game/replayTimer';
import { PRODUCT } from '../src/monetization/types';

vi.mock('phaser', () => ({ default: { Geom: { Rectangle: class {} } } }));

const NOW = 1_700_000_000_000;
/** The first level a frontier attempt pays for, past the protected first area. */
const PAID = HEALTH.protectedThrough + 1;

/** A save whose frontier is `level`: everything below it cleared on two stars. */
function frontier(level: number): Progress {
  const best: Record<number, number> = {};
  for (let l = 1; l < level; l++) best[l] = levelSpec(l).starAccuracy[1]!;
  return { unlocked: level, best };
}
const health = (hearts: number): Health => ({ hearts, refillStartedAt: hearts >= HEALTH.max ? null : NOW, spentAttempt: null });

/**
 * The ledger side of one level visit, step for step as `PlayScene.startRound` takes it:
 * the handover, the gate, the release of an ended attempt, then — once the audio would be
 * running — `beginAttempt` on the kept id or a fresh one. The source test below pins that
 * PlayScene really does these in this order.
 */
class Visit {
  public attemptId: string | null = null;
  public begun = false;
  public outcome = false;
  public starts = 0;
  /** Today's restart record, as `tiny-tempo.restarts.v1` would hold it. */
  public restarts: DailyRestarts | null = null;
  private ids = 0;

  /** A replay timer running on the device, as `replayTimerActive` would read it. */
  public timer = false;

  public constructor(public health: Health, public readonly progress: Progress, public readonly level: number, public premium = false) {}

  public facts(now = NOW): RestartFacts {
    return {
      level: this.level, progress: this.progress, health: this.health, now, premium: this.premium, timerActive: this.timer,
      attemptId: this.attemptId, outcomeRecorded: this.outcome, scoredResponseBegun: this.begun,
      restartsLeft: restartsLeft(this.restarts, now),
    };
  }

  /** `audio` false is a start whose unlock or load failed after the teardown. */
  public start(mode: StartMode, audio = true): boolean {
    const handover = attemptForStart(mode, this.attemptId, this.outcome);
    if (!canBeginAttempt(this.health, this.progress, this.level, NOW, this.premium, handover.keep)) return false;
    this.health = releaseAttempt(this.health, handover, NOW);
    if (handover.keep === null || mode === 'free_restart') this.begun = false;
    this.attemptId = handover.keep;
    this.outcome = false;
    if (!audio) return false;
    const id = handover.keep ?? `attempt-${++this.ids}`;
    const begun = beginAttempt(this.health, this.progress, this.level, id, NOW, this.premium);
    if (!begun.ok) return false;
    this.health = begun.health;
    this.attemptId = id;
    this.starts++;
    return true;
  }

  public respond(): void { this.begun = true; }

  /** The restart puck and its sheet's confirm, as PlayScene routes them. */
  public restart(): boolean {
    const kind = restartKind(this.facts());
    if (kind === 'try_again') return this.start('new_attempt');
    if (this.attemptId === null) return this.start('resume');
    if (kind === 'immediate' || kind === 'confirm_free') return this.start('free_restart');
    if (kind === 'confirm_restart') {
      const used = spendRestart(this.restarts, NOW);
      if (used === null) return false;
      this.restarts = used;
      return this.start('free_restart');
    }
    return false;
  }

  public finish(stars: 0 | 1 | 2 | 3): void {
    this.health = finishAttempt(this.health, this.attemptId!, stars, NOW).health;
    this.outcome = true;
  }
}

describe('heart accounting', () => {
  it('spends one heart to start an unfinished frontier level', () => {
    const visit = new Visit(health(5), frontier(PAID), PAID);
    expect(visit.start('resume')).toBe(true);
    expect(visit.health.hearts).toBe(4);
    expect(visit.health.spentAttempt).toBe(visit.attemptId);
  });

  it('restarts free, on the same attempt, before the first scored response', () => {
    const visit = new Visit(health(5), frontier(PAID), PAID);
    visit.start('resume');
    const first = visit.attemptId;
    expect(restartKind(visit.facts())).toBe('confirm_free');
    expect(sheetFor('confirm_free')).toBe('free');
    expect(visit.restart()).toBe(true);
    expect(visit.attemptId).toBe(first);
    expect(visit.health.hearts).toBe(4);
  });

  it('uses one of today\'s restarts once the scored response has begun: the same attempt, on its heart', () => {
    const visit = new Visit(health(5), frontier(PAID), PAID);
    visit.start('resume');
    const first = visit.attemptId;
    visit.respond();
    expect(restartKind(visit.facts())).toBe('confirm_restart');
    expect(sheetFor('confirm_restart')).toBe('daily');
    expect(visit.restart()).toBe(true);
    expect(visit.attemptId).toBe(first);
    expect(visit.health.hearts).toBe(4);
    expect(restartsLeft(visit.restarts, NOW)).toBe(RESTARTS.daily - 1);
    // The new pass is unscored again: a restart before it scores is free.
    expect(visit.begun).toBe(false);
    expect(restartKind(visit.facts())).toBe('confirm_free');
  });

  it('consumes nothing when the sheet is opened and cancelled', () => {
    const visit = new Visit(health(3), frontier(PAID), PAID);
    visit.start('resume');
    visit.respond();
    const before = { health: visit.health, restarts: visit.restarts };
    // Asking what the sheet is, again and again, is pure.
    for (let i = 0; i < 5; i++) expect(liveSheet(visit.facts())).toBe('daily');
    expect({ health: visit.health, restarts: visit.restarts }).toEqual(before);
    // And PlayScene's open and close paths touch no ledger call.
    const scene = readFileSync('src/scenes/PlayScene.ts', 'utf8');
    for (const name of ['private requestRestart(', 'private openRestartSheet(', 'private refreshRestartSheet(', 'private closeRestartSheet(']) {
      const from = scene.indexOf(name);
      const body = scene.slice(from, scene.indexOf('\n  }\n', from));
      expect(body, name).not.toMatch(/saveHealth|beginAttempt|abandonAttempt|releaseAttempt|redeemHeart|useDailyRestart|saveDailyRestarts/);
    }
  });

  it('gives two restarts a day, then offers the ad, and two more the next day', () => {
    const visit = new Visit(health(5), frontier(PAID), PAID);
    visit.start('resume');
    const id = visit.attemptId;
    for (let used = 1; used <= RESTARTS.daily; used++) {
      visit.respond();
      expect(restartKind(visit.facts())).toBe('confirm_restart');
      expect(visit.restart()).toBe(true);
      expect(restartsLeft(visit.restarts, NOW)).toBe(RESTARTS.daily - used);
    }
    // Every restart was the same attempt on the one heart it began with.
    expect(visit.attemptId).toBe(id);
    expect(visit.health.hearts).toBe(4);
    visit.respond();
    expect(restartKind(visit.facts())).toBe('out_of_restarts');
    expect(visit.restart()).toBe(false);
    expect(visit.attemptId).toBe(id);
    // The player's midnight brings two more.
    const tomorrow = NOW + 24 * 3_600_000;
    expect(calendarDay(tomorrow)).not.toBe(calendarDay(NOW));
    expect(restartKind(visit.facts(tomorrow))).toBe('confirm_restart');
    expect(restartsLeft(visit.restarts, tomorrow)).toBe(RESTARTS.daily);
  });

  it('never charges Resume after an interruption, before or after the response began', () => {
    const visit = new Visit(health(2), frontier(PAID), PAID);
    visit.start('resume');
    const id = visit.attemptId;
    visit.respond();
    for (let i = 0; i < 3; i++) expect(visit.start('resume')).toBe(true);
    expect(visit.attemptId).toBe(id);
    expect(visit.health.hearts).toBe(1);
    expect(visit.restarts).toBeNull();
    // The attempt has been played, so a restart after Resume still uses one of today's.
    expect(visit.begun).toBe(true);
    expect(restartKind(visit.facts())).toBe('confirm_restart');
    // Even at zero hearts, Resume continues what is already paid for.
    const broke = new Visit(health(1), frontier(PAID), PAID);
    broke.start('resume');
    expect(broke.health.hearts).toBe(0);
    expect(broke.start('resume')).toBe(true);
    expect(broke.health.hearts).toBe(0);
  });

  it('keeps a cleared level free and unlimited, with no sheet', () => {
    const progress = frontier(PAID + 2);
    const visit = new Visit(health(0), progress, PAID);
    visit.restarts = { day: calendarDay(NOW), used: RESTARTS.daily };
    expect(visit.start('resume')).toBe(true);
    visit.respond();
    expect(restartKind(visit.facts())).toBe('immediate');
    expect(sheetFor('immediate')).toBeNull();
    expect(visit.restart()).toBe(true);
    expect(visit.health.hearts).toBe(0);
  });

  it('keeps the protected opening levels free and unlimited', () => {
    for (let level = 1; level <= HEALTH.protectedThrough; level++) {
      const visit = new Visit(health(0), frontier(level), level);
      visit.restarts = { day: calendarDay(NOW), used: RESTARTS.daily };
      expect(visit.start('resume')).toBe(true);
      visit.respond();
      expect(restartKind(visit.facts())).toBe('immediate');
      expect(visit.restart()).toBe(true);
      expect(visit.health.hearts).toBe(0);
    }
  });

  it('keeps Premium unlimited: no restarts used and no ad, since Premium has none', () => {
    const visit = new Visit(health(0), frontier(PAID), PAID, true);
    visit.restarts = { day: calendarDay(NOW), used: RESTARTS.daily };
    expect(visit.start('resume')).toBe(true);
    visit.respond();
    expect(restartKind(visit.facts())).toBe('immediate');
    expect(visit.restart()).toBe(true);
    expect(visit.restarts).toEqual({ day: calendarDay(NOW), used: RESTARTS.daily });
    // A sheet left open when Premium arrives turns into the one that says nothing is used.
    expect(liveSheet(visit.facts())).toBe('free');
    expect(RESTART_COPY.free.note).toBe('No restart will be used.');
  });

  it('makes every restart free while a replay timer runs: no restart used, no ad, and the heart kept', () => {
    const visit = new Visit(health(2), frontier(PAID), PAID);
    visit.restarts = { day: calendarDay(NOW), used: RESTARTS.daily };
    expect(visit.start('resume')).toBe(true);
    visit.respond();
    expect(restartKind(visit.facts())).toBe('out_of_restarts');
    visit.timer = true;
    expect(restartKind(visit.facts())).toBe('immediate');
    expect(visit.restart()).toBe(true);
    expect(visit.restarts).toEqual({ day: calendarDay(NOW), used: RESTARTS.daily });
    expect(visit.health.hearts).toBe(1);
    // The empty sheet, and the picker over it, close into the free one the moment the timer lands.
    expect(liveSheet(visit.facts())).toBe('free');
    expect(liveSheet(visit.facts(), 'timers')).toBe('free');
    // A timer that ran out hands the puck back to the day's restarts.
    visit.timer = false;
    visit.respond();
    expect(restartKind(visit.facts())).toBe('out_of_restarts');
  });

  it('keeps the timer picker open while the empty sheet is what the run would raise', () => {
    const visit = new Visit(health(2), frontier(PAID), PAID);
    visit.restarts = { day: calendarDay(NOW), used: RESTARTS.daily };
    visit.start('resume');
    visit.respond();
    expect(liveSheet(visit.facts(), 'timers')).toBe('timers');
    expect(liveSheet(visit.facts(), 'empty')).toBe('empty');
    // Midnight brings a restart: the ad and the picker both give way to the daily sheet.
    expect(liveSheet(visit.facts(NOW + 24 * 3_600_000), 'timers')).toBe('daily');
    visit.outcome = true;
    expect(liveSheet(visit.facts(), 'timers')).toBeNull();
  });

  it('still refunds a kept heart — two stars or more — on the attempt that earned them', () => {
    const visit = new Visit(health(5), frontier(PAID), PAID);
    visit.start('resume');
    visit.respond();
    visit.restart();
    expect(visit.health.hearts).toBe(4);
    visit.finish(HEALTH.keepAtStars);
    expect(visit.health.hearts).toBe(5);
    // Try again after the result is a new attempt that needs a heart, as it always was.
    expect(restartKind(visit.facts())).toBe('try_again');
    expect(visit.restart()).toBe(true);
    expect(visit.health.hearts).toBe(4);
  });

  it('leaves the heart with the player when Try again\'s audio then fails', () => {
    const visit = new Visit(health(2), frontier(PAID), PAID);
    visit.start('resume');
    visit.respond();
    expect(visit.start('new_attempt', false)).toBe(false);
    // The ended attempt holds nothing and no new one began: nothing is held, nothing lost.
    expect(visit.health).toMatchObject({ hearts: 1, spentAttempt: null });
    expect(visit.attemptId).toBeNull();
    // Retry starts the new attempt and spends exactly the one heart.
    expect(visit.start('resume')).toBe(true);
    expect(visit.health.hearts).toBe(0);
  });
});

describe('the rewarded restart, with none left today', () => {
  const ok = (): Promise<RewardedResult> => Promise.resolve({ ok: true });
  const broken = (reason: 'unavailable' | 'cancelled' | 'failed') => (): Promise<RewardedResult> => Promise.resolve({ ok: false, reason });

  function spentRun(): Visit {
    const visit = new Visit(health(5), frontier(PAID), PAID);
    visit.restarts = { day: calendarDay(NOW), used: RESTARTS.daily };
    visit.start('resume');
    visit.respond();
    return visit;
  }

  it('does not restart or end the run: it offers the ad, or keeping on', () => {
    const visit = spentRun();
    const id = visit.attemptId;
    expect(restartKind(visit.facts())).toBe('out_of_restarts');
    expect(sheetFor('out_of_restarts')).toBe('empty');
    expect(RESTART_COPY.empty).toMatchObject({ title: 'No restarts left', confirm: 'Watch ad & Restart' });
    expect(RESTART_COPY.empty.note).toContain(`${RESTARTS.daily} more tomorrow`);
    expect(visit.restart()).toBe(false);
    expect(visit.attemptId).toBe(id);
    expect(visit.health.hearts).toBe(4);
  });

  it('never offers the ad while a restart is there, even one the day brought under the sheet', () => {
    const visit = spentRun();
    expect(liveSheet(visit.facts())).toBe('empty');
    expect(liveSheet(visit.facts(NOW + 24 * 3_600_000))).toBe('daily');
    expect(liveSheet({ ...visit.facts(), restartsLeft: 1 })).toBe('daily');
  });

  it('restarts on the reward, the same attempt, with nothing banked or charged', async () => {
    const visit = spentRun();
    const id = visit.attemptId;
    expect(await watchForRestart(ok)).toEqual({ kind: 'rewarded' });
    expect(visit.start('free_restart')).toBe(true);
    expect(visit.attemptId).toBe(id);
    expect(visit.health.hearts).toBe(4);
    expect(restartsLeft(visit.restarts, NOW)).toBe(0);
  });

  it('leaves the run alone when the ad fails, closes or is not there', async () => {
    for (const reason of ['unavailable', 'cancelled', 'failed'] as const) {
      expect(await watchForRestart(broken(reason))).toEqual({ kind: 'failed', reason });
    }
    // A show that throws is a failure too, never an exception into the scene.
    expect(await watchForRestart(() => Promise.reject(new Error('sdk')))).toEqual({ kind: 'failed', reason: 'failed' });
  });

  it('restarts once for one reward, and only into the run it was asked on', () => {
    const scene = readFileSync('src/scenes/PlayScene.ts', 'utf8');
    const watch = scene.slice(scene.indexOf('private async watchToRestart('), scene.indexOf('private pausedByController('));
    expect(watch).toContain('if (this.commerceBusy || this.curtain.active) return;');
    expect(watch.match(/this\.startRound\(/g)).toHaveLength(1);
    expect(watch.indexOf('this.restartSheet.hide();\n      playAnalytics.restartConfirmed')).toBeLessThan(watch.indexOf("void this.startRound('free_restart')"));
    expect(watch.indexOf('if (this.disposed) {')).toBeLessThan(watch.indexOf('this.restartSheet.setBusy(null);\n      if (watch.kind'));
    expect(watch.indexOf('if (!this.ticketHolds(ticket))')).toBeLessThan(watch.indexOf("this.startRound('free_restart')"));
    expect(watch).not.toMatch(/useDailyRestart|redeemHeart/);
    // Interruptions move the start request, so an ad that returns after a pause restarts nothing.
    const interrupt = scene.slice(scene.indexOf('  private interrupt(): void {'), scene.indexOf('  private persistAbandonedAttempt('));
    expect(interrupt).toContain('++this.startRequest;');
  });

  it('spends a daily restart only once the sheet that said so is confirmed, and before the restart runs', () => {
    const scene = readFileSync('src/scenes/PlayScene.ts', 'utf8');
    const confirm = scene.slice(scene.indexOf('  private onRestartSheet('), scene.indexOf('  private restartTicket('));
    expect(confirm.match(/useDailyRestart\(/g)).toHaveLength(1);
    expect(confirm.indexOf("if (liveSheet(facts) !== shown)")).toBeLessThan(confirm.indexOf('useDailyRestart('));
    expect(confirm.indexOf('useDailyRestart(')).toBeLessThan(confirm.indexOf("void this.startRound('free_restart');\n      return;\n    }\n    void this.watchToRestart"));
    expect(scene).not.toContain('buyToRestart');
  });

  it('checks the ticket the scene holds against the run that came back', () => {
    const ticket = { attemptId: 'a1', startRequest: 7 };
    const live = { disposed: false, attemptId: 'a1', startRequest: 7, outcomeRecorded: false };
    expect(ticketStillApplies(ticket, live)).toBe(true);
    expect(ticketStillApplies(ticket, { ...live, disposed: true })).toBe(false);
    expect(ticketStillApplies(ticket, { ...live, outcomeRecorded: true })).toBe(false);
    expect(ticketStillApplies(ticket, { ...live, startRequest: 8 })).toBe(false);
    expect(ticketStillApplies(ticket, { ...live, attemptId: 'a2' })).toBe(false);
  });

  it('keeps the play screen\'s own Watch and the map\'s working through the heart helper', async () => {
    const scene = readFileSync('src/scenes/PlayScene.ts', 'utf8');
    const play = scene.slice(scene.indexOf('  private async watchAd('), scene.indexOf('  private async buyFill('));
    expect(play).toContain('watchForHeart(() => monetization().showRewarded(), redeemHeart, claimId)');
    expect(play).toContain("void this.startRound('resume');");
    const map = readFileSync('src/scenes/MapScene.ts', 'utf8');
    expect(map).toContain('const watch = await watchForHeart(() => monetization().showRewarded()');
    const watch = await watchForHeart(ok, id => claimHeart(health(0), id, NOW), 'play:t1');
    expect(watch).toMatchObject({ kind: 'granted', granted: true, hearts: 1 });
  });
});

describe('when the run has genuinely begun', () => {
  const scored = { teaching: false, introducing: false, rehearsal: false };

  it('is not begun by the first-run demonstration, an introduction or a rehearsal', () => {
    for (const event of ['respond', 'judged'] as const) {
      expect(scoredResponseBegins(event, { ...scored, teaching: true })).toBe(false);
      expect(scoredResponseBegins(event, { ...scored, introducing: true })).toBe(false);
      expect(scoredResponseBegins(event, { ...scored, rehearsal: true })).toBe(false);
    }
    expect(scoredResponseBegins('other', scored)).toBe(false);
  });

  it('is begun by the first real response or the first judged tap', () => {
    expect(scoredResponseBegins('respond', scored)).toBe(true);
    expect(scoredResponseBegins('judged', scored)).toBe(true);
    // The scene sets it from those two events only, and only a new attempt clears it.
    const scene = readFileSync('src/scenes/PlayScene.ts', 'utf8');
    expect(scene.match(/this\.scoredResponseBegun = true/g)).toHaveLength(1);
    expect(scene).toContain("this.noteScoredResponse('respond');");
    expect(scene).toContain("this.noteScoredResponse('judged');");
    expect(scene).toContain("if (resumeId === null || mode === 'free_restart') this.scoredResponseBegun = false;");
  });

  it('resets the run\'s own state on every start, and ends an attempt before anything can fail', () => {
    const scene = readFileSync('src/scenes/PlayScene.ts', 'utf8');
    const start = scene.slice(scene.indexOf('  private async startRound('), scene.indexOf('  private beginTeach('));
    for (const reset of [
      'this.setGroove(GROOVE_START)', 'this.tally = { perfect: 0, flawless: 0 }', 'this.timing = EMPTY_TIMING',
      'this.results = []', 'this.taskIndex = 0', 'this.outcome = null', 'this.mastery = \'none\'',
    ]) expect(start, reset).toContain(reset);
    const order = ['attemptForStart(', 'canBeginAttempt(', 'releaseAttempt(', 'this.levelRun?.abandon();', 'await this.audio!.unlock()', 'resumeId ?? createAttemptId', 'beginAttempt('];
    const at = order.map(token => start.indexOf(token));
    expect(at.every(i => i >= 0), at.join(',')).toBe(true);
    for (let k = 1; k < at.length; k++) expect(at[k]!, order[k]).toBeGreaterThan(at[k - 1]!);
    // Every caller names its mode; nothing infers it from the result alone.
    expect(scene).not.toMatch(/this\.startRound\(\)/);
    expect(scene).not.toContain('this.outcome === null ? this.attemptId : null');
  });

  it('records nothing for a restart: no progress, objectives, achievements or result', () => {
    const scene = readFileSync('src/scenes/PlayScene.ts', 'utf8');
    const flow = scene.slice(scene.indexOf('  // ---- Restart ----'), scene.indexOf('  private showPause(): void {'));
    expect(flow).not.toMatch(/recordOutcome|recordResult|saveProgress|recordObjectives|syncAchievements|queueCloudSave|finishAttempt/);
  });
});

describe('the attempt handover', () => {
  it('continues on Resume and a free restart, ends on a new attempt, never resumes a finished one', () => {
    expect(attemptForStart('resume', 'a', false)).toEqual({ keep: 'a', abandon: null });
    expect(attemptForStart('free_restart', 'a', false)).toEqual({ keep: 'a', abandon: null });
    expect(attemptForStart('new_attempt', 'a', false)).toEqual({ keep: null, abandon: 'a' });
    // A finished attempt is already closed by `finishAttempt`; Try again only begins.
    expect(attemptForStart('new_attempt', 'a', true)).toEqual({ keep: null, abandon: null });
    expect(attemptForStart('resume', 'a', true)).toEqual({ keep: null, abandon: null });
    expect(attemptForStart('resume', null, false)).toEqual({ keep: null, abandon: null });
  });

  it('releases an ended attempt once, however often it is asked', () => {
    const held: Health = { hearts: 2, refillStartedAt: NOW, spentAttempt: 'a' };
    const once = releaseAttempt(held, { keep: null, abandon: 'a' }, NOW);
    expect(once).toMatchObject({ hearts: 2, spentAttempt: null });
    expect(releaseAttempt(once, { keep: null, abandon: 'a' }, NOW)).toEqual(once);
    expect(releaseAttempt(held, { keep: 'a', abandon: null }, NOW)).toBe(held);
  });

  it('asks the result screen\'s question, not the sheet\'s, once a result is recorded', () => {
    const visit = new Visit(health(0), frontier(PAID), PAID);
    visit.attemptId = 'done';
    visit.outcome = true;
    visit.begun = true;
    expect(restartKind(visit.facts())).toBe('try_again');
    expect(liveSheet(visit.facts())).toBeNull();
  });
});

describe('the sheet', () => {
  const frame = { centerX: 360, bottom: 1100, maxWidth: 680, s: 1, control: 88 };

  it('keeps every control a thumb wide and inside the card, and never overlapping', () => {
    for (const s of [1, 0.6]) {
      const layout = restartSheetLayout({ ...frame, s });
      const controls = [layout.confirm, layout.keep];
      for (const r of controls) {
        expect(r.height).toBeGreaterThanOrEqual(88);
        expect(r.x).toBeGreaterThanOrEqual(layout.card.x);
        expect(r.x + r.width).toBeLessThanOrEqual(layout.card.x + layout.card.width + 1e-6);
        expect(r.y + r.height).toBeLessThanOrEqual(layout.card.y + layout.card.height);
      }
      expect(layout.confirm.y + layout.confirm.height).toBeLessThanOrEqual(layout.keep.y);
      expect(layout.card.y + layout.card.height).toBeCloseTo(frame.bottom);
    }
  });

  it('adds the timer block to the empty sheet and trades the action for four rows on the picker', () => {
    const empty = restartSheetLayout(frame, 'empty');
    expect(empty.timer.height).toBeGreaterThanOrEqual(88);
    expect(empty.confirm.y + empty.confirm.height).toBeLessThanOrEqual(empty.timer.y);
    expect(empty.timer.y + empty.timer.height).toBeLessThanOrEqual(empty.keep.y);
    expect(empty.options).toEqual([]);
    expect(restartSheetHit(empty, empty.timer.x + 10, empty.timer.y + 10)).toBe('timers');
    const picker = restartSheetLayout(frame, 'timers');
    expect(picker.confirm.width).toBe(0);
    expect(picker.timer.width).toBe(0);
    expect(picker.options).toHaveLength(REPLAY_TIMERS.length);
    picker.options.forEach((row, i) => {
      expect(row.height).toBeGreaterThanOrEqual(88);
      expect(row.x).toBeGreaterThanOrEqual(picker.card.x);
      if (i > 0) expect(picker.options[i - 1]!.y + picker.options[i - 1]!.height).toBeLessThanOrEqual(row.y);
      expect(restartSheetHit(picker, row.x + row.width / 2, row.y + row.height / 2)).toEqual({ buy: REPLAY_TIMERS[i]!.product });
    });
    expect(picker.options[3]!.y + picker.options[3]!.height).toBeLessThanOrEqual(picker.keep.y);
    expect(picker.card.y + picker.card.height).toBeCloseTo(frame.bottom);
    // The free and daily sheets are as they were: no timer, no rows.
    for (const kind of ['free', 'daily'] as const) {
      const plain = restartSheetLayout(frame, kind);
      expect(plain.timer.width).toBe(0);
      expect(plain.options).toEqual([]);
      expect(restartSheetHit(plain, plain.confirm.x + 4, plain.confirm.y + plain.confirm.height + 4)).toBe('swallow');
    }
    // The timer block's price reads from the cheapest timer, and says so until the catalogue arrives.
    expect(fromPrice(() => null)).toBe('Buy');
    expect(fromPrice(product => (product === PRODUCT.timer30m ? '€0.99' : '€9.99'))).toBe('from €0.99');
    expect(RESTART_COPY.timers.title).toBe('Unlimited restarts');
    expect(sheetNote('timers', 0)).toBe(RESTART_COPY.timers.note);
  });

  it('routes a tap to its control, the card face to nothing, and off the card back to the level', () => {
    const layout = restartSheetLayout(frame);
    const centre = (r: { x: number; y: number; width: number; height: number }) => [r.x + r.width / 2, r.y + r.height / 2] as const;
    expect(restartSheetHit(layout, ...centre(layout.confirm))).toBe('confirm');
    expect(restartSheetHit(layout, ...centre(layout.keep))).toBe('keep');
    expect(restartSheetHit(layout, layout.card.x + 4, layout.card.y + 4)).toBe('swallow');
    expect(restartSheetHit(layout, layout.card.x + 4, layout.card.y - 20)).toBeNull();
  });

  it('holds its controls while it arms, and while an ad is out', () => {
    expect(guardedSheetTap('confirm', 10, 10 + RESTART_SHEET_ARM_SEC, false)).toBe('swallow');
    expect(guardedSheetTap('confirm', 11, 10 + RESTART_SHEET_ARM_SEC, false)).toBe('confirm');
    expect(guardedSheetTap('keep', 11, 0, true)).toBe('swallow');
    expect(guardedSheetTap(null, 11, 0, true)).toBeNull();
  });

  it('says what a restart takes before anything is spent, and only where something will be', () => {
    expect(RESTART_COPY.free).toMatchObject({ title: 'Restart from the beginning?', note: 'No restart will be used.' });
    expect(RESTART_COPY.daily.title).toBe('Restart level?');
    expect(dailyNote(2)).toBe("Uses 1 of today's 2 restarts.");
    expect(dailyNote(1)).toBe('Uses your last restart for today.');
    expect(sheetNote('daily', 1)).toBe(dailyNote(1));
    expect(sheetNote('empty', 0)).toBe(RESTART_COPY.empty.note);
    expect(RESTART_COPY.keep).toBe('Keep playing');
    // Hearts are no longer what a restart costs, so no sheet mentions one.
    for (const kind of ['free', 'daily', 'empty'] as const) expect(sheetNote(kind, 2) + RESTART_COPY[kind].title).not.toMatch(/heart/i);
  });
});

describe('restart analytics', () => {
  let sent: { event: AnalyticsEvent; payload: Readonly<Record<string, unknown>> }[] = [];
  let ledger = new PlayAnalytics();
  beforeEach(() => {
    sent = [];
    ledger = new PlayAnalytics((event, payload) => { sent.push({ event, payload }); }, () => 0);
  });

  it('tells requested, confirmed, cancelled and a failed rewarded restart apart, one event each', () => {
    const plain = { restartsLeft: 2, premium: false, timer: false };
    ledger.restartRequested(12, 'daily', plain);
    ledger.restartCancelled(12, 'daily', 'keep_playing', plain);
    ledger.restartRequested(12, 'empty', { ...plain, restartsLeft: 0 });
    ledger.rewardedRestartFailed(12, 'cancelled');
    ledger.restartConfirmed(12, 'rewarded', { ...plain, restartsLeft: 0 });
    ledger.restartRequested(13, 'none', { ...plain, premium: true });
    ledger.restartConfirmed(13, 'free', { ...plain, premium: true });
    ledger.restartRequested(14, 'timers', { ...plain, restartsLeft: 0 });
    ledger.restartConfirmed(14, 'timer', { ...plain, restartsLeft: 0, timer: true });
    expect(sent.map(s => s.event)).toEqual([
      'restart_requested', 'restart_cancelled', 'restart_requested', 'rewarded_restart_failed', 'restart_confirmed',
      'restart_requested', 'restart_confirmed', 'restart_requested', 'restart_confirmed',
    ]);
    expect(sent[0]!.payload).toEqual({ level: 12, area: 2, placement: 'restart', restarts_left: 2, premium: 0, timer: 0, sheet: 'daily' });
    expect(sent[3]!.payload).toEqual({ level: 12, area: 2, placement: 'restart', reason: 'cancelled' });
    expect(sent[4]!.payload).toMatchObject({ cost: 'rewarded', restarts_left: 0 });
    expect(sent[6]!.payload).toMatchObject({ cost: 'free', premium: 1 });
    expect(sent[7]!.payload).toMatchObject({ sheet: 'timers', timer: 0 });
    expect(sent[8]!.payload).toMatchObject({ cost: 'timer', timer: 1 });
  });

  it('closes the ended attempt\'s run and opens the new one exactly once each', () => {
    const spec = levelSpec(8);
    const first = ledger.beginLevel({ spec, progress: frontier(8), attemptId: 'r1', heartSpent: true })!;
    first.abandon();
    first.abandon();
    ledger.beginLevel({ spec, progress: frontier(8), attemptId: 'r2', heartSpent: true });
    // The ended id is never reopened, so a late Resume cannot revive it.
    expect(ledger.beginLevel({ spec, progress: frontier(8), attemptId: 'r1', heartSpent: true })).toBeNull();
    const count = (event: AnalyticsEvent) => sent.filter(s => s.event === event).length;
    expect(count('level_abandoned')).toBe(1);
    expect(count('level_started')).toBe(2);
  });
});

describe('the result after a level', () => {
  it('ignores taps for a moment after it appears, so a tap still landing from the level spends nothing', async () => {
    const { RESULT_ARM_SEC, resultArmed } = await import('../src/game/restart');
    expect(RESULT_ARM_SEC).toBeGreaterThanOrEqual(0.5);
    expect(resultArmed(10, 10)).toBe(false);
    expect(resultArmed(10, 10 + RESULT_ARM_SEC - 0.01)).toBe(false);
    expect(resultArmed(10, 10 + RESULT_ARM_SEC)).toBe(true);
    expect(resultArmed(-Infinity, 10)).toBe(false);
    const scene = readFileSync('src/scenes/PlayScene.ts', 'utf8');
    expect(scene).toContain('if (this.summaryShown && resultArmed(this.summaryWallAt, performance.now() / 1000)) {');
  });

  it('says on Try again the heart it will spend, and nothing where it spends none', async () => {
    const { tryAgainCost } = await import('../src/game/restart');
    expect(tryAgainCost({ progress: frontier(PAID), level: PAID, premium: false })).toBe(1);
    expect(tryAgainCost({ progress: frontier(PAID), level: PAID, premium: true })).toBe(0);
    expect(tryAgainCost({ progress: frontier(HEALTH.protectedThrough), level: HEALTH.protectedThrough, premium: false })).toBe(0);
    // A finished level replays free, whatever its stars.
    expect(tryAgainCost({ progress: frontier(PAID + 1), level: PAID, premium: false })).toBe(0);
  });
});

describe('an interruption can cost a task, never improve it', () => {
  const judged = (grades: ('Perfect' | 'Good' | 'omission' | null)[], extras = 0): JudgeState => ({
    targets: grades.map((_, i) => i),
    windows: RHYTHM,
    outcomes: grades.map((grade, i) => grade === null ? null
      : grade === 'omission' ? { kind: 'omission', grade: 'Miss', index: i, deltaMs: null }
        : { kind: 'hit', grade, index: i, deltaMs: 0 }),
    extras: Array.from({ length: extras }, () => ({ kind: 'extra', grade: 'Miss', index: null, deltaMs: 0 })),
  });

  it('holds a cut-short task to what it could still have made', () => {
    expect(scoreCeiling(judged([null, null, null, null]))).toBe(100);
    expect(scoreCeiling(judged(['Good', null, null, null]))).toBe(92.5);
    expect(scoreCeiling(judged(['Perfect', 'omission', null, null]))).toBe(75);
    expect(scoreCeiling(judged(['Perfect', null, null, null], 1))).toBe(93.75);
    // Never below what the pass would have scored had it ended there and then.
    const state = judged(['Good', 'omission', null, null], 2);
    expect(scoreCeiling(state)).toBeGreaterThanOrEqual(scoreRound(state).accuracy);
  });

  it('lowers a replay that beat its ceiling, and leaves one that did not as played', () => {
    const played = scoreRound(judged(['Perfect', 'Perfect', 'Perfect', 'Perfect']));
    expect(capRound(played, 92.5).accuracy).toBe(92.5);
    expect(capRound(played, 92.5).perfect).toBe(4);
    expect(capRound(played, 100)).toBe(played);
    const weak = scoreRound(judged(['Good', 'omission', 'omission', 'omission']));
    expect(capRound(weak, 92.5)).toBe(weak);
  });

  it('keeps the lower ceiling across two pauses in one task, and forgets it for another', () => {
    let paused = pauseTask(null, 2, 80);
    paused = pauseTask(paused, 2, 95);
    expect(paused).toEqual({ task: 2, ceiling: 80 });
    expect(ceilingFor(paused, 2)).toBe(80);
    expect(ceilingFor(paused, 3)).toBe(100);
    expect(pauseTask(paused, 3, 90)).toEqual({ task: 3, ceiling: 90 });
    expect(pauseTask(null, 0, Number.NaN).ceiling).toBe(100);
  });

  it('resumes at the first task with no result, and only once one is finished', () => {
    expect(resumeTask([], 5)).toBeNull();                 // nothing finished: start as always
    expect(resumeTask([80], 5)).toBe(1);
    expect(resumeTask([80, 90, 70], 5)).toBe(3);
    expect(resumeTask([80, 90, 70, 60, 50], 5)).toBeNull(); // finished: a result, not a run
    // A breather keeps its four bars; any other task gets the opening bar back.
    expect(resumeLeadBeats(0, RHYTHM.leadInBeats)).toBe(RHYTHM.leadInBeats);
    expect(resumeLeadBeats(16, RHYTHM.leadInBeats)).toBe(16);
  });

  it('is wired in the scene: Resume continues, the ceiling caps, and back and the puck pause first', () => {
    const scene = readFileSync('src/scenes/PlayScene.ts', 'utf8');
    const start = scene.slice(scene.indexOf('  private async startRound('), scene.indexOf('  private beginTeach('));
    expect(start).toContain('resumeTask(this.results, this.spec.tasks.length)');
    expect(start).toContain('continuing: continueAt !== null');
    expect(start).toContain('resumeLeadBeats(this.task.leadBeats, RHYTHM.leadInBeats)');
    const result = scene.slice(scene.indexOf('  private showResult('), scene.indexOf('  private setGroove('));
    expect(result).toContain('capRound(result, ceiling)');
    expect(result).toContain('this.results[this.taskIndex] = credited.accuracy;');
    expect(scene).toContain("if (near(this.mapAt)) { this.pressPuck('map'); this.wayOut('puck'); return; }");
    expect(scene.match(/levelBackAction\(/g)).toHaveLength(1);
    const running = scene.slice(scene.indexOf('  private levelRunning('), scene.indexOf('  private wayOut('));
    expect(running).toContain("if (phase === 'result') return this.outcome === null && this.transition !== null;");
  });
});
