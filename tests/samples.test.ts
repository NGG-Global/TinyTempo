import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ATTACK_THRESHOLD, attackFrame, recordedVoice, SAMPLE_URLS, SampleBank, trimToAttack,
} from '../src/audio/samples';
import { AudioEngine } from '../src/audio/AudioEngine';

afterEach(() => vi.unstubAllGlobals());

/** Enough of a context to hold buffers: the bank only ever copies channel data. */
function fakeContext(decoded?: (url: string) => { channels: Float32Array[]; rate?: number }): BaseAudioContext {
  return {
    sampleRate: 44100,
    createBuffer(channels: number, length: number, sampleRate: number) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return {
        numberOfChannels: channels, length, sampleRate, duration: length / sampleRate,
        getChannelData: (c: number) => data[c]!,
        copyToChannel: (from: Float32Array, c: number) => { data[c]!.set(from); },
      };
    },
    decodeAudioData: async (bytes: ArrayBuffer) => {
      const url = new TextDecoder().decode(bytes);
      const { channels, rate = 44100 } = decoded?.(url) ?? { channels: [new Float32Array([0, 1])] };
      return {
        numberOfChannels: channels.length, length: channels[0]!.length, sampleRate: rate,
        duration: channels[0]!.length / rate,
        getChannelData: (c: number) => channels[c]!,
      };
    },
  } as unknown as BaseAudioContext;
}

const buffer = (context: BaseAudioContext, data: readonly number[]): AudioBuffer => {
  const b = context.createBuffer(1, data.length, 44100);
  b.getChannelData(0).set(data);
  return b;
};

describe('where a recorded sound actually starts', () => {
  it('finds the first frame that crosses, on any channel', () => {
    expect(attackFrame([new Float32Array([0, 0, 0, 0.5, 0.9])])).toBe(3);
    // A stereo take whose transient lands on one side first still starts there.
    expect(attackFrame([new Float32Array([0, 0, 0.5]), new Float32Array([0, 0.5, 0])])).toBe(1);
    expect(attackFrame([new Float32Array([-0.9, 0])])).toBe(0);
  });

  it('treats the noise floor of a room as silence, not as the sound', () => {
    const floor = new Float32Array([0.002, -0.003, 0.001, 0.8]);
    expect(attackFrame([floor])).toBe(3);
    expect(ATTACK_THRESHOLD).toBeGreaterThan(0.003);
  });

  it('gives up rather than swallowing a sample it cannot find a start in', () => {
    // A quiet take plays as delivered; returning its length would make it silent.
    expect(attackFrame([new Float32Array([0, 0, 0])])).toBe(0);
    expect(attackFrame([])).toBe(0);
  });
});

describe('aligning a recorded beat to the grid it is scheduled on', () => {
  const context = fakeContext();

  it('drops the leading silence so the transient lands on the instant it was booked', () => {
    // 25 ms of silence at 44.1 kHz is 1100 frames, and the Perfect window is 55 ms: a
    // sample played as delivered puts every demonstration beat measurably late.
    const lead = Array.from({ length: 1100 }, () => 0);
    const source = buffer(context, [...lead, 0.9, 0.4, 0.1]);
    const trimmed = trimToAttack(context, source);
    expect(trimmed.length).toBe(3);
    expect(Array.from(trimmed.getChannelData(0))).toEqual([0.9, 0.4, 0.1].map(Math.fround));
  });

  it('leaves a sample that already starts on its transient exactly as delivered', () => {
    const source = buffer(context, [0.9, 0.4]);
    expect(trimToAttack(context, source)).toBe(source);
    const quiet = buffer(context, [0, 0, 0]);
    expect(trimToAttack(context, quiet)).toBe(quiet);
  });
});

