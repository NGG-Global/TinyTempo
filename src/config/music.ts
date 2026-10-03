/**
 * Musical model of the gameplay tracks.
 *
 * `MUSIC` is what every gameplay track shares and the game is built around: the tempo the
 * level curve starts from, the bar, and the scheduling policy. `GAMEPLAY_TRACKS` is what
 * differs between them — a file, its length in bars, its lead-in and its gain — all of it
 * measured from the delivered stems (see docs/MUSIC.md). Nothing here is a knob to tune
 * by ear; a value that is not measured is written down as one that is not.
 */
export const MUSIC = {
  /**
   * Every gameplay track is authored at 120 BPM in 4/4. That is not a per-track value:
   * every level starts at this tempo and `setRate` is the level's BPM over it, so a track
   * at any other tempo would be pitch-shifted on every level of the game to sit on the
   * grid. A delivery at another tempo is re-rendered, not compensated.
   */
  sourceBpm: 120,
  beatsPerBar: 4,
  pickupBeats: 0,
  startLeadSec: 0.2,
  gainRampSec: 0.025,
  /**
   * Cross-screen duck: long enough to sit under the 320 ms scene curtain, short enough
   * that a level's first downbeat is not still fading in. Instant cuts stay on
   * `gainRampSec`; this is only the shell ↔ level ↔ silent hand-off.
   */
  bedFadeSec: 0.35,
  /**
   * Levels are scored in chapters of this many, and the chapters take the tracks in turn
   * (`game/musicSelection.ts`): 1–25 on the first, 26–50 on the second, 51–75 on the
   * first again. Twenty-five is two and a half areas, so a chapter boundary is not an
   * area's, and that is deliberate: the areas already change the ground and the finale,
   * and the music changing on the same line would make every gate a wall of new things.
   * The map plays the frontier's chapter, so a player hears the change once, on the road.
   */
  chapterLevels: 25,
  /**
   * The metronome under every level: a click on each beat with the bar's first accented,
   * as a one-bar loop started with the music and driven by the same rate automation, so
   * it can never drift from the loop it is counting. Its gain rides the track's bus, so
   * the track's loudness match scales it; the values here are set by ear against track B
   * and are the one thing in this model that is not measured.
   */
  metronome: { gain: 0.7, accentHz: 1500, beatHz: 1000, accentLevel: 0.4, beatLevel: 0.25, clickSec: 0.03 },
  /**
   * How a level brings a layered track in. It starts on the first stem alone and a scored
   * task's accuracy moves the count: at or above `strong` one more stem joins on the next
   * task's downbeat, below `weak` the last one leaves, in between it holds. The change
   * lands on the bar line with the tempo change, faded over `fadeSec`.
   */
  layers: { strong: 70, weak: 40, fadeSec: 0.5 },
} as const;

/** One playable file of a track: a premix, or one stem of a layered track. */
export interface TrackStem {
  readonly id: string;
  readonly url: string;
  /** Level against the other stems, in dB; 0 is as delivered. The mix, applied at runtime. */
  readonly trimDb?: number;
  /**
   * A gentle low-pass (12 dB/oct, no resonance) at this frequency, for a stem that should
   * sit behind the act's voices rather than beside them: the attack and presence of a
   * sound live above ~2 kHz, and that is what draws the ear.
   */
  readonly toneHz?: number;
  /**
   * A gentle high-pass (12 dB/oct, no resonance) at this frequency, for a stem whose low
   * end would double the bass and blur the kick: the pulse a player locks onto lives
   * there, and two parts in that register read as one muddier one.
   */
  readonly lowCutHz?: number;
}

/** A stem's trim as a gain. */
export const stemLevel = (stem: TrackStem): number => 10 ** ((stem.trimDb ?? 0) / 20);

/** What `MusicSystem` needs to know about one gameplay track, measured, not tuned. */
export interface GameplayTrack {
  /**
   * The files that make the track, in the order a level brings them in. A premixed
   * track is one stem; a layered one is its stems, the first of which is always heard.
   * Each is decoded whole (~38 MB of float PCM per stereo stem at 44.1 kHz), which is
   * why a track is layered only where the game plays them one at a time.
   */
  readonly stems: readonly TrackStem[];
  /**
   * How many of `stems`, from the first, a level can ever earn; the rest play only in
   * the shell, where nothing is judged. Absent, a level can earn them all.
   */
  readonly levelStems?: number;
  /** Whole bars at `MUSIC.sourceBpm`; the loop is copied to exactly this length at load. */
  readonly bars: number;
  /**
   * Where the first downbeat sits in the decoded file, found at load from the opening
   * transient rather than configured, because the shipped MP3 decodes with an extra
   * decoder delay (23 ms in Chromium) that other decoders may or may not trim. The
   * bounds admit the shipped file on both kinds of decoder and reject a crossing that
   * cannot be the downbeat: a wrong file, a silent head, or a hit later in the opening
   * bar. Falling back is then safer than trusting it, because an accepted false trigger
   * shifts the whole beat grid against the music for good.
   */
  readonly leadIn: {
    readonly threshold: number; readonly fallbackSec: number; readonly minSec: number; readonly maxSec: number;
  };
  /** The bus gain the track plays at, so every track is heard at one level. */
  readonly gain: number;
}

