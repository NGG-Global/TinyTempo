import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { RHYTHM } from '../src/config/rhythm';
import { isFlawless, markFor } from '../src/game/beatTrack';
import { advanceGroove, GROOVE_START, isMastered } from '../src/game/groove';
import { AREAS, levelSpec, mapLevelState, meanAccuracy } from '../src/game/levels';
import { isLevelMastered, mapMastered, masteredCount, masteryResult, MASTERED_ACCURACY } from '../src/game/mastery';
import { loadProgress, mergeProgress, recordResult, saveProgress, type Progress } from '../src/game/progress';
import { decodeSaveCode, encodeSaveCode, type SaveData } from '../src/game/saveCode';
import { scoreRound, type RoundResult } from '../src/game/scoring';
import { decodeCloudSave, emptyCloudSave, encodeCloudSave, mergeCloudSaves } from '../src/playgames/cloudSave';
import { createJudge, expireTargets, judgeTap } from '../src/rhythm/judge';
import { masteryPose } from '../src/ui/groove';
import { BRASS } from '../src/ui/panel';
import { contrastRatio } from '../src/ui/colour';
import { masteryGroove } from '../src/ui/roadLayout';

vi.mock('phaser', () => ({ default: { Geom: { Rectangle: class {} } } }));

const KEY = 'small-acts.progress.v1';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, String(v)); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear(),
    key: () => null,
    get length() { return map.size; },
  } as Storage;
}

/** A small deterministic generator, so a failure names the same case every run. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Tap = 'perfect' | 'good' | 'miss';

/**
 * One task through the real judge and scorer, and the scene's own flawless test
 * (`PlayScene.showResult`: every mark Perfect and no extra tap).
 */
function playTask(taps: readonly Tap[], extras: number): { result: RoundResult; flawless: boolean } {
  const spacing = 0.5;
  const targets = taps.map((_, i) => 1 + i * spacing);
  const judge = createJudge(targets);
  taps.forEach((tap, i) => {
    if (tap === 'perfect') judgeTap(judge, targets[i]! + (i % 2 ? -1 : 1) * (RHYTHM.perfectMs - 5) / 1000);
    if (tap === 'good') judgeTap(judge, targets[i]! + (RHYTHM.perfectMs + 20) / 1000);
  });
  // Half-way between two targets is outside every Good window at this spacing: an extra.
  for (let k = 0; k < extras; k++) judgeTap(judge, targets[k % targets.length]! + spacing / 2);
  expireTargets(judge, targets[targets.length - 1]! + 5);
  const marks = judge.outcomes.map(markFor);
  return { result: scoreRound(judge), flawless: isFlawless(marks) && judge.extras.length === 0 };
}

function playLevel(level: number, before: Progress, task: (index: number) => { taps: Tap[]; extras: number }) {
  const spec = levelSpec(level);
  let groove = GROOVE_START;
  const results: number[] = [];
  spec.tasks.forEach((_, i) => {
    const plan = task(i);
    const played = playTask(plan.taps, plan.extras);
    results.push(played.result.accuracy);
    groove = advanceGroove(groove, { flawless: played.flawless });
  });
  const accuracy = meanAccuracy(results);
  const outcome = recordResult(before, level, accuracy);
  const flawless = isMastered(groove, spec.tasks.length, outcome.cleared);
  return { accuracy, outcome, flawless, mastery: masteryResult(before, outcome, level, flawless) };
}

const allPerfect = (n = 8) => ({ taps: Array<Tap>(n).fill('perfect'), extras: 0 });
const EMPTY: Progress = { unlocked: 1, best: {} };
const SETTINGS: SaveData['settings'] = { muted: false, music: 1, sfx: 1, haptics: true, calibrationMs: 0 };

