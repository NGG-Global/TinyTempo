# Music: two premixed gameplay arrangements

TinyTempo plays one selected gameplay premix through `MusicSystem` on the shared
`AudioContext`. The title theme remains a separate `ThemeMusic` player. There is no
runtime stem mixing, arrangement cache, new save field, or arrangement-specific judgement.

## Assets and provenance

| | Arrangement A | Arrangement B |
| --- | --- | --- |
| WAV inputs | Seven original masters in `bgm/` | Eight PCM working copies in `bgm/arrangement-b/` |
| Shipping premix | `bgm/mix/tiny-tempo.mp3` (unchanged) | `bgm/mix/tiny-tempo-b.mp3` |
| Source BPM | 120 | 121, measured approximately 121.002 |
| Meter / loop bars | 4/4, 60 | 4/4, 64 |
| Normalized source loop | 120.000 s | 126.942149 s, rounded to the nearest audio frame |
| Duration at gameplay's initial 120 BPM | 120 s | 128 s |
| Bitrate | 160 kb/s | 160 kb/s |
| Shipping size | 2,399,040 bytes | 2,544,480 bytes |
| Gameplay gain | 0.5632 | 0.3843 |

A's masters are `0 Drums.wav`, `1 Bass.wav`, `2 Guitar.wav`, `3 Keyboard.wav`,
`4 Percussion.wav`, `5 Synth.wav`, `6 Brass.wav`. All are stereo PCM16 at 48 kHz,
5,756,414 frames / 119.925292 seconds. Their original measurements are unchanged:
120 BPM, first downbeat approximately 156 ms into the WAV, a short silent ending,
and a 60-bar / 120-second normalized loop. Re-encoding A with the extended pipeline
produced the exact same MP3 bytes as the checked-in asset.

The delivered B archive was **MP3, not WAV**: `Memory Match Groove Stems (121BPM).zip`.
The eight WAV files now in the source folder are explicitly identified **decoded working
copies of those lossy files**, not newly recovered lossless masters. `provenance.json`
records original MP3 hashes and the archive hash. Each working WAV is stereo PCM16,
48 kHz, **7,739,136 frames / 161.232 seconds**. The original master bit depth is unknown.

Exact B input names:

- `0 Lead Vocals.wav`
- `1 Drums.wav`
- `2 Bass.wav`
- `3 Guitar.wav`
- `4 Keyboard.wav`
- `5 Synth.wav`
- `6 Other.wav`
- `7 Brass.wav`

No independently trimmed, padded, or shifted stems are accepted. All eight participate
in the offline float sum, including the almost-silent vocal stem. Only the premix ships
in the web bundle/APK; the WAV working copies and provenance do not.

## B's deliberate loop edit

The initial [inspection report](MUSIC-ARRANGEMENT-B-INSPECTION.md) records why directly
normalizing the full delivery was unsuitable: it ends off a bar boundary with an audible
tail and a late transient. Following authorization to resolve the source problems, the
encoder now makes an explicit, reproducible edit defined in `bgm/arrangement-b/edit.json`:

1. Use 121 BPM and the measured opening attack at 0.125604167 s as the source grid origin.
2. Skip four bars to the established groove, **8.059479167 s** at the source frame grid.
3. Keep **64 complete bars**, ending at approximately **135.001625 s**. This excludes
   the opening and problematic final outro instead of silently padding or truncating it.
4. Over the first **80 ms**, blend the continuation at the chosen loop end into the
   new opening using a raised-cosine weight. Both passages occupy the same beat positions;
   the blend does not overlap away any time or shorten a bar.
5. Apply **8 ms fades** at both edges to reduce codec attack differences. Add **150 ms
   silent preroll** and **100 ms cyclic postroll** for encoding. These are outside the
   gameplay loop and are removed by the existing normalization path.

This is an arrangement edit, not a claim that the delivered file was already seamless.
It retains the measured source tempo. There is **no offline time stretch** and no change
to the game's BPM curve. The source bar phase is inferred from the opening and drum grid,
not certified by a composer. Phone listening remains the final check of the musical join.

MP3 encodes the head after silence and the tail after music, leaving a residual sample
step even with an offline blend. B therefore opts into a **3 ms raised-cosine endpoint
correction** in `normalizeLoop`: adjust only the last 3 ms toward the first sample.
The frame count, beat origin, and interior samples do not move. This is generic per-track
configuration (`seamRampSec`); A leaves it disabled. Chromium measured zero endpoint
sample discontinuity for B at both 44.1 and 48 kHz after this correction.

## Rebuilding

The working WAVs are already prepared. Normal rebuilding needs only the existing JS
encoder dependency:

```sh
npm run music:encode
```

