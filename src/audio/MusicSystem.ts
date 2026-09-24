import { MUSIC, GAMEPLAY_ARRANGEMENTS, loopSeconds, pickupSeconds, type ArrangementId, type GameplayArrangement } from '../config/music';

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
  reference: AudioBuffer, threshold: number, fallbackSec: number,
  minSec: number = MUSIC.leadIn.minSec, maxSec: number = MUSIC.leadIn.maxSec,
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
 * pre-roll (and decoder delay) before the first downbeat are dropped and the (silent) tail
 * is padded or trimmed so the loop length is precisely `bars` bars. Native looping then
 * keeps the bar grid aligned indefinitely instead of slipping by the export's rounding.
 */
export function normalizeLoop(context: BaseAudioContext, source: AudioBuffer, lead: number, arrangement: GameplayArrangement = GAMEPLAY_ARRANGEMENTS.a): AudioBuffer {
  const frames = Math.round(loopSeconds(arrangement) * source.sampleRate);
  if (!Number.isInteger(lead) || lead < 0) throw new Error('Lead-in must be a whole number of frames.');
  if (source.length <= lead) throw new Error('Music track is shorter than its lead-in.');
  if (lead === 0 && source.length === frames && !arrangement.seamRampSec) return source;
  const target = context.createBuffer(source.numberOfChannels, frames, source.sampleRate);
  for (let channel = 0; channel < source.numberOfChannels; channel++) {
    target.copyToChannel(source.getChannelData(channel).subarray(lead, lead + frames), channel);
    if (arrangement.seamRampSec) {
      // MP3 encoded the head after silence and the tail after music. Remove only the
      // residual sample discontinuity, in place, without shortening/restarting a bar.
      const data = target.getChannelData(channel);
      const count = Math.min(frames, Math.max(2, Math.round(arrangement.seamRampSec * source.sampleRate)));
      const correction = data[0]! - data[frames - 1]!;
      for (let i = 0; i < count; i++) data[frames - count + i]! += correction * (1 - Math.cos(Math.PI * i / (count - 1))) / 2;
    }
  }
  return target;
}

/** Bound a failed fetch/decode without ever allowing overlapping long decodes. */
async function deadline<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Music loading timed out.')), MUSIC.loadTimeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

/** One selected premix and one source on the existing AudioContext. No decoded track cache. */
export class MusicSystem {
  private readonly bus: GainNode;
  private level: number = MUSIC.masterGain;
  private source: AudioBufferSourceNode | null = null;
  private buffer: AudioBuffer | null = null;
  private pending: Promise<void> | null = null;
  private abort: AbortController | null = null;
  private requested: ArrangementId = 'a';
  private loaded: ArrangementId | null = null;
  // A timed-out native decode cannot be cancelled. This barrier must settle before
  // another decode begins; it retains no decoded AudioBuffer after settling.
  private decoding: Promise<void> = Promise.resolve();
  private silent = false;
  private disposed = false;
  private origin: number | null = null;
  private leadInFrames = 0;
  private rate = 1;
  private generation = 0;
  public constructor(private readonly context: AudioContext, destination: AudioNode) {
    this.bus = context.createGain();
    this.bus.gain.value = this.level;
    this.bus.connect(destination);
  }
  public get arrangementId(): ArrangementId | null { return this.loaded; }
  public get requestedArrangement(): ArrangementId { return this.requested; }
  public get sourceBpm(): number { return GAMEPLAY_ARRANGEMENTS[this.loaded ?? 'a'].sourceBpm; }
  public get defaultGain(): number { return GAMEPLAY_ARRANGEMENTS[this.loaded ?? 'a'].gain; }
  public get baseRate(): number { return MUSIC.sourceBpm / this.sourceBpm; }
  public get silentFallback(): boolean { return this.silent; }
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

