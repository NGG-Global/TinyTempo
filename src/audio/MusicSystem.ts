import { MUSIC, loopSeconds, pickupSeconds } from '../config/music';

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
  minSec = MUSIC.leadIn.minSec, maxSec = MUSIC.leadIn.maxSec,
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
export function normalizeLoop(context: BaseAudioContext, source: AudioBuffer, lead: number): AudioBuffer {
  const frames = Math.round(loopSeconds() * source.sampleRate);
  if (!Number.isInteger(lead) || lead < 0) throw new Error('Lead-in must be a whole number of frames.');
  if (source.length <= lead) throw new Error('Music track is shorter than its lead-in.');
  if (lead === 0 && source.length === frames) return source;
  const target = context.createBuffer(source.numberOfChannels, frames, source.sampleRate);
  for (let channel = 0; channel < source.numberOfChannels; channel++) {
    target.copyToChannel(source.getChannelData(channel).subarray(lead, lead + frames), channel);
  }
  return target;
}

/** One full-file loop of the premixed track, on the existing AudioContext. */
export class MusicSystem {
  private readonly bus: GainNode;
  private level: number = MUSIC.masterGain;
  private source: AudioBufferSourceNode | null = null;
  private buffer: AudioBuffer | null = null;
  private pending: Promise<void> | null = null;
  private abort: AbortController | null = null;
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

  /** Atomic load: playback cannot start until the fetch, decode and validation all succeed. */
  public load(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Music is disposed.'));
    if (this.ready) return Promise.resolve();
    if (this.pending) return this.pending;
    const abort = new AbortController();
    this.abort = abort;
    this.pending = (async () => {
      const response = await fetch(MUSIC.url, { signal: abort.signal });
      if (!response.ok) throw new Error(`Could not load the music track (${response.status}).`);
      return this.context.decodeAudioData(await response.arrayBuffer());
    })().then(decoded => {
      if (this.disposed) throw new Error('Music was disposed during loading.');
      validateLoopBuffer(decoded);
      const lead = detectLeadIn(decoded, MUSIC.leadIn.threshold, MUSIC.leadIn.fallbackSec);
      const buffer = normalizeLoop(this.context, decoded, lead);
      this.leadInFrames = lead;
      validateLoopBuffer(buffer);
      this.buffer = buffer;
    }).catch((error: unknown) => {
      abort.abort();
      throw error;
    }).finally(() => { this.pending = null; this.abort = null; });
    return this.pending;
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
    this.bus.disconnect();
  }
}
