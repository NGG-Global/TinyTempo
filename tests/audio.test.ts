import { afterEach, expect, it, vi } from 'vitest';
import { AudioEngine } from '../src/audio/AudioEngine';
import { createBugSounds } from '../src/audio/bugSounds';
import { createCurlSounds } from '../src/audio/curlSounds';
import { createImpactBuffers, synthesizeImpact } from '../src/audio/hammerSounds';
import { createSawSounds } from '../src/audio/sawSounds';
import { createTomatoSounds } from '../src/audio/tomatoSounds';
import { createCucumberSounds } from '../src/audio/cucumberSounds';
import { createBananaSounds } from '../src/audio/bananaSounds';
import { createWindowSounds } from '../src/audio/windowSounds';
import { createPaperSounds } from '../src/audio/paperSounds';
import { createClapSounds } from '../src/audio/clapSounds';
import { createScratchSounds } from '../src/audio/scratchSounds';

afterEach(() => vi.unstubAllGlobals());

it('schedules hammer/coda sources at absolute times and cancels every voice on restart', async () => {
  const nodes: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; onended: (() => void) | null }[] = [];
  const close = vi.fn(() => Promise.resolve());
  vi.stubGlobal('AudioContext', class {
    currentTime = 10;
    state = 'running';
    sampleRate = 8000;
    decodeAudioData = async () => ({ length: 80000, sampleRate: 8000, duration: 10 });
    destination = {};
    close = close;
    createGain() {
      return {
        gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
        connect: vi.fn((target: object) => target), disconnect: vi.fn(),
      };
    }
    createBuffer(_channels: number, length: number) {
      return { getChannelData: () => new Float32Array(length) };
    }
    createBufferSource() {
      const node = {
        playbackRate: { value: 1 },
        buffer: null, connect: vi.fn((target: object) => target), start: vi.fn(), stop: vi.fn(),
        disconnect: vi.fn(), onended: null as (() => void) | null,
      };
      nodes.push(node);
      return node;
    }
  });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })));
  const engine = new AudioEngine();
  const buffers = createImpactBuffers(engine.context);
  engine.setSounds({ action: buffers.hit, success: buffers.flush, rough: buffers.bent, scrape: buffers.skid, judder: buffers.dead });
  engine.play(12, 'action');
  engine.playFinish(12.5, 'success');
  expect(nodes[0]!.start).toHaveBeenCalledWith(12);
  expect(nodes[1]!.start).toHaveBeenCalledWith(12.5);
  expect(engine.activeSources).toBe(2);
  engine.setSounds({ action: buffers.hit, success: buffers.flush, rough: buffers.bent, scrape: buffers.skid, judder: buffers.dead });
  engine.cancel();
  expect(engine.activeSources).toBe(0);
  for (const node of nodes) {
    expect(node.stop).toHaveBeenCalledTimes(1);
    expect(node.disconnect).toHaveBeenCalledTimes(1);
    expect(node.onended).toBeNull();
  }
  engine.playFinish(13, 'rough');
  nodes[2]!.onended!();
  expect(engine.activeSources).toBe(0);
  await engine.music.load();
  engine.music.start(14);
  engine.cancel();
  for (const node of nodes.slice(3)) expect(node.stop).not.toHaveBeenCalled();
  engine.dispose(); engine.dispose();
  for (const node of nodes.slice(3)) expect(node.stop).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
});

it('gives up on an unlock whose resume() never settles instead of waiting forever', async () => {
  vi.useFakeTimers();
  try {
    vi.stubGlobal('AudioContext', class {
      currentTime = 0;
      state = 'suspended';
      sampleRate = 8000;
      destination = {};
      close = vi.fn(() => Promise.resolve());
      resume = vi.fn(() => new Promise<void>(() => { /* a blocked route never resolves */ }));
      createGain() { return { gain: { value: 1 }, connect: vi.fn((target: object) => target), disconnect: vi.fn() }; }
    });
    const engine = new AudioEngine();
    const unlock = engine.unlock();
    const outcome = unlock.then(() => 'resolved', (error: Error) => error.message);
    await vi.advanceTimersByTimeAsync(3500);
    expect(await outcome).toMatch(/blocked/);
  } finally { vi.useRealTimers(); }
});

it('keeps the audible clock when sinkchange fires without a fresh stamp', () => {
  const listeners = new Map<string, () => void>();
  let currentTime = 10.3;
  let stamp: { contextTime: number; performanceTime: number } | null = {
    contextTime: 10, performanceTime: 1000,
  };
  vi.stubGlobal('AudioContext', class {
    get currentTime() { return currentTime; }
    state = 'running';
    destination = {};
    close = vi.fn(() => Promise.resolve());
    getOutputTimestamp() { return stamp ?? { contextTime: 0, performanceTime: 0 }; }
    addEventListener(name: string, fn: () => void) { listeners.set(name, fn); }
    removeEventListener(name: string) { listeners.delete(name); }
    createGain() {
      return { gain: { value: 1, setValueAtTime() {} }, connect() { return this; }, disconnect() {} };
    }
  });
  try {
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    const engine = new AudioEngine();
    engine.clock.refresh();
    expect(engine.clock.mode).toBe('output');
    expect(engine.clock.now()).toBeCloseTo(10);
    stamp = null;
    currentTime = 10.5;
    vi.spyOn(performance, 'now').mockReturnValue(1200);
    listeners.get('sinkchange')!();
    expect(engine.clock.mode).toBe('output');
    expect(engine.clock.now()).toBeCloseTo(10.2, 5);
    engine.dispose();
  } finally { vi.restoreAllMocks(); }
});

