import { afterEach, describe, expect, it, vi } from 'vitest';
import { MusicSystem } from '../src/audio/MusicSystem';
import {
  canReuseShell, currentMusicBed, resetMusicBedState, setMusicBed,
} from '../src/audio/musicBed';
import { GAMEPLAY_TRACKS, MUSIC } from '../src/config/music';

const RATE = 100;
const FILE_FRAMES = 11993;
const LEAD = 18;

function fakeBuffer(length: number, rate = RATE, channels = 2, onset = LEAD) {
  const data = Array.from({ length: channels }, () => new Float32Array(length));
  // The onset sits on the last channel, so a mono buffer (the metronome bar) can be made too.
  if (length > onset) data[Math.min(1, channels - 1)]![onset] = 0.5;
  return {
    length, sampleRate: rate, duration: length / rate, numberOfChannels: channels,
    getChannelData: (c: number) => data[c]!,
    copyToChannel: (source: Float32Array, c: number) => { data[c]!.set(source.subarray(0, length)); },
  };
}

function setup() {
  const nodes: ReturnType<typeof makeSource>[] = [];
  const makeSource = () => ({
    buffer: null as { length: number } | null, loop: false, loopStart: -1, loopEnd: -1,
    playbackRate: { value: 1, setValueAtTime: vi.fn() },
    start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), onended: null,
  });
  const urls: string[] = [];
  const context = {
    currentTime: 10, state: 'running', sampleRate: RATE,
    decodeAudioData: vi.fn(async () => ((urls[urls.length - 1] ?? '').includes('tiny-tempo-b') ? fakeBuffer(10814, RATE, 2, 12) : fakeBuffer(FILE_FRAMES))),
    createBuffer: (channels: number, length: number, rate: number) => fakeBuffer(length, rate, channels),
    createGain: () => ({
      gain: {
        value: 1, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(), disconnect: vi.fn(),
    }),
    createBufferSource: () => { const source = makeSource(); nodes.push(source); return source; },
    createBiquadFilter: () => ({ type: '', frequency: { value: 0 }, Q: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() }),
  };
  const fetcher = vi.fn(async (url: string) => { urls.push(url); return { ok: true, arrayBuffer: async () => new ArrayBuffer(16) }; });
  vi.stubGlobal('fetch', fetcher);
  const system = new MusicSystem(context as unknown as AudioContext, {} as AudioNode);
  return { system, context, nodes, fetcher, host: { music: system, context: context as unknown as AudioContext } };
}

