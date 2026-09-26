import type { Voice } from './AudioEngine';

/**
 * The recorded one-shots.
 *
 * Every other sound in the game is synthesized at runtime, which is what kept the download
 * to one music track. These six acts are the exception: a stomp, a snip, a grunt, two
 * wipes, a trombone's two notes and two endings, and a clap with the three rooms that
 * answer it, delivered as recordings, because a
 * voice can be *performed* in a way a few lines of oscillator maths cannot reach. They are an enhancement over a working game, never a
 * dependency of one — a bank that fails to load leaves every act on the synthesis it
 * already had, which is why `load` resolves rather than rejects and `get` returns null.
 *
 * They ride the same route as the music: a file outside `public/`, referenced through
 * `import.meta.url` so Vite hashes and emits it, and served from local storage in the
 * Android WebView.
 */

/** Files as delivered. Levels and edits belong in the source WAV, not in a gain here. */
export const SAMPLE_URLS = {
  shoe: new URL('../../sfx/shoe.wav', import.meta.url).href,
  scissors: new URL('../../sfx/scissors.wav', import.meta.url).href,
  grunt: new URL('../../sfx/grunt.wav', import.meta.url).href,
  wipe1: new URL('../../sfx/wipe-1.wav', import.meta.url).href,
  wipe2: new URL('../../sfx/wipe-2.wav', import.meta.url).href,
  // The trombone's two notes and its two endings. MP3 as delivered: see docs/SOUND.md for
  // why these four are not WAV like the others.
  trombone1: new URL('../../sfx/trombone-1.mp3', import.meta.url).href,
  trombone2: new URL('../../sfx/trombone-2.mp3', import.meta.url).href,
  tromboneSuccess: new URL('../../sfx/trombone-success.mp3', import.meta.url).href,
  tromboneFail: new URL('../../sfx/trombone-fail.mp3', import.meta.url).href,
  // The clap. The beat is WAV as delivered, like every other percussive take; its three
  // endings are four seconds of applause each, encoded from the masters in sfx/masters/
  // by `npm run sfx:encode` for the same reason the trombone's endings are MP3.
  clap: new URL('../../sfx/clap.wav', import.meta.url).href,
  clapSuccess: new URL('../../sfx/clap-success.mp3', import.meta.url).href,
  clapPartial: new URL('../../sfx/clap-partial.mp3', import.meta.url).href,
  clapFail: new URL('../../sfx/clap-fail.mp3', import.meta.url).href,
} as const;

export type SampleName = keyof typeof SAMPLE_URLS;

/**
 * Loud enough to be the sound starting rather than the room it was recorded in. The
 * quietest delivered attack clears this by a wide margin and the noise floors sit two
 * orders of magnitude below it.
 */
export const ATTACK_THRESHOLD = 0.01;

/**
 * The frame the sound actually starts on.
 *
 * A recorded one-shot carries whatever silence sat before the take: the delivered files
 * open with between 0.1 ms and 25 ms of it. A beat sound is scheduled *on* the grid, so
 * that silence is not padding, it is lateness — 25 ms against a 55 ms Perfect window,
 * charged to every demonstration beat and then to the player copying what they heard.
 * The music already drops its own lead for exactly this reason (`detectLeadIn`).
 *
 * Returns 0 when nothing crosses, so a sample that is all quiet plays as delivered rather
 * than vanishing.
 */
export function attackFrame(channels: readonly Float32Array[], threshold = ATTACK_THRESHOLD): number {
  const length = channels[0]?.length ?? 0;
  for (let i = 0; i < length; i++) {
    for (const data of channels) if (Math.abs(data[i] ?? 0) > threshold) return i;
  }
  return 0;
}

/** Channel views of a buffer, in order. */
function channelsOf(buffer: AudioBuffer): Float32Array[] {
  return Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
}

/**
 * The same buffer with its leading silence dropped, so the transient lands on the instant
 * it was scheduled for. Nothing else about the sound changes — this is alignment, not a
 * mix decision.
 */