The script validates RIFF/PCM format, sample rate, channel count, bit depth, complete
frames, exact expected filenames, and equal frame counts within each arrangement.
It accumulates in Float32, performs B's edit, reduces peaks above 0.97 before converting
to PCM16, then uses the existing LAME encoder at 160 kb/s. It processes A and B sequentially.
It prints source duration/rate/frames, peak, normalization factor, output byte count,
and suggested playback gain. The machine-readable output is `bgm/mix/encoding-report.json`.
The Windows path issue is fixed with `fileURLToPath`; A's mixing math and bitrate are unchanged.
`npm run music:encode -- --stems` optionally creates reference stem MP3s; the game never loads them.

To reconstruct the WAV working copies from an extracted original archive:

```sh
node scripts/prepare-arrangement-b.mjs "path/to/extracted/Memory Match Groove stems"
```

That one-time import requires local FFmpeg and records provenance. It does not add a
runtime executable, service, backend, or network dependency. Genuine replacement WAV
masters may be placed under the same names, but their tempo, onset, loop edit, provenance,
and final encoded lead-in must be measured again; do not reuse the MP3-derived edit blindly.

## Loudness and decoded lead-in

| Measurement | A | B |
| --- | ---: | ---: |
| Float premix peak before normalization | 1.3658447 (+2.71 dBFS) | 1.1882935 (+1.50 dBFS) |
| Normalization factor | 0.7101832 | 0.8162967 |
| Encoder's gain recommendation | 0.5632349 | 0.3852479 |
| Final configured gain | 0.5632 | 0.3843 |
| Chromium decoded RMS, 44.1 kHz | 0.0875343 | 0.1282518 |
| Chromium normalized-loop RMS, 44.1 kHz | 0.0875167 | 0.1283491 |
| Chromium decoded peak, 44.1 kHz | 0.9166607 | 0.9144815 |
| Detected lead, 44.1 kHz | 0.181814059 s | 0.174965986 s |
| Detected lead, 48 kHz | 0.181812500 s | 0.175145833 s |

B's configured gain matches the **decoded** music to A (approximately 0.0493 RMS after
the music bus for each), rather than blindly copying A's gain or relying solely on the
pre-encode estimate. Peaks stay well below full scale on the music bus, leaving SFX room.
Full-file RMS is approximate loudness matching, not a perceptual loudness certification.

Both use the existing generic 0.05 (-26 dBFS) onset threshold, avoiding low-level MP3
pre-echo. A's fallback/range remain 0.182 s / 0.05–0.5 s. B's measured fallback is
**0.1751 s**, with range **0.12–0.22 s**. The first significant B crossing follows the
encoded musical origin by roughly 2 ms because of its edge fade/attack; it is the audible
attack that the grid aligns to. No extra timing forgiveness is introduced. The 44.1/48 kHz
measurements differ by 0.18 ms. Other decoders may trim encoder delay; normal operation
detects the onset rather than assuming that the fallback is universal.

Detailed browser measurements are in [MUSIC-BROWSER-MEASUREMENTS.json](MUSIC-BROWSER-MEASUREMENTS.json).

## Selection and saves

`game/musicSelection.ts` selects `ARRANGEMENT_CYCLE[chapter % cycle.length]`.
The chapter length is **`ROTATION[0].acts`**, currently 25, so:

- 1–25 A; 26–50 B; 51–75 A; 76–100 B; repeat indefinitely.
- A returning level-63 player gets A without save migration.
- The map/settings use `loadProgress().unlocked`, the existing progression frontier.
- A replay selects its own level's arrangement before its first count-in.

This deliberately preserves the explicitly requested ranges. The current registry has
29 acts, and its later eras expand at levels 51 and 107. `LevelSpec.lap` now counts each
act's earlier appearances; it would give A at level 76 and can vary within an expanded
pass. It cannot also satisfy those fixed chapter ranges. Music therefore derives its
stable chapter size from the original rotation era, without duplicating a `25` literal
or changing vignette order, visual variants, keepsakes, difficulty, or saves.

## Switching, timing, and interruption

`musicBed` still owns shell/level/silent transitions. Shell creation selects the frontier
arrangement, so B is already playing on the map/settings at frontier 26. A level claims
ownership before awaiting preparation. A mismatched replay or direct entry prepares its
arrangement before any count-in or judgement window exists. Scene tokens prevent a stale
fade/load from stopping or starting a source after another scene has taken ownership.

A changed arrangement fades out over the existing 350 ms bed transition, then stops and
disconnects its source, clears `source.buffer`, and releases the system's normalized
buffer reference **before** loading the next track. There is no two-track crossfade.
The new shell source starts from musical zero and fades in. Same-arrangement shell
screens retain the running source. A level starts a fresh source at the future shared
clock timestamp, as before; its arrangement remains fixed through every task and response.

`MusicSystem.setBpm(taskBpm, at)` maps the game BPM to `taskBpm / sourceBpm` on the existing
scheduled playback-rate parameter. A remains 1.0–1.25; B is 120/121–150/121. Both produce
identical 120–150 BPM gameplay. Pitch follows rate, as before; B starts about 14 cents
below its authored pitch. The normalized loops are whole bars to the nearest audio frame.
At 44.1 kHz B is 5,598,149 frames; at 48 kHz it is 6,093,223 frames.

