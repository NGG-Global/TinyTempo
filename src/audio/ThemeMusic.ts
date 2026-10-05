import { THEME } from '../config/music';
import { detectLeadIn } from './MusicSystem';

/** Where in the decode the theme starts, and the exact span it loops. */
export interface ThemeLoop {
  /** Where the music begins: the first play starts here, on the opening itself. */
  readonly offset: number;
  readonly start: number;
  readonly end: number;
}

/**
 * The theme's loop points in a decoded buffer, or null to loop the file on its own ends.
 * The music's start is found from its opening hit, the way `detectLeadIn` finds a gameplay
 * downbeat, less the hit's own offset in the master; the loop is then exactly
 * `THEME.loopSec` long, from `THEME.seamSec` past that start. A buffer that cannot hold the
 * loop — the wrong file, or a decode too short — gets null, and a theme that loops with a
 * gap is still better than a menu that throws.
 */
export function themeLoop(buffer: AudioBuffer): ThemeLoop | null {
  try {
    const { threshold, fallbackSec, minSec, maxSec } = THEME.leadIn;
    const lead = detectLeadIn(buffer, threshold, fallbackSec, minSec, maxSec) / buffer.sampleRate;
    const offset = Math.max(0, lead - THEME.onsetSec);
    const start = offset + THEME.seamSec;
    const end = start + THEME.loopSec;
    return Number.isFinite(end) && end <= buffer.duration ? { offset, start, end } : null;
  } catch {
    return null;
  }
}

/**
 * The title screen's theme: one long loop, faded in when the menu is on screen and out
 * when it leaves.
 *
 * Kept apart from `MusicSystem` on purpose. That system exists to hold a beat grid — a
 * measured downbeat, a whole-bar loop, a tempo that changes task by task — because a
 * level is judged against it. The menu judges nothing, so every one of those guarantees
 * would have had to become optional to share the code, and the thing that makes the
 * gameplay track trustworthy would have grown a mode where it does not apply.
 *
 * It is also allowed to fail. A theme that will not load leaves a quiet title screen and
 * a game that is otherwise untouched, so nothing here rejects into a caller.
 */
export class ThemeMusic {
  private readonly bus: GainNode;
  private buffer: AudioBuffer | null = null;
  private loop: ThemeLoop | null = null;
  private source: AudioBufferSourceNode | null = null;
  /**
   * A source `leave()` has already told to stop at the end of its fade. It is still
   * audible until then. Dropping the only reference to it is how a quick return to the
   * title started a second copy over the one that was still fading out.
   */
  private fading: AudioBufferSourceNode | null = null;
  private pending: Promise<AudioBuffer> | null = null;
  private disposed = false;
  /** Whether the title screen currently wants it. A load that lands after the player has
   *  already left must not start a track into an empty menu. */
  private wanted = false;

  public constructor(private readonly context: AudioContext, destination: AudioNode) {
    this.bus = context.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(destination);
  }

  public get ready(): boolean { return this.buffer !== null; }
  public get playing(): boolean { return this.source !== null; }
  /** The context time the playing source began at the music's start; null when none is playing. */
  private startedAt: number | null = null;
  /**
   * Where the theme is at context time `t`, in seconds from its first downbeat; null while
   * it is not playing. Every pass after the first restarts `THEME.loopSec` later in the
   * same bar position, since the loop is whole bars, so the beat phase needs no wrap.
   */
  public playheadAt(t: number): number | null {
    return this.source === null || this.startedAt === null || !Number.isFinite(t) ? null : t - this.startedAt;
  }

  /**
   * The title screen is up: load the track if this is the first time, then play it.
   *
   * Audio cannot start before the platform says it may, so this is a no-op while the
   * context is suspended — the menu calls it again from the first gesture that unlocks
   * one. Nothing is fetched until something could actually be heard, which keeps 1.3 MB
   * off the first run of a player who taps straight through to a level.
   */
  public async enter(): Promise<void> {
    if (this.disposed) return;
    this.wanted = true;
    if (this.context.state !== 'running') return;
    try {
      if (!this.buffer) {
        const buffer = await this.fetchTrack();
        this.loop = themeLoop(buffer);
        this.buffer = buffer;
      }
    } catch (error) {
      console.warn('The title theme is unavailable; the menu stays quiet.', error);
      return;
    }
    // Re-checked after the await: the player may have left, or muted, or the engine gone.
    if (!this.wanted || this.disposed || this.source || this.context.state !== 'running') return;
    this.begin();
  }

  /** The title screen is leaving. Fades rather than cuts, and cancels a pending start. */
  public leave(): void {
    this.wanted = false;
    const source = this.source;
    this.source = null;
    if (!source) return;
    this.fading = source;
    this.fade(0, THEME.fadeOutSec);
    source.onended = () => {
      source.disconnect();
      if (this.fading === source) this.fading = null;
    };
    try { source.stop(this.context.currentTime + THEME.fadeOutSec); }
    catch {
      source.disconnect();
      if (this.fading === source) this.fading = null;
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.wanted = false;
    this.silence(this.source);
    this.source = null;
    this.silence(this.fading);
    this.fading = null;
    this.bus.disconnect();
    this.buffer = null;
    this.loop = null;
  }

  /**
   * A source that is leaving. `stop` may already have been scheduled by `leave`, and a
   * second call throws, so the disconnect is what actually takes it out of the mix.
   */
  private silence(source: AudioBufferSourceNode | null): void {
    if (!source) return;
    source.onended = null;
    try { source.stop(); } catch { /* The fade already scheduled this stop. */ }
    try { source.disconnect(); } catch { /* Already disconnected. */ }
  }

  private async fetchTrack(): Promise<AudioBuffer> {
    this.pending ??= (async () => {
      const response = await fetch(THEME.url);
      if (!response.ok) throw new Error(`Could not load the title theme (${response.status}).`);
      const decoded = await this.context.decodeAudioData(await response.arrayBuffer());
      if (decoded.length <= 0) throw new Error('The title theme is empty.');
      return decoded;
    })().finally(() => { this.pending = null; });
    return this.pending;
  }

  private begin(): void {
    // The outgoing fade is still in the graph until its stop time. Disconnect it before
    // starting another, or the title plays two copies for the rest of that fade.
    const fading = this.fading;
    this.fading = null;
    if (fading) {
      // `leave` already scheduled the stop. Clearing the ended handler keeps that
      // later callback from touching a source the new playback has replaced.
      fading.onended = null;
      fading.disconnect();
    }
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.loop = true;
    // The seamless loop when the decode holds one: the first play starts on the opening, and
    // every later pass restarts past the encoder's smear of it. Otherwise the file's own ends.
    const loop = this.loop;
    if (loop) {
      source.loopStart = loop.start;
      source.loopEnd = loop.end;
    }
    source.connect(this.bus);
    source.onended = () => { source.disconnect(); if (this.source === source) this.source = null; };
    try {
      source.start(0, loop?.offset ?? 0);
      // `start(0)` begins as soon as possible, which is the context's current time.
      this.startedAt = this.context.currentTime;
    } catch {
      // A route that rejects a start costs the theme, never the menu it is playing under.
      source.disconnect();
      return;
    }
    this.source = source;
    this.fade(THEME.gain, THEME.fadeInSec);
  }

  /** Ramps from wherever the last ramp had reached, so a quick leave-and-return does not jump. */
  private fade(to: number, seconds: number): void {
    const now = this.context.currentTime;
    const gain = this.bus.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(to, now + seconds);
  }
}
