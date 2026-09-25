import { afterEach, describe, expect, it, vi } from 'vitest';
import { MusicSystem } from '../src/audio/MusicSystem';
import {
  canReuseShell, currentMusicBed, resetMusicBedState, setMusicBed,
} from '../src/audio/musicBed';
import { MUSIC } from '../src/config/music';

const RATE = 100;
const FILE_FRAMES = 11993;
const LEAD = 18;

function fakeBuffer(length: number, rate = RATE, channels = 2, onset = LEAD) {
  const data = Array.from({ length: channels }, () => new Float32Array(length));
  if (length > onset) data[1]![onset] = 0.5;
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
  const context = {
    currentTime: 10, state: 'running',
    decodeAudioData: vi.fn(async () => fakeBuffer(FILE_FRAMES)),
    createBuffer: (channels: number, length: number, rate: number) => fakeBuffer(length, rate, channels),
    createGain: () => ({
      gain: {
        value: 1, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(), disconnect: vi.fn(),
    }),
    createBufferSource: () => { const source = makeSource(); nodes.push(source); return source; },
  };
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(16) })));
  const system = new MusicSystem(context as unknown as AudioContext, {} as AudioNode);
  return { system, context, nodes, host: { music: system, context: context as unknown as AudioContext } };
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
  });

  it('starts the shell once and does not stack a second source over it', async () => {
    const { system, nodes, host } = setup();
    await system.load();
    await setMusicBed(host, 'shell', { fadeSec: 0 });
    expect(currentMusicBed()).toBe('shell');
    expect(nodes).toHaveLength(1);
    await setMusicBed(host, 'shell', { fadeSec: 0 });
    expect(nodes).toHaveLength(1);
    expect(system.activeSources).toBe(1);
  });

  it('keeps a leftover level loop as the shell instead of starting over it', async () => {
    const { system, nodes, host } = setup();
    await system.load();
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

  it('cuts immediately on silent so tap offset is not competing with the loop', async () => {
    const { system, nodes, host } = setup();
    await system.load();
    await setMusicBed(host, 'shell', { fadeSec: 0 });
    await setMusicBed(host, 'silent');
    expect(currentMusicBed()).toBe('silent');
    expect(system.activeSources).toBe(0);
    expect(nodes[0]!.stop).toHaveBeenCalledTimes(1);
  });

  it('does not let an in-flight fade stop a level that has already started', async () => {
    vi.useFakeTimers();
    const { system, nodes, host } = setup();
    await system.load();
    await setMusicBed(host, 'shell', { fadeSec: 0 });
    const fading = setMusicBed(host, 'silent', { fadeSec: MUSIC.bedFadeSec });
    system.start(12);
    await setMusicBed(host, 'level');
    await vi.advanceTimersByTimeAsync(MUSIC.bedFadeSec * 1000 + 50);
    await fading;
    expect(currentMusicBed()).toBe('level');
    expect(system.activeSources).toBe(1);
    expect(nodes[1]!.stop).not.toHaveBeenCalled();
  });
});
