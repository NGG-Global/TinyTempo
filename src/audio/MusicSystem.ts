import { GAMEPLAY_TRACKS, MUSIC, TRACK_CYCLE, loopSeconds, pickupSeconds, stemLevel, type GameplayTrack, type TrackId } from '../config/music';
import { metronomeBar } from './metronomeSounds';

export function validateLoopBuffer(buffer: AudioBuffer | null): number {
  if (!buffer || buffer.length <= 0 || buffer.sampleRate <= 0) throw new Error('Music track is empty or invalid.');
  return buffer.duration;
}

/**
 * First frame on which any channel exceeds the threshold: the track's opening transient
 * marks the first downbeat. Returns the fallback when nothing exceeds it, and when the
 * crossing lands outside the plausible range — a silent head, a wrong file, or a hit later
 * in the opening bar would otherwise shift the beat grid against the music permanently.
 * It does not catch a trigger a granule early on encoder pre-echo, which stays within the
 * range; the guard is against a grossly wrong detection, not a few milliseconds of smear.
 */
export function detectLeadIn(
  reference: AudioBuffer, threshold: number, fallbackSec: number, minSec: number, maxSec: number,
): number {
  const fallback = Math.round(fallbackSec * reference.sampleRate);
  const channels = Array.from({ length: reference.numberOfChannels }, (_, c) => reference.getChannelData(c));
  const limit = Math.min(reference.length, Math.round(reference.sampleRate * maxSec));
  const floor = Math.round(reference.sampleRate * minSec);
  for (let i = 0; i < limit; i++) for (const data of channels) if (Math.abs(data[i]!) > threshold) return i < floor ? fallback : i;
  return fallback;
}

/**
 * Copies the decoded track into an exact whole-bar loop buffer: `lead` frames of exported
 * pre-roll (and decoder delay) before the first downbeat are dropped and the tail is
 * padded or trimmed so the loop length is precisely the track's bars. Native looping then
 * keeps the bar grid aligned indefinitely instead of slipping by the export's rounding.
 */
export function normalizeLoop(context: BaseAudioContext, source: AudioBuffer, lead: number, track: GameplayTrack): AudioBuffer {
  const frames = Math.round(loopSeconds(track) * source.sampleRate);
  if (!Number.isInteger(lead) || lead < 0) throw new Error('Lead-in must be a whole number of frames.');
  if (source.length <= lead) throw new Error('Music track is shorter than its lead-in.');
  if (lead === 0 && source.length === frames) return source;
  const target = context.createBuffer(source.numberOfChannels, frames, source.sampleRate);
  for (let channel = 0; channel < source.numberOfChannels; channel++) {
    target.copyToChannel(source.getChannelData(channel).subarray(lead, lead + frames), channel);
  }
  return target;
}

/**
 * One gameplay track, looped whole on the existing AudioContext: every stem of it as its
 * own source, started on the same sample and driven by the same rate automation, so the
 * stems can be brought in one at a time and never drift apart. A premixed track is one
 * stem. The metronome is one more looping source of a single bar, on the same terms.
 *
 * One track is decoded at a time. A decoded stem is ~38 MB of float PCM and the
 * normalising copy adds one more transiently, so a six-stem track holds ~230 MB — the
 * cost the premix was made to avoid, paid here for a mix that answers the player; holding
 * two tracks would double it for a switch that happens once every twenty-five levels, so
 * selecting a different track drops the loaded one before the next fetch begins. Scenes
 * select at their boundaries — the menu's PLAY, a shell screen's create, a level's start —
 * never while a level is running, and `load` stops the sources when the track changes
 * because a source can only play the buffer it was given.
 */
