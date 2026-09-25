import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { advanceGroove, GROOVE_MAX, GROOVE_START, isMastered, type GrooveLevel, type GrooveState } from '../src/game/groove';
import { beatPulse, GROOVE_POSE, grooveBlend, groovePose, MASTERY, masteryPose } from '../src/ui/groove';
import { synthesizeGroove } from '../src/audio/grooveSounds';
import { STAR_REVEAL } from '../src/ui/starReveal';
import { KEEPSAKE_CARD, planResult, RESULT_ROWS } from '../src/ui/resultLayout';
import { levelSpec, starsFor } from '../src/game/levels';
import { RHYTHM } from '../src/config/rhythm';

vi.mock('phaser', () => ({ default: {} }));

const play = (verdicts: readonly boolean[], from: GrooveState = GROOVE_START): GrooveState =>
  verdicts.reduce((state, flawless) => advanceGroove(state, { flawless }), from);
const levels = (verdicts: readonly boolean[]): GrooveLevel[] => {
  const out: GrooveLevel[] = [];
  let state = GROOVE_START;
  for (const flawless of verdicts) { state = advanceGroove(state, { flawless }); out.push(state.level); }
  return out;
};

describe('groove', () => {
  it('starts at 0, with nothing scored', () => {
    expect(GROOVE_START).toEqual({ level: 0, flawlessTasks: 0, scoredTasks: 0, allFlawless: true, peak: 0 });
  });

  it('climbs one level per flawless task: 1, 2, 3', () => {
    expect(levels([true, true, true])).toEqual([1, 2, 3]);
  });

  it('is capped at 3 however many flawless tasks follow', () => {
    expect(levels([true, true, true, true, true, true])).toEqual([1, 2, 3, 3, 3, 3]);
    expect(GROOVE_MAX).toBe(3);
  });

  it('slides one level on a task that was not flawless: 3 → 2, never straight to 0', () => {
    const three = play([true, true, true]);
    expect(advanceGroove(three, { flawless: false }).level).toBe(2);
  });

  it('decays to 0 over repeated slips and never goes below it', () => {
    expect(levels([true, true, true, false, false, false, false, false])).toEqual([1, 2, 3, 2, 1, 0, 0, 0]);
    expect(advanceGroove(GROOVE_START, { flawless: false }).level).toBe(0);
    expect(advanceGroove(GROOVE_START, { flawless: false }).allFlawless).toBe(false);
  });

  it('counts what it saw, and remembers the peak for the once-per-run report', () => {
    const state = play([true, false, true, true, true, false]);
    expect(state).toMatchObject({ flawlessTasks: 4, scoredTasks: 6, allFlawless: false, peak: 3, level: 2 });
    expect(Object.isFrozen(state)).toBe(true);
  });

  it('is a fresh GROOVE_START on a restart or a new level, not a continuation', () => {
    // The scene assigns GROOVE_START on every startRound; the state carries no identity
    // of its own, so a new level and a restart are the same reset.
    const worn = play([true, true, true]);
    expect(play([true], GROOVE_START).level).toBe(1);
    expect(play([true], worn).level).toBe(3);
    expect(GROOVE_START.level).toBe(0);
  });
});

describe('mastery', () => {
  it('is every scored task flawless on a cleared level', () => {
    expect(isMastered(play([true, true, true, true]), 4, true)).toBe(true);
  });

  it('is denied by one task short of flawless', () => {
    expect(isMastered(play([true, true, false, true]), 4, true)).toBe(false);
    // Even one that climbed straight back to 3 afterwards.
    expect(isMastered(play([false, true, true, true, true]), 5, true)).toBe(false);
  });

  it('is denied on a failed level whatever its tasks did', () => {
    expect(isMastered(play([true, true, true, true]), 4, false)).toBe(false);
  });

  it('needs every one of the level\'s tasks, so a pass cut short cannot be mastered', () => {
    expect(isMastered(play([true, true, true]), 4, true)).toBe(false);
    expect(isMastered(GROOVE_START, 0, true)).toBe(false);
  });
});