  /** Latest request wins; the worker serializes all fetch/decode/normalize operations.
   * Callers select only at shell/level boundaries. Same-selection callers share a promise.
   * Release the old source AND buffer before even fetching a different arrangement.
   */
  public load(id: ArrangementId = this.requested): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Music is disposed.'));
    if (id !== this.requested) {
      this.requested = id;
      this.abort?.abort();
      this.stop();
      this.buffer = null;
      this.loaded = null;
    }
    if (this.pending) return this.pending;
    if (this.ready) return Promise.resolve();
    this.pending = this.loadSelected().finally(() => { this.pending = null; });
    return this.pending;
  }
  private async read(id: ArrangementId): Promise<AudioBuffer> {
    const abort = new AbortController();
    this.abort = abort;
    try {
      // Even after a timeout, never decode A on top of an unfinished B decode.
      await deadline(this.decoding);
      if (this.disposed) throw new Error('Music is disposed.');
      const bytes = await deadline((async () => {
        const response = await fetch(GAMEPLAY_ARRANGEMENTS[id].url, { signal: abort.signal });
        if (!response.ok) throw new Error(`Could not load music ${id} (${response.status}).`);
        return response.arrayBuffer();
      })());
      if (this.disposed || abort.signal.aborted) throw new Error('Music load cancelled.');
      const decode = this.context.decodeAudioData(bytes);
      this.decoding = decode.then(() => undefined, () => undefined);
      return await deadline(decode);
    } finally {
      abort.abort();
      if (this.abort === abort) this.abort = null;
    }
  }
  private async prepare(id: ArrangementId, requested: ArrangementId): Promise<{ buffer: AudioBuffer; lead: number }> {
    const decoded = await this.read(id);
    if (this.disposed || requested !== this.requested) throw new Error('Music load cancelled.');
    validateLoopBuffer(decoded);
    const arrangement = GAMEPLAY_ARRANGEMENTS[id];
    const leadIn = arrangement.leadIn;
    const lead = detectLeadIn(decoded, leadIn.threshold, leadIn.fallbackSec, leadIn.minSec, leadIn.maxSec);
    const buffer = normalizeLoop(this.context, decoded, lead, arrangement);
    validateLoopBuffer(buffer);
    return { buffer, lead };
  }
  private async loadSelected(): Promise<void> {
    while (!this.disposed) {
      const requested = this.requested;
      let actual = requested;
      let prepared: { buffer: AudioBuffer; lead: number };
      try {
        prepared = await this.prepare(actual, requested);
      } catch (error) {
        if (this.disposed) throw new Error('Music was disposed during loading.');
        if (requested !== this.requested) continue;
        if (requested === 'a') throw error; // Preserve A's visible Retry path.
        actual = 'a';
        try {
          prepared = await this.prepare(actual, requested);
        } catch {
          if (this.disposed) throw new Error('Music was disposed during loading.');
          if (requested !== this.requested) continue;
          // Optional music must not make a level unplayable. A short silent bar
          // supplies the same audio-clock origin if BOTH arrangements are unavailable.
          const rate = this.context.sampleRate || 44100;
          this.buffer = this.context.createBuffer(1, Math.round(MUSIC.beatsPerBar * 60 / MUSIC.sourceBpm * rate), rate);
          this.loaded = 'a'; this.silent = true; this.leadInFrames = 0;
          return;
        }
      }
      if (this.disposed) throw new Error('Music was disposed during loading.');
      if (requested !== this.requested) continue; // never commit a stale selection
      this.buffer = prepared.buffer;
      this.leadInFrames = prepared.lead;
      this.loaded = actual;
      this.silent = false;
      return;
    }
    throw new Error('Music was disposed during loading.');
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
      source.playbackRate.value = this.baseRate;
      this.rate = this.baseRate;
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
  /** The gameplay BPM is independent of the selected source's authored tempo. */
  public setBpm(bpm: number, at: number): void { this.setRate(bpm / this.sourceBpm, at); }
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
      source.buffer = null; // disconnect alone leaves the long PCM reachable from the node
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
