# Music: one premixed loop from seven composition stems

## Files and inspection

Seven unmodified stems: `bgm/0 Drums.wav`, `1 Bass.wav`, `2 Guitar.wav`, `3 Keyboard.wav`, `4 Percussion.wav`, `5 Synth.wav`, `6 Brass.wav`. All are stereo 16-bit PCM at 48 kHz with 5,756,414 frames: **119.925292 seconds**, about 23 MB each. They replace the earlier four-stem composition (kept in Git history). No trimming, normalization, independent offsets or time stretching was applied to the files.

## Musical metadata (measured)

The delivery note said the music begins on the first beat at second 0 and loops well. Onset analysis says otherwise, and `config/music.ts` records what was measured:

- **Tempo 120 BPM.** A comb-filter scan from 60 to 200 BPM and a least-squares fit over 227 drum onsets both land within 0.01 BPM of 120; the residual drift between the first and last thirty seconds is about 6 ms, which rules out 120.075 (the tempo that would make the raw file length a whole number of beats).
- **Lead-in 0.156 s.** Drums, percussion and keyboard all first exceed 1% of full scale between 0.156 and 0.158 s; the first 156 ms hold only dither-level noise. The first downbeat is therefore ~156 ms into the file, not at zero. Bass enters at 16.1 s, synth 10.4 s, brass 44.4 s, guitar 67.6 s.
- **Loop is 75 ms short of 60 bars.** 119.925 s is 239.85 beats at 120 BPM; 60 bars would be 120.000 s. Looping the raw file would slip the grid by 75 ms every cycle, and the signal ends at 119.89 s, so the tail is already silent.

`MusicSystem.normalizeLoop()` therefore copies the decoded track into an exact 120.000 s buffer: it drops the detected lead-in and pads the silent tail to `bars × beatsPerBar` beats. Beat 0 of the loop is the first downbeat, so `pickupBeats` is 0 and the count-in begins on the loop origin. The gameplay grid and the file loop then stay aligned indefinitely. Bar phase (which beat is "one") assumes the first audible beat is a downbeat; confirm with the composer.

## Shipped format: one premixed MP3 from the WAV masters

The WAVs are 161 MB and are kept only as masters. `npm run music:encode`
(`scripts/encode-music.mjs`, pure-JavaScript LAME at 160 kb/s joint stereo) sums the seven
masters at the `MIX` weights and writes one stereo track, `bgm/mix/tiny-tempo.mp3`, 2.40 MB.
`config/music.ts` points at that file, so the web bundle and the Android APK carry one
music asset instead of seven. Pass `--stems` to also write `bgm/mp3/*.mp3`, which is what a
future dynamic mix would need; nothing loads them today. Re-run the script whenever a WAV
changes, and re-measure the lead-in afterwards.

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

## Playback

`MusicSystem` shares `AudioEngine.context` and master output/mute, never creating another
live context. `load()` fetches and decodes the one track and commits it atomically after
validation. Concurrent callers share one promise; the decoded buffer is cached. A failed
fetch, an empty decode or an invalid sample rate rejects playback with a visible retry
error, and nothing partial starts. Disposal aborts the download and prevents a late decode
from committing.

After the menu's PLAY gesture resumes the shared AudioContext and awaits loading, the play
scene schedules one future start (context time + the configured 200 ms lead) with
`start(sharedTime, 0)`, `loop = true`, `loopStart = 0`, `loopEnd = 120` and playback rate 1.
Native Web Audio handles looping: no bar timers, boundary restarts or resynchronization.

The gameplay count-in begins on the loop origin, which is the first musical downbeat. The
track is authored at 120 BPM; each level starts there and `setRate` ramps the playback rate
on a task downbeat as the level's tempo curve rises, up to +25%. Pitch rises with tempo,
which is why the level curve caps there.

## Gain and cleanup

One GainNode carries the whole track at `MUSIC.masterGain`, feeding master output. `setGain`
validates 0-1 and ramps over 25 ms; zero gain leaves the source running silently, and global
mute likewise changes only gain. There is no per-stem control any more, and no player-facing
mixer — the DEV replay panel has a single music toggle.

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
out-of-range cases, whole-bar normalisation, and the musical pickup calculation.
`tests/audio.test.ts` verifies that task SFX cancellation cannot stop music.

Browser QA used the actual file, driven in headless Chromium at 393x851: one active source,
loop length exactly 120.000000 s, detected lead 0.181814 s, bus gain 0.5632, unchanged
across task transitions and round restarts, with no console errors and no failed requests.

Remaining risks, none of which a browser can settle: confirm the bar phase with the
composer; verify the detected lead-in and the loop seam by ear on Android and iOS decoders,
including whether either trims the encoder delay via the LAME header; check the premix's
relative loudness and headroom against the SFX by ear now that `masterGain` compensates for
normalisation; and test iOS/Android unlock, interruption and output routing.

## The title theme

A second track, `bgm/theme/cozy-quest.mp3`, plays on the title screen and nowhere else.
Going to the map, into a level, or into Settings stops it; the premixed loop above is
still the only thing a level ever hears.

It has its own player, `audio/ThemeMusic.ts`, rather than a second mode inside
`MusicSystem`. Everything that makes that system trustworthy is a promise about a beat
grid — a measured downbeat, a loop that is exactly whole bars, a tempo that changes task
by task — and a level is judged against all three. The menu judges nothing, so sharing the
code would have meant making each of those guarantees optional in the one place they must
not be. The theme only has to start, loop and get out of the way.

| | Gameplay loop | Title theme |
| --- | --- | --- |
| Length | 120.000 s, exactly 60 bars | 152.0 s, as delivered |
| Loop | whole bars, lead-in detected and dropped | the file's own ends, which fade |
| Tempo | `setRate` per task | fixed |
| Gain | 0.5632 | 0.4 |
| Size | 2.4 MB | 3.5 MB |

`THEME.gain` is measured rather than judged by ear: the theme sits at −18.2 dB RMS against
the premix's −21.2 dB, so 0.4 against the premix's 0.5632 puts the two at the same heard
level and the move from the title screen into a level is not a jump. Both hang off the
engine's master bus, so the mute switch covers the theme like everything else.

**A browser will not play it until the page has been touched.** That is the autoplay
policy and not something the code can route around: on a cold start the context is
suspended, so `enter()` does nothing and — importantly — fetches nothing. Every tap on the
title screen that leaves the player there asks again, and a return from the map finds the
engine already unlocked and starts immediately. Where a platform does allow playback
without a gesture, which a packaged WebView can, the attempt made when the menu opens
succeeds on its own.

The corollary is worth keeping: **the 3.5 MB is only spent by a player who hears it.**
Tapping straight through from a cold start to a level downloads the gameplay track and the
recorded beats and not the theme. The trap on the way there was that a `resume()` left
pending from the menu's own create resolves the instant PLAY grants the gesture credit it
was waiting for — which is exactly when the player is leaving — so the wake path checks
`busy` as well as `disposed` before it starts anything.

Not settled here: the loop seam. The file neither starts nor ends in silence but does fade
at both ends, so the join is a dip rather than a click, and at 152 s most players will
never reach it. Whether that dip is acceptable, and whether 3.5 MB is the right price for
a title loop — a shorter edit or a lower bitrate would cut it substantially — are both
calls for the composer rather than for a headless browser.
