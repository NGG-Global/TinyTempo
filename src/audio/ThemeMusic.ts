import { THEME } from '../config/music';

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

  /**
   * The title screen is up: load the track if this is the first time, then play it.
   *
   * Audio cannot start before the platform says it may, so this is a no-op while the
   * context is suspended — the menu calls it again from the first gesture that unlocks
   * one. Nothing is fetched until something could actually be heard, which keeps 3.5 MB
   * off the first run of a player who taps straight through to a level.
   */
  public async enter(): Promise<void> {
    if (this.disposed) return;
    this.wanted = true;
    if (this.context.state !== 'running') return;
    try {
      this.buffer ??= await this.fetchTrack();
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
    source.connect(this.bus);
    source.onended = () => { source.disconnect(); if (this.source === source) this.source = null; };
    try {
      source.start();
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