describe('what groove never touches', () => {
  const src = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

  it('is read by nothing that judges, scores, saves, paces or unlocks', () => {
    for (const path of [
      'src/rhythm/judge.ts', 'src/game/scoring.ts', 'src/game/RoundController.ts', 'src/rhythm/RhythmScheduler.ts',
      'src/game/levels.ts', 'src/config/progression.ts', 'src/config/rhythm.ts', 'src/audio/MusicSystem.ts',
      'src/game/progress.ts', 'src/game/health.ts', 'src/game/saveCode.ts', 'src/game/stars.ts',
    ]) {
      expect(src(path).toLowerCase().includes('groove'), path).toBe(false);
    }
  });

  it('imports nothing itself, so it cannot reach any of them', () => {
    expect(src('src/game/groove.ts')).not.toMatch(/^import /m);
    expect(src('src/ui/groove.ts')).not.toMatch(/from 'phaser'/);
    expect(src('src/audio/grooveSounds.ts')).not.toMatch(/^import /m);
  });

  it('leaves the stars where the curve puts them', () => {
    // Nothing to inject: the scorer and the thresholds cannot see the state at all.
    const spec = levelSpec(7);
    expect(starsFor(spec.starAccuracy[2]!, spec)).toBe(3);
    expect(starsFor(spec.clearAccuracy, spec)).toBe(1);
    expect(RHYTHM.beatsPerBar).toBe(4);
  });

  it('is moved in the scene by scored tasks alone', () => {
    const scene = src('src/scenes/PlayScene.ts');
    const between = (from: string, to: string): string => { const a = scene.indexOf(from); return scene.slice(a, scene.indexOf(to, a + 1)); };
    expect(scene.match(/advanceGroove\(/g)).toHaveLength(1);
    // Inside showResult, after the introduction's own early return, never in the
    // introduction's or the first-run pass's paths.
    const showResult = between('private showResult(', 'private setGroove(');
    expect(showResult).toContain("if (this.intro) { this.showIntroResult(result); return; }");
    expect(showResult).toContain('advanceGroove(');
    expect(between('private showIntroResult(', 'private beginTask(')).not.toContain('Groove');
    expect(between('private teachTick(', 'private beginIntro(')).not.toContain('Groove');
    // The pass's, reset with it, and gone with the scene.
    expect(between('private async startRound(', 'private beginTeach(')).toContain('this.setGroove(GROOVE_START)');
    expect(between('private async startRound(', 'private beginTeach(')).toContain('this.grooveStage.reset()');
    expect(between('private shutdown(', '\n}')).toContain('this.grooveStage.destroy()');
    // The judge is handed the same three arguments it always was.
    expect(scene).toContain('this.controller.tap(this.audio.clock.input(tap.timestamp), this.audio.context.currentTime, performance.now())');
  });
});

describe('the room', () => {
  const rest = beatPulse(0, 0, 120, true);

  it('adds nothing at levels 0 and 1: level 1 is the flawless flourish alone', () => {
    for (const level of [0, 1]) {
      const pose = groovePose(level, beatPulse(0.02, 0, 120), Infinity);
      expect(pose.glow).toBe(0);
      expect(pose.rim).toBe(0);
      expect(pose.scale).toBe(1);
    }
  });

  it('is noticeable at 2 and plainly there at 3, and never a full-screen flash', () => {
    const two = groovePose(2, rest, Infinity), three = groovePose(3, rest, Infinity);
    expect(two.glow).toBeGreaterThan(0.2);
    expect(three.glow).toBeGreaterThan(two.glow);
    expect(three.rim).toBeGreaterThan(two.rim);
    expect(three.warmth).toBeGreaterThan(two.warmth);
    for (let amount = 0; amount <= 3; amount += 0.25) {
      for (let t = 0; t < 2; t += 0.01) {
        const pose = groovePose(amount, beatPulse(t, 0, 180), t - 1.5);
        expect(pose.glow).toBeLessThanOrEqual(0.8);
        expect(pose.scale).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('breathes on the bar: beat 1 fullest, beats 2–4 smaller, and never a jump', () => {
    const beat = 60 / 120;
    const on1 = beatPulse(GROOVE_POSE.breathIn * beat, 0, 120), on2 = beatPulse(beat + GROOVE_POSE.breathIn * beat, 0, 120);
    expect(on1.beat).toBe(0);
    expect(on2.beat).toBe(1);
    expect(on1.strength).toBeCloseTo(1, 5);
    expect(on2.strength).toBeCloseTo(GROOVE_POSE.offbeat, 5);
    expect(beatPulse(3.9 * beat, 0, 120).beat).toBe(3);
    expect(beatPulse(-0.5 * beat, 0, 120).beat).toBe(3);
    let previous = beatPulse(0, 0, 120).strength;
    for (let t = 0.002; t < 4 * beat; t += 0.002) {
      const s = beatPulse(t, 0, 120).strength;
      expect(Math.abs(s - previous)).toBeLessThan(0.15);
      previous = s;
    }
  });

  it('swells by one or two percent at most on a beat', () => {
    const full = beatPulse(GROOVE_POSE.breathIn * 0.5, 0, 120);
    expect(groovePose(2, full, Infinity).scale).toBeLessThanOrEqual(1.0125);
    expect(groovePose(3, full, Infinity).scale).toBeLessThanOrEqual(1.021);
    expect(groovePose(3, full, Infinity).scale).toBeGreaterThan(1.01);
  });

  it('answers a Perfect at level 3 with a flare that is gone inside a beat, and not below it', () => {
    expect(groovePose(3, rest, 0.1).scale).toBeGreaterThan(groovePose(3, rest, Infinity).scale);
    expect(groovePose(2, rest, 0.1).scale).toBe(groovePose(2, rest, Infinity).scale);
    expect(groovePose(3, rest, GROOVE_POSE.flare).scale).toBe(1);
  });

  it('warms up and settles down over a blend rather than switching', () => {
    expect(grooveBlend(2, 3, 0)).toBe(2);
    expect(grooveBlend(2, 3, GROOVE_POSE.blend / 2)).toBeGreaterThan(2.5);
    expect(grooveBlend(2, 3, GROOVE_POSE.blend)).toBe(3);
    expect(grooveBlend(3, 2, GROOVE_POSE.blend / 3)).toBeLessThan(3);
    expect(grooveBlend(3, 2, GROOVE_POSE.blend / 3)).toBeGreaterThan(2);
    expect(grooveBlend(0, 2, -Infinity)).toBe(0);
  });

  it('holds still under reduced motion: the light and the brass, nothing moving', () => {
    expect(beatPulse(0.02, 0, 120, true).strength).toBe(0);
    expect(grooveBlend(2, 3, 0, true)).toBe(3);
    const still = groovePose(3, beatPulse(0.02, 0, 120, true), 0.05, true);
    expect(still.scale).toBe(1);
    expect(still.glow).toBe(GROOVE_POSE.glow[3]);
    expect(still.rim).toBe(GROOVE_POSE.rim[3]);
    expect(still).toEqual(groovePose(3, rest, 1, true));
  });
});

describe('the mastery payoff', () => {
  it('waits until the third medal has had its chorus, and behind a finale\'s ribbon and card', () => {
    const chorusAt = STAR_REVEAL.delay + STAR_REVEAL.spread + STAR_REVEAL.impact + 0.06;
    expect(MASTERY.delay).toBeGreaterThan(chorusAt + 0.4);
    expect(MASTERY.finaleDelay).toBeGreaterThan(1.25 + 0.5);
    expect(MASTERY.finaleDelay).toBeGreaterThan(MASTERY.delay);
    // A keepsake earned by the same clear comes after the label, on both kinds of level.
    expect(KEEPSAKE_CARD.delay + MASTERY.keepsakeLag).toBeGreaterThan(MASTERY.delay);
    expect(KEEPSAKE_CARD.delay + 0.7 + MASTERY.keepsakeLag).toBeGreaterThan(MASTERY.finaleDelay);
  });

  it('is absent before it is due, then opens a ring, glints the medals once and knocks the plaque', () => {
    expect(masteryPose(-0.1)).toBeNull();
    expect(masteryPose(-Infinity)).toBeNull();
    const early = masteryPose(0.05)!, mid = masteryPose(MASTERY.ring)!, late = masteryPose(MASTERY.hold + 1)!;
    expect(early.ring.spread).toBeLessThan(mid.ring.spread);
    expect(mid.ring.spread).toBeGreaterThan(0.95);
    expect(early.flash).toBeGreaterThan(0);
    expect(masteryPose(MASTERY.flash / 2)!.flash).toBeCloseTo(1, 5);
    expect(masteryPose(MASTERY.flash)!.flash).toBe(0);
    expect(early.knock).toBeGreaterThan(0);
    expect(late.ring.alpha).toBe(0);
    expect(late.knock).toBeLessThan(0.001);
    expect(late.label.alpha).toBe(1);
    expect(late.label.rise).toBeCloseTo(0, 5);
  });

  it('is a static plate and a fading ring under reduced motion', () => {
    const still = masteryPose(0.1, true)!;
    expect(still).toMatchObject({ flash: 0, knock: 0, label: { rise: 0, alpha: 1 } });
    expect(still.ring.spread).toBe(1);
    expect(masteryPose(MASTERY.hold, true)!.ring.alpha).toBe(0);
  });

  it('takes a row under the plaque, after a finale\'s card and before a keepsake', () => {
    const frame = { s: 1, width: 680, top: 190, preferredTop: 300, blockTop: 1400, replayHeight: 96 };
    const plan = planResult(frame, { refund: false, finale: true, mastery: true, strip: false, keepsake: 180, replay: false });
    expect(plan.rows.map(r => r.kind)).toEqual(['finale', 'mastery', 'keepsake']);
    expect(plan.rows[1]!.height).toBe(RESULT_ROWS.mastery);
    const bare = planResult(frame, { refund: false, finale: false, strip: false, keepsake: 0, replay: false });
    expect(bare.rows).toEqual([]);
  });
});

describe('the accents', () => {
  it('are short, bounded and end in silence', () => {
    const rate = 48_000;
    for (const kind of ['shaker', 'chime', 'sting'] as const) {
      const data = synthesizeGroove(rate, kind);
      expect(data.length).toBeGreaterThan(rate * 0.05);
      let peak = 0;
      for (const v of data) { expect(Number.isFinite(v)).toBe(true); peak = Math.max(peak, Math.abs(v)); }
      expect(peak).toBeLessThanOrEqual(1);
      expect(peak).toBeGreaterThan(0.05);
      const tail = data.subarray(data.length - Math.round(rate * 0.01));
      expect(Math.max(...Array.from(tail).map(Math.abs))).toBeLessThan(0.05);
    }
  });

  it('keep the shaker inside one beat at the fastest tempo, so it never reaches the next count', () => {
    const rate = 48_000;
    expect(synthesizeGroove(rate, 'shaker').length / rate).toBeLessThan(60 / 200);
  });

  it('are deterministic', () => {
    expect(synthesizeGroove(22_050, 'chime')).toEqual(synthesizeGroove(22_050, 'chime'));
  });
});