describe('best accuracy 100 is the same fact as a flawless run', () => {
  it('holds for a task: 100 exactly when every target is Perfect and nothing extra was tapped', () => {
    const random = seeded(17);
    let flawlessSeen = 0, nearSeen = 0;
    for (let trial = 0; trial < 4000; trial++) {
      const n = 1 + Math.floor(random() * 16);
      // Mostly Perfect, so flawless tasks and near misses both turn up often.
      const taps = Array.from({ length: n }, (): Tap => { const r = random(); return r < 0.9 ? 'perfect' : r < 0.96 ? 'good' : 'miss'; });
      const extras = random() < 0.85 ? 0 : 1 + Math.floor(random() * 2);
      const { result, flawless } = playTask(taps, extras);
      expect(result.accuracy === MASTERED_ACCURACY, `${taps.join(',')} +${extras}`).toBe(flawless);
      if (flawless) flawlessSeen++;
      else if (result.accuracy > 95) nearSeen++;
    }
    expect(flawlessSeen).toBeGreaterThan(100);
    expect(nearSeen).toBeGreaterThan(100);
  });

  it('holds for a level: the saved best is 100 exactly when the groove calls the run mastered', () => {
    const random = seeded(29);
    for (let trial = 0; trial < 300; trial++) {
      const level = 1 + Math.floor(random() * 80);
      const run = playLevel(level, EMPTY, () => {
        const n = 2 + Math.floor(random() * 10);
        return { taps: Array.from({ length: n }, (): Tap => (random() < 0.985 ? 'perfect' : 'good')), extras: random() < 0.98 ? 0 : 1 };
      });
      expect(isLevelMastered(run.outcome.progress, level), `level ${level} at ${run.accuracy}`).toBe(run.flawless);
    }
  });
});

