# Music: two premixed gameplay loops, and the title theme

Two gameplay tracks, each one premixed MP3 from its own WAV stems, each normalised at load
into an exact whole-bar loop at 120 BPM, and one of them decoded at a time. Track A is the
seven-stem workshop loop this document was written for, and every measurement below is
still it unless the section says otherwise. Track B is the six-stem second track, in
[its own section](#track-b-the-second-track). Which one a level plays is
[a chapter rule](#which-track-a-level-plays). The title theme is a third file, and the
[last section](#the-title-theme) says why it is not a track.

## Track A: files and inspection

Seven unmodified stems: `bgm/0 Drums.wav`, `1 Bass.wav`, `2 Guitar.wav`, `3 Keyboard.wav`, `4 Percussion.wav`, `5 Synth.wav`, `6 Brass.wav`. All are stereo 16-bit PCM at 48 kHz with 5,756,414 frames: **119.925292 seconds**, about 23 MB each. They replace the earlier four-stem composition (kept in Git history). No trimming, normalization, independent offsets or time stretching was applied to the files.

## Musical metadata (measured)

The delivery note said the music begins on the first beat at second 0 and loops well. Onset analysis says otherwise, and `config/music.ts` records what was measured:

- **Tempo 120 BPM.** A comb-filter scan from 60 to 200 BPM and a least-squares fit over 227 drum onsets both land within 0.01 BPM of 120; the residual drift between the first and last thirty seconds is about 6 ms, which rules out 120.075 (the tempo that would make the raw file length a whole number of beats).
- **Lead-in 0.156 s.** Drums, percussion and keyboard all first exceed 1% of full scale between 0.156 and 0.158 s; the first 156 ms hold only dither-level noise. The first downbeat is therefore ~156 ms into the file, not at zero. Bass enters at 16.1 s, synth 10.4 s, brass 44.4 s, guitar 67.6 s.
- **Loop is 75 ms short of 60 bars.** 119.925 s is 239.85 beats at 120 BPM; 60 bars would be 120.000 s. Looping the raw file would slip the grid by 75 ms every cycle, and the signal ends at 119.89 s, so the tail is already silent.

`MusicSystem.normalizeLoop()` therefore copies the decoded track into an exact 120.000 s buffer: it drops the detected lead-in and pads the silent tail to `bars × beatsPerBar` beats. Beat 0 of the loop is the first downbeat, so `pickupBeats` is 0 and the count-in begins on the loop origin. The gameplay grid and the file loop then stay aligned indefinitely. Bar phase (which beat is "one") assumes the first audible beat is a downbeat; confirm with the composer.

## Shipped format: one premixed MP3 per track from the WAV masters

The WAVs are kept only as masters. `npm run music:encode` (`scripts/encode-music.mjs`,
pure-JavaScript LAME at 160 kb/s joint stereo) sums each track's masters at the weights in
its `TRACKS` entry and writes one stereo file per track into `bgm/mix/`: `tiny-tempo.mp3`,
2.40 MB, from the seven in `bgm/`, and `tiny-tempo-b.mp3`, 2.16 MB, from the six in
`bgm/track-b/`. `GAMEPLAY_TRACKS` in `config/music.ts` points at those files, so the web
bundle and the Android APK carry two music assets instead of thirteen. `--track a` or
`--track b` encodes one; `--stems` also writes per-stem MP3s beside that track's masters,
which is what a future dynamic mix would need; nothing loads them today. Re-run the script
whenever a WAV changes, and re-measure the lead-in afterwards. Track A's encode is
deterministic: re-running it with the same masters writes the same bytes, which is how a
change to the script is checked against the file that ships.

The premix is summed and scaled in float, never in 16-bit: the seven stems together peak at
**1.3658 (+2.71 dBFS)**, so a 16-bit sum would clip irreversibly. The script normalises to
0.97 peak — a factor of 0.710183 — and reports the bus gain that gives it back.
`MUSIC.masterGain` is therefore 0.5632 (0.4 / 0.710183), which puts the track at exactly the
level the seven stems played at while keeping the extra signal-to-noise the normalisation
bought through the lossy encode.

Why one file: nothing mixes stems at runtime. `MUSIC.mix` was all 1 and `setGain` was
reachable only from the DEV replay panel, so seven decodes bought nothing and cost a great
deal — see the memory note below.

MP3 decoding is not sample-exact. Chromium decodes the premix to 5,289,883 frames
(119.951995 s) at its own 44.1 kHz context rate, with the usual encoder-plus-decoder delay
ahead of the music; other decoders may trim that delay using the LAME header. The lead-in is
therefore detected at load rather than configured: `detectLeadIn` returns the first frame
above `threshold`, and `normalizeLoop` drops exactly that many frames.

`threshold` is **0.05 (-26 dBFS)**, not the -40 dBFS this carried while the drum stem was the
reference. MP3 pre-echo smears energy backwards into the granule before a transient, and
-40 dBFS is exactly that level: measured in Chromium, the drum stem and the premix disagree
by 64 frames (1.45 ms) at -40 dBFS but by only 4 frames (0.09 ms) at -26 dBFS. The opening
drum hit rises from -26 to -14 dBFS within 1 ms, so the higher threshold still lands on the
attack. `detectLeadIn` also rejects a crossing outside `minSec`-`maxSec` (0.05-0.5 s) and
falls back: a silent head, a wrong file or a hit later in the opening bar would otherwise
shift the beat grid against the music permanently, with no resync. It does **not** catch a
trigger one granule early, which stays inside that range — the threshold is what handles
that case.

Measured in the running game: detected lead **0.181814 s** (8018 frames at 44.1 kHz), loop
length exactly 120.000000 s, one active source. Against the seven-stem build, which detected
7973 frames at -40 dBFS on the drum stem, the music now sits **1.02 ms later** relative to
the beat grid. That is 0.4% of a half beat at 120 BPM and 0.8% of the Good window's
half-width; it has not been checked by ear.

Decoded memory, by arithmetic rather than measurement: one stereo 120 s buffer at 44.1 kHz
is about 42 MB of float PCM, and `normalizeLoop` holds the decode and the copy at once, so
roughly 85 MB transiently. The seven-stem load was seven times that — about 296 MB steady
and 592 MB transient, allocated during the PLAY tap before the player had seen anything.
Download went from 16.8 MB to 2.4 MB, and `dist/` from 28 MB to 3.8 MB with sourcemaps off.

## Track B: the second track

Six stems, delivered as `BASIC_DRUM_STEM`, `BASS_STEM`, `MAIN_HARMONY_STEM`,
`SYNTH_LEAD_STEM`, `ORCHESTRAL_SPICES_STEM` and `RISERS_NOISES_AND_PERCS_STEM`, kept
unmodified in `bgm/track-b/` under the masters' naming convention (`0 Drums.wav` to
`5 Risers.wav`). All are stereo **24-bit** PCM at 48 kHz with 5,184,000 frames:
**108.000000 s**, 31 MB each. The encoder reads 24-bit as well as 16-bit for them.

Measured, the same way as track A:

- **Tempo 120 BPM, 4/4.** A comb scan of the drum stem prefers 80 and 160 BPM, and that
  is the kick pattern, not the tempo: the strong hits sit three sixteenths apart (375 ms)
  with a second hit 86 ms behind each. Against a 120 BPM grid laid from sample zero,
  **every bar's downbeat kick reaches −26 dBFS 3.6–3.7 ms after the beat, from bar 1 to
  bar 54**, and a least-squares fit over the on-beat attacks gives 120.01 BPM. The harmony
  stem changes chord on beats 1 and 3 of a four-beat bar and is flat against a three-beat
  one. The arrangement confirms the bar: the orchestra enters at 12.0 s (bar 7) and leaves
  at 54.0 s (bar 28), the synth lead enters at 20.0 s (bar 11) — all whole bars at 120 and
  not at 80 or 160.
- **Lead-in 0 s.** The harmony exceeds −26 dBFS 1.8 ms into the file and the first kick
  3.6 ms in. The file starts on the downbeat.
- **Loop exactly 54 bars.** 108.000 s is 216 beats at 120 BPM. Nothing is padded or
  trimmed; the music runs to the last sample and the seam is the composer's own. The
  harmony's last 5 ms sit at −38.8 dB against −29.9 dB for its first 5 ms, so the join is
  an attack after a decay rather than a click, but it has not been checked by ear.

The six stems sum to a peak of **0.9494 (−0.45 dBFS)**, so the premix is not scaled. The
encoder writes **0.1 s of silence in front of it**. The masters start on the downbeat, and
an MP3 whose first transient sits in the opening granule is where decoders disagree most
about how much encoder delay to trim; the head puts B's opening hit in the same regime as
A's, whose masters carry 156 ms of room, and inside a detection window with a real guard
on both sides. `normalizeLoop` drops it at load like any lead-in.

Decoded in Chromium, at both 44.1 and 48 kHz: 108.144 s, the first crossing of −26 dBFS at
**0.1247 s** — the head, the same 23 ms of decoder delay track A shows, and the harmony's
1.8 ms rise — and 108.019 s of music after it, so the 108.000 s loop is whole. A decoder
that trims the delay through the LAME header lands near 0.102 s. `GAMEPLAY_TRACKS.b.leadIn`
is therefore `{ threshold 0.05, fallback 0.125, min 0.05, max 0.25 }`, which admits both
and rejects a premix encoded without its head.

Loudness was matched to track A by measurement when the stems were first delivered: the
decoded premix sat at **−17.66 dB RMS** against A's **−21.16 dB**, and A is heard through
0.5632, so `gain` was **0.3762**. The redelivered harmony (below) makes the six sum to
+2.55 dBFS, so the encoder now scales every stem by 0.7235 to keep the premix off full
scale, and `gain` is **0.52** (0.3762 / 0.7235): every stem but the harmony is heard exactly
as loud as before.

## Track B in layers, and the metronome

Track B is not played as its premix. The encoder writes each of its six stems as its own
MP3 (`tiny-tempo-b-drums.mp3` to `tiny-tempo-b-risers.mp3`, 128 kb/s, 1.73 MB each), with
the same 0.1 s head and the same scale as the premix, so the six played together are the
premix to the sample. `GAMEPLAY_TRACKS.b.stems` lists them in the order a level brings
them in — drums, bass, harmony, orchestral colour, then the synth lead and risers that only
the shell plays — and track A is the same shape with one stem, its premix.

`MusicSystem` decodes every stem of the selected track, one after another, and starts one
looping source per stem on the same sample under the same rate automation, so they cannot
drift apart. **The lead-in is detected on the first stem and applied to all of them**: each
stem's own first sound sits somewhere else in the bar (the bass at 25 ms, the synth lead at
20 s), and a per-stem detection would slide the stems against each other. Decoded in
Chromium, the drums' first crossing of −26 dBFS sits ~2 ms after the premix's, which is the
kick's own rise; `fallbackSec` is 0.127 for that reason.

A level starts on the first stem alone, with a metronome bar under it, and earns more
(`game/musicLayers.ts`): a scored task at or above `MUSIC.layers.strong` (70%) adds the
next stem, one below `MUSIC.layers.weak` (40%) takes the last one away, anything between
holds, and the change lands on the next task's downbeat with the tempo change, faded over
`MUSIC.layers.fadeSec`. The count is level-local, reset at every start, stored nowhere and
read by nothing that judges, scores, paces, saves or unlocks. A premix is a track that is
always full: the same rule runs and hears nothing.

### The mix: the music is the room, not the subject

The game is played by ear. What the player has to hold in their head is the phrase the act
just demonstrated, and the foreground is that act's voice and the metronome; every stem is
background to them. The first layered build played the stems as delivered and let a strong
level reach all six, and it was tiring exactly when the synth lead entered. Measured on the
24-bit masters:

| Stem | Bars active | Onsets a bar | Off the beat and eighth grid | Energy under 250 Hz / 250–2k / above 2k |
| --- | --- | --- | --- | --- |
| Drums | 1–54 | 14.4 | 69% | 84% / 13% / 2% |
| Bass | 1–26, 35–54 | 9.7 | 60% | 91% / 9% / 0% |
| Harmony | 1–54 | 5.3 | 48% | 19% / 71% / 11% |
| Synth lead | 11, 17–18, 22, 27–54 | 5.5 | 39% | 16% / 70% / 14% |
| Orchestral | 7–12, 15–26 | 4.6 | 46% | 24% / 65% / 11% |
| Risers | 27–51, every other bar | 14.9 | 43% | 8% / 55% / 37% |

The lead is a melody with a rhythm of its own, in the same band as the act voices, so in a
level it is a second phrase competing with the one being copied. The risers are tension
sweeps, and a riser announces a downbeat event that in this game never comes. Neither can
be fixed by level alone: a quieter melody is still a melody. So:

- **A level can earn five stems** (`GAMEPLAY_TRACKS.b.levelStems`): drums, bass, harmony,
  orchestral colour and, **last**, the synth lead. The lead takes four strong tasks in a row
  from the drums alone and is the first thing a weak task takes away, so it is heard only by
  a player already in the pocket, and it enters quieter and darker than every stem it joins.
  The risers play only on the map and in Settings, where nothing is judged, and quieter even
  there.
- **Each stem has a trim and, where it shares the act voices' band, a tone** — a 12 dB/oct
  low-pass with no resonance, because a sound's attack and presence live above ~2 kHz and
  that is what pulls the ear. The layer gain carries the trim, so a stem can never be heard
  untrimmed:

| Stem | Trim | Tone | In a level |
| --- | --- | --- | --- |
| Drums | 0 dB | — | always |
| Bass | −2 dB | — | 2nd |
| Harmony | −5.3 dB | 3.2 kHz, cut below 120 Hz | 3rd |
| Orchestral | −5 dB | 3.5 kHz | 4th |
| Synth lead | −9 dB | 1.8 kHz | 5th, last |
| Risers | −10 dB | 2.5 kHz | never |

Rendered from the masters over bars 23–38, at the game's bus gain with the metronome, four
stems sit 3.0 dB below what a strong level reached before, and 5.8 dB lower in the 250 Hz–2
kHz band; the lead's arrival on top of them is the one step that adds a melody back, behind
its trim and tone. The trims and tones were chosen from these measurements and have been
heard only through that render, not on a handset against an act. A level of four tasks or
fewer can never reach the lead, since it takes four strong tasks to earn and lands on the
next one's downbeat; `levelStems` back to 4 takes it out of levels altogether.

### The redelivered harmony

`bgm/track-b/2 Harmony.wav` was replaced by a second delivery, `HARMONY_ALTERNATIVE.wav`, and
the first is kept as `bgm/track-b/replaced/2 Harmony (first delivery).wav` (the encoder reads
only the folder's own WAVs). Same format, same 5,184,000 frames, the same first sound 1.77 ms
in, and its chords still move on beats 1 and 3. But it is a different part:

| | First delivery | Second delivery |
| --- | --- | --- |
| Peak / RMS | −6.7 dBFS / −23.5 dB | −2.3 dBFS / −19.4 dB |
| Energy under 250 Hz / 250–2k / above 2k | 19% / 71% / 11% | 74% / 24% / 3% |
| Below 60 Hz and 60–120 Hz, against its whole | −52 / −39 dB | −10 / −7 dB |

The bass stem reads −9 and −6 dB in those two bands: below 120 Hz the new harmony carries as
much as the bass itself. Played as delivered it doubles the bass's register and blurs the
kick, which is the pulse a player locks onto, so it takes a **120 Hz low cut** (`lowCutHz`, a
12 dB/oct high-pass ahead of its tone) and keeps its warmth from 120 Hz up. Its trim,
**−5.3 dB**, is what puts it at the loudness the first delivery had in this mix, matched on an
approximate K-weighting (BS.1770's shelf and high-pass, ungated) rather than on RMS, because
a low part at equal RMS sounds quieter. Rendered over bars 23–38 with the five stems a level
can earn and the metronome, the mix matches the old one within 0.1 dB overall, below 120 Hz
and in 250 Hz–2 kHz; without the cut the low end would be 1.6 dB heavier. Not yet heard on a
handset.

The drums are the busiest stem — 14 onsets a bar, most of them sixteenths — and they are
the floor, under the metronome from the first beat. That is the composer's groove and no
mix can make it simpler; if it still reads as busy against the patterns being copied, the
fix is a simpler drum part, not a quieter one.

The metronome (`audio/metronomeSounds.ts`) is one synthesized bar at the source tempo — a
click on every beat, the first accented by pitch and level — looped as one more source
from the same start sample with the same rate automation, so its accent is always the
loop's downbeat and it can never drift from what it counts. It rides the track's bus
through its own gain (`MUSIC.metronome.gain`), so the bed's fades and the mute cover it,
and the track's loudness match scales it. Its levels are set by ear, not measured.

**The cost is memory and download, and it is the cost the premix was made to avoid.** A
decoded stereo stem is ~38 MB of float PCM at 44.1 kHz (41.5 at 48), so the six stems hold
~230 MB steady and one more decode transiently, against 38 MB for the premix; every stem is
genuinely stereo (the drums, the narrowest, carry −14.6 dB of side energy), so none can
ship mono. The download is 10.4 MB against 2.2. The seven-stem build this repository began
with ran at ~296 MB, so the figure is known to work on the devices it was tried on, but it
has not been measured on a low-memory handset and a WebView killed for memory looks like
a freeze. If it proves too much, the cheaper shape is three cumulative mixes (drums, drums
with bass and harmony, everything) crossfaded by the same rule, at half the memory and a
coarser arrangement.

## Which track a level plays

`trackForLevel` in `game/musicSelection.ts`: levels are taken in chapters of
`MUSIC.chapterLevels`, twenty-five, and the chapters go round `TRACK_CYCLE` — with
`['a', 'b']`, 1–25 on A, 26–50 on B, 51–75 on A again. **For now the cycle is `['b']`**,
so every level and the shell play track B while it is being heard on devices; the rule and
track A stay, and restoring `['a', 'b']` is the whole change back. The rule is the level alone, so nothing is stored, save codes
and merges hear the same track for the same level, and a replay plays what the level
played. Twenty-five is two and a half areas, so a chapter boundary is never an area gate,
which is deliberate: the areas already change the ground and the finale, and the music
changing on the same line would make every gate a wall of new things. The shell on the map
and settings plays the frontier's chapter (`shellTrack` in `audio/sharedAudio.ts`), so a
player hears the change once, on the road, and a replay from the other chapter hands its
track back on the way out.

Both tracks are authored at 120 BPM, and `MUSIC.sourceBpm` is not a per-track value: every
level starts there and `setRate` is the level's BPM over it. A track at another tempo would
be pitch-shifted on every level to sit on the grid, so a delivery at another tempo is
re-rendered, not compensated.

## Playback

`MusicSystem` shares `AudioEngine.context` and the music bus under master mute, never creating another
live context. `load(id)` fetches and decodes one track and commits it atomically after
validation. Concurrent callers for the same track share one promise; the decoded loop is
cached until another track is asked for. A failed
fetch, an empty decode or an invalid sample rate rejects playback with a visible retry
error, and nothing partial starts. Disposal aborts the download and prevents a late decode
from committing.

**One track is decoded at a time.** A loop is ~42 MB of float PCM and the normalising copy
doubles that transiently, so holding both would double the steady cost for a switch that
happens once every twenty-five levels. Asking for a different track stops the source — a
source can only play the buffer it was given — releases the loaded loop, and only then
fetches; a load still in flight for another track is cancelled and its callers told it was
superseded. Scenes select at their boundaries and nowhere else: the menu's PLAY loads the
frontier's track before the shell starts, a shell screen's create names it through
`setMusicBed(engine, 'shell', { track })`, which fades whatever is running out before it
loads and starts the one asked for, and a level loads its own chapter's track after the
map's curtain has hushed the shell. A leftover level from the other chapter is never
reused as the shell, however smoothly it is running.

After the menu's PLAY gesture resumes the shared AudioContext and awaits loading, the play
scene schedules one future start (context time + the configured 200 ms lead) with
`start(sharedTime, 0)`, `loop = true`, `loopStart = 0`, `loopEnd = 120` and playback rate 1.
Native Web Audio handles looping: no bar timers, boundary restarts or resynchronization.

The gameplay count-in begins on the loop origin, which is the first musical downbeat. The
track is authored at 120 BPM; each level starts there and `setRate` ramps the playback rate
on a task downbeat as the level's tempo curve rises, up to +25%. Pitch rises with tempo,
which is why the level curve caps there.

## Gain and cleanup

One GainNode carries the whole track at the loaded track's `gain` (`trackGain`), feeding
the player's music bus, which feeds master output. Committing a different track moves the
bus to its gain while nothing is playing, so the level is right before anything is heard. `setGain` validates 0-1 and ramps over 25 ms; zero gain
leaves the source running silently, and global mute likewise changes only the master gain.
The player's music level is that parent bus, so a swell, a bed fade and the title theme
all scale with it and none of them has to know the setting. Effects have their own bus.
There is no per-stem control any more. The DEV replay panel still has a single music toggle,
which ducks the mix gain and leaves the player's level where it is.

Music continues through task slides, vignette changes, the final summary and the return to
the menu. Task SFX cancellation and profile changes do not touch it. An explicit session
restart stops and disconnects the old source and schedules a fresh one from the cached
buffer. Background interruption or audio suspension stops music alongside the attempt;
resuming needs a fresh gesture and count-in. Disposal stops the source, disconnects the
gain and releases the buffer.

## Validation and risks

`tests/music.test.ts` covers a single atomic load, the full-buffer loop, silent running and
restoration, repeated loops without source creation, restart and disposal, failed-load
retry, disposal during loading, invalid starts and gains, lead-in detection including both
out-of-range cases and track B's bounds against both kinds of decoder, whole-bar
normalisation of both tracks, one track loaded at a time with the source stopped and the
loop released before the next fetch, a superseded load, and the musical pickup calculation.
`tests/musicBed.test.ts` covers the shell switching tracks under a fade and refusing a
leftover level from the other chapter; `tests/musicSelection.test.ts` pins the chapter
rule. `tests/audio.test.ts` verifies that task SFX cancellation cannot stop music.

Browser QA used the actual file, driven in headless Chromium at 393x851: one active source,
loop length exactly 120.000000 s, detected lead 0.181814 s, bus gain 0.5632, unchanged
across task transitions and round restarts, with no console errors and no failed requests.

Remaining risks, none of which a browser can settle: confirm the bar phase with the
composer; verify the detected lead-in and the loop seam of both tracks by ear on Android
and iOS decoders, including whether either trims the encoder delay via the LAME header;
check each premix's relative loudness and headroom against the SFX by ear now that each
track's `gain` is a measured match; listen to the change of track at level 26 and on the
map when the frontier crosses it; and test iOS/Android unlock, interruption and output
routing.

## The title theme

A second track, `bgm/theme/home-page.mp3`, plays on the title screen and nowhere else. Its
master is `bgm/theme/home-page.wav`, kept unmodified, and `npm run music:encode -- --track
theme` writes the MP3. Going to the map, into a level, or into Settings stops it. The
gameplay loop then continues as the shell bed on the map and settings (`audio/musicBed.ts`),
and is still the only thing a level ever hears. Returning to the title hushes that loop so
the two tracks cannot overlap.

It replaces `bgm/theme/cozy-quest.mp3`, which stays in the repository so the change can be
undone by pointing `THEME.url` back at it. Nothing references it, so it no longer reaches
the bundle.

It has its own player, `audio/ThemeMusic.ts`, rather than a second mode inside
`MusicSystem`. Everything that makes that system trustworthy is a promise about a beat
grid — a measured downbeat, a loop that is exactly whole bars, a tempo that changes task
by task — and a level is judged against all three. The menu judges nothing, so sharing the
code would have meant making each of those guarantees optional in the one place they must
not be. The theme only has to start, loop and get out of the way.

| | Track A | Track B | Title theme |
| --- | --- | --- | --- |
| Files | one premix | six stems, layered by performance | one file |
| Length | 120.000 s, exactly 60 bars | 108.000 s, exactly 54 bars | 64.000 s, as delivered |
| Loop | whole bars, lead-in detected and dropped | whole bars, lead-in detected and dropped | seamless, from loop points found in the decode |
| Tempo | `setRate` per task | `setRate` per task | fixed |
| Gain | 0.5632 | 0.52 | 0.551 |
| Size | 2.4 MB | 10.4 MB (six stems) | 1.3 MB |

### A seamless loop through an MP3

The master is a seamless loop: 24-bit stereo at 48 kHz, exactly 3,072,000 frames, music to
its last sample, and its last sample within 0.004 of its first. The theme it replaces faded
at both ends, so looping the whole decoded file only ever dipped. This one would gap: an MP3
encoder writes silence in front of the music and pads the end, and decoders disagree about
trimming either, so a decoded MP3 looped on its own ends has a hole at the seam every 64 s.

So the encoder writes the theme with a known 0.1 s head of silence and the loop's opening
0.25 s copied again after its end, and `themeLoop` finds the music's start in the decode —
the first crossing of −26 dBFS, the same detection `detectLeadIn` gives the gameplay track,
less the 2.125 ms at which the master's first sound crosses it — and loops exactly
`THEME.loopSec` from there. The seam then has music on both sides, and a start found a few
milliseconds out shifts the loop without opening a gap in it.

Measured in Chromium at 44.1 and 48 kHz: the start lands at 0.123 s, the waveform's step
across the seam is the size of an ordinary sample-to-sample step, and the loop's RMS is
−23.6 dB. The first 60 ms after the head are not clean: the encoder smears the opening hit
across the frames that follow silence, and against the copy at the end they differ by up to
−9 dB. From 0.1 s in, the two copies differ by −24 dB, which is the codec's own noise. So
**the loop restarts `THEME.seamSec`, 0.1 s, into the music**, and only the first play, under
the 1.2 s fade-in, starts on the opening itself. A decode that cannot hold the loop — the
wrong file, a truncated download — falls back to looping the file on its own ends.

`THEME.gain` is measured rather than judged by ear, and against what the theme hands over
to: PLAY takes the player to the map, whose shell bed is track B's six stems at their trims,
heard at −28.3 dB RMS. The theme's master sits at −23.2 dB, so 0.551 puts the two at one
level and pressing PLAY is not a jump. Both hang off the music bus, so the player's music
level and the mute cover the theme like the loop.

**A browser will not play it until the page has been touched.** That is the autoplay
policy and not something the code can route around: on a cold start the context is
suspended, so `enter()` does nothing and — importantly — fetches nothing. Every tap on the
title screen that leaves the player there asks again, and a return from the map finds the
engine already unlocked and starts immediately. Where a platform does allow playback
without a gesture, which a packaged WebView can, the attempt made when the menu opens
succeeds on its own.

The corollary is worth keeping: **the 1.3 MB is only spent by a player who hears it.**
Tapping straight through from a cold start to a level downloads the gameplay track and the
recorded beats and not the theme. The trap on the way there was that a `resume()` left
pending from the menu's own create resolves the instant PLAY grants the gesture credit it
was waiting for — which is exactly when the player is leaving — so the wake path checks
`busy` as well as `disposed` before it starts anything.

Driven in headless Chromium at 393×851: the theme starts on the first tap with the loop
points above, fades to 0.551, and leaves on PLAY at the instant the shell bed starts, with
no overlap and no gap. Not settled here: whether the seam is inaudible on a handset's own
decoder, and the level match by ear.