describe('the sample bank', () => {
  const urls = Object.values(SAMPLE_URLS);
  const takes = (): Record<string, { channels: Float32Array[] }> =>
    Object.fromEntries(urls.map((url, i) => [url, { channels: [new Float32Array([0, 0, 0.9, 0.2 + i / 100])] }]));

  const stubFetch = (fail: readonly string[] = []): ReturnType<typeof vi.fn> => {
    const fetcher = vi.fn(async (url: string) => (
      fail.includes(url)
        ? { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }
        : { ok: true, arrayBuffer: async () => new TextEncoder().encode(url).buffer }
    ));
    vi.stubGlobal('fetch', fetcher);
    return fetcher;
  };

  it('decodes every sample once and aligns each one', async () => {
    const table = takes();
    const fetcher = stubFetch();
    const bank = new SampleBank();
    const context = fakeContext(url => table[url]!);
    await bank.load(context);
    expect(fetcher).toHaveBeenCalledTimes(urls.length);
    expect(bank.ready).toBe(true);
    // Two frames of silence dropped from each.
    expect(bank.get('grunt')!.length).toBe(2);
    // A second load is free: the buffers are already decoded for this context.
    await bank.load(context);
    expect(fetcher).toHaveBeenCalledTimes(urls.length);
  });

  it('leaves an act on its synthesized voice rather than failing the level', async () => {
    // A bank is an enhancement over a game that already works, so it never rejects.
    stubFetch(urls);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const bank = new SampleBank();
    await expect(bank.load(fakeContext())).resolves.toBeUndefined();
    expect(bank.ready).toBe(false);
    expect(bank.get('shoe')).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('keeps the samples that did arrive when one of them did not', async () => {
    const table = takes();
    const fetcher = stubFetch([SAMPLE_URLS.wipe2]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const bank = new SampleBank();
    const context = fakeContext(url => table[url]!);
    await bank.load(context);
    expect(bank.get('wipe1')).not.toBeNull();
    expect(bank.get('wipe2')).toBeNull();
    // A later level awaits this same load. The miss stays missed for this context
    // instead of being fetched again in front of the grid.
    await bank.load(context);
    expect(fetcher).toHaveBeenCalledTimes(urls.length);
    warn.mockRestore();
  });

  it('tries a missed sample again for a context it has not decoded into', async () => {
    const table = takes();
    const fetcher = stubFetch([SAMPLE_URLS.shoe]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const bank = new SampleBank();
    await bank.load(fakeContext(url => table[url]!));
    const first = fetcher.mock.calls.length;
    await bank.load(fakeContext(url => table[url]!));
    expect(fetcher.mock.calls.length).toBe(first + urls.length);
    warn.mockRestore();
  });

  it('never hands a buffer to a context that cannot play it', async () => {
    const table = takes();
    stubFetch();
    const bank = new SampleBank();
    await bank.load(fakeContext(url => table[url]!));
    expect(bank.get('shoe')).not.toBeNull();
    // A fresh context owns fresh buffers; the old ones belong to a context that is gone.
    const second = fakeContext(url => table[url]!);
    const pending = bank.load(second);
    expect(bank.get('shoe')).toBeNull();
    await pending;
    expect(bank.get('shoe')).not.toBeNull();
  });
});

describe('choosing a voice', () => {
  const context = fakeContext();

  it('prefers the recorded takes and never synthesizes what it does not need', async () => {
    const table = Object.fromEntries(
      Object.values(SAMPLE_URLS).map(url => [url, { channels: [new Float32Array([0.9, 0.5])] }]),
    );
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode(url).buffer })));
    const bank = new SampleBank();
    await bank.load(fakeContext(url => table[url]!));
    const fallback = vi.fn(() => buffer(context, [1]));
    const voice = recordedVoice(fallback, ['wipe1', 'wipe2'], bank);
    expect(Array.isArray(voice)).toBe(true);
    expect(voice).toHaveLength(2);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('falls back to the synthesized voice when the bank is empty', () => {
    const fallback = buffer(context, [1]);
    expect(recordedVoice(() => fallback, ['wipe1', 'wipe2'], new SampleBank())).toBe(fallback);
  });
});

describe('an act with more than one take', () => {
  it('alternates them, and starts over when the act changes', () => {
    const played: number[] = [];
    vi.stubGlobal('AudioContext', class {
      currentTime = 0;
      state = 'running';
      sampleRate = 44100;
      destination = {};
      createGain() { return { gain: { value: 1, setValueAtTime: vi.fn() }, connect: (t: object) => t, disconnect: vi.fn() }; }
      createBuffer(channels: number, length: number) {
        return { numberOfChannels: channels, length, getChannelData: () => new Float32Array(length) };
      }
      createBufferSource() {
        return {
          playbackRate: { value: 1 }, buffer: null as { length: number } | null,
          connect: (t: object) => t, disconnect: vi.fn(), onended: null,
          start: vi.fn(), stop: vi.fn(),
        };
      }
    });
    const engine = new AudioEngine();
    const take = (length: number): AudioBuffer => engine.context.createBuffer(1, length, 44100);
    const spy = vi.spyOn(engine as unknown as { playBuffer: (t: number, b: AudioBuffer) => void }, 'playBuffer')
      .mockImplementation((_t, b) => { played.push(b.length); });
    const one = take(11), two = take(22);
    engine.setSounds({ action: [one, two], success: one, rough: one, scrape: one, judder: one });
    for (let i = 0; i < 5; i++) engine.play(0, 'action');
    expect(played).toEqual([11, 22, 11, 22, 11]);
    // A new act begins on its own first take rather than wherever the last one stopped.
    played.length = 0;
    const solo = take(33);
    engine.setSounds({ action: solo, success: solo, rough: solo, scrape: solo, judder: solo });
    for (let i = 0; i < 3; i++) engine.play(0, 'action');
    expect(played).toEqual([33, 33, 33]);
    spy.mockRestore();
  });
});