describe('a mastered level', () => {
  it('is a flawless cleared level', () => {
    const run = playLevel(4, EMPTY, () => allPerfect());
    expect(run.outcome.cleared).toBe(true);
    expect(run.accuracy).toBe(100);
    expect(run.mastery).toBe('first');
    expect(isLevelMastered(run.outcome.progress, 4)).toBe(true);
    expect(masteredCount(run.outcome.progress)).toBe(1);
  });

  it('is not a 99.x% run, nor any run with a Good, a miss or an extra tap', () => {
    // One Good among eight targets, in one task: the level lands just under 100.
    const good = playLevel(4, EMPTY, i => (i === 0 ? { taps: ['good', ...Array<Tap>(7).fill('perfect')], extras: 0 } : allPerfect()));
    expect(good.accuracy).toBeGreaterThan(99);
    expect(good.accuracy).toBeLessThan(100);
    expect(good.mastery).toBe('none');
    expect(isLevelMastered(good.outcome.progress, 4)).toBe(false);
    for (const slip of [{ taps: ['miss', ...Array<Tap>(7).fill('perfect')], extras: 0 }, { ...allPerfect(), extras: 1 }]) {
      const run = playLevel(4, EMPTY, i => (i === 1 ? slip as { taps: Tap[]; extras: number } : allPerfect()));
      expect(run.mastery).toBe('none');
      expect(isLevelMastered(run.outcome.progress, 4)).toBe(false);
    }
    expect(isLevelMastered({ unlocked: 5, best: { 4: 99.99 } }, 4)).toBe(false);
    expect(masteredCount({ unlocked: 5, best: { 1: 99.99, 2: 100, 3: 80, 4: 100 } })).toBe(2);
  });

  it('survives a reload', () => {
    const storage = memoryStorage();
    const run = playLevel(6, { unlocked: 6, best: { 1: 90, 2: 90, 3: 90, 4: 90, 5: 90 } }, () => allPerfect());
    expect(saveProgress(run.outcome.progress, storage)).toBe(true);
    const reloaded = loadProgress(storage);
    expect(isLevelMastered(reloaded, 6)).toBe(true);
    expect(masteredCount(reloaded)).toBe(1);
  });

  it('is not taken away by a worse replay', () => {
    const first = playLevel(3, { unlocked: 3, best: { 1: 80, 2: 80 } }, () => allPerfect());
    const worse = playLevel(3, first.outcome.progress, i => (i === 0 ? { taps: ['good', 'perfect', 'perfect', 'perfect'], extras: 1 } : allPerfect()));
    expect(worse.outcome.cleared).toBe(true);
    expect(worse.mastery).toBe('none');
    expect(isLevelMastered(worse.outcome.progress, 3)).toBe(true);
    // And a failed one.
    const failed = recordResult(first.outcome.progress, 3, 5);
    expect(failed.cleared).toBe(false);
    expect(isLevelMastered(failed.progress, 3)).toBe(true);
  });

  it('is not taken away by any merge: save code, Saved Games or a restored backup', () => {
    const mastered: Progress = { unlocked: 9, best: { 1: 100, 2: 88, 3: 100, 8: 100 } };
    const behind: Progress = { unlocked: 4, best: { 1: 92, 2: 99.6, 3: 70 } };
    for (const merged of [mergeProgress(mastered, behind), mergeProgress(behind, mastered)]) {
      expect([1, 3, 8].every(level => isLevelMastered(merged, level))).toBe(true);
      expect(isLevelMastered(merged, 2)).toBe(false);
    }
    // A save code restored onto a device that has the masteries.
    const code = decodeSaveCode(encodeSaveCode({ progress: behind, settings: SETTINGS, tutorialComplete: true }));
    if (!code.ok) throw new Error(code.reason);
    expect(masteredCount(mergeProgress(mastered, code.data.progress))).toBe(3);
    // A save code carrying them onto an empty device.
    const carried = decodeSaveCode(encodeSaveCode({ progress: mastered, settings: SETTINGS, tutorialComplete: true }));
    if (!carried.ok) throw new Error(carried.reason);
    expect([1, 3, 8].every(level => isLevelMastered(mergeProgress(EMPTY, carried.data.progress), level))).toBe(true);
    // Saved Games: both sides of a conflict, and the payload's own round trip.
    const cloud = (progress: Progress) => ({ ...emptyCloudSave(), progress });
    for (const merged of [mergeCloudSaves(cloud(mastered), cloud(behind)), mergeCloudSaves(cloud(behind), cloud(mastered))]) {
      expect(masteredCount(merged.progress)).toBe(3);
      const read = decodeCloudSave(encodeCloudSave(merged));
      if (read.kind !== 'save') throw new Error(read.kind);
      expect(masteredCount(read.save.progress)).toBe(3);
    }
    // Auto Backup restores the storage itself, which is the reload above.
  });

  it('does not travel in a save code as a rounded 99.x', () => {
    // 99.6 used to be written as 100 and come back mastered.
    const near: Progress = { unlocked: 3, best: { 1: 99.6, 2: 99.5 } };
    const code = decodeSaveCode(encodeSaveCode({ progress: near, settings: SETTINGS, tutorialComplete: false }));
    if (!code.ok) throw new Error(code.reason);
    expect(masteredCount(code.data.progress)).toBe(0);
    expect(code.data.progress.best[1]).toBe(99);
    // Capping at 99 costs no star: every threshold is a whole percent well under it.
    for (const level of [1, 2]) expect(code.data.progress.best[level]!).toBeGreaterThanOrEqual(levelSpec(level).starAccuracy[2]!);
  });

  it('reads an older code\'s ambiguous 100 as three stars and no mastery', () => {
    // Hand-built version 2 bytes, as the encoder wrote them before the flawless byte: level 1 at 100.
    const bytes = [2, 2, 0, 0, 0, 0, 100, 100, 100];
    bytes.push(bytes.reduce((sum, b) => (sum + b) & 0xff, 0));
    const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    let out = '', buffer = 0, bits = 0;
    for (const byte of bytes) {
      buffer = (buffer << 8) | byte; bits += 8;
      while (bits >= 5) { bits -= 5; out += alphabet[(buffer >> bits) & 31]; }
    }
    if (bits > 0) out += alphabet[(buffer << (5 - bits)) & 31];
    const read = decodeSaveCode(out);
    if (!read.ok) throw new Error(read.reason);
    expect(read.data.progress.best[1]).toBe(99.5);
    expect(isLevelMastered(read.data.progress, 1)).toBe(false);
    expect(levelSpec(1).starAccuracy[2]!).toBeLessThanOrEqual(99.5);
  });

  it('shows on a save written before mastery was persistent', () => {
    // A stored best of exactly 100 from an older build: nothing was ever written for mastery.
    const storage = memoryStorage({ [KEY]: JSON.stringify({ version: 1, unlocked: 12, best: { 3: 100, 7: 100, 9: 99.7, 10: 85 } }) });
    const progress = loadProgress(storage);
    expect(isLevelMastered(progress, 3)).toBe(true);
    expect(isLevelMastered(progress, 7)).toBe(true);
    expect(isLevelMastered(progress, 9)).toBe(false);
    expect(masteredCount(progress)).toBe(2);
    expect(mapMastered(progress, 3)).toBe(true);
  });
});

