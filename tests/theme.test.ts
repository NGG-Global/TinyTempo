import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeMusic, themeLoop } from '../src/audio/ThemeMusic';
import { THEME } from '../src/config/music';

afterEach(() => vi.unstubAllGlobals());

interface Ramp { readonly to: number; readonly at: number }

/** Enough of a context to see what the theme asks for, and nothing more. */
function stub(state: 'running' | 'suspended' = 'running') {
  const ramps: Ramp[] = [];
  const sources: { loop: boolean; loopStart: number; loopEnd: number; started: boolean; stoppedAt: number | null; buffer: unknown; disconnect: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn> }[] = [];
  const gain = {
    value: 0,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn((v: number) => { gain.value = v; }),
    linearRampToValueAtTime: vi.fn((to: number, at: number) => { ramps.push({ to, at }); gain.value = to; }),
  };
  const context = {
    state,
    currentTime: 5,
    createGain: () => ({ gain, connect: vi.fn(), disconnect: vi.fn() }),
    createBufferSource() {
      const node = {
        loop: false, loopStart: 0, loopEnd: 0, buffer: null as unknown, started: false, stoppedAt: null as number | null,
        connect: vi.fn(), disconnect: vi.fn(), onended: null as (() => void) | null,
        start: vi.fn(() => { node.started = true; }),
        stop: vi.fn((at?: number) => { node.stoppedAt = at ?? 0; }),
      };
      sources.push(node);
      return node;
    },
    decodeAudioData: vi.fn(async () => ({ length: 1000, duration: 152, sampleRate: 44100, numberOfChannels: 2 })),
  };
  return { context: context as unknown as AudioContext, gain, ramps, sources, raw: context };
}

const ok = () => vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));

/** A decoded theme: `seconds` long, silent but for one hit `hitSec` in, like the shipped MP3. */
function decoded(seconds: number, hitSec: number, rate = 1000) {
  const length = Math.round(seconds * rate), data = new Float32Array(length);
  if (hitSec * rate < length) data[Math.round(hitSec * rate)] = 0.4;
  return { length, duration: length / rate, sampleRate: rate, numberOfChannels: 1, getChannelData: () => data } as unknown as AudioBuffer;
}

describe('the theme\'s seamless loop', () => {
  it('finds the music\'s start from its opening hit and loops exactly the delivered length past the encoder\'s smear', () => {
    // As decoded in Chromium: the 0.1 s head, 23 ms of decoder delay, and the hit 2.1 ms into the music.
    const loop = themeLoop(decoded(64.392, 0.125))!;
    expect(loop.offset).toBeCloseTo(0.125 - THEME.onsetSec, 3);
    expect(loop.start).toBeCloseTo(loop.offset + THEME.seamSec, 9);
    expect(loop.end - loop.start).toBeCloseTo(THEME.loopSec, 9);
    expect(THEME.loopSec).toBe(64);
    // The span after the loop's end is the opening copied by the encoder: it must hold it.
    expect(loop.end).toBeLessThanOrEqual(64.392);
    // A decoder that trims the delay finds the start 23 ms earlier; the loop is the same length.
    const trimmed = themeLoop(decoded(64.37, 0.102))!;
    expect(trimmed.end - trimmed.start).toBeCloseTo(THEME.loopSec, 9);
    expect(trimmed.offset).toBeCloseTo(0.102 - THEME.onsetSec, 3);
  });
  it('falls back to the file\'s own ends rather than looping something that is not the theme', () => {
    // Too short to hold the loop: the wrong file, or a truncated download.
    expect(themeLoop(decoded(30, 0.125))).toBeNull();
    // Nothing readable at all.
    expect(themeLoop({ length: 1000, duration: 152, sampleRate: 44100, numberOfChannels: 2 } as unknown as AudioBuffer)).toBeNull();
    // No hit in the window: the measured fallback start, still a whole loop.
    const silent = themeLoop(decoded(64.392, 10))!;
    expect(silent.offset).toBeCloseTo(THEME.leadIn.fallbackSec - THEME.onsetSec, 3);
  });
  it('starts on the opening and loops between the points it found', async () => {
    vi.stubGlobal('fetch', ok());
    const { context, sources, raw } = stub();
    raw.decodeAudioData = vi.fn(async () => decoded(64.392, 0.125));
    const theme = new ThemeMusic(context, {} as AudioNode);
    await theme.enter();
    const source = sources[0]!;
    const loop = themeLoop(decoded(64.392, 0.125))!;
    expect(source.loop).toBe(true);
    expect(source.loopStart).toBeCloseTo(loop.start, 9);
    expect(source.loopEnd).toBeCloseTo(loop.end, 9);
    expect(source.start).toHaveBeenCalledWith(0, loop.offset);
  });
});

