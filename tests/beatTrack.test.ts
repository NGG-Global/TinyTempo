import { describe, expect, it, vi } from 'vitest';
import { beatsPlayed, countIn, fuse, ghostRing, GO_HOLD_BEATS, handover, handoverAt, isFlawless, isLastRestBar, markFor, restCopy, restProgress, trackGeometry, turnCount, turnCountPose } from '../src/game/beatTrack';
import { PROGRESSION } from '../src/config/progression';
import { breatherTask, levelSpec, openingBeats } from '../src/game/levels';
import { createRoundPlan } from '../src/rhythm/RhythmScheduler';
import { parsePattern } from '../src/rhythm/patterns';
import type { Judgement } from '../src/rhythm/judge';

// `levelSpec` reaches the registry, and the acts import Phaser.
vi.mock('phaser', () => ({ default: {} }));

const hit = (grade: 'Perfect' | 'Good'): Judgement => ({ kind: 'hit', grade, index: 0, deltaMs: 10 });

describe('what the beat track is showing', () => {
  it('reads a mark off the judge rather than deciding anything itself', () => {
    expect(markFor(null)).toBe('pending');
    expect(markFor(undefined)).toBe('pending');
    expect(markFor(hit('Perfect'))).toBe('perfect');
    expect(markFor(hit('Good'))).toBe('good');
    expect(markFor({ kind: 'omission', grade: 'Miss', index: 2, deltaMs: null })).toBe('miss');
  });

  it('leaves the row unmarked for an extra tap, which belongs to no beat', () => {
    expect(markFor({ kind: 'extra', grade: 'Miss', index: null, deltaMs: 300 })).toBe('pending');
  });

  it('centres the beads and keeps the longest pattern inside the frame', () => {
    for (const count of [3, 4, 5, 6, 7, 8, 9]) {
      const width = 560;
      const { centres, radius, gap } = trackGeometry(count, width);
      expect(centres).toHaveLength(count);
      // Symmetric about the centre, so the row sits under the action wherever that is.
      expect(centres[0]! + centres[count - 1]!).toBeCloseTo(0, 6);
      // Evenly pitched.
      if (count > 1) expect(centres[1]! - centres[0]!).toBeCloseTo(gap, 6);
      // Nothing, bead edge included, may leave the frame.
      expect(Math.abs(centres[count - 1]!) + radius).toBeLessThanOrEqual(width / 2 + 0.001);
      expect(radius).toBeGreaterThan(0);
    }
  });

  it('shrinks the pitch before the beads, and degenerates safely', () => {
    expect(trackGeometry(9, 120).gap).toBeLessThan(trackGeometry(9, 560).gap);
    expect(trackGeometry(1, 560).centres).toEqual([0]);
    expect(trackGeometry(0, 560).centres).toEqual([]);
    expect(trackGeometry(4, 0).centres).toEqual([]);
    expect(trackGeometry(4, Number.NaN).centres).toEqual([]);
  });

  it('counts demonstration beats from the plan and never goes backwards', () => {
    const plan = createRoundPlan(1, parsePattern('p', 'X X - X'), 120, 0, 4);
    expect(beatsPlayed(null, 99)).toBe(0);
    expect(beatsPlayed(plan, plan.demo - 0.001)).toBe(0);
    let previous = 0;
    for (let t = 0; t <= plan.end; t += 0.02) {
      const played = beatsPlayed(plan, t);
      expect(played).toBeGreaterThanOrEqual(previous);
      previous = played;
    }
    // Every action cue has sounded by the time the player's turn ends.
    expect(beatsPlayed(plan, plan.end)).toBe(plan.targets.length);
  });

  it('shows the last four lead ticks, and nothing once the demonstration starts', () => {
    const plan = createRoundPlan(1, parsePattern('p', 'X X - X'), 120, 0, 4);
    expect(countIn(null, 0)).toBeNull();
    expect(countIn(plan, plan.demo)).toBeNull();
    expect(countIn(plan, plan.demo + 1)).toBeNull();
    // It fills across the bar and is full on the last tick before the demonstration.
    expect(countIn(plan, 0)).toBe(1);
    const beat = 60 / 120;
    expect(countIn(plan, 3 * beat)).toBe(4);
  });

  it('treats a long breather as a rest, not a count of sixteen', () => {
    const plan = createRoundPlan(1, parsePattern('p', 'X X - X'), 120, 0, 16);
    const beat = 60 / 120;
    // Early in the breather there is nothing to count down to yet.
    expect(countIn(plan, 2 * beat)).toBeNull();
    // The row arrives one beat before the first of the final four ticks.
    expect(countIn(plan, 11 * beat)).toBe(0);
    expect(countIn(plan, 12 * beat)).toBe(1);
    expect(countIn(plan, 15 * beat)).toBe(4);
  });
});

