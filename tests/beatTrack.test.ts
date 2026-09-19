import { describe, expect, it } from 'vitest';
import { beatsPlayed, countIn, fuse, ghostRing, handover, handoverAt, markFor, trackGeometry } from '../src/game/beatTrack';
import { createRoundPlan } from '../src/rhythm/RhythmScheduler';
import { parsePattern } from '../src/rhythm/patterns';
import type { Judgement } from '../src/rhythm/judge';

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