it('resumes a suspended context without resetting the audible clock', () => {
  const resume = vi.fn(() => Promise.resolve());
  vi.stubGlobal('AudioContext', class {
    currentTime = 10;
    state = 'suspended';
    destination = {};
    close = vi.fn(() => Promise.resolve());
    resume = resume;
    getOutputTimestamp() { return { contextTime: 9.7, performanceTime: 1000 }; }
    createGain() {
      return { gain: { value: 1 }, connect() { return this; }, disconnect() {} };
    }
  });
  try {
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    const engine = new AudioEngine();
    engine.clock.refresh();
    expect(engine.clock.mode).toBe('output');
    engine.recover();
    expect(resume).toHaveBeenCalledTimes(1);
    expect(engine.clock.mode).toBe('output');
    expect(engine.clock.now()).toBeCloseTo(9.7);
    engine.dispose();
  } finally { vi.restoreAllMocks(); }
});

it('drops a voice that cannot start instead of throwing out of the tap path', () => {
  vi.stubGlobal('AudioContext', class {
    currentTime = 10;
    state = 'running';
    destination = {};
    close = vi.fn(() => Promise.resolve());
    createGain() {
      return {
        gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() { return this; },
        disconnect: vi.fn(),
      };
    }
    createOscillator() {
      return {
        frequency: { value: 0 },
        connect: vi.fn((target: object) => target),
        start: () => { throw new Error('The start time is earlier than currentTime.'); },
        stop: vi.fn(),
        disconnect: vi.fn(),
        onended: null as (() => void) | null,
      };
    }
  });
  const engine = new AudioEngine();
  expect(() => engine.play(10, 'count')).not.toThrow();
  expect(engine.activeSources).toBe(0);
  engine.dispose();
});

it('reacts to a grade with its own voice and stays silent for a set that declares none', () => {
  const nodes: { start: ReturnType<typeof vi.fn>; onended: (() => void) | null }[] = [];
  vi.stubGlobal('AudioContext', class {
    currentTime = 10;
    state = 'running';
    sampleRate = 48000;
    destination = {};
    close = vi.fn(() => Promise.resolve());
    createGain() { return { gain: { value: 1 }, connect: vi.fn((target: object) => target), disconnect: vi.fn() }; }
    createBuffer(_channels: number, length: number) { return { getChannelData: () => new Float32Array(length) }; }
    createBufferSource() {
      const node = { buffer: null, connect: vi.fn((target: object) => target), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(), onended: null as (() => void) | null };
      nodes.push(node);
      return node;
    }
  });
  const engine = new AudioEngine();
  engine.setSounds(createSawSounds(engine.context));
  engine.playAccent(20, 'scrape');
  engine.playAccent(21, 'judder');
  expect(engine.activeSources).toBe(2);
  expect(nodes[0]!.start).toHaveBeenCalledWith(20);
  expect(nodes[1]!.start).toHaveBeenCalledWith(21);
  engine.dispose();
});

/**
 * Three of the five sound sets used to omit the accents, which are optional no longer.
 * A mistake was therefore silent on levels 1, 2 and 3 of every five and audible on 4 and
 * 5 — the inconsistency reported as broken level audio. Every set must now voice both.
 */
it('gives every vignette a voice for a wasted tap and for a missed beat', () => {
  const rate = 48000;
  const factories = {
    hammer: (c: AudioContext) => { const b = createImpactBuffers(c); return { action: b.hit, success: b.flush, rough: b.bent, scrape: b.skid, judder: b.dead }; },
    window: createWindowSounds,
    bug: createBugSounds,
    saw: createSawSounds,
    tomato: createTomatoSounds,
    curl: createCurlSounds,
    cucumber: createCucumberSounds,
    banana: createBananaSounds,
    paper: createPaperSounds,
  };
  const context = {
    sampleRate: rate,
    createBuffer(_channels: number, length: number) {
      const data = new Float32Array(length);
      return { length, duration: length / rate, getChannelData: () => data };
    },
  } as unknown as AudioContext;
  for (const [name, make] of Object.entries(factories)) {
    const sounds = make(context);
    for (const kind of ['action', 'success', 'rough', 'scrape', 'judder'] as const) {
      const buffer = sounds[kind];
      expect(buffer, `${name}.${kind} exists`).toBeTruthy();
      expect(buffer.length, `${name}.${kind} has samples`).toBeGreaterThan(rate * 0.05);
    }
  }
});

