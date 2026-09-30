import { afterEach, describe, expect, it, vi } from 'vitest';
import { MusicSystem, detectLeadIn, normalizeLoop, validateLoopBuffer } from '../src/audio/MusicSystem';
import { GAMEPLAY_TRACKS, MUSIC, TRACK_CYCLE, loopSeconds, pickupSeconds } from '../src/config/music';

// A 100 Hz "sample rate" keeps the fake buffers tiny while exercising real frame arithmetic.
const RATE = 100;
const FILE_FRAMES = 11993; // 119.93 s: 75 ms short of 60 bars, like the delivered master.
const LEAD = 18; // the opening transient at 0.18 s in the decoded MP3
const A = GAMEPLAY_TRACKS.a;
const B = GAMEPLAY_TRACKS.b;
// Track B decodes to 108.144 s: the 0.1 s head, 54 whole bars, and the codec's padding.
const B_FRAMES = 10814;
const B_LEAD = 12;
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
  const decodes: string[] = [];
  const makeSource = () => ({ buffer: null as { length: number } | null, loop: false, loopStart: -1, loopEnd: -1, playbackRate: { value: 0, setValueAtTime: vi.fn() },
    start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), onended: null });
  const gains: { gain: { value: number; cancelScheduledValues: ReturnType<typeof vi.fn>; setValueAtTime: ReturnType<typeof vi.fn>; linearRampToValueAtTime: ReturnType<typeof vi.fn> }; disconnect: ReturnType<typeof vi.fn> }[] = [];
  const context = {
    currentTime: 10, state: 'running',
    decodeAudioData: vi.fn(async () => {
      // The last fetched url says which track's decode this is.
      const url = decodes[decodes.length - 1];
      if (empty) return fakeBuffer(0);
      return url === B.url ? fakeBuffer(B_FRAMES, RATE, 2, B_LEAD) : fakeBuffer(FILE_FRAMES);
    }),
    createBuffer: (channels: number, length: number, rate: number) => fakeBuffer(length, rate, channels),
    createGain: () => {
      const node = { gain: { value: 1, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() };
      gains.push(node); return node;
    },
    createBufferSource: () => { const source = makeSource(); nodes.push(source); return source; },
  };
  const fetcher = vi.fn(async (url: string) => { decodes.push(url); return { ok: true, arrayBuffer: async () => new ArrayBuffer(16) }; });
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
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(A.url, expect.anything());
    expect(system.trackId).toBe('a');
    expect(context.decodeAudioData).toHaveBeenCalledTimes(1);
    expect(system.start(12)).toBeCloseTo(12 + pickupSeconds(MUSIC.sourceBpm, MUSIC.pickupBeats), 9);
    expect(system.leadInSeconds).toBeCloseTo(LEAD / RATE, 9);
    expect(nodes).toHaveLength(1);
    const node = nodes[0]!;
    expect(node.start).toHaveBeenCalledExactlyOnceWith(12, 0);
    expect(node.loop).toBe(true);
    expect(node.loopStart).toBe(0);
    expect(node.loopEnd).toBe(loopSeconds(A));
    expect(node.buffer!.length).toBe(loopSeconds(A) * RATE);
    expect(node.playbackRate.value).toBe(1);
    await system.load();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('detects the lead-in from the opening transient and falls back outside the plausible range', () => {
    const { minSec, maxSec } = A.leadIn;
    expect(detectLeadIn(fakeBuffer(FILE_FRAMES) as unknown as AudioBuffer, 0.01, 0.5, minSec, maxSec)).toBe(LEAD);
    expect(detectLeadIn(fakeBuffer(FILE_FRAMES) as unknown as AudioBuffer, 0.9, 0.5, minSec, maxSec)).toBe(50);
    expect(detectLeadIn(fakeBuffer(4) as unknown as AudioBuffer, 0.01, 0.5, minSec, maxSec)).toBe(50);
    // A crossing too early to be the downbeat is a decoder artefact or the wrong file: a
    // false trigger accepted here would shift the whole beat grid against the music for good.
    expect(detectLeadIn(fakeBuffer(FILE_FRAMES, RATE, 2, 1) as unknown as AudioBuffer, 0.01, 0.5, minSec, maxSec)).toBe(50);
    // A crossing beyond the window is never reached, so it falls back rather than reporting it.
    expect(detectLeadIn(fakeBuffer(FILE_FRAMES, RATE, 2, 400) as unknown as AudioBuffer, 0.01, 0.5, minSec, maxSec)).toBe(50);
    // The shipped bounds have to admit the shipped file: ~0.156 s of export pre-roll plus
    // whatever decoder delay the platform leaves in.
    for (const track of Object.values(GAMEPLAY_TRACKS)) {
      expect(track.leadIn.fallbackSec).toBeGreaterThan(track.leadIn.minSec);
      expect(track.leadIn.fallbackSec).toBeLessThan(track.leadIn.maxSec);
    }
    // Track B's bounds admit both kinds of decoder — 0.1247 s measured in Chromium, which
    // keeps the encoder delay, and ~0.102 s on one that trims it — and reject a premix
    // encoded without its head, whose first hit sits in the opening 2 ms.
    expect(B.leadIn.minSec).toBeLessThan(0.102);
    expect(B.leadIn.maxSec).toBeGreaterThan(0.1247);
    expect(detectLeadIn(fakeBuffer(B_FRAMES, RATE, 2, B_LEAD) as unknown as AudioBuffer, B.leadIn.threshold, B.leadIn.fallbackSec, B.leadIn.minSec, B.leadIn.maxSec)).toBe(B_LEAD);
    expect(detectLeadIn(fakeBuffer(B_FRAMES, RATE, 2, 0) as unknown as AudioBuffer, B.leadIn.threshold, B.leadIn.fallbackSec, B.leadIn.minSec, B.leadIn.maxSec)).toBe(Math.round(B.leadIn.fallbackSec * RATE));
  });
  it('normalizes the track into an exact whole-bar loop: drops the lead-in and pads the tail', () => {
    const source = fakeBuffer(FILE_FRAMES);
    for (let i = 0; i < FILE_FRAMES; i++) source.getChannelData(0)[i] = i;
    const lead = LEAD;
    const loop = normalizeLoop({ createBuffer: (c: number, l: number, r: number) => fakeBuffer(l, r, c) } as unknown as AudioContext, source as unknown as AudioBuffer, lead, A);
    expect(loop.length).toBe(loopSeconds(A) * RATE);
    expect(loop.getChannelData(0)[0]).toBe(lead);
    expect(loop.getChannelData(0)[FILE_FRAMES - lead - 1]).toBe(FILE_FRAMES - 1);
    expect(loop.getChannelData(0)[FILE_FRAMES - lead]).toBe(0);
    expect(loop.getChannelData(0)[loop.length - 1]).toBe(0);
    expect(() => normalizeLoop({} as AudioContext, fakeBuffer(lead) as unknown as AudioBuffer, lead, A)).toThrow(/lead-in/);
    expect(() => normalizeLoop({} as AudioContext, source as unknown as AudioBuffer, 1.5, A)).toThrow(/whole number/);
  });
  it('trims track B to its 54 bars: the head and decoder delay go, and the tail is the music itself', () => {
    const source = fakeBuffer(B_FRAMES);
    for (let i = 0; i < B_FRAMES; i++) source.getChannelData(0)[i] = i;
    const loop = normalizeLoop({ createBuffer: (c: number, l: number, r: number) => fakeBuffer(l, r, c) } as unknown as AudioContext, source as unknown as AudioBuffer, B_LEAD, B);
    expect(loop.length).toBe(108 * RATE);
    expect(loop.getChannelData(0)[0]).toBe(B_LEAD);
    // The last frame of the loop is the last frame of the composer's 108 s, not padding:
    // the file runs to its end and the seam is the file's own.
    expect(loop.getChannelData(0)[loop.length - 1]).toBe(B_LEAD + 108 * RATE - 1);
    expect(B_LEAD + 108 * RATE).toBeLessThanOrEqual(B_FRAMES);
  });
  it('loads one track at a time: selecting the other stops the source and releases the loop first', async () => {
    const { system, nodes, fetcher, context } = setup();
    await system.load('b');
    expect(system.trackId).toBe('b');
    expect(system.trackGain).toBe(B.gain);
    expect(system.gain).toBe(B.gain);
    expect(fetcher).toHaveBeenLastCalledWith(B.url, expect.anything());
    system.start(12);
    expect(nodes[0]!.loopEnd).toBe(108);
    expect(nodes[0]!.buffer!.length).toBe(108 * RATE);
    // Same track again: nothing fetched, nothing stopped.
    await system.load('b');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(system.activeSources).toBe(1);
    // The other track: the running source cannot play it, so it stops before the fetch,
    // and the old loop is dropped before the new decode is held.
    const loading = system.load('a');
    expect(system.activeSources).toBe(0);
    expect(system.ready).toBe(false);
    expect(system.selectedTrack).toBe('a');
    expect(nodes[0]!.stop).toHaveBeenCalledTimes(1);
    await loading;
    expect(system.trackId).toBe('a');
    expect(system.gain).toBe(A.gain);
    expect(context.decodeAudioData).toHaveBeenCalledTimes(2);
    system.start(14);
    expect(nodes[1]!.loopEnd).toBe(120);
  });
  it('lets a later selection supersede a load still in flight', async () => {
    const { system, fetcher } = setup();
    const first = system.load('a');
    const second = system.load('b');
    await expect(first).rejects.toThrow(/superseded/);
    await second;
    expect(system.trackId).toBe('b');
    expect(system.ready).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('keeps the one source running through a silent gain, restoration and multiple loops', async () => {
    const { system, nodes, gains, context } = setup();
    await system.load(); system.start(12);
    expect(system.gain).toBe(A.gain);
    system.setGain(0); expect(system.gain).toBe(0);
    system.setGain(A.gain, 0);
    expect(gains[0]!.gain.setValueAtTime).toHaveBeenCalledWith(A.gain, context.currentTime);
    expect(system.gain).toBe(A.gain);
    context.currentTime = 12 + system.duration * 3; // three whole loops after the scheduled start
    system.setGain(A.gain);
    expect(system.gain).toBe(A.gain);
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
    expect(loopSeconds(A)).toBe(120);
    expect(loopSeconds(B)).toBe(108);
    // Every track in the cycle is authored at the one source tempo, so a level's rate is
    // its BPM over that and never a per-track correction that would pitch-shift the game.
    for (const id of TRACK_CYCLE) expect(Number.isInteger(loopSeconds(GAMEPLAY_TRACKS[id]) * MUSIC.sourceBpm / 60 / MUSIC.beatsPerBar)).toBe(true);
    const buffer = { length: 5760000, sampleRate: 48000, duration: 120 } as AudioBuffer;
    expect(validateLoopBuffer(buffer)).toBe(buffer.duration);
    expect(() => validateLoopBuffer(null)).toThrow(/empty or invalid/);
    expect(() => validateLoopBuffer({ length: 0, sampleRate: 48000 } as AudioBuffer)).toThrow(/empty or invalid/);
  });
});