describe('the breather\'s rest', () => {
  const lead = PROGRESSION.breatherBars * 4;
  const breather = (bpm = 120, start = 40) => createRoundPlan(1, parsePattern('p', 'X X - X'), bpm, start, lead);

  it('returns null outside a breather', () => {
    expect(restProgress(null, 0)).toBeNull();
    // A level's opening bar and a finale's longer opening are lead-ins, not rests.
    for (const beats of [0, 4, 8]) {
      const plan = createRoundPlan(1, parsePattern('p', 'X X - X'), 120, 0, beats);
      for (let t = -1; t < plan.demo; t += 0.05) expect(restProgress(plan, t)).toBeNull();
    }
    expect(openingBeats(10)).not.toBe(lead);
    expect(openingBeats(11)).not.toBe(lead);
    // Before its beat of warning there is nothing to show.
    const plan = breather();
    expect(restProgress(plan, plan.start - 60 / plan.bpm - 0.01)).toBeNull();
    expect(restProgress(plan, Number.NaN)).toBeNull();
  });

  it('is bar 0 beat 0 at the first lead cue, and bar 3 beat 3 on the last', () => {
    for (const bpm of [120, 136, 150]) {
      const plan = breather(bpm);
      const cues = plan.cues.filter(cue => cue.kind !== 'action');
      expect(restProgress(plan, cues[0]!.time)).toMatchObject({ bar: 0, beat: 0, bars: PROGRESSION.breatherBars, at: cues[0]!.time });
      expect(restProgress(plan, cues.at(-1)!.time)).toMatchObject({ bar: 3, beat: 3, bars: 4 });
      // The beat of warning: the tiles are up with nothing played.
      expect(restProgress(plan, cues[0]!.time - 0.5 * 60 / bpm)).toMatchObject({ bar: 0, beat: -1 });
    }
  });

  it('returns null once the demonstration starts', () => {
    const plan = breather();
    expect(restProgress(plan, plan.demo - 0.001)).not.toBeNull();
    expect(restProgress(plan, plan.demo)).toBeNull();
    expect(restProgress(plan, plan.response)).toBeNull();
  });

  it('is monotonic across the lead-in, a beat at a time, and never numbers the beats', () => {
    const plan = breather(133);
    let previous = -2;
    const seen = new Set<number>();
    for (let t = plan.start - 60 / plan.bpm; t < plan.demo; t += 0.004) {
      const rest = restProgress(plan, t)!;
      const at = rest.bar * 4 + rest.beat;
      expect(at).toBeGreaterThanOrEqual(previous);
      expect(at - previous).toBeLessThanOrEqual(1);
      expect(rest.beat).toBeLessThan(4);
      previous = at;
      seen.add(at);
    }
    expect(seen.size).toBe(lead + 1);
    expect(previous).toBe(lead - 1);
  });

  it('hands over in the last bar: 3, 2, 1 bars to go, then Get ready with no caption', () => {
    const plan = breather();
    const beat = 60 / plan.bpm;
    const at = (bar: number, b = 1) => restProgress(plan, plan.start + (bar * 4 + b) * beat + 0.01)!;
    expect(restCopy(at(0))).toEqual({ headline: 'Breathe', label: 'Halfway', caption: '3 bars to go' });
    expect(restCopy(at(1)).caption).toBe('2 bars to go');
    expect(restCopy(at(2)).caption).toBe('1 bar to go');
    expect(isLastRestBar(at(2, 3))).toBe(false);
    expect(isLastRestBar(at(3, 0))).toBe(true);
    expect(restCopy(at(3))).toEqual({ headline: 'Get ready', label: 'Last bar', caption: '' });
    // The last bar is exactly where the count-in's pips run, so the two agree.
    for (let b = 0; b < 4; b++) expect(countIn(plan, plan.start + (12 + b) * beat + 0.01)).toBe(b + 1);
    expect(countIn(plan, plan.start + 11 * beat + 0.01)).toBe(0);
  });

  it('matches the breather a long level really carries', () => {
    for (const level of [34, 60, 90]) {
      const spec = levelSpec(level);
      const index = breatherTask(spec.tasks.length);
      if (index < 0) continue;
      expect(spec.tasks[index]!.leadBeats).toBe(lead);
    }
  });
});