describe('the map', () => {
  it('marks a mastered cleared stop, and nothing else', () => {
    const progress: Progress = { unlocked: 11, best: { 2: 100, 5: 97, 10: 100 } };
    expect(mapMastered(progress, 2)).toBe(true);
    // A finale is a stop like any other.
    expect(mapMastered(progress, 10)).toBe(true);
    expect(mapMastered(progress, 5)).toBe(false);
    expect(mapMastered(progress, 1)).toBe(false);
    // The frontier, and a best a tampered save holds beyond it, are never marked.
    const ahead: Progress = { unlocked: 4, best: { 4: 100, 6: 100 } };
    expect(mapMastered(ahead, 4)).toBe(false);
    expect(mapMastered(ahead, 6)).toBe(false);
    // The same cleared the map's own state machine draws.
    const all: Progress = { unlocked: 30, best: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [i + 1, 100])) };
    for (let level = 1; level <= 40; level++) expect(mapMastered(all, level), `level ${level}`).toBe(mapLevelState(level, all.unlocked) === 'cleared');
  });

  it('draws the mark from the shared rule, and nothing else in the game compares a best with 100', () => {
    const map = readFileSync('src/scenes/MapScene.ts', 'utf8');
    const puck = map.slice(map.indexOf('private drawLevelPuck('), map.indexOf('private drawFinaleStage('));
    expect(puck).toContain('mapMastered(this.progress, this.first + i)');
    expect(puck).toContain('masteryGroove(');
    for (const file of ['src/scenes/MapScene.ts', 'src/scenes/PlayScene.ts', 'src/game/saveCode.ts', 'src/game/playAnalytics.ts', 'src/playgames/cloudSave.ts']) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/(===|>=)\s*100\b/);
    }
  });

  it('keeps the groove legible on every area\'s cleared puck, and thinner than the puck can notice', () => {
    for (const area of AREAS) {
      const groove = masteryGroove(46, 1, BRASS);
      // The cleared puck is the area's ink: dark on most areas, cream on Dusk.
      const legible = Math.max(contrastRatio(groove.brass, area.ink), contrastRatio(groove.shadow, area.ink));
      expect(legible, area.name).toBeGreaterThanOrEqual(3);
      expect(groove.channel).toBeLessThan(46 * 0.15);
      expect(groove.radius + groove.channel / 2).toBeLessThan(46);
    }
  });
});

describe('the result', () => {
  it('reveals the first mastery and only acknowledges a later flawless replay', () => {
    const first = playLevel(5, { unlocked: 5, best: { 1: 80, 2: 80, 3: 80, 4: 80 } }, () => allPerfect());
    expect(first.mastery).toBe('first');
    const again = playLevel(5, first.outcome.progress, () => allPerfect());
    expect(again.mastery).toBe('repeat');
    expect(again.outcome.stars).toBe(3);
    // The reveal's ring, glint and knock belong to the first; a repeat's plate still arrives.
    for (const age of [0.1, 0.3, 0.6, 1, 2]) {
      const repeat = masteryPose(age, false, true)!;
      expect(repeat.ring.alpha).toBe(0);
      expect(repeat.flash).toBe(0);
      expect(repeat.knock).toBe(0);
    }
    expect(masteryPose(2, false, true)!.label.alpha).toBe(1);
    expect(masteryPose(0.3, false, false)!.ring.alpha).toBeGreaterThan(0);
    expect(masteryPose(0.2, false, false)!.flash).toBeGreaterThan(0);
    expect(masteryPose(0, true, true)!.label.alpha).toBe(1);
  });

  it('plays the reveal\'s sting, buzz and sparks only for a first mastery', () => {
    const scene = readFileSync('src/scenes/PlayScene.ts', 'utf8');
    expect(scene).toMatch(/if \(this\.mastery === 'first' && this\.audio\)[\s\S]{0,200}playStinger\(this\.masteryAt/);
    expect(scene).toContain("if (this.mastery === 'first') vibrate('stamp');");
    expect(scene).toContain("if (!still && this.mastery === 'first') {");
    expect(scene).toContain("this.levelRun?.finish(outcome, accuracy, this.mastery);");
  });
});
