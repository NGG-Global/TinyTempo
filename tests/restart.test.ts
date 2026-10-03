import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HEALTH, beginAttempt, canBeginAttempt, claimHeart, finishAttempt, type GrantHeartResult, type Health,
} from '../src/game/health';
import { levelSpec } from '../src/game/levels';
import { PlayAnalytics } from '../src/game/playAnalytics';
import type { Progress } from '../src/game/progress';
import {
  attemptForStart, liveSheet, releaseAttempt, restartKind, scoredResponseBegins, sheetFor, ticketStillApplies, watchForHeart,
  type RestartFacts, type StartMode,
} from '../src/game/restart';
import type { AnalyticsEvent } from '../src/monetization/analytics';
import type { RewardedResult } from '../src/monetization/types';
import { guardedSheetTap, RESTART_COPY, RESTART_SHEET_ARM_SEC, restartSheetHit, restartSheetLayout } from '../src/ui/restartSheet';

vi.mock('phaser', () => ({ default: { Geom: { Rectangle: class {} } } }));

const NOW = 1_700_000_000_000;
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
  private ids = 0;

  public constructor(public health: Health, public readonly progress: Progress, public readonly level: number, public premium = false) {}

  public facts(now = NOW): RestartFacts {
    return {
      level: this.level, progress: this.progress, health: this.health, now, premium: this.premium,
      attemptId: this.attemptId, outcomeRecorded: this.outcome, scoredResponseBegun: this.begun,
    };
  }

  /** `audio` false is a start whose unlock or load failed after the teardown. */
  public start(mode: StartMode, audio = true): boolean {
    const handover = attemptForStart(mode, this.attemptId, this.outcome);
    if (!canBeginAttempt(this.health, this.progress, this.level, NOW, this.premium, handover.keep)) return false;
    this.health = releaseAttempt(this.health, handover, NOW);
    if (handover.keep === null) this.begun = false;
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
    if (kind === 'confirm_paid') return this.start('new_attempt');
    return false;
  }

  public finish(stars: 0 | 1 | 2 | 3): void {
    this.health = finishAttempt(this.health, this.attemptId!, stars, NOW).health;
    this.outcome = true;
  }
}