describe('the handover', () => {
  const plan = (bpm = 120, lead = 4) => createRoundPlan(1, parsePattern('p', 'X X - X'), bpm, 100, lead);

  it('opens inside the demonstration, two beats before the first target', () => {
    const p = plan();
    const beat = 60 / p.bpm;
    expect(handoverAt(p)).toBeCloseTo(p.targets[0]! - 2 * beat);
    // The point of the whole design: it is the example's own last beats, not new ones.
    expect(handoverAt(p)).toBeGreaterThan(p.demo);
    expect(handoverAt(p)).toBeLessThan(p.response);
  });

  it('has finished arriving by the downbeat, and has not started before it opens', () => {
    const p = plan();
    const first = p.targets[0]!;
    expect(handover(p, handoverAt(p) - 0.001).runway).toBe(0);
    expect(handover(p, handoverAt(p)).runway).toBe(0);
    // Nothing new may appear on the beat it announces.
    expect(handover(p, first).runway).toBe(1);
    expect(handover(p, first).yours).toBe(0);
    expect(handover(p, first + 60 / p.bpm * 0.18).yours).toBe(1);
  });

  it('is a fraction of the runway at the midpoint, whatever the tempo', () => {
    for (const bpm of [80, 120, 150]) {
      const p = plan(bpm);
      const mid = handoverAt(p) + (p.targets[0]! - handoverAt(p)) / 2;
      expect(handover(p, mid).runway).toBeCloseTo(0.5);
      expect(handover(p, mid).yours).toBe(0);
    }
  });

  it('survives a missing plan and a clock that has not started', () => {
    expect(handoverAt(null)).toBe(Infinity);
    expect(handover(null, 10)).toEqual({ runway: 0, yours: 0 });
    expect(handover(plan(), Number.NaN)).toEqual({ runway: 0, yours: 0 });
  });

  it('lights the sockets left to right, and all of them once the turn has arrived', () => {
    const early = { runway: 0.2, yours: 0 };
    expect(fuse(early, 0)).toBeGreaterThan(fuse(early, 1));
    expect(fuse(early, 1)).toBeGreaterThanOrEqual(fuse(early, 2));
    expect(fuse({ runway: 1, yours: 0 }, 3)).toBe(1);
    // An interrupted or stepped handover still ends with every socket lit.
    for (let i = 0; i < 8; i++) expect(fuse({ runway: 0, yours: 1 }, i)).toBe(1);
  });
});