export class MusicSystem {
  private readonly bus: GainNode;
  private level: number;
  private sources: AudioBufferSourceNode[] = [];
  private buffers: AudioBuffer[] = [];
  private stemGains: GainNode[] = [];
  /** Where each stem's source enters its chain: the stem's tone filter, or its gain. */
  private stemInputs: AudioNode[] = [];
  /** The gain each stem's layer gain was last set to: its trim when heard, 0 when not. */
  private stemLevels: number[] = [];
  /** Each stem's trim as a gain: the level it is heard at. */
  private stemTrims: number[] = [];
  /** Every tone and low-cut filter the loaded track's stems pass through, for release. */
  private stemFilters: BiquadFilterNode[] = [];
  private layers = 0;
  private click: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  private clickBar: AudioBuffer | null = null;
  private pending: Promise<void> | null = null;
  private pendingTrack: TrackId | null = null;
  private abort: AbortController | null = null;
  private selected: TrackId = TRACK_CYCLE[0]!;
  private loaded: TrackId | null = null;
  private disposed = false;
  private origin: number | null = null;
  private leadInFrames = 0;
  private rate = 1;
  private generation = 0;
  public constructor(private readonly context: AudioContext, destination: AudioNode) {
    this.level = this.track.gain;
    this.bus = context.createGain();
    this.bus.gain.value = this.level;
    this.bus.connect(destination);
  }
  /** The track that is loaded, or, while none is, the one selected. */
  public get track(): GameplayTrack { return GAMEPLAY_TRACKS[this.loaded ?? this.selected]; }
  /** The loaded track's id; null until a load has committed. */
  public get trackId(): TrackId | null { return this.loaded; }
  /** The id the last `load` asked for, which a pending load is fetching. */
  public get selectedTrack(): TrackId { return this.selected; }
  /** The bus gain the loaded track is meant to play at: what `setGain` restores to. */
  public get trackGain(): number { return this.track.gain; }
  public get ready(): boolean { return this.buffers.length > 0; }
  /** Stem sources playing: one for a premix, one per stem for a layered track. */
  public get activeSources(): number { return this.sources.length; }
  /** How many stems are heard, or scheduled to be, of the loaded track. */
  public get activeLayers(): number { return this.layers; }
  /** How many stems the loaded track has: what the shell hears, and the most a level can earn. */
  public get stemCount(): number { return this.buffers.length; }
  /** Whether the metronome bar is looping with the track. */
  public get metronome(): boolean { return this.click !== null; }
  public get startTime(): number | null { return this.origin; }
  public get downbeatTime(): number | null { return this.origin === null ? null : this.origin + pickupSeconds(MUSIC.sourceBpm, MUSIC.pickupBeats); }
  public get duration(): number { return this.buffers[0]?.duration ?? 0; }
  /** Diagnostic: frames dropped before the first downbeat of the shipped decode. */
  public get leadInSeconds(): number { return this.buffers[0] ? this.leadInFrames / this.buffers[0].sampleRate : 0; }
  public get playbackGeneration(): number { return this.generation; }
  /** Diagnostic only. Gameplay never uses file position or loop count as its clock. */
  public get completedLoops(): number { return this.origin === null ? 0 : Math.floor(Math.max(0, this.context.currentTime - this.origin) / this.duration); }
  public get gain(): number { return this.level; }
  /** Most recently scheduled playback rate (1 = the source tempo). */
  public get playbackRate(): number { return this.rate; }