Judgement, timing windows, `AudioClock`, round plans, calibration, and progression are
unchanged. Mute still acts on the shared master bus, including both arrangements and the
separate title theme. Interruption stops the attempt/source; resume starts the same
arrangement from musical zero with a fresh count-in and its base rate. No song choice
is persisted. Returning to the title silences gameplay and uses the existing title player.

## Loading, failures, and memory

Only the selected gameplay buffer remains reachable. Concurrent requests share a worker;
latest selection wins, stale decodes are discarded, and long native decodes are serialized.
The previous buffer is released before the next fetch/decode, not after it.

Measured allocation sizes from real normalized buffers:

| | 44.1 kHz stereo float | 48 kHz stereo float |
| --- | ---: | ---: |
| A | 42,336,000 bytes (40.37 MiB) | 46,080,000 bytes (43.95 MiB) |
| B | 44,785,192 bytes (42.71 MiB) | 48,745,784 bytes (46.49 MiB) |

As before, normalizing temporarily holds the new decode plus its new loop copy: about
85.5 MiB for B at 44.1 kHz, 93.1 MiB at 48 kHz, plus decoder/compressed-data overhead.
These are buffer sizes, not a measured Android process RSS or a forced-GC guarantee.
There is no permanent A+B cache. The separate title player's existing memory policy is unchanged.

B fetch/decode/normalization failure falls back to a newly loaded A on A's valid grid.
The requested chapter stays B, preventing repeated retries on every map/settings visit.
Switching away and back permits another attempt. If both fail, a **single silent bar**
provides the normal clock origin so an optional alternate track cannot block play.
A's standalone failure retains its existing Retry behavior.

Fetch/decode waits have a 12-second deadline. Web Audio cannot cancel a native decode,
so a timed-out decode retains a serialization barrier: no fallback starts another long
decode on top of it. If that barrier also times out, B uses the tiny silent bar. A late
native result is discarded and cannot replace an active level. Disposal aborts downloads,
stops/disconnects sources, and prevents late commits.

## Title theme

`bgm/theme/cozy-quest.mp3`, `THEME`, and `ThemeMusic.ts` are unchanged. The title theme has
no arrangement ID, normalized gameplay loop, tempo scheduling, or scoring role. Its
existing gain is 0.4 and it stays on the same master mute bus. It loads only when title
playback is possible. Gameplay arrangement selection never fetches it.

## Adding C

1. Supply and inspect aligned source stems; record tempo, bar count, intended origin,
   loop seam, and provenance. Add an explicit offline edit if needed.
2. Add an encoder input descriptor with directory, expected stem names, output name,
   and optional edit. Keep one float premix and one shipping MP3.
3. Add a `GAMEPLAY_ARRANGEMENTS.c` entry with a static asset URL and measured source
   model, gain, onset bounds/fallback, and optional seam ramp. Reuse shared values only
   where the measurements agree.
4. Add `c` to `ARRANGEMENT_CYCLE` if an A/B/C rotation is intended. That deliberately
   changes chapter assignment; no architecture or save-format change is needed.
5. Re-encode, measure the actual browser decode, and extend selection/asset tests and
   phone listening checks. Do not add another resident buffer or any scoring branch.

## Validation and Android listening

Final verification: `npm run typecheck`, `npm run lint`, `npm test` (**87 files / 1,088
tests**), `npm run build`, and `npm run music:encode` all passed. Thirty tests were added
across `music.test.ts`, `musicBed.test.ts`, `musicSelection.test.ts`, and `audio.test.ts`;
existing title-theme tests also pass. No test timeouts were increased. The build retains
the existing font-path, unset-Sentry-DSN, and mixed-import warnings.

Tests cover deterministic boundaries/deeper chapters and derived chapter sizes; the
expanded visual-registry discrepancy; selected-source ownership and buffer release;
stale fade/load races; fetch/decode/normalization failure and timeout fallback; identical
BPM, round plans and judgements; per-arrangement loop normalization and B seam correction;
shared mute; fresh-count-in resume; and separate title playback.

Actual Chromium scene checks exercised frontier 26 → settings (same B source) → level 26
(correct B origin at 120 BPM) → map → frontier 51 (A) → title (zero gameplay sources),
with no page errors. Decoder measurements ran at both 44.1 and 48 kHz. Passing automated
checks do not substitute for listening to the edited musical join on a phone.

On Android, check:

1. Leave B playing on the map through at least 128 seconds to hear its complete loop seam.
2. Compare A/B chapter changes (25→26 and 50→51), then replay an older chapter; listen for
   an intentional fade and correct first count-in, with no track change during a response.
3. Compare loudness against the title theme and vignette SFX at low/high volume.
4. Mute/unmute during B, background/resume, and change output route; confirm a fresh,
   aligned count-in after interruption and no simultaneous gameplay sources.
5. Block B loading in a debug build: A should take over; with both unavailable, the level
   should remain playable on its normal SFX/clock. Watch memory across repeated switches.
