import bEdit from '../../bgm/arrangement-b/edit.json';

/** Shared playback policy and the original A model, preserved for compatibility. */
export const MUSIC = {
  // Measured from the delivered files (see docs/MUSIC.md): 120 BPM, 60 bars, every stem
  // 119.925 s. The first downbeat sits about 0.156 s into the WAV, and the file ends 75 ms
  // short of bar 61, so the raw file neither starts on the beat nor loops on a bar.
  // MusicSystem copies the decode into an exact whole-bar loop: it drops the lead-in and
  // pads the silent tail to `bars` bars. The lead-in is detected at load from the opening
  // transient rather than configured, because the shipped MP3 decodes with an extra
  // decoder delay (23 ms in Chromium) that other decoders may or may not trim.
  sourceBpm: 120,
  beatsPerBar: 4,
  bars: 60,
  // The threshold is -26 dBFS, not the -40 dBFS this used to carry, because MP3 pre-echo
  // smears energy backwards into the granule before a transient and -40 dBFS is exactly
  // that level. Measured in Chromium, the two files disagree by 64 frames (1.45 ms) at
  // -40 dBFS and by 4 frames (0.09 ms) at -26 dBFS; the opening drum hit rises from -26 to
  // -14 dBFS in 1 ms, so the higher threshold still lands on the attack itself.
  // A detected lead outside the range is not a downbeat at all: a wrong file, a silent
  // head, or a hit later in the opening bar. Falling back is then safer than trusting it,
  // because an accepted false trigger shifts the whole beat grid against the music for good.
  leadIn: { threshold: 0.05, fallbackSec: 0.182, minSec: 0.05, maxSec: 0.5 },
  pickupBeats: 0,
  startLeadSec: 0.2,
  gainRampSec: 0.025,
  /**
   * Cross-screen duck: long enough to sit under the 320 ms scene curtain, short enough
   * that a level's first downbeat is not still fading in. Instant cuts stay on
   * `gainRampSec`; this is only the shell ↔ level ↔ silent hand-off.
   */
  bedFadeSec: 0.35,
  // The premix is normalised to 0.97 peak for signal-to-noise, which took 0.710 off a sum
  // that peaked at +2.7 dBFS. This gain gives that back: 0.4 / 0.710, so the track sits at
  // exactly the level the seven stems did, and the bus still supplies SFX headroom.
  masterGain: 0.5632,
  // Bound unavailable downloads/decodes; serialization still prevents overlapping decodes.
  loadTimeoutMs: 12_000,
} as const;

export interface GameplayArrangement {
  readonly url: string;
  readonly sourceBpm: number;
  readonly bars: number;
  readonly gain: number;
  /** Correct a residual lossy-codec seam over the final few milliseconds, without moving beats. */
  readonly seamRampSec?: number;
  readonly leadIn: { readonly threshold: number; readonly fallbackSec: number; readonly minSec: number; readonly maxSec: number };
}

export const GAMEPLAY_ARRANGEMENTS = {
  a: {
    url: new URL('../../bgm/mix/tiny-tempo.mp3', import.meta.url).href,
    sourceBpm: MUSIC.sourceBpm, bars: MUSIC.bars, gain: MUSIC.masterGain, leadIn: MUSIC.leadIn,
  },
  b: {
    url: new URL('../../bgm/mix/tiny-tempo-b.mp3', import.meta.url).href,
    sourceBpm: bEdit.sourceBpm, bars: bEdit.bars,
    // Matched to A after real MP3 decoding; see docs/MUSIC.md for both context rates.
    gain: 0.3843, seamRampSec: 0.003,
    leadIn: { threshold: 0.05, fallbackSec: 0.1751, minSec: 0.12, maxSec: 0.22 },
  },
} as const satisfies Record<string, GameplayArrangement>;
export type ArrangementId = keyof typeof GAMEPLAY_ARRANGEMENTS;
export const ARRANGEMENT_CYCLE: readonly ArrangementId[] = ['a', 'b'];

export const pickupSeconds = (bpm: number, beats: number): number => beats * 60 / bpm;
/** Exact loop length in seconds: whole bars at the source tempo. */
export const loopSeconds = (arrangement: GameplayArrangement = GAMEPLAY_ARRANGEMENTS.a): number => arrangement.bars * MUSIC.beatsPerBar * 60 / arrangement.sourceBpm;
