import { describe, expect, it, vi } from 'vitest';
import { RoundController, type RoundEvents } from '../src/game/RoundController';
import { parsePattern } from '../src/rhythm/patterns';
import { RHYTHM } from '../src/config/rhythm';

/** Defaults to a level's opening task, the only one that still carries a count-in. */
function setup(leadBeats = RHYTHM.leadInBeats) {
  const events: RoundEvents = { phase: vi.fn(), cue: vi.fn(), tap: vi.fn(), judgement: vi.fn(), complete: vi.fn(), interrupted: vi.fn() };
  const sound = { play: vi.fn(), cancel: vi.fn() };
  const round = new RoundController(sound, events);
  let now = 0;
  const advance = (until: number) => {
    while (now + 0.02 < until) { now += 0.02; round.tick(now, now * 1000); }
    now = until; round.tick(now, now * 1000);
  };
  round.start(parsePattern('p', 'X X - X'), 100, 0, 0, RHYTHM.leadSec, leadBeats);
  return { round, events, sound, advance };
}

describe('round lifecycle', () => {
  it('accepts a shared musical start without adding another setup lead', () => {
    const { round } = setup();
    round.start(parsePattern('p', 'X X - X'), 100, 10, 10000, 12, RHYTHM.leadInBeats);
    expect(round.plan!.start).toBe(12);
    expect(round.plan!.demo).toBeCloseTo(14.4);
    expect(round.plan!.cues.filter(c => c.kind === 'count').map(c => c.time)).toEqual([12, 12.6, 13.2]);
    expect(round.plan!.cues.filter(c => c.kind === 'ready').map(c => c.time)).toEqual([13.8]);
    // Every task after the first begins on its demonstration, with nothing counted in.
    round.start(parsePattern('p', 'X X - X'), 100, 10, 10000, 20);
    expect(round.plan!.demo).toBe(20);
    expect(round.plan!.cues.every(c => c.kind === 'action')).toBe(true);
  });
  it('runs watch/response/result with one completion and no response ghosts', () => {
    const { round, events, sound, advance } = setup();
    const plan = round.plan!;
    expect(round.tap(plan.demo, plan.demo, 0)).toBeNull();
    for (const target of plan.targets) {
      advance(target);
      expect(round.tap(target, target, target * 1000)?.grade).toBe('Perfect');
    }
    advance(plan.end + 0.3);
    expect(round.result?.accuracy).toBe(100);
    expect(events.complete).toHaveBeenCalledTimes(1);
    advance(plan.end + 1);
    expect(events.complete).toHaveBeenCalledTimes(1);
    expect(sound.play).toHaveBeenCalledTimes(plan.cues.length + plan.targets.length);
    expect(events.phase).toHaveBeenCalledWith('demonstrate');
    expect(events.phase).toHaveBeenCalledWith('respond');
  });
  it('retains the early first-hit window before the rendered respond phase', () => {
    const { round, events, sound, advance } = setup();
    const early = round.plan!.response - 0.1;
    advance(early);
    // The demonstration now runs right up to the response, so an early first tap lands
    // while the demonstration is still the rendered phase. It is still eligible.
    const plays = sound.play.mock.calls.length;
    expect(round.phase).toBe('demonstrate');
    expect(round.tap(early, early, early * 1000)?.grade).toBe('Good');
    expect(events.tap).not.toHaveBeenCalled();
    expect(sound.play).toHaveBeenCalledTimes(plays);
    advance(round.plan!.response);
    expect(round.phase).toBe('respond');
    expect(events.tap).toHaveBeenCalledTimes(1);
    expect(sound.play).toHaveBeenCalledTimes(plays + 1);
  });
  it('uses capture time even when a callback is delivered late', () => {
    const { round, advance } = setup();
    const target = round.plan!.targets[0]!;
    advance(target + 0.1);
    expect(round.tap(target, target + 0.1, (target + 0.1) * 1000)?.grade).toBe('Perfect');
  });
  it('tolerates a stall that ends inside the count-in, since nothing has been shown or judged yet', () => {
    const { round, events } = setup();
    round.tick(0.02, 20);
    round.tick(1.5, 1500); // 1.48 s without a pump, still before the demonstration at 2.6 s
    expect(round.phase).toBe('prepare');
    expect(events.interrupted).not.toHaveBeenCalled();
    round.tick(1.52, 1520);
    round.tick(2.7, 2700); // the same gap reaching the demonstration is a real stall
    expect(round.phase).toBe('paused');
    expect(events.interrupted).toHaveBeenCalledTimes(1);
  });
  it('forgives a stall before the first demonstration beat even with nothing counted in', () => {
    const events: RoundEvents = { phase: vi.fn(), cue: vi.fn(), tap: vi.fn(), judgement: vi.fn(), complete: vi.fn(), interrupted: vi.fn() };
    const round = new RoundController({ play: vi.fn(), cancel: vi.fn() }, events);
    // A task swapped in mid-level has no count-in, so the old rule left no window at all
    // for the heavy frames that build it. What matters is that no beat has been hidden.
    // A leading rest, so the demonstration is already the rendered phase while the first
    // beat is still ahead: the plan starts at 1 s and its first beat sounds at 1.6 s.
    round.start(parsePattern('p', '- X X - X'), 100, 0, 0, 1);
    round.tick(0.02, 20);
    round.tick(1.5, 1500); // 1.48 s without a pump, still before the first beat
    expect(round.phase).toBe('demonstrate');
    expect(events.interrupted).not.toHaveBeenCalled();
    round.tick(1.52, 1520);
    round.tick(2, 2000); // a shorter gap that reaches the first beat is a real stall
    expect(round.phase).toBe('paused');
    expect(events.interrupted).toHaveBeenCalledTimes(1);
  });
  it('lands a late last demonstration beat before a held first tap', () => {
    const events: RoundEvents = { phase: vi.fn(), cue: vi.fn(), tap: vi.fn(), judgement: vi.fn(), complete: vi.fn(), interrupted: vi.fn() };
    const round = new RoundController({ play: vi.fn(), cancel: vi.fn() }, events);
    // Last pair is a half beat: at 150 BPM that gap is 200 ms, inside stallMs.
    round.start(parsePattern('p', 'X - X - - - X X', 0.5), 150, 0, 0, 0);
    const plan = round.plan!;
    const lastDemo = plan.cues.filter(cue => cue.kind === 'action').at(-1)!.time;
    expect(plan.response - lastDemo).toBeLessThan(RHYTHM.stallMs / 1000);
    let now = 0;
    const until = lastDemo - 0.01;
    while (now + 0.02 < until) { now += 0.02; round.tick(now, now * 1000); }
    now = until; round.tick(now, now * 1000);
    expect(round.phase).toBe('demonstrate');
    const early = plan.response - 0.05;
    expect(round.tap(early, early, early * 1000)?.kind).toBe('hit');
    expect(events.tap).not.toHaveBeenCalled();
    round.tick(plan.response + 0.02, (plan.response + 0.02) * 1000);
    expect(round.phase).toBe('respond');
    const lastDemoOrder = vi.mocked(events.cue).mock.calls.findIndex(call => call[0].kind === 'action' && call[0].time === lastDemo);
    expect(lastDemoOrder).toBeGreaterThanOrEqual(0);
    const cueOrder = vi.mocked(events.cue).mock.invocationCallOrder[lastDemoOrder]!;
    const tapOrder = vi.mocked(events.tap).mock.invocationCallOrder[0]!;
    expect(cueOrder).toBeLessThan(tapOrder);
  });
  it('invalidates a long stall before recording unfair misses', () => {
    const { round, events } = setup();
    round.tick(9, 9000);
    expect(round.phase).toBe('paused');
    expect(round.result).toBeNull();
    expect(events.judgement).not.toHaveBeenCalled();
    expect(events.interrupted).toHaveBeenCalledTimes(1);
  });
  it('restarts repeatedly and ignores input from old attempts', () => {
    const { round, advance, events } = setup();
    const old = round.plan!;
    for (let i = 0; i < 50; i++) round.start(old.pattern, 120, 0, 0);
    expect(round.plan!.id).toBe(51);
    const current = round.plan!;
    advance(current.end + 0.3);
    expect(events.complete).toHaveBeenCalledTimes(1);
    expect(round.result).toMatchObject({ accuracy: 0, missed: 3 });
    expect(round.tap(old.targets[0]!, 20, 20000)).toBeNull();
    round.dispose(); round.dispose();
    expect(round.plan).toBeNull();
  });
});