describe('the count into the turn', () => {
  const plan = (bpm = 120, lead = 4) => createRoundPlan(1, parsePattern('p', 'X X - X'), bpm, 100, lead);

  it('lands each numeral on its own beat, and the Go on the first target', () => {
    for (const bpm of [80, 120, 168]) {
      const p = plan(bpm);
      const beat = 60 / bpm;
      const first = p.targets[0]!;
      for (const n of [3, 2, 1]) {
        // On the beat, and still showing the same numeral a hair before the next one.
        expect(turnCount(p, first - n * beat)?.count).toBe(n);
        expect(turnCount(p, first - n * beat + beat * 0.99)?.count).toBe(n);
      }
      expect(turnCount(p, first)?.count).toBe(0);
      expect(turnCount(p, first)?.age).toBeCloseTo(0);
    }
  });

  it('is a count-in: it opens inside the example and never before it', () => {
    const p = plan();
    const beat = 60 / p.bpm;
    const first = p.targets[0]!;
    expect(turnCount(p, first - 3 * beat - 0.001)).toBeNull();
    expect(turnCount(p, first - 3 * beat)).not.toBeNull();
    // The example is running while the count runs; nothing is added to the loop.
    expect(first - 3 * beat).toBeGreaterThan(p.demo);
    // And it opens a beat ahead of the block's own handover, so the first numeral is a
    // heads-up rather than one more thing arriving with the baton.
    expect(first - 3 * beat).toBeLessThan(handoverAt(p));
  });

  it('swells toward the turn, so the example keeps the attention until it is over', () => {
    const p = plan();
    const beat = 60 / p.bpm;
    const first = p.targets[0]!;
    const weights = [3, 2, 1, 0].map(n => turnCount(p, first - n * beat)!.weight);
    for (let i = 1; i < weights.length; i++) expect(weights[i]!).toBeGreaterThan(weights[i - 1]!);
    expect(weights[0]!).toBeLessThan(0.3);
    expect(weights.at(-1)!).toBe(1);
  });

  it('holds the Go for part of a beat and then empties the slot', () => {
    const p = plan();
    const beat = 60 / p.bpm;
    const first = p.targets[0]!;
    expect(turnCount(p, first + beat * GO_HOLD_BEATS * 0.99)?.count).toBe(0);
    expect(turnCount(p, first + beat * GO_HOLD_BEATS)).toBeNull();
  });

  it('never counts to a beat that is not there, and never runs backwards', () => {
    const p = plan();
    let previous = Infinity;
    for (let t = p.start; t <= p.end; t += 0.01) {
      const call = turnCount(p, t);
      if (!call) continue;
      expect(call.count).toBeLessThanOrEqual(3);
      expect(call.count).toBeGreaterThanOrEqual(0);
      expect(call.age).toBeGreaterThanOrEqual(0);
      expect(call.count).toBeLessThanOrEqual(previous);
      previous = call.count;
    }
    expect(previous).toBe(0);
  });

  it('survives a missing plan, a stopped clock and a count of none', () => {
    expect(turnCount(null, 10)).toBeNull();
    expect(turnCount(plan(), Number.NaN)).toBeNull();
    expect(turnCount(plan(), plan().targets[0]!, 0)).toBeNull();
  });
});

describe('the guiding ring', () => {
  it('contracts onto its socket over the beat before it is due, then goes', () => {
    const beat = 0.5;
    const target = 10;
    expect(ghostRing(target, beat, target - beat).alpha).toBe(0);
    const closing = ghostRing(target, beat, target - beat * 0.45);
    expect(closing.alpha).toBeGreaterThan(0.5);
    expect(closing.radius).toBeLessThan(1);
    expect(closing.radius).toBeGreaterThan(0);
    expect(ghostRing(target, beat, target).radius).toBeCloseTo(0);
    expect(ghostRing(target, beat, target).alpha).toBeCloseTo(1);
    // It says where, not when: it is gone well inside the beat it pointed at.
    expect(ghostRing(target, beat, target + 0.14).alpha).toBe(0);
  });

  it('shows nothing rather than throwing on a degenerate plan', () => {
    expect(ghostRing(Number.NaN, 0.5, 1).alpha).toBe(0);
    expect(ghostRing(10, 0, 1).alpha).toBe(0);
  });
});