export const GAMEPLAY_TRACKS = {
  /**
   * The seven-stem workshop loop. Measured from the delivered files: 120 BPM, 60 bars,
   * every stem 119.925 s. The first downbeat sits about 0.156 s into the WAV and the file
   * ends 75 ms short of bar 61, so the raw file neither starts on the beat nor loops on a
   * bar; MusicSystem drops the lead-in and pads the silent tail to `bars` bars.
   */
  a: {
    stems: [{ id: 'mix', url: new URL('../../bgm/mix/tiny-tempo.mp3', import.meta.url).href }],
    bars: 60,
    // The threshold is -26 dBFS, not the -40 dBFS this used to carry, because MP3
    // pre-echo smears energy backwards into the granule before a transient and -40 dBFS
    // is exactly that level. Measured in Chromium, the two files disagree by 64 frames
    // (1.45 ms) at -40 dBFS and by 4 frames (0.09 ms) at -26 dBFS; the opening drum hit
    // rises from -26 to -14 dBFS in 1 ms, so the higher threshold still lands on the
    // attack itself. Decoded lead in Chromium: 0.1818 s.
    leadIn: { threshold: 0.05, fallbackSec: 0.182, minSec: 0.05, maxSec: 0.5 },
    // The premix is normalised to 0.97 peak for signal-to-noise, which took 0.710 off a
    // sum that peaked at +2.7 dBFS. This gain gives that back: 0.4 / 0.710, so the track
    // sits at exactly the level the seven stems did, and the bus still supplies SFX
    // headroom.
    gain: 0.5632,
  },
  /**
   * The six-stem second track: drums, bass, harmony, synth lead, orchestral colour and
   * risers. Measured from the delivered 24-bit masters: 120 BPM, 54 bars, every stem
   * exactly 108.000 s, and the first downbeat on the first sample — every bar's kick
   * lands 3.7 ms after a grid laid from zero, the synth lead enters on bar 11, the
   * orchestra on bar 7 and leaves on bar 28. The loop is the file's whole length, so the
   * tail is music, not silence, and the seam is the composer's.
   */
  b: {
    // The six stems, each encoded by the same pipeline as the premix with the same head
    // and scale, so together they are the premix to the sample. Every one is genuinely
    // stereo (the drums, the narrowest, carry −14.6 dB of side), so none ships mono.
    //
    // **The mix is for a game played by ear, so the music is the room, not the subject.**
    // The foreground is the act's voice — the phrase being demonstrated and copied — and
    // the metronome; the stems sit behind them. The order is the order a level adds them,
    // and the trims and tone are measured choices (docs/MUSIC.md):
    //  - drums, as delivered: the floor, under the metronome from the first beat;
    //  - bass, −2 dB: 91% of its energy is under 250 Hz, clear of every act voice;
    //  - harmony, −5.3 dB, cut below 120 Hz and softened at 3.2 kHz: the chords. The part
    //    was redelivered as a lower, warmer one — 74% of its energy under 250 Hz, and as
    //    much below 120 Hz as the bass stem itself — so it gives that register to the bass
    //    and the kick, and its trim puts it at the loudness the first delivery had here;
    //  - orchestral colour, −5 dB at 3.5 kHz: plays bars 7–26 only, a lift, not a part;
    //  - the synth lead, −9 dB and softened at 1.8 kHz, **last**: it is a melody — 39% of
    //    its notes off the beat and eighth grid, in the same 250 Hz–2 kHz band as the act
    //    voices — so it is a second phrase beside the one being copied, which is what made
    //    the track tiring the moment it entered. It is earned only after four strong
    //    tasks in a row, by a player already in the pocket, and enters well behind them.
    // `levelStems` stops a level there. The risers fire every other bar from bar 27, and a
    // riser announces a downbeat event that never comes, so they play only on the map and
    // in Settings, and quieter even there.
    stems: [
      { id: 'drums', url: new URL('../../bgm/mix/tiny-tempo-b-drums.mp3', import.meta.url).href },
      { id: 'bass', url: new URL('../../bgm/mix/tiny-tempo-b-bass.mp3', import.meta.url).href, trimDb: -2 },
      { id: 'harmony', url: new URL('../../bgm/mix/tiny-tempo-b-harmony.mp3', import.meta.url).href, trimDb: -5.3, toneHz: 3200, lowCutHz: 120 },
      { id: 'orchestral', url: new URL('../../bgm/mix/tiny-tempo-b-orchestral.mp3', import.meta.url).href, trimDb: -5, toneHz: 3500 },
      { id: 'lead', url: new URL('../../bgm/mix/tiny-tempo-b-synth-lead.mp3', import.meta.url).href, trimDb: -9, toneHz: 1800 },
      { id: 'risers', url: new URL('../../bgm/mix/tiny-tempo-b-risers.mp3', import.meta.url).href, trimDb: -10, toneHz: 2500 },
    ],
    levelStems: 5,
    bars: 54,
    // The encoder writes 0.1 s of silence in front of every file of this track (see
    // scripts/encode-music.mjs): a transient in an MP3's first granule is where decoders
    // disagree most about the encoder delay, and the head puts the opening hit inside the
    // same window as track A's. The lead is detected on the first stem alone — the drums,
    // whose first kick reaches -26 dBFS 3.6 ms after the downbeat — and applied to every
    // stem, because each stem's own first sound sits somewhere else in the bar and the
    // stems have to stay sample-aligned. Decoded lead of the premix in Chromium: 0.1247 s
    // — the head, 23 ms of decoder delay and the harmony's 1.8 ms rise; the drums land
    // ~2 ms later. A decoder that trims the delay lands near 0.104 s; both sit inside
    // these bounds, and a file with no head does not.
    leadIn: { threshold: 0.05, fallbackSec: 0.127, minSec: 0.05, maxSec: 0.25 },
    // Holds every stem at the level the mix was set at. Matched to track A by measurement
    // when the stems were first delivered: the premix sat at -17.66 dB RMS against A's
    // -21.16 dB, heard through 0.5632, which gave 0.3762. The redelivered harmony is low and
    // loud, and with it the six sum to +2.55 dBFS, so the encoder now scales every stem by
    // 0.7235 to keep the premix off full scale; this gives that back (0.3762 / 0.7235), so
    // the drums, bass, orchestra, lead and risers are heard exactly as they were, and the
    // harmony's own trim decides where it sits.
    gain: 0.52,
  },
} as const satisfies Record<string, GameplayTrack>;
export type TrackId = keyof typeof GAMEPLAY_TRACKS;
/**
 * The order the chapters take the tracks in. Append to add a track; reordering moves
 * every chapter. **For now this is the second track alone**, so every level and the shell
 * play it while it is being tested on devices; the chapter rule and track A stay in
 * place, and restoring `['a', 'b']` puts levels 1–25 back on A.
 */
