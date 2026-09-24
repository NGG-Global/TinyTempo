import { afterEach, describe, expect, it, vi } from 'vitest';
import { MusicSystem, detectLeadIn, normalizeLoop, validateLoopBuffer } from '../src/audio/MusicSystem';
import { MUSIC, GAMEPLAY_ARRANGEMENTS, loopSeconds, pickupSeconds } from '../src/config/music';

// A 100 Hz "sample rate" keeps the fake buffers tiny while exercising real frame arithmetic.
const RATE = 100;
const FILE_FRAMES = 11993; // 119.93 s: 75 ms short of 60 bars, like the delivered master.
const LEAD = 18; // the opening transient at 0.18 s in the decoded MP3
function fakeBuffer(length: number, rate = RATE, channels = 2, onset = LEAD) {
  const data = Array.from({ length: channels }, () => new Float32Array(length));
  if (length > onset) data[1]![onset] = 0.5; // one decoded transient after silence
  return { length, sampleRate: rate, duration: length / rate, numberOfChannels: channels,
    getChannelData: (c: number) => data[c]!,
    copyToChannel: (source: Float32Array, c: number) => { data[c]!.set(source.subarray(0, length)); } };
}
afterEach(() => vi.unstubAllGlobals());

function setup(empty = false) {
  const nodes: ReturnType<typeof makeSource>[] = [];
  const makeSource = () => ({ buffer: null as { length: number } | null, loop: false, loopStart: -1, loopEnd: -1, playbackRate: { value: 0, setValueAtTime: vi.fn() },
    start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), onended: null });
  const gains: { gain: { value: number; cancelScheduledValues: ReturnType<typeof vi.fn>; setValueAtTime: ReturnType<typeof vi.fn>; linearRampToValueAtTime: ReturnType<typeof vi.fn> }; disconnect: ReturnType<typeof vi.fn> }[] = [];
  const context = {
    currentTime: 10, state: 'running',
    decodeAudioData: vi.fn(async () => fakeBuffer(empty ? 0 : FILE_FRAMES)),
    createBuffer: (channels: number, length: number, rate: number) => fakeBuffer(length, rate, channels, Infinity),
    createGain: () => {
      const node = { gain: { value: 1, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() };
      gains.push(node); return node;
    },
    createBufferSource: () => { const source = makeSource(); nodes.push(source); return source; },
  };
  const fetcher = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(16) }));
  vi.stubGlobal('fetch', fetcher);
  return { system: new MusicSystem(context as unknown as AudioContext, {} as AudioNode), context, nodes, gains, fetcher };
}