describe('heart accounting', () => {
  it('spends one heart to start an unfinished frontier level', () => {
    const visit = new Visit(health(5), frontier(8), 8);
    expect(visit.start('resume')).toBe(true);
    expect(visit.health.hearts).toBe(4);
    expect(visit.health.spentAttempt).toBe(visit.attemptId);
  });

  it('restarts free, on the same attempt, before the first scored response', () => {
    const visit = new Visit(health(5), frontier(8), 8);
    visit.start('resume');
    const first = visit.attemptId;
    expect(restartKind(visit.facts())).toBe('confirm_free');
    expect(sheetFor('confirm_free')).toBe('free');
    expect(visit.restart()).toBe(true);
    expect(visit.attemptId).toBe(first);
    expect(visit.health.hearts).toBe(4);
  });

  it('ends the attempt and begins another once the scored response has begun', () => {
    const visit = new Visit(health(5), frontier(8), 8);
    visit.start('resume');
    const first = visit.attemptId;
    visit.respond();
    expect(restartKind(visit.facts())).toBe('confirm_paid');
    expect(visit.restart()).toBe(true);
    expect(visit.attemptId).not.toBe(first);
    expect(visit.begun).toBe(false);
  });

  it('charges exactly one more heart for a confirmed paid restart, and never refunds the ended attempt', () => {
    const visit = new Visit(health(5), frontier(8), 8);
    visit.start('resume');
    const first = visit.attemptId!;
    visit.respond();
    visit.restart();
    expect(visit.health.hearts).toBe(3);
    expect(visit.health.spentAttempt).toBe(visit.attemptId);
    // The ended attempt holds nothing: a late finish on it cannot refund anything.
    expect(finishAttempt(visit.health, first, 3, NOW)).toMatchObject({ refunded: false });
  });

  it('consumes nothing when the sheet is opened and cancelled', () => {
    const visit = new Visit(health(3), frontier(8), 8);
    visit.start('resume');
    visit.respond();
    const before = visit.health;
    // Asking what the sheet is, again and again, is pure.
    for (let i = 0; i < 5; i++) expect(liveSheet(visit.facts())).toBe('paid');
    expect(visit.health).toEqual(before);
    // And PlayScene's open and close paths touch no ledger call.
    const scene = readFileSync('src/scenes/PlayScene.ts', 'utf8');
    for (const name of ['private requestRestart(', 'private openRestartSheet(', 'private refreshRestartSheet(', 'private closeRestartSheet(']) {
      const from = scene.indexOf(name);
      const body = scene.slice(from, scene.indexOf('\n  }\n', from));
      expect(body, name).not.toMatch(/saveHealth|beginAttempt|abandonAttempt|releaseAttempt|redeemHeart/);
    }
  });

  it('makes every confirmed restart a new attempt that needs a heart of its own', () => {
    const visit = new Visit(health(5), frontier(8), 8);
    visit.start('resume');
    const ids = new Set([visit.attemptId]);
    for (let expected = 3; expected >= 0; expected--) {
      visit.respond();
      expect(restartKind(visit.facts())).toBe('confirm_paid');
      expect(visit.restart()).toBe(true);
      ids.add(visit.attemptId);
      expect(visit.health.hearts).toBe(expected);
    }
    expect(ids.size).toBe(5);
    visit.respond();
    // Out of hearts: no restart until a heart is found, and the run is still the old one.
    const held = visit.attemptId;
    expect(restartKind(visit.facts())).toBe('out_of_hearts');
    expect(visit.restart()).toBe(false);
    expect(visit.attemptId).toBe(held);
    expect(visit.health.spentAttempt).toBe(held);
  });

  it('never charges Resume after an interruption, before or after the response began', () => {
    const visit = new Visit(health(2), frontier(8), 8);
    visit.start('resume');
    const id = visit.attemptId;
    visit.respond();
    for (let i = 0; i < 3; i++) expect(visit.start('resume')).toBe(true);
    expect(visit.attemptId).toBe(id);
    expect(visit.health.hearts).toBe(1);
    // The attempt has been played, so a restart after Resume is still a paid one.
    expect(visit.begun).toBe(true);
    expect(restartKind(visit.facts())).toBe('confirm_paid');
    // Even at zero hearts, Resume continues what is already paid for.
    const broke = new Visit(health(1), frontier(8), 8);
    broke.start('resume');
    expect(broke.health.hearts).toBe(0);
    expect(broke.start('resume')).toBe(true);
    expect(broke.health.hearts).toBe(0);
  });

  it('keeps a cleared level free, with no sheet', () => {
    const progress = frontier(12);
    const visit = new Visit(health(0), progress, 9);
    expect(visit.start('resume')).toBe(true);
    visit.respond();
    expect(restartKind(visit.facts())).toBe('immediate');
    expect(sheetFor('immediate')).toBeNull();
    expect(visit.restart()).toBe(true);
    expect(visit.health.hearts).toBe(0);
  });

  it('keeps the protected opening levels free', () => {
    for (let level = 1; level <= HEALTH.protectedThrough; level++) {
      const visit = new Visit(health(0), frontier(level), level);
      expect(visit.start('resume')).toBe(true);
      visit.respond();
      expect(restartKind(visit.facts())).toBe('immediate');
      expect(visit.restart()).toBe(true);
      expect(visit.health.hearts).toBe(0);
    }
  });

  it('keeps Premium free, and never tells Premium a heart will be used', () => {
    const visit = new Visit(health(0), frontier(8), 8, true);
    expect(visit.start('resume')).toBe(true);
    visit.respond();
    expect(restartKind(visit.facts())).toBe('immediate');
    expect(visit.restart()).toBe(true);
    expect(visit.health.hearts).toBe(0);
    // A sheet left open when Premium arrives turns into the one that says no heart is used.
    expect(liveSheet(visit.facts())).toBe('free');
    expect(RESTART_COPY.free.note).toBe('No heart will be used.');
  });

  it('still refunds three stars, on the attempt that earned them', () => {
    const visit = new Visit(health(5), frontier(8), 8);
    visit.start('resume');
    visit.respond();
    visit.restart();
    expect(visit.health.hearts).toBe(3);
    visit.finish(3);
    expect(visit.health.hearts).toBe(4);
    // Try again after the result is a new attempt, as it always was.
    expect(restartKind(visit.facts())).toBe('try_again');
    expect(visit.restart()).toBe(true);
    expect(visit.health.hearts).toBe(3);
  });

  it('leaves the heart with the player when the restart\'s audio then fails', () => {
    const visit = new Visit(health(2), frontier(8), 8);
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

describe('the zero-heart rewarded restart', () => {
  const ok = (): Promise<RewardedResult> => Promise.resolve({ ok: true });
  const broken = (reason: 'unavailable' | 'cancelled' | 'failed') => (): Promise<RewardedResult> => Promise.resolve({ ok: false, reason });

  function emptyRun(): Visit {
    const visit = new Visit(health(1), frontier(8), 8);
    visit.start('resume');
    visit.respond();
    expect(visit.health.hearts).toBe(0);
    return visit;
  }

  it('does not end the attempt at zero hearts: it offers the ad instead', () => {
    const visit = emptyRun();
    const id = visit.attemptId;
    expect(restartKind(visit.facts())).toBe('out_of_hearts');
    expect(sheetFor('out_of_hearts')).toBe('empty');
    expect(RESTART_COPY.empty).toMatchObject({ title: 'Out of hearts', note: 'Get a heart and restart this level.' });
    expect(visit.restart()).toBe(false);
    expect(visit.attemptId).toBe(id);
    expect(visit.health.spentAttempt).toBe(id);
  });

  it('never offers the ad while a heart is there, even one that regenerated under the sheet', () => {
    const visit = emptyRun();
    expect(liveSheet(visit.facts())).toBe('empty');
    // Twenty minutes on: the refill landed while the sheet was open.
    expect(liveSheet(visit.facts(NOW + HEALTH.regenMs))).toBe('paid');
    for (let hearts = 1; hearts <= HEALTH.max; hearts++) {
      expect(liveSheet({ ...visit.facts(), health: { ...health(hearts), spentAttempt: visit.attemptId } })).toBe('paid');
    }
  });

  it('grants one heart on the reward and restarts on it: same balance, a fresh attempt', async () => {
    const visit = emptyRun();
    const old = visit.attemptId!;
    const grants: GrantHeartResult[] = [];
    const watch = await watchForHeart(ok, id => {
      const grant = claimHeart(visit.health, id, NOW);
      visit.health = grant.health;
      grants.push(grant);
      return grant;
    }, 'restart:t1');
    expect(watch).toMatchObject({ kind: 'granted', granted: true, hearts: 1 });
    expect(grants).toHaveLength(1);
    expect(ticketStillApplies({ attemptId: old, startRequest: 4 }, { disposed: false, attemptId: old, startRequest: 4, outcomeRecorded: false })).toBe(true);
    // The heart is there now, so the restart is the paid one, and it spends that heart once.
    expect(restartKind(visit.facts())).toBe('confirm_paid');
    expect(visit.start('new_attempt')).toBe(true);
    expect(visit.attemptId).not.toBe(old);
    expect(visit.health).toMatchObject({ hearts: 0, spentAttempt: visit.attemptId });
    expect(finishAttempt(visit.health, old, 3, NOW).refunded).toBe(false);
  });

  it('leaves the run and the hearts alone when the ad fails, closes or is not there', async () => {
    for (const reason of ['unavailable', 'cancelled', 'failed'] as const) {
      const visit = emptyRun();
      const before = { health: visit.health, attemptId: visit.attemptId };
      let redeemed = 0;
      const watch = await watchForHeart(broken(reason), id => { redeemed++; return claimHeart(visit.health, id, NOW); }, `restart:${reason}`);
      expect(watch).toEqual({ kind: 'failed', reason });
      expect(redeemed).toBe(0);
      expect(visit.health).toEqual(before.health);
      expect(visit.attemptId).toBe(before.attemptId);
    }
    // A show that throws is a failure too, never an exception into the scene.
    const thrown = await watchForHeart(() => Promise.reject(new Error('sdk')), () => { throw new Error('never'); }, 'restart:x');
    expect(thrown).toEqual({ kind: 'failed', reason: 'failed' });
  });

  it('cannot grant twice or restart twice for one reward', async () => {
    // The SDK firing Rewarded and resolving show both reach the claim: one heart.
    const first = claimHeart(health(0), 'restart:dup', NOW);
    const second = claimHeart(first.health, 'restart:dup', NOW);
    expect(first).toMatchObject({ granted: true, health: { hearts: 1 } });
    expect(second).toMatchObject({ granted: false, health: { hearts: 1 } });
    // And the scene runs one watch at a time, under the commerce lock, then hides the sheet
    // before it starts: a second confirm has nothing to land on.
    const scene = readFileSync('src/scenes/PlayScene.ts', 'utf8');
    const watch = scene.slice(scene.indexOf('private async watchToRestart('), scene.indexOf('private async buyToRestart('));
    expect(watch).toContain('if (this.commerceBusy || this.curtain.active) return;');
    expect(watch.match(/this\.startRound\(/g)).toHaveLength(1);
    expect(watch.indexOf('this.restartSheet.hide();\n      playAnalytics.restartConfirmed')).toBeLessThan(watch.indexOf("void this.startRound('new_attempt')"));
  });

  it('restarts nothing into a scene that went away, or a run that ended or moved on', () => {
    const ticket = { attemptId: 'a1', startRequest: 7 };
    const live = { disposed: false, attemptId: 'a1', startRequest: 7, outcomeRecorded: false };
    expect(ticketStillApplies(ticket, live)).toBe(true);
    expect(ticketStillApplies(ticket, { ...live, disposed: true })).toBe(false);
    expect(ticketStillApplies(ticket, { ...live, outcomeRecorded: true })).toBe(false);
    expect(ticketStillApplies(ticket, { ...live, startRequest: 8 })).toBe(false);
    expect(ticketStillApplies(ticket, { ...live, attemptId: 'a2' })).toBe(false);
    // The scene checks the dead-scene case before touching anything, and the ticket before restarting.
    const scene = readFileSync('src/scenes/PlayScene.ts', 'utf8');
    const watch = scene.slice(scene.indexOf('private async watchToRestart('), scene.indexOf('private async buyToRestart('));
    expect(watch.indexOf('if (this.disposed) {')).toBeLessThan(watch.indexOf('this.restartSheet.setBusy(null);\n      if (watch.kind'));
    expect(watch.indexOf('if (!this.ticketHolds(ticket))')).toBeLessThan(watch.indexOf("this.startRound('new_attempt')"));
    // Interruptions move the start request, so an ad that returns after a pause restarts nothing.
    const interrupt = scene.slice(scene.indexOf('  private interrupt(): void {'), scene.indexOf('  private persistAbandonedAttempt('));
    expect(interrupt).toContain('++this.startRequest;');
  });

  it('keeps the play screen\'s own Watch and the map\'s working through the same helper', async () => {
    const scene = readFileSync('src/scenes/PlayScene.ts', 'utf8');
    const play = scene.slice(scene.indexOf('  private async watchAd('), scene.indexOf('  private async buyFill('));
    expect(play).toContain('watchForHeart(() => monetization().showRewarded(), redeemHeart, claimId)');
    expect(play).toContain("void this.startRound('resume');");
    const map = readFileSync('src/scenes/MapScene.ts', 'utf8');
    expect(map).toContain('const watch = await watchForHeart(() => monetization().showRewarded()');
    // One ad, one heart, at the empty play screen: the restart it leads to is the start's.
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
    expect(scene).toContain('if (resumeId === null) this.scoredResponseBegun = false;');
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
    const visit = new Visit(health(0), frontier(8), 8);
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
    for (const kind of ['free', 'paid', 'empty'] as const) {
      for (const offers of [{ refill: true, premium: true }, { refill: true, premium: false }, { refill: false, premium: false }]) {
        const layout = restartSheetLayout(kind, frame, offers);
        const controls = [layout.confirm, layout.refill, layout.premium, layout.keep].filter(r => r !== null);
        for (const r of controls) {
          expect(r.height).toBeGreaterThanOrEqual(88);
          expect(r.x).toBeGreaterThanOrEqual(layout.card.x);
          expect(r.x + r.width).toBeLessThanOrEqual(layout.card.x + layout.card.width + 1e-6);
          expect(r.y + r.height).toBeLessThanOrEqual(layout.card.y + layout.card.height);
        }
        for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
          const a = controls[i]!, b = controls[j]!;
          const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
          expect(apart).toBe(true);
        }
        expect(layout.card.y + layout.card.height).toBeCloseTo(frame.bottom);
        if (kind !== 'empty') expect(layout.refill ?? layout.premium).toBeNull();
      }
    }
  });

  it('routes a tap to its control, the card face to nothing, and off the card back to the level', () => {
    const layout = restartSheetLayout('empty', frame, { refill: true, premium: true });
    const centre = (r: { x: number; y: number; width: number; height: number }) => [r.x + r.width / 2, r.y + r.height / 2] as const;
    expect(restartSheetHit(layout, ...centre(layout.confirm))).toBe('confirm');
    expect(restartSheetHit(layout, ...centre(layout.refill!))).toBe('refill');
    expect(restartSheetHit(layout, ...centre(layout.premium!))).toBe('premium');
    expect(restartSheetHit(layout, ...centre(layout.keep))).toBe('keep');
    expect(restartSheetHit(layout, layout.card.x + 4, layout.card.y + 4)).toBe('swallow');
    expect(restartSheetHit(layout, layout.card.x + 4, layout.card.y - 20)).toBeNull();
  });

  it('holds its controls while it arms, and while an ad or a purchase is out', () => {
    expect(guardedSheetTap('confirm', 10, 10 + RESTART_SHEET_ARM_SEC, false)).toBe('swallow');
    expect(guardedSheetTap('confirm', 11, 10 + RESTART_SHEET_ARM_SEC, false)).toBe('confirm');
    expect(guardedSheetTap('keep', 11, 0, true)).toBe('swallow');
    expect(guardedSheetTap(null, 11, 0, true)).toBeNull();
  });

  it('says the cost before anything is spent, and only where one will be', () => {
    expect(RESTART_COPY.free).toMatchObject({ title: 'Restart from the beginning?', note: 'No heart will be used.' });
    expect(RESTART_COPY.paid).toMatchObject({ title: 'Restart level?', note: 'This run will end. Restarting uses 1 heart.' });
    expect(RESTART_COPY.keep).toBe('Keep playing');
    expect(RESTART_COPY.free.note).not.toMatch(/uses/);
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
    ledger.restartRequested(8, 'paid', 3, false);
    ledger.restartCancelled(8, 'paid', 'keep_playing', 3, false);
    ledger.restartRequested(8, 'empty', 0, false);
    ledger.rewardedRestartFailed(8, 'cancelled');
    ledger.restartConfirmed(8, 'rewarded', 1, false);
    ledger.restartRequested(9, 'none', 0, true);
    ledger.restartConfirmed(9, 'free', 0, true);
    expect(sent.map(s => s.event)).toEqual([
      'restart_requested', 'restart_cancelled', 'restart_requested', 'rewarded_restart_failed', 'restart_confirmed',
      'restart_requested', 'restart_confirmed',
    ]);
    expect(sent[0]!.payload).toEqual({ level: 8, area: 1, placement: 'restart', hearts: 3, premium: 0, sheet: 'paid' });
    expect(sent[3]!.payload).toEqual({ level: 8, area: 1, placement: 'restart', reason: 'cancelled' });
    expect(sent[4]!.payload).toMatchObject({ cost: 'rewarded', hearts: 1 });
    expect(sent[6]!.payload).toMatchObject({ cost: 'free', premium: 1 });
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
