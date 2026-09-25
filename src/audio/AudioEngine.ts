import { AudioClock } from './AudioClock';
import { MusicSystem } from './MusicSystem';
import type { SoundKind, SoundSink } from '../rhythm/RhythmScheduler';

const TONE = { count: 440, ready: 660, action: 880 } as const;
const DURATION = 0.065;
/**
 * How long a coda takes to fade out when the next task needs the room. Under a beat at
 * every tempo, so the fade belongs to the ending it closes rather than to the task after
 * it, and long enough that applause recedes instead of being cut.
 */
const CODA_FADE = 0.35;
/** A resume() that never settles (no gesture credit, blocked route) must not leave the scene waiting forever. */
const UNLOCK_TIMEOUT_MS = 3000;
/**
 * One voice, which an act may give more than one take of. Consecutive plays rotate
 * through them, so a beat that repeats all level does not fire the identical sample
 * every time — the window's two wipes are one stroke each way.
 */
export type Voice = AudioBuffer | readonly AudioBuffer[];

/** Which coda a resolved round gets. The same decision the headline is chosen from. */
export type FinishOutcome = 'success' | 'partial' | 'rough';

/**
 * The voices every act declares, which is what each act's synthesis is written against.
 * Named here rather than read off `VignetteSounds`, because that interface also carries
 * the voices only some acts have: a `keyof` over it would oblige every act to synthesize
 * a coda it does not use.
 */
export type VoiceName = 'action' | 'success' | 'rough' | 'scrape' | 'judder';

export interface VignetteSounds {
  readonly action: Voice;
  readonly success: AudioBuffer;
  readonly rough: AudioBuffer;
  /**
   * The middle coda, for an act whose ending has three outcomes. Optional, and the
   * middle falls back to `rough` without one — which is what the acts with three
   * endings and two voices have always done.
   */
  readonly partial?: AudioBuffer;
  /**
   * The judgement accents: `scrape` answers a tap that hit nothing, `judder` a beat that
   * went by untapped. The action sound is scheduled before the tap is graded, so a
   * reaction to the grade needs its own voice.
   *
   * Both are required. They were optional, and three of the five vignettes simply never
   * declared them — so a mistake was silent on levels 1, 2 and 3 of every five and
   * audible on 4 and 5, which is the inconsistency that got reported as broken audio.
   * A new vignette that forgets them now fails to compile instead of shipping mute.
   */
  readonly scrape: AudioBuffer;
  readonly judder: AudioBuffer;
}
export type AccentKind = 'scrape' | 'judder';

/** Tiny synthesized clicks keep the prototype independent of asset downloads. */
export class AudioEngine implements SoundSink {
  public readonly context = new AudioContext({ latencyHint: 'interactive' });
  public readonly clock = new AudioClock(this.context);
  private readonly master = this.context.createGain();
  public readonly music = new MusicSystem(this.context, this.master);
  private readonly sources = new Map<AudioScheduledSourceNode, GainNode>();
  private sounds: VignetteSounds | null = null;
  /** The action voice's takes, and which one the next beat gets. */
  private takes: readonly AudioBuffer[] = [];
  private take = 0;
  private disposed = false;
  public muted = false;
  /**
   * A genuine device change should adopt the new output pair. `reset()` would drop the
   * last audible mapping onto `currentTime` the instant the stamp is missing — and Chrome
   * on A2DP also fires `sinkchange` when the Bluetooth buffer reconfigures, which is often
   * the first player voice rather than a new headset. Jumping the clock there expires
   * every waiting target while the demonstration (already scheduled) still sounds in time.
   */
  private readonly onSink = (): void => { this.clock.refresh(); };