/** The hammer's two new voices must carry audible signal, not a buffer of zeroes. */
it('synthesizes the hammer accents as sound rather than silence', () => {
  for (const kind of ['skid', 'dead'] as const) {
    const samples = synthesizeImpact(48000, kind);
    const peak = samples.reduce((most, v) => Math.max(most, Math.abs(v)), 0);
    expect(peak, `${kind} peak`).toBeGreaterThan(0.05);
    expect(samples.every(Number.isFinite), `${kind} finite`).toBe(true);
  }
});

/**
 * A coda is the one voice that can outlive the task it belongs to: the clap's applause is
 * four seconds against a hold of under three at the fastest tempo. It is faded out before
 * the next task's downbeat, and left to ring out when nothing follows it.
 */
it('plays the middle coda where an act has one, and clears the room before the next task', () => {
  const sources: { buffer: AudioBuffer | null; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
  const gains: { setValueAtTime: ReturnType<typeof vi.fn>; linearRampToValueAtTime: ReturnType<typeof vi.fn> }[] = [];
  vi.stubGlobal('AudioContext', class {
    currentTime = 10;
    state = 'running';
    sampleRate = 8000;
    destination = {};
    close = vi.fn(() => Promise.resolve());
    createGain() {
      const gain = { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() };
      gains.push(gain);
      return { gain, connect: vi.fn((target: object) => target), disconnect: vi.fn() };
    }
    createBuffer(_channels: number, length: number) {
      return { length, getChannelData: () => new Float32Array(length) };
    }
    createBufferSource() {
      const node = {
        buffer: null, connect: vi.fn((target: object) => target), start: vi.fn(), stop: vi.fn(),
        disconnect: vi.fn(), onended: null as (() => void) | null,
      };
      sources.push(node);
      return node;
    }
  });
  const engine = new AudioEngine();
  const clap = createClapSounds(engine.context);
  engine.setSounds(clap);

  // The middle ending has its own recording, and the deadline is the next task's downbeat.
  engine.playFinish(12, 'partial', 14);
  expect(sources[0]!.buffer).toBe(clap.partial);
  expect(sources[0]!.start).toHaveBeenCalledWith(12);
  expect(sources[0]!.stop).toHaveBeenCalledWith(14);
  // The last gain built is the coda's own envelope; the first is the engine's master.
  const envelope = gains.at(-1)!;
  expect(envelope.linearRampToValueAtTime).toHaveBeenCalledWith(0, 14);
  const fadeFrom = envelope.setValueAtTime.mock.calls[0]![1] as number;
  expect(fadeFrom).toBeGreaterThan(12);
  expect(fadeFrom).toBeGreaterThanOrEqual(13.5); // under a beat at every tempo the game runs
  expect(fadeFrom).toBeLessThan(14);

  // After the last task there is no next task: the applause rings out under the summary.
  engine.playFinish(16, 'success');
  expect(sources[1]!.buffer).toBe(clap.success);
  expect(sources[1]!.stop).not.toHaveBeenCalled();

  // An act with three endings and two voices keeps the behaviour it shipped with.
  const scratch = createScratchSounds(engine.context);
  engine.setSounds(scratch);
  engine.playFinish(18, 'partial');
  expect(sources.at(-1)!.buffer).toBe(scratch.rough);
  engine.dispose();
});

it('keeps both arrangements and the separate title theme under the same global mute', async () => {
  const gainNodes: { gain: { value: number; setValueAtTime: ReturnType<typeof vi.fn> } }[] = [];
  vi.stubGlobal('AudioContext', class {
    currentTime = 10; state = 'running'; sampleRate = 100; destination = {};
    close = vi.fn(async () => {});
    createGain() {
      const node = { gain: { value: 1, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() };
      gainNodes.push(node); return node;
    }
    createBuffer(channels: number, length: number, sampleRate: number) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { length, sampleRate, duration: length / sampleRate, numberOfChannels: channels,
        getChannelData: (c: number) => data[c]!, copyToChannel: (values: Float32Array, c: number) => data[c]!.set(values) };
    }
    async decodeAudioData() {
      const buffer = this.createBuffer(2, 12800, 100);
      buffer.getChannelData(0)[18] = 0.5; return buffer;
    }
    createBufferSource() {
      return { buffer: null, loop: false, playbackRate: { value: 1, setValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null };
    }
  });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })));
  const engine = new AudioEngine();
  engine.toggleMute();
  for (const id of ['a', 'b'] as const) {
    await engine.music.load(id); engine.music.start(12);
    expect(engine.muted).toBe(true);
    expect(gainNodes[0]!.gain.setValueAtTime).toHaveBeenLastCalledWith(0, 10);
    expect(engine.theme.playing).toBe(false);
  }
  engine.music.stop();
  await engine.theme.enter();
  expect(engine.theme.playing).toBe(true);
  expect(engine.music.activeSources).toBe(0);
  expect(engine.music.arrangementId).toBe('b');
  expect(gainNodes[0]!.gain.setValueAtTime).toHaveBeenLastCalledWith(0, 10);
  engine.toggleMute();
  expect(gainNodes[0]!.gain.setValueAtTime).toHaveBeenLastCalledWith(1, 10);
  engine.dispose();
});
