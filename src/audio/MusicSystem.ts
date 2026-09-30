import { GAMEPLAY_TRACKS, MUSIC, TRACK_CYCLE, loopSeconds, pickupSeconds, type GameplayTrack, type TrackId } from '../config/music';

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
 * One full-file loop of one premixed gameplay track, on the existing AudioContext.
 *
 * One track is decoded at a time. A decoded loop is ~42 MB of float PCM and the
 * normalising copy doubles that transiently, so holding both tracks would double the
 * steady cost for a switch that happens once every twenty-five levels; selecting a
 * different track drops the loaded one before the next fetch begins. Scenes select at
 * their boundaries — the menu's PLAY, a shell screen's create, a level's start — never
 * while a level is running, and `load` stops the source when the track changes because a
 * source can only play the buffer it was given.
 */
export class MusicSystem {
  private readonly bus: GainNode;
  private level: number;
  private source: AudioBufferSourceNode | null = null;
  private buffer: AudioBuffer | null = null;
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
  public get ready(): boolean { return this.buffer !== null; }
  public get activeSources(): number { return this.source ? 1 : 0; }
  public get startTime(): number | null { return this.origin; }
  public get downbeatTime(): number | null { return this.origin === null ? null : this.origin + pickupSeconds(MUSIC.sourceBpm, MUSIC.pickupBeats); }
  public get duration(): number { return this.buffer?.duration ?? 0; }
  /** Diagnostic: frames dropped before the first downbeat of the shipped decode. */
  public get leadInSeconds(): number { return this.buffer ? this.leadInFrames / this.buffer.sampleRate : 0; }
  public get playbackGeneration(): number { return this.generation; }
  /** Diagnostic only. Gameplay never uses file position or loop count as its clock. */
  public get completedLoops(): number { return this.origin === null ? 0 : Math.floor(Math.max(0, this.context.currentTime - this.origin) / this.duration); }
  public get gain(): number { return this.level; }
  /** Most recently scheduled playback rate (1 = the source tempo). */
  public get playbackRate(): number { return this.rate; }

  /**
   * Atomic load of one track: playback cannot start until the fetch, decode and
   * validation all succeed. The same track is loaded once and shared by concurrent
   * callers. Asking for a different track stops the source, releases the loaded loop and
   * cancels a load of any other; the callers of that load are told it was superseded.
   */
  public load(id: TrackId = this.selected): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Music is disposed.'));
    if (id !== this.selected) {
      this.selected = id;
      this.abort?.abort();
    }
    if (this.loaded === id && this.buffer) return Promise.resolve();
    if (this.pending && this.pendingTrack === id) return this.pending;
    if (this.loaded !== null) {
      this.stop();
      this.buffer = null;
      this.loaded = null;
    }
    const track = GAMEPLAY_TRACKS[id];
    const abort = new AbortController();
    this.abort = abort;
    this.pendingTrack = id;
    const load = (async () => {
      const response = await fetch(track.url, { signal: abort.signal });
      if (!response.ok) throw new Error(`Could not load the music track (${response.status}).`);
      return this.context.decodeAudioData(await response.arrayBuffer());
    })().then(decoded => {
      if (this.disposed) throw new Error('Music was disposed during loading.');
      if (abort.signal.aborted) throw new Error('Music load was superseded by another track.');
      validateLoopBuffer(decoded);
      const lead = detectLeadIn(decoded, track.leadIn.threshold, track.leadIn.fallbackSec, track.leadIn.minSec, track.leadIn.maxSec);
      const buffer = normalizeLoop(this.context, decoded, lead, track);
      validateLoopBuffer(buffer);
      this.leadInFrames = lead;
      this.buffer = buffer;
      this.loaded = id;
      // Nothing is playing — a change of track stopped the source above — so the bus can
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
  /** Returns the first musical downbeat, retaining the audible pickup at source position zero. */
  public start(at = this.context.currentTime + MUSIC.startLeadSec): number {
    if (this.disposed || !this.buffer) throw new Error('Load the music track before playback.');
    if (this.context.state !== 'running') throw new Error('Unlock audio before starting music.');
    if (!Number.isFinite(at) || at <= this.context.currentTime) throw new Error('Schedule music at a future shared timestamp.');
    this.stop();
    const end = validateLoopBuffer(this.buffer);
    try {
      const source = this.context.createBufferSource();
      source.buffer = this.buffer;
      source.loop = true;
      source.loopStart = 0;
      source.loopEnd = end;
      source.playbackRate.value = 1;
      this.rate = 1;
      source.connect(this.bus);
      this.source = source;
      source.start(at, 0);
      this.origin = at;
      this.generation++;
      return this.downbeatTime!;
    } catch (error) { this.stop(); throw error; }
  }
  /**
   * Speeds the track up at one instant, which the caller places on a beat. Pitch rises with
   * tempo (Web Audio has no time-stretch); the level curve caps this at +25% for that reason.
   */
  public setRate(rate: number, at: number): void {
    if (this.disposed) return;
    if (!Number.isFinite(rate) || rate < 0.5 || rate > 2) throw new Error('Playback rate must be between 0.5 and 2.');
    if (!Number.isFinite(at)) throw new Error('Schedule the rate change at a finite time.');
    this.source?.playbackRate.setValueAtTime(rate, Math.max(at, this.context.currentTime));
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
  public stop(): void {
    const source = this.source;
    if (source) {
      source.onended = null;
      try { source.stop(); } catch { /* A source that never started cannot be stopped. */ }
      source.disconnect();
    }
    this.source = null;
    this.origin = null;
  }
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abort?.abort();
    this.stop();
    this.buffer = null;
    this.loaded = null;
    this.bus.disconnect();
  }
}