  public constructor() {
    this.master.connect(this.context.destination);
    this.context.addEventListener?.('sinkchange', this.onSink);
  }
  public setSounds(sounds: VignetteSounds): void {
    this.cancel();
    this.sounds = sounds;
    // Rotation is per act, not per task: a level that changes tempo between tasks should
    // not also restart the alternation and play the same take twice across the join.
    const { action } = sounds;
    this.takes = Array.isArray(action) ? action : [action];
    this.take = 0;
  }
  public async unlock(): Promise<void> {
    if (this.disposed) throw new Error('Audio has been disposed.');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.context.resume(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Sound is blocked. Tap to try again.')), UNLOCK_TIMEOUT_MS); }),
      ]);
    } finally { clearTimeout(timer); }
    if (this.context.state !== 'running') throw new Error('Sound is blocked. Tap to try again.');
    this.clock.reset();
  }
  /**
   * A Bluetooth route can flip the context to `suspended` for a moment when a new voice
   * starts. Resume without resetting the audible clock — `unlock()` is the gesture path
   * and would jump `now()` onto `currentTime`, missing the rest of the response.
   */
  public recover(): void {
    if (this.disposed || this.context.state === 'running' || this.context.state === 'closed') return;
    void this.context.resume();
  }
  public get activeSources(): number { return this.sources.size; }
  public play(time: number, kind: SoundKind): void {
    if (this.disposed) return;
    if (kind === 'action' && this.takes.length > 0) {
      this.playBuffer(time, this.takes[this.take++ % this.takes.length]!, 0.65);
      return;
    }
    const source = this.context.createOscillator();
    const envelope = this.context.createGain();
    const start = Math.max(time, this.context.currentTime);
    source.frequency.value = TONE[kind];
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(kind === 'action' ? 0.22 : 0.1, start + 0.002);
    envelope.gain.exponentialRampToValueAtTime(0.001, start + DURATION);
    source.connect(envelope).connect(this.master);
    this.sources.set(source, envelope);
    source.onended = () => { source.disconnect(); envelope.disconnect(); this.sources.delete(source); };
    this.startVoice(source, envelope, start, start + DURATION);
  }
  /**
   * A non-scoring coda, scheduled by presentation only after the round is resolved.
   *
   * `silentBy` is the instant the coda has to be out of the way: the next task's own
   * downbeat. A recorded ending can outlast the hold it plays in — the clap's applause
   * runs four seconds against a hold of 2.8 at the fastest tempo — and a coda still
   * ringing there is applause over the beats the player has to copy next. It is faded
   * rather than cut, and left to ring out when nothing follows it.
   */
  public playFinish(time: number, outcome: FinishOutcome, silentBy?: number): void {
    const sounds = this.sounds;
    if (!sounds) return;
    const coda = outcome === 'success' ? sounds.success : outcome === 'partial' ? sounds.partial ?? sounds.rough : sounds.rough;
    this.playBuffer(time, coda, 0.8, silentBy);
  }
  /**
   * A reaction to a grade the judge has already returned. It sits under the action
   * sound rather than replacing it.
   */
  public playAccent(time: number, kind: AccentKind): void {
    const buffer = this.sounds?.[kind];
    if (buffer) this.playBuffer(time, buffer, 0.5);
  }
  /**
   * A presentation sound the level's own voices do not cover — the finale's roll and
   * fanfare. Through the same bus as every voice, so mute, `cancel()` and a restart stop it
   * like anything else; never used for anything the judge listens to.
   */
  public playStinger(time: number, buffer: AudioBuffer, gain = 0.6): void {
    this.playBuffer(time, buffer, gain);
  }
  private playBuffer(time: number, buffer: AudioBuffer, gain: number, silentBy?: number): void {
    if (this.disposed) return;
    const source = this.context.createBufferSource();
    const envelope = this.context.createGain();
    source.buffer = buffer;
    envelope.gain.value = gain;
    source.connect(envelope).connect(this.master);
    this.sources.set(source, envelope);
    source.onended = () => { source.disconnect(); envelope.disconnect(); this.sources.delete(source); };
    const start = Math.max(time, this.context.currentTime);
    if (silentBy !== undefined && Number.isFinite(silentBy) && silentBy > start) {
      // Linear rather than exponential: an exponential ramp cannot reach zero, and this
      // one has to, since the source is stopped on the same instant.
      envelope.gain.setValueAtTime(gain, Math.max(start, silentBy - CODA_FADE));
      envelope.gain.linearRampToValueAtTime(0, silentBy);
      this.startVoice(source, envelope, start, silentBy);
      return;
    }
    this.startVoice(source, envelope, start);
  }
  /**
   * Bluetooth A2DP can reject a start that races the hardware callback. Dropping the
   * voice is fine; throwing out of the tap handler would skip the judgement that already
   * scored and leave the round looking like input had failed.
   */
  private startVoice(
    source: AudioScheduledSourceNode,
    envelope: GainNode,
    start: number,
    stop?: number,
  ): void {
    try {
      source.start(start);
      if (stop !== undefined) source.stop(stop);
    } catch {
      source.onended = null;
      source.disconnect();
      envelope.disconnect();
      this.sources.delete(source);
    }
  }
  public toggleMute(): void {
    this.muted = !this.muted;
    this.master.gain.setValueAtTime(this.muted ? 0 : 1, this.context.currentTime);
  }
  public cancel(): void {
    for (const [source, envelope] of this.sources) {
      source.onended = null;
      source.stop();
      source.disconnect();
      envelope.disconnect();
    }
    this.sources.clear();
  }
  public dispose(): void {
    if (this.disposed) return;
    this.cancel();
    this.music.dispose();
    this.disposed = true;
    this.context.removeEventListener?.('sinkchange', this.onSink);
    this.master.disconnect();
    void this.context.close();
  }
}
