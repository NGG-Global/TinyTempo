import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeMusic } from '../src/audio/ThemeMusic';
import { THEME } from '../src/config/music';

afterEach(() => vi.unstubAllGlobals());

interface Ramp { readonly to: number; readonly at: number }

/** Enough of a context to see what the theme asks for, and nothing more. */
function stub(state: 'running' | 'suspended' = 'running') {
  const ramps: Ramp[] = [];
  const sources: { loop: boolean; started: boolean; stoppedAt: number | null; buffer: unknown }[] = [];
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
        loop: false, buffer: null as unknown, started: false, stoppedAt: null as number | null,
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