afterEach(() => {
  resetMusicBedState();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the shell / level / silent music bed', () => {
  it('reuses a rate-1 source as the shell, including leftover level music', () => {
    expect(canReuseShell(1, 1, 'shell')).toBe(true);
    expect(canReuseShell(1, 1, 'level')).toBe(true);
    // A silent fade still has a source until it stops; claiming it as the shell would
    // bring the metronome's competitor back on the tap-offset screen.
    expect(canReuseShell(1, 1, 'silent')).toBe(false);
    expect(canReuseShell(0, 1, 'shell')).toBe(false);
    expect(canReuseShell(1, 1.15, 'level')).toBe(false);
    // A leftover level from the other chapter is running smoothly and is still not the shell.
    expect(canReuseShell(1, 1, 'level', false)).toBe(false);
  });

  it('switches the shell to the track a scene names, fading the other chapter out first', async () => {
    const { system, nodes, fetcher, host } = setup();
    await system.load('a');
    await setMusicBed(host, 'shell', { fadeSec: 0, track: 'a' });
    expect(nodes).toHaveLength(1);
    // The frontier moved into the next chapter: the map asks for its track.
    await setMusicBed(host, 'shell', { fadeSec: 0, track: 'b' });
    expect(nodes[0]!.stop).toHaveBeenCalledTimes(1);
    const stems = GAMEPLAY_TRACKS.b.stems.length;
    expect(nodes).toHaveLength(1 + stems);
    expect(system.trackId).toBe('b');
    expect(nodes[1]!.loopEnd).toBe(108);
    expect(fetcher).toHaveBeenLastCalledWith(GAMEPLAY_TRACKS.b.stems[stems - 1]!.url, expect.anything());
    expect(currentMusicBed()).toBe('shell');
    // The shell hears the whole arrangement, with no metronome under it.
    expect(system.activeLayers).toBe(stems);
    expect(system.metronome).toBe(false);
    // Naming the loaded track again reuses the sources rather than restarting the loop.
    await setMusicBed(host, 'shell', { fadeSec: 0, track: 'b' });
    expect(nodes).toHaveLength(1 + stems);
    expect(nodes[1]!.stop).not.toHaveBeenCalled();
    // A shell with no track named keeps what is loaded.
    await setMusicBed(host, 'shell', { fadeSec: 0 });
    expect(nodes).toHaveLength(1 + stems);
    expect(system.gain).toBe(GAMEPLAY_TRACKS.b.gain);
  });

  it('does not keep a leftover level from another chapter as the shell', async () => {
    const { system, nodes, host } = setup();
    await system.load('b');
    system.start(12);
    await setMusicBed(host, 'level');
    await setMusicBed(host, 'shell', { fadeSec: 0, track: 'a' });
    expect(nodes[0]!.stop).toHaveBeenCalledTimes(1);
    expect(nodes).toHaveLength(GAMEPLAY_TRACKS.b.stems.length + 1);
    expect(system.trackId).toBe('a');
    expect(system.gain).toBe(GAMEPLAY_TRACKS.a.gain);
  });

  it('starts the shell once and does not stack a second source over it', async () => {
    const { system, nodes, host } = setup();
    await system.load('a');
    await setMusicBed(host, 'shell', { fadeSec: 0 });
    expect(currentMusicBed()).toBe('shell');
    expect(nodes).toHaveLength(1);
    await setMusicBed(host, 'shell', { fadeSec: 0 });
    expect(nodes).toHaveLength(1);
    expect(system.activeSources).toBe(1);
  });

  it('keeps a leftover level loop as the shell instead of starting over it', async () => {
    const { system, nodes, host } = setup();
    await system.load('a');
    system.start(12);
    await setMusicBed(host, 'level');
    expect(currentMusicBed()).toBe('level');
    expect(nodes).toHaveLength(1);
    await setMusicBed(host, 'shell', { fadeSec: 0 });
    // The overlap bug: a second start() while the level source was still running.
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.stop).not.toHaveBeenCalled();
    expect(currentMusicBed()).toBe('shell');
  });

  it('gives a reused level loop the shell\'s mix: every stem, and no metronome', async () => {
    const { system, nodes, host } = setup();
    await system.load('b');
    const stems = system.stemCount;
    expect(stems).toBeGreaterThan(1);
    system.start(12, { layers: 1, metronome: true });
    expect(system.metronome).toBe(true);
    expect(nodes).toHaveLength(stems + 1);
    await setMusicBed(host, 'level');
    await setMusicBed(host, 'shell', { fadeSec: 0 });
    expect(currentMusicBed()).toBe('shell');
    // The stems play on; only the click bar is stopped.
    expect(nodes).toHaveLength(stems + 1);
    for (const stem of nodes.slice(0, stems)) expect(stem.stop).not.toHaveBeenCalled();
    expect(nodes[stems]!.stop).toHaveBeenCalledTimes(1);
    expect(system.metronome).toBe(false);
    expect(system.activeLayers).toBe(stems);
    expect(system.activeSources).toBe(stems);
  });

  it('cuts immediately on silent so tap offset is not competing with the loop', async () => {
    const { system, nodes, host } = setup();
    await system.load('a');
    await setMusicBed(host, 'shell', { fadeSec: 0 });
    await setMusicBed(host, 'silent');
    expect(currentMusicBed()).toBe('silent');
    expect(system.activeSources).toBe(0);
    expect(nodes[0]!.stop).toHaveBeenCalledTimes(1);
  });

  it('does not let an in-flight fade stop a level that has already started', async () => {
    vi.useFakeTimers();
    const { system, nodes, host } = setup();
    await system.load('a');
    await setMusicBed(host, 'shell', { fadeSec: 0 });
    const fading = setMusicBed(host, 'silent', { fadeSec: MUSIC.bedFadeSec });
    system.start(12);
    await setMusicBed(host, 'level');
    await vi.advanceTimersByTimeAsync(MUSIC.bedFadeSec * 1000 + 50);
    await fading;
    expect(currentMusicBed()).toBe('level');
    expect(system.activeSources).toBe(1);
    expect(nodes[1]!.stop).not.toHaveBeenCalled();
    // And the level is not left with the bus the hush was fading to zero: the mix is the
    // level's from the moment it is named, so its stems and metronome are heard.
    expect(system.gain).toBe(system.trackGain);
  });

  it('hands the bus gain to a level that starts while the map\'s hush is still fading', async () => {
    vi.useFakeTimers();
    const { system, host } = setup();
    await system.load('a');
    await setMusicBed(host, 'shell', { fadeSec: 0 });
    expect(system.gain).toBe(system.trackGain);
    const hush = setMusicBed(host, 'silent', { fadeSec: MUSIC.bedFadeSec });
    expect(system.gain).toBe(0);
    // Reduced motion: the curtain beats the fade, and the level starts under it.
    system.start(12, { layers: 1, metronome: true });
    await setMusicBed(host, 'level');
    expect(system.gain).toBe(system.trackGain);
    await vi.advanceTimersByTimeAsync(MUSIC.bedFadeSec * 1000 + 50);
    await hush;
    expect(system.gain).toBe(system.trackGain);
    expect(system.activeSources).toBe(1);
    expect(system.metronome).toBe(true);
  });
});