describe('how a numeral of the count is posed', () => {
  const plan = createRoundPlan(1, parsePattern('p', 'X X - X'), 120, 100, 4);
  const beat = 60 / plan.bpm;
  const first = plan.targets[0]!;
  const at = (n: number, into: number) => turnCount(plan, first - n * beat + into)!;

  it('strikes: oversized and above its line on the beat, at rest inside the beat', () => {
    const struck = turnCountPose(at(3, 0), beat, false);
    expect(struck.scale).toBeGreaterThan(1.3);
    expect(struck.rise).toBeLessThan(-20);
    const rested = turnCountPose(at(3, beat * 0.9), beat, false);
    expect(rested.scale).toBeCloseTo(1, 5);
    expect(rested.rise).toBeCloseTo(0, 5);
    expect(rested.alpha).toBeGreaterThan(0.5);
  });

  it('drives past its rest size on the way down, so the settle reads as a landing', () => {
    let smallest = Infinity;
    for (let age = 0; age < beat * 0.4; age += beat * 0.01) smallest = Math.min(smallest, turnCountPose(at(2, age), beat, false).scale);
    expect(smallest).toBeLessThan(0.97);
  });

  it('leans alternate ways from one numeral to the next, and the Go stands up', () => {
    const three = turnCountPose(at(3, beat * 0.5), beat, false).tilt;
    const two = turnCountPose(at(2, beat * 0.5), beat, false).tilt;
    const one = turnCountPose(at(1, beat * 0.5), beat, false).tilt;
    expect(Math.sign(three)).not.toBe(Math.sign(two));
    expect(Math.sign(two)).not.toBe(Math.sign(one));
    // The Go shimmies off its strike and is upright well inside its hold.
    expect(Math.abs(turnCountPose(turnCount(plan, first + beat * 0.5)!, beat, false).tilt)).toBeLessThan(0.01);
  });

  it('warms from the ink toward coral one strike at a time, full on the Go', () => {
    const heats = [3, 2, 1].map(n => turnCountPose(at(n, 0), beat, false).heat);
    expect(heats[0]).toBe(0);
    expect(heats[1]).toBeGreaterThan(heats[0]!);
    expect(heats[2]).toBeGreaterThan(heats[1]!);
    expect(turnCountPose(turnCount(plan, first)!, beat, false).heat).toBe(1);
  });

  it('leaves a ring on each strike that spreads and is gone before the next beat', () => {
    const early = turnCountPose(at(2, beat * 0.1), beat, false).ring;
    const late = turnCountPose(at(2, beat * 0.4), beat, false).ring;
    expect(early.alpha).toBeGreaterThan(late.alpha);
    expect(late.spread).toBeGreaterThan(early.spread);
    expect(turnCountPose(at(2, beat * 0.95), beat, false).ring.alpha).toBe(0);
  });

  it('is the Go leaving over the back of its hold, and never before the numerals have had their say', () => {
    const go = (into: number) => turnCountPose(turnCount(plan, first + into)!, beat, false);
    expect(go(beat * 0.3).alpha).toBeGreaterThan(go(beat * GO_HOLD_BEATS * 0.9).alpha);
    expect(turnCountPose(at(1, beat * 0.9), beat, false).alpha).toBeGreaterThan(0.5);
  });

  it('keeps the information and drops the motion under reduced motion', () => {
    const pose = turnCountPose(at(3, 0), beat, true);
    expect(pose).toMatchObject({ scale: 1, rise: 0, tilt: 0 });
    expect(pose.alpha).toBeGreaterThan(0.5);
    expect(pose.ring.alpha).toBe(0);
    expect(pose.heat).toBe(0);
  });
});

describe('a flawless task', () => {
  it('is every beat Perfect, and nothing less', () => {
    expect(isFlawless(['perfect', 'perfect', 'perfect'])).toBe(true);
    expect(isFlawless(['perfect', 'good', 'perfect'])).toBe(false);
    expect(isFlawless(['perfect', 'pending'])).toBe(false);
    expect(isFlawless(['perfect', 'miss'])).toBe(false);
  });

  it('needs at least one beat to have been answered', () => {
    expect(isFlawless([])).toBe(false);
  });
});