export function trimToAttack(context: BaseAudioContext, source: AudioBuffer, threshold = ATTACK_THRESHOLD): AudioBuffer {
  const lead = attackFrame(channelsOf(source), threshold);
  if (lead <= 0 || lead >= source.length) return source;
  const target = context.createBuffer(source.numberOfChannels, source.length - lead, source.sampleRate);
  for (let channel = 0; channel < source.numberOfChannels; channel++) {
    target.copyToChannel(source.getChannelData(channel).subarray(lead), channel);
  }
  return target;
}

/**
 * The decoded one-shots, for whichever AudioContext is current.
 *
 * Game-wide like the engine that owns the context, because the buffers belong to that
 * context and decoding them per act would repeat the work for nothing. A context it has
 * not seen clears the bank rather than handing back buffers another context cannot play.
 */
export class SampleBank {
  private readonly buffers = new Map<SampleName, AudioBuffer>();
  /**
   * Names that failed to arrive for the current context. A level start awaits `load`,
   * so retrying a miss on every level is a delay in front of the grid for a sample
   * that will not be there.
   */
  private readonly missing = new Set<SampleName>();
  private context: BaseAudioContext | null = null;
  private pending: Promise<void> | null = null;

  public get ready(): boolean { return this.buffers.size > 0; }

  /** The decoded sample, or null while it has not loaded — or could not. */
  public get(name: SampleName): AudioBuffer | null {
    return this.buffers.get(name) ?? null;
  }

  /**
   * Fetch and decode every sample. Idempotent, and it never rejects: a sample that does
   * not arrive is simply absent, and the act that wanted it keeps the synthesized voice
   * it shipped with. A failed bank is a game that sounds like it used to, not a broken one.
   */
  public load(context: BaseAudioContext): Promise<void> {
    if (this.context !== context) {
      this.buffers.clear();
      this.missing.clear();
      this.context = context;
      this.pending = null;
    }
    if (this.pending) return this.pending;
    const names = (Object.keys(SAMPLE_URLS) as SampleName[]).filter(
      name => !this.buffers.has(name) && !this.missing.has(name),
    );
    if (names.length === 0) return Promise.resolve();
    const flight = Promise.all(names.map(async name => {
      try {
        const response = await fetch(SAMPLE_URLS[name]);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const decoded = await context.decodeAudioData(await response.arrayBuffer());
        // A context swapped mid-flight would have cleared the bank; do not repopulate it.
        if (this.context !== context) return;
        this.buffers.set(name, trimToAttack(context, decoded));
      } catch (error) {
        // Only remember the failure for the context that asked. A newer context has
        // already cleared `missing` and must be allowed to try for itself.
        if (this.context === context) this.missing.add(name);
        console.warn(`Sound sample "${name}" is unavailable; using the synthesized voice.`, error);
      }
    })).then(() => undefined);
    this.pending = flight;
    // Identity, not a bare clear: a context swap starts a newer flight, and the older
    // one's `finally` must not drop that newer promise or the next level fetches twice.
    void flight.finally(() => { if (this.pending === flight) this.pending = null; });
    return flight;
  }

  /** Drops the decoded buffers. The next `load` fetches again. */
  public clear(): void {
    this.buffers.clear();
    this.missing.clear();
    this.context = null;
    this.pending = null;
  }
}

/** One bank for the game, beside the one engine that owns the context it decodes into. */
export const samples = new SampleBank();

/**
 * The recorded takes for a voice, or the synthesized one the act shipped with when none
 * of them arrived. The fallback is a thunk because synthesizing it is wasted work on the
 * common path, and an act that lists several takes wants them alternated, not layered.
 */
export function recordedVoice(fallback: () => AudioBuffer, names: readonly SampleName[], bank: SampleBank = samples): Voice {
  const takes = names.map(name => bank.get(name)).filter((take): take is AudioBuffer => take !== null);
  return takes.length > 0 ? takes : fallback();
}