  /**
   * Atomic load of one track: playback cannot start until every stem has been fetched,
   * decoded and validated. Stems are decoded one after another, so the transient cost is
   * one decode over the stems already held rather than all of them at once. The lead-in
   * is detected on the first stem and applied to every one: each stem's own first sound
   * sits somewhere else in the bar, and they have to stay sample-aligned. The same track
   * is loaded once and shared by concurrent callers. Asking for a different track stops
   * the sources, releases the loaded loop and cancels a load of any other; the callers of
   * that load are told it was superseded.
   */
  public load(id: TrackId = this.selected): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Music is disposed.'));
    if (id !== this.selected) {
      this.selected = id;
      this.abort?.abort();
    }
    if (this.loaded === id && this.ready) return Promise.resolve();
    if (this.pending && this.pendingTrack === id) return this.pending;
    if (this.loaded !== null) {
      this.stop();
      this.release();
    }
    const track: GameplayTrack = GAMEPLAY_TRACKS[id];
    const abort = new AbortController();
    this.abort = abort;
    this.pendingTrack = id;
    const superseded = (): Error => this.disposed ? new Error('Music was disposed during loading.') : new Error('Music load was superseded by another track.');
    const load = (async () => {
      const buffers: AudioBuffer[] = [];
      let lead = 0;
      for (const stem of track.stems) {
        const response = await fetch(stem.url, { signal: abort.signal });
        if (!response.ok) throw new Error(`Could not load the music track (${response.status}).`);
        const decoded = await this.context.decodeAudioData(await response.arrayBuffer());
        if (this.disposed || abort.signal.aborted) throw superseded();
        validateLoopBuffer(decoded);
        if (buffers.length === 0) lead = detectLeadIn(decoded, track.leadIn.threshold, track.leadIn.fallbackSec, track.leadIn.minSec, track.leadIn.maxSec);
        const buffer = normalizeLoop(this.context, decoded, lead, track);
        validateLoopBuffer(buffer);
        if (buffers.length > 0 && buffer.length !== buffers[0]!.length) throw new Error('The stems of a track must decode to one length.');
        buffers.push(buffer);
      }
      return { buffers, lead };
    })().then(({ buffers, lead }) => {
      if (this.disposed || abort.signal.aborted) throw superseded();
      this.leadInFrames = lead;
      this.buffers = buffers;
      // Each stem's chain: source → tone (when it has one) → layer gain → bus. The layer
      // gain carries the stem's trim when it is heard and 0 when it is not, so the mix and
      // the arrangement are one parameter and nothing can play a stem untrimmed.
      this.stemTrims = track.stems.map(stemLevel);
      this.stemGains = track.stems.map((_, i) => {
        const gain = this.context.createGain();
        gain.gain.value = this.stemTrims[i]!;
        gain.connect(this.bus);
        return gain;
      });
      // Built from the gain back towards the source: low cut → tone → layer gain.
      this.stemInputs = track.stems.map((stem, i) => {
        let input: AudioNode = this.stemGains[i]!;
        for (const [type, hz] of [['lowpass', stem.toneHz], ['highpass', stem.lowCutHz]] as const) {
          if (hz === undefined) continue;
          const filter = this.context.createBiquadFilter();
          filter.type = type;
          filter.frequency.value = hz;
          filter.Q.value = Math.SQRT1_2;
          filter.connect(input);
          this.stemFilters.push(filter);
          input = filter;
        }
        return input;
      });
      this.stemLevels = [...this.stemTrims];
      this.layers = buffers.length;
      this.loaded = id;
      // Nothing is playing — a change of track stopped the sources above — so the bus can
      // take the new track's level now, before anything hears it.
      if (this.level !== track.gain) this.setGain(track.gain, 0);
    }).catch((error: unknown) => {
      abort.abort();
      throw error;
    }).finally(() => {
      if (this.pending === load) { this.pending = null; this.pendingTrack = null; }
      if (this.abort === abort) this.abort = null;
    });
    this.pending = load;
    return load;
  }
  /**
   * Returns the first musical downbeat, retaining the audible pickup at source position
   * zero. Every stem starts on that sample; `layers` says how many are heard from it (the
   * shell takes them all, a level its first alone), and `metronome` adds the click bar,
   * started on the same sample so its accent is the loop's downbeat.
   */
  public start(at = this.context.currentTime + MUSIC.startLeadSec, options?: { layers?: number; metronome?: boolean }): number {
    if (this.disposed || !this.ready) throw new Error('Load the music track before playback.');
    if (this.context.state !== 'running') throw new Error('Unlock audio before starting music.');
    if (!Number.isFinite(at) || at <= this.context.currentTime) throw new Error('Schedule music at a future shared timestamp.');
    const layers = Math.max(1, Math.min(this.buffers.length, options?.layers ?? this.buffers.length));
    if (!Number.isInteger(layers)) throw new Error('Layers are a whole number of stems.');
    this.stop();
    const end = validateLoopBuffer(this.buffers[0]!);
    try {
      this.rate = 1;
      this.buffers.forEach((buffer, i) => {
        const source = this.loopSource(buffer, end, this.stemInputs[i]!);
        source.start(at, 0);
        this.sources.push(source);
      });
      this.layers = layers;
      this.stemGains.forEach((gain, i) => {
        const level = i < layers ? this.stemTrims[i]! : 0;
        gain.gain.cancelScheduledValues(this.context.currentTime);
        gain.gain.setValueAtTime(level, this.context.currentTime);
        this.stemLevels[i] = level;
      });
      if (options?.metronome) {
        this.clickBar ??= metronomeBar(this.context);
        const gain = this.context.createGain();
        gain.gain.value = MUSIC.metronome.gain;
        gain.connect(this.bus);
        const source = this.loopSource(this.clickBar, this.clickBar.duration, gain);
        source.start(at, 0);
        this.click = { source, gain };
      }
      this.origin = at;
      this.generation++;
      return this.downbeatTime!;
    } catch (error) { this.stop(); throw error; }
  }
  private loopSource(buffer: AudioBuffer, end: number, destination: AudioNode): AudioBufferSourceNode {
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = end;
    source.playbackRate.value = 1;
    source.connect(destination);
    return source;
  }
  /**
   * How many stems are heard from `at`, which the caller places on a bar line with the
   * tempo change: a stem joining or leaving fades over `fadeSec` from there, so the change
   * reads as the arrangement moving rather than a cut. Clamped to what the track has, so
   * a premix hears nothing.
   */
  public setLayers(count: number, at: number, fadeSec: number = MUSIC.layers.fadeSec): void {
    if (this.disposed || !this.ready) return;
    if (!Number.isInteger(count) || count < 1) throw new Error('At least one stem is always heard.');
    if (!Number.isFinite(at) || !Number.isFinite(fadeSec) || fadeSec < 0) throw new Error('A layer change needs a finite time and fade.');
    const layers = Math.min(this.buffers.length, count);
    const start = Math.max(at, this.context.currentTime);
    this.stemGains.forEach((gain, i) => {
      const level = i < layers ? this.stemTrims[i]! : 0;
      if (level === this.stemLevels[i]) return;
      gain.gain.cancelScheduledValues(start);
      gain.gain.setValueAtTime(this.stemLevels[i]!, start);
      if (fadeSec <= 0) gain.gain.setValueAtTime(level, start);
      else gain.gain.linearRampToValueAtTime(level, start + fadeSec);
      this.stemLevels[i] = level;
    });
    this.layers = layers;
  }
  /**
   * Speeds the track up at one instant, which the caller places on a beat. Pitch rises with
   * tempo (Web Audio has no time-stretch); the level curve caps this at +25% for that reason.
   */
  public setRate(rate: number, at: number): void {
    if (this.disposed) return;
    if (!Number.isFinite(rate) || rate < 0.5 || rate > 2) throw new Error('Playback rate must be between 0.5 and 2.');
    if (!Number.isFinite(at)) throw new Error('Schedule the rate change at a finite time.');
    const when = Math.max(at, this.context.currentTime);
    for (const source of this.sources) source.playbackRate.setValueAtTime(rate, when);
    this.click?.source.playbackRate.setValueAtTime(rate, when);
    this.rate = rate;
  }
  public setGain(value: number, rampSec: number = MUSIC.gainRampSec): void {
    if (this.disposed) return;
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('Music gain must be between zero and one.');
    if (!Number.isFinite(rampSec) || rampSec < 0) throw new Error('Gain ramp must be a non-negative duration.');
    const parameter = this.bus.gain;
    const now = this.context.currentTime;
    parameter.cancelScheduledValues(now);
    parameter.setValueAtTime(parameter.value, now);
    if (rampSec <= 0) parameter.setValueAtTime(value, now);
    else parameter.linearRampToValueAtTime(value, now + rampSec);
    this.level = value;
    // Zero gain is not a lifecycle event. The buffer source keeps running.
  }
  /**
   * Hold the loop at `from` until `startAt`, then ramp it to `to` by `endAt`, both on the
   * context clock. The finale's opening build: scheduled once, like every cue, so the swell
   * lands on the downbeat it was placed for whatever the frame rate does meanwhile.
   */
  public swell(from: number, to: number, startAt: number, endAt: number): void {
    if (this.disposed) return;
    for (const value of [from, to]) {
      if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('Music gain must be between zero and one.');
    }
    if (!Number.isFinite(startAt) || !Number.isFinite(endAt)) throw new Error('A swell needs finite times.');
    const parameter = this.bus.gain;
    const now = this.context.currentTime;
    const start = Math.max(now, startAt);
    parameter.cancelScheduledValues(now);
    parameter.setValueAtTime(from, now);
    parameter.setValueAtTime(from, start);
    parameter.linearRampToValueAtTime(to, Math.max(start, endAt));
    this.level = to;
  }
  /**
   * Silence the metronome bar and leave the stems running. The map inherits a level's
   * sources rather than restarting them, and the click is the one thing of the level's
   * that must not come with them.
   */
  public stopMetronome(): void {
    if (!this.click) return;
    const { source, gain } = this.click;
    source.onended = null;
    try { source.stop(); } catch { /* A source that never started cannot be stopped. */ }
    source.disconnect();
    gain.disconnect();
    this.click = null;
  }
  public stop(): void {
    const sources = this.click ? [...this.sources, this.click.source] : this.sources;
    for (const source of sources) {
      source.onended = null;
      try { source.stop(); } catch { /* A source that never started cannot be stopped. */ }
      source.disconnect();
    }
    this.click?.gain.disconnect();
    this.click = null;
    this.sources = [];
    this.origin = null;
  }
  /** Drops the loaded track's stems and their gains; the click bar is the context's and stays. */
  private release(): void {
    for (const gain of this.stemGains) gain.disconnect();
    for (const filter of this.stemFilters) filter.disconnect();
    this.buffers = [];
    this.stemFilters = [];
    this.stemGains = [];
    this.stemInputs = [];
    this.stemLevels = [];
    this.stemTrims = [];
    this.layers = 0;
    this.loaded = null;
  }
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abort?.abort();
    this.stop();
    this.release();
    this.clickBar = null;
    this.bus.disconnect();
  }
}
