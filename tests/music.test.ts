import { afterEach, describe, expect, it, vi } from 'vitest';
import { MusicSystem, detectLeadIn, normalizeLoop, validateLoopBuffer } from '../src/audio/MusicSystem';
import { MUSIC, loopSeconds, pickupSeconds } from '../src/config/music';

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
    createBuffer: (channels: number, length: number, rate: number) => fakeBuffer(length, rate, channels),
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
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(MUSIC.url, expect.anything());
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