describe('the premixed music loop', () => {
  it('loads once and schedules a full-buffer loop from offset zero', async () => {
    const { system, nodes, fetcher, context } = setup();
    expect(() => system.start()).toThrow(/Load the music track/);
    const first = system.load();
    expect(system.load()).toBe(first);
    await first;
    // One request and one decode: the seven-stem load cost seven of each and ~307 MiB of PCM.
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(GAMEPLAY_ARRANGEMENTS.a.url, expect.anything());
    expect(context.decodeAudioData).toHaveBeenCalledTimes(1);
    expect(system.start(12)).toBeCloseTo(12 + pickupSeconds(MUSIC.sourceBpm, MUSIC.pickupBeats), 9);
    expect(system.leadInSeconds).toBeCloseTo(LEAD / RATE, 9);
    expect(nodes).toHaveLength(1);
    const node = nodes[0]!;
    expect(node.start).toHaveBeenCalledExactlyOnceWith(12, 0);
    expect(node.loop).toBe(true);
    expect(node.loopStart).toBe(0);
    expect(node.loopEnd).toBe(loopSeconds());
    expect(node.buffer!.length).toBe(loopSeconds() * RATE);
    expect(node.playbackRate.value).toBe(1);
    await system.load();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('detects the lead-in from the opening transient and falls back outside the plausible range', () => {
    expect(detectLeadIn(fakeBuffer(FILE_FRAMES) as unknown as AudioBuffer, 0.01, 0.5)).toBe(LEAD);
    expect(detectLeadIn(fakeBuffer(FILE_FRAMES) as unknown as AudioBuffer, 0.9, 0.5)).toBe(50);
    expect(detectLeadIn(fakeBuffer(4) as unknown as AudioBuffer, 0.01, 0.5)).toBe(50);
    // A crossing too early to be the downbeat is a decoder artefact or the wrong file: a
    // false trigger accepted here would shift the whole beat grid against the music for good.
    expect(detectLeadIn(fakeBuffer(FILE_FRAMES, RATE, 2, 1) as unknown as AudioBuffer, 0.01, 0.5)).toBe(50);
    // A crossing beyond the window is never reached, so it falls back rather than reporting it.
    expect(detectLeadIn(fakeBuffer(FILE_FRAMES, RATE, 2, 400) as unknown as AudioBuffer, 0.01, 0.5)).toBe(50);
    // The shipped bounds have to admit the shipped file: ~0.156 s of export pre-roll plus
    // whatever decoder delay the platform leaves in.
    expect(MUSIC.leadIn.fallbackSec).toBeGreaterThan(MUSIC.leadIn.minSec);
    expect(MUSIC.leadIn.fallbackSec).toBeLessThan(MUSIC.leadIn.maxSec);
  });
  it('normalizes the track into an exact whole-bar loop: drops the lead-in and pads the tail', () => {
    const source = fakeBuffer(FILE_FRAMES);
    for (let i = 0; i < FILE_FRAMES; i++) source.getChannelData(0)[i] = i;
    const lead = LEAD;
    const loop = normalizeLoop({ createBuffer: (c: number, l: number, r: number) => fakeBuffer(l, r, c) } as unknown as AudioContext, source as unknown as AudioBuffer, lead);
    expect(loop.length).toBe(loopSeconds() * RATE);
    expect(loop.getChannelData(0)[0]).toBe(lead);
    expect(loop.getChannelData(0)[FILE_FRAMES - lead - 1]).toBe(FILE_FRAMES - 1);
    expect(loop.getChannelData(0)[FILE_FRAMES - lead]).toBe(0);
    expect(loop.getChannelData(0)[loop.length - 1]).toBe(0);
    expect(() => normalizeLoop({} as AudioContext, fakeBuffer(lead) as unknown as AudioBuffer, lead)).toThrow(/lead-in/);
    expect(() => normalizeLoop({} as AudioContext, source as unknown as AudioBuffer, 1.5)).toThrow(/whole number/);
  });
  it('keeps the one source running through a silent gain, restoration and multiple loops', async () => {
    const { system, nodes, gains, context } = setup();
    await system.load(); system.start(12);
    expect(system.gain).toBe(MUSIC.masterGain);
    system.setGain(0); expect(system.gain).toBe(0);
    system.setGain(MUSIC.masterGain, 0);
    expect(gains[0]!.gain.setValueAtTime).toHaveBeenCalledWith(MUSIC.masterGain, context.currentTime);
    expect(system.gain).toBe(MUSIC.masterGain);
    context.currentTime = 12 + system.duration * 3; // three whole loops after the scheduled start
    system.setGain(MUSIC.masterGain);
    expect(system.gain).toBe(MUSIC.masterGain);
    expect(system.activeSources).toBe(1);
    expect(system.completedLoops).toBe(3);
    expect(system.playbackGeneration).toBe(1);
    expect(nodes[0]!.start).toHaveBeenCalledTimes(1);
    expect(nodes[0]!.stop).not.toHaveBeenCalled();
    expect(gains[0]!.gain.linearRampToValueAtTime).toHaveBeenCalled();
  });
  it('cleans the old source on restart and disposes idempotently', async () => {
    const { system, nodes } = setup();
    await system.load(); system.start(12); system.start(14);
    expect(system.activeSources).toBe(1);
    expect(nodes).toHaveLength(2);
    expect(nodes[0]!.stop).toHaveBeenCalledTimes(1);
    expect(nodes[0]!.disconnect).toHaveBeenCalledTimes(1);
    system.dispose(); system.dispose();
    expect(system.activeSources).toBe(0);
    for (const node of nodes) expect(node.stop).toHaveBeenCalledTimes(1);
    await expect(system.load()).rejects.toThrow(/disposed/);
  });
  it('rejects an empty decode without starting anything', async () => {
    const { system, nodes } = setup(true);
    await expect(system.load()).rejects.toThrow(/empty or invalid/);
    expect(system.ready).toBe(false); expect(nodes).toHaveLength(0);
  });
  it('can retry a failed fetch without committing a partial load', async () => {
    const { system, fetcher, nodes } = setup();
    fetcher.mockRejectedValueOnce(new Error('Network unavailable'));
    await expect(system.load()).rejects.toThrow(/Network/);
    expect(system.ready).toBe(false);
    expect(nodes).toHaveLength(0);
    await system.load();
    expect(system.ready).toBe(true);
  });
  it('ramps the tempo at one beat-aligned instant', async () => {
    const { system, nodes, context } = setup();
    await system.load(); system.start(12);
    expect(system.playbackRate).toBe(1);
    system.setRate(1.15, 20);
    expect(nodes[0]!.playbackRate.setValueAtTime).toHaveBeenCalledExactlyOnceWith(1.15, 20);
    expect(system.playbackRate).toBe(1.15);
    system.setRate(1, 5); // never in the past
    expect(nodes[0]!.playbackRate.setValueAtTime).toHaveBeenLastCalledWith(1, context.currentTime);
    expect(() => system.setRate(3, 20)).toThrow(/between/);
    expect(() => system.setRate(1, NaN)).toThrow(/finite/);
    system.start(30);
    expect(system.playbackRate).toBe(1);
  });
  it('rejects suspended or non-future starts and invalid gains', async () => {
    const { system, context, nodes } = setup();
    await system.load();
    expect(() => system.start(10)).toThrow(/future/);
    context.state = 'suspended';
    expect(() => system.start(12)).toThrow(/Unlock/);
    expect(() => system.setGain(NaN)).toThrow();
    expect(() => system.setGain(2)).toThrow();
    expect(nodes).toHaveLength(0);
  });
  it('does not commit a decoded buffer after disposal during loading', async () => {
    const { system, nodes } = setup();
    const loading = system.load(); system.dispose();
    await expect(loading).rejects.toThrow(/disposed/);
    expect(system.ready).toBe(false); expect(nodes).toHaveLength(0);
  });
  it('starts the count-in on the loop downbeat and validates the decoded track', () => {
    expect(pickupSeconds(MUSIC.sourceBpm, MUSIC.pickupBeats)).toBe(0);
    expect(pickupSeconds(100, 1)).toBe(0.6);
    expect(loopSeconds()).toBe(120);
    const buffer = { length: 5760000, sampleRate: 48000, duration: 120 } as AudioBuffer;
    expect(validateLoopBuffer(buffer)).toBe(buffer.duration);
    expect(() => validateLoopBuffer(null)).toThrow(/empty or invalid/);
    expect(() => validateLoopBuffer({ length: 0, sampleRate: 48000 } as AudioBuffer)).toThrow(/empty or invalid/);
  });
});

describe('arrangement ownership and recovery', () => {
  it('drops the old source buffer before fetching another arrangement and never caches both', async () => {
    const { system, nodes, fetcher } = setup();
    await system.load('a'); system.start(12);
    fetcher.mockImplementationOnce(async () => {
      expect(system.ready).toBe(false);
      expect(system.activeSources).toBe(0);
      expect(nodes[0]!.buffer).toBeNull();
      expect(nodes[0]!.disconnect).toHaveBeenCalledOnce();
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(16) };
    });
    await system.load('b'); system.start(13);
    expect(system.arrangementId).toBe('b');
    expect(system.activeSources).toBe(1);
    await system.load('a');
    expect(nodes[1]!.buffer).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(3); // A is fetched anew, not held beside B.
    system.dispose();
  });
  it.each(['a', 'b'] as const)('normalizes %s on its own bar grid and maps every task BPM identically', async id => {
    const { system, context, nodes } = setup();
    await system.load(id);
    expect(system.duration).toBeCloseTo(Math.round(loopSeconds(GAMEPLAY_ARRANGEMENTS[id]) * RATE) / RATE, 9);
    expect(system.start(12)).toBe(12);
    expect(nodes[0]!.playbackRate.value).toBe(120 / GAMEPLAY_ARRANGEMENTS[id].sourceBpm);
    for (const bpm of [120, 126, 138, 150]) {
      system.setBpm(bpm, 20);
      expect(system.playbackRate * system.sourceBpm).toBeCloseTo(bpm, 12);
    }
    system.setGain(0);
    expect(system.activeSources).toBe(1);
    system.stop(); context.state = 'suspended';
    expect(() => system.start(15)).toThrow(/Unlock/);
    context.state = 'running'; system.start(16);
    expect(system.playbackRate).toBe(system.baseRate);
    expect(system.downbeatTime).toBe(16);
    expect(nodes[0]!.buffer).toBeNull();
    system.dispose();
  });
  it('falls back from unavailable B to A and keeps that selection through shell/level calls', async () => {
    const { system, fetcher } = setup();
    fetcher.mockRejectedValueOnce(new Error('B missing'));
    await system.load('b');
    expect(system.requestedArrangement).toBe('b');
    expect(system.arrangementId).toBe('a');
    expect(system.duration).toBe(120);
    expect(system.baseRate).toBe(1);
    await system.load('b');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(system.start(12)).toBe(12);
    system.dispose();
  });
  it('also falls back when the B decode or normalization is invalid', async () => {
    const { system, context } = setup();
    context.decodeAudioData.mockResolvedValueOnce(fakeBuffer(5));
    await system.load('b');
    expect(system.arrangementId).toBe('a');
    expect(context.decodeAudioData).toHaveBeenCalledTimes(2);
    system.dispose();
  });
  it('supplies a short silent bar if B and A both fail, leaving a valid playable clock', async () => {
    const { system, fetcher } = setup();
    fetcher.mockRejectedValue(new Error('offline'));
    await system.load('b');
    expect(system.silentFallback).toBe(true);
    expect(system.duration).toBe(2);
    expect(system.start(12)).toBe(12);
    system.setBpm(150, 14);
    expect(system.playbackRate).toBe(1.25);
    system.dispose();
  });
  it('serializes a changed selection behind an uncancellable decode and discards stale results', async () => {
    const { system, context } = setup();
    let finish!: (buffer: ReturnType<typeof fakeBuffer>) => void;
    context.decodeAudioData.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const first = system.load('a');
    await vi.waitFor(() => expect(context.decodeAudioData).toHaveBeenCalledTimes(1));
    const next = system.load('b');
    expect(context.decodeAudioData).toHaveBeenCalledTimes(1);
    expect(system.ready).toBe(false);
    finish(fakeBuffer(FILE_FRAMES));
    await Promise.all([first, next]);
    expect(system.arrangementId).toBe('b');
    expect(context.decodeAudioData).toHaveBeenCalledTimes(2);
    system.dispose();
  });
  it('bounds a stalled B fetch and aborts it before the A fallback', async () => {
    vi.useFakeTimers();
    try {
      const { system, fetcher } = setup();
      fetcher.mockImplementationOnce(() => new Promise(() => {}));
      const pending = system.load('b');
      await vi.advanceTimersByTimeAsync(MUSIC.loadTimeoutMs + 100);
      await pending;
      expect(system.arrangementId).toBe('a');
      system.dispose();
    } finally { vi.useRealTimers(); }
  });
  it('never starts a second decode when B times out in the native decoder', async () => {
    vi.useFakeTimers();
    try {
      const { system, context } = setup();
      context.decodeAudioData.mockImplementationOnce(() => new Promise(() => {}));
      const pending = system.load('b');
      await vi.advanceTimersByTimeAsync(MUSIC.loadTimeoutMs * 2 + 100);
      await pending;
      expect(system.silentFallback).toBe(true);
      expect(context.decodeAudioData).toHaveBeenCalledTimes(1);
      system.dispose();
    } finally { vi.useRealTimers(); }
  });
});

it('keeps task plans and judgement windows identical for A and B', async () => {
  const { createRoundPlan } = await import('../src/rhythm/RhythmScheduler');
  const { parsePattern } = await import('../src/rhythm/patterns');
  const { createJudge, judgeTap, windowsFor } = await import('../src/rhythm/judge');
  const plans = [], results = [];
  for (const id of ['a', 'b'] as const) {
    const { system } = setup();
    await system.load(id);
    const origin = system.start(12);
    system.setBpm(138, origin);
    const plan = createRoundPlan(1, parsePattern('same', 'X X X X'), 138, origin, 4);
    const judge = createJudge(plan.targets, windowsFor(plan.targets));
    plans.push(plan);
    results.push(plan.targets.map((target, index) => judgeTap(judge, target + [0, 0.04, 0.08, 0.14][index]!)));
    expect(system.arrangementId).toBe(id); // BPM/task changes never select music.
    system.dispose();
  }
  expect(plans[1]).toEqual(plans[0]);
  expect(results[1]).toEqual(results[0]);
});

it('repairs only B’s last 3 ms codec seam without changing its length or interior', () => {
  const rate = 1000, frames = Math.round(loopSeconds(GAMEPLAY_ARRANGEMENTS.b) * rate);
  const source = fakeBuffer(frames + 200, rate);
  source.getChannelData(0).fill(0.2);
  source.getChannelData(0)[frames + 99] = -0.1;
  const loop = normalizeLoop({ createBuffer: (c: number, n: number, r: number) => fakeBuffer(n, r, c, Infinity) } as unknown as AudioContext,
    source as unknown as AudioBuffer, 100, GAMEPLAY_ARRANGEMENTS.b);
  expect(loop.length).toBe(frames);
  expect(loop.getChannelData(0)[frames - 1]).toBeCloseTo(loop.getChannelData(0)[0]!, 6);
  expect(loop.getChannelData(0)[frames - 4]).toBeCloseTo(0.2);
});