export const TRACK_CYCLE: readonly TrackId[] = ['b'];

/**
 * The title theme. A second track, and deliberately not part of the model above.
 *
 * Nothing on the menu is judged, scheduled or counted against it, so it needs none of
 * what `MUSIC` describes: no measured downbeat, no whole-bar loop, no tempo changes. It
 * only has to start, loop and get out of the way — which is why it has its own small
 * player rather than a second mode inside `MusicSystem`, where every one of those
 * guarantees would have to be made optional.
 *
 * The theme is `bgm/theme/home-page.wav`, a seamless 64.000 s loop with music to its last
 * sample, shipped as an MP3 the encoder writes with a 0.1 s head and the loop's opening
 * 0.25 s copied after its end (scripts/encode-music.mjs). An MP3 cannot loop on its own
 * ends — the encoder pads both and decoders disagree about trimming either — so the player
 * finds the music's start in the decode and loops exactly `loopSec` from `seamSec` into it
 * (`themeLoop`). Measured in Chromium at 44.1 and 48 kHz: the start lands 0.123 s in, the
 * first 60 ms after the head carry the encoder's smear of the opening hit (up to −9 dB
 * against the music), and from 0.1 s in the two copies either side of the seam differ by
 * codec noise alone, −24 dB. So the loop restarts 0.1 s into the music, and only the first
 * play, under the fade-in, starts on the opening itself.
 *
 * `gain` matches it, by measurement rather than by ear, to the music it hands over to: the
 * shell bed on the map, track B's six stems at their trims, heard at −28.3 dB RMS against
 * the theme's −23.2 dB, so 0.551 puts the two at one level and PLAY is not a jump.
 */
export const THEME = {
  gain: 0.551,
  /** Long enough not to be a cut, short enough that leaving the menu feels immediate. */
  fadeInSec: 1.2,
  fadeOutSec: 0.45,
  url: new URL('../../bgm/theme/home-page.mp3', import.meta.url).href,
  /** The loop, as delivered: 3,072,000 frames at 48 kHz. */
  loopSec: 64,
  /** How far into the music the loop restarts: past the encoder's smear of the first frames. */
  seamSec: 0.1,
  /** Where the master's first sound crosses `leadIn.threshold`, after its sample 0. */
  onsetSec: 0.002125,
  /** The head is 0.1 s; Chromium leaves 23 ms of decoder delay on it, a trimming decoder none. */
  leadIn: { threshold: 0.05, fallbackSec: 0.125, minSec: 0.05, maxSec: 0.25 },
} as const;

export const pickupSeconds = (bpm: number, beats: number): number => beats * 60 / bpm;
/** Exact loop length in seconds: the track's whole bars at the source tempo. */
export const loopSeconds = (track: GameplayTrack): number => track.bars * MUSIC.beatsPerBar * 60 / MUSIC.sourceBpm;