describe('the title theme', () => {
  it('fetches nothing at all while audio is not allowed to sound', async () => {
    // A player who taps straight through to a level never pays for a track they would
    // not have heard, so the cost of the title screen's music is zero until it plays.
    const fetcher = ok();
    vi.stubGlobal('fetch', fetcher);
    const { context, sources } = stub('suspended');
    const theme = new ThemeMusic(context, {} as AudioNode);
    await theme.enter();
    expect(fetcher).not.toHaveBeenCalled();
    expect(theme.ready).toBe(false);
    expect(theme.playing).toBe(false);
    expect(sources).toHaveLength(0);
  });

  it('loads once and loops at the level it was matched to', async () => {
    const fetcher = ok();
    vi.stubGlobal('fetch', fetcher);
    const { context, sources, ramps } = stub();
    const theme = new ThemeMusic(context, {} as AudioNode);
    await theme.enter();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(theme.ready).toBe(true);
    expect(theme.playing).toBe(true);
    expect(sources).toHaveLength(1);
    expect(sources[0]!.loop).toBe(true);
    expect(sources[0]!.started).toBe(true);
    // Faded up rather than cut in, and to the gain that matches the gameplay track.
    expect(ramps.at(-1)).toEqual({ to: THEME.gain, at: 5 + THEME.fadeInSec });
  });

  it('does not stack a second copy when the title screen asks again', async () => {
    const fetcher = ok();
    vi.stubGlobal('fetch', fetcher);
    const { context, sources } = stub();
    const theme = new ThemeMusic(context, {} as AudioNode);
    await theme.enter();
    await theme.enter();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(sources).toHaveLength(1);
  });

  it('does not keep a fading copy when the title screen comes back', async () => {
    // leave() schedules the stop at the end of the fade and drops its playing
    // reference. Coming back before that stop used to start a second copy on top.
    vi.stubGlobal('fetch', ok());
    const { context, sources } = stub();
    const theme = new ThemeMusic(context, {} as AudioNode);
    await theme.enter();
    theme.leave();
    await theme.enter();
    expect(theme.playing).toBe(true);
    expect(sources).toHaveLength(2);
    expect(sources[0]!.disconnect).toHaveBeenCalled();
    expect(sources[0]!.stoppedAt).toBe(5 + THEME.fadeOutSec);
    expect(sources[1]!.started).toBe(true);
    expect(sources[1]!.stoppedAt).toBeNull();
  });

  it('fades out and stops on the way off the title screen', async () => {
    vi.stubGlobal('fetch', ok());
    const { context, sources, ramps } = stub();
    const theme = new ThemeMusic(context, {} as AudioNode);
    await theme.enter();
    theme.leave();
    expect(theme.playing).toBe(false);
    expect(ramps.at(-1)).toEqual({ to: 0, at: 5 + THEME.fadeOutSec });
    // Stopped at the end of the fade, not on the frame the player tapped.
    expect(sources[0]!.stoppedAt).toBe(5 + THEME.fadeOutSec);
  });

  it('never starts a track into a title screen the player has already left', async () => {
    // The decode lands after the tap that leaves; starting then would play music under
    // the map.
    let release: (() => void) | undefined;
    vi.stubGlobal('fetch', vi.fn(async () => {
      await new Promise<void>(resolve => { release = resolve; });
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    }));
    const { context, sources } = stub();
    const theme = new ThemeMusic(context, {} as AudioNode);
    const entering = theme.enter();
    theme.leave();
    release?.();
    await entering;
    expect(theme.playing).toBe(false);
    expect(sources).toHaveLength(0);
  });

  it('leaves the title screen quiet rather than throwing when the track will not load', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) })));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { context } = stub();
    const theme = new ThemeMusic(context, {} as AudioNode);
    await expect(theme.enter()).resolves.toBeUndefined();
    expect(theme.playing).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('stops for good when the engine goes', async () => {
    vi.stubGlobal('fetch', ok());
    const { context, sources } = stub();
    const theme = new ThemeMusic(context, {} as AudioNode);
    await theme.enter();
    theme.dispose();
    expect(theme.playing).toBe(false);
    expect(sources[0]!.stoppedAt).toBe(0);
    await theme.enter();
    expect(sources).toHaveLength(1);
  });
});
