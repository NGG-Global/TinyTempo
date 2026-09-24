# Arrangement B: source inspection, September 25, 2026

## Historical inspection � resolved by the subsequent implementation

This report preserves the initial source findings. The user subsequently authorized
resolving the source issues; B is now implemented using a documented 64-bar interior
loop edit. The missing WAVs were prepared as explicitly labelled MP3-derived PCM working
copies. The encoder Windows bug is fixed. See [MUSIC.md](MUSIC.md) for current behavior,
measurements, and validation. The stopped-work status and command results below describe
the initial inspection only, not the finished feature.

## Initial status

Implementation stopped at source validation, following the request not to hide a timing
or looping problem in code. No runtime, scoring, progression, title-theme, encoding,
or test code has changed. No shipping B premix has been generated. The supplied files
are usable for analysis, but are not the promised WAV masters or a validated seamless loop.

## Provenance and method

Archive: `Downloads/Memory Match Groove Stems (121BPM).zip` (18,403,657 bytes).
SHA-256: `e286fc0841264057266da473198fa08745edb8026f9d0390cf495aedaed4add2`.

The archive contains eight MP3 files. Each was fully decoded with local FFmpeg 9.0 to
stereo float32 PCM at its native 48,000 Hz. All decode to **7,739,136 frames**, or
**161.232 seconds**. They are mutually compatible in decoded dimensions. MP3 has no
fixed PCM bit depth; the original master bit depth cannot be recovered from this delivery.
Float32 is the analysis format, not evidence of 32-bit source masters.

Header-only duration estimates were inconsistent because these files have variable
bitrates; the durations above come from counting the fully decoded frames, not trusting
those estimates. FFmpeg decoding emitted no errors. Browser/Android decoding has not
been measured, and there is no generated B premix whose decoder lead-in can be certified.

Local analysis scripts, extracted sources, arrays, and per-file JSON are in ignored
`test-results/arrangement-b-inspection/` (`measure_stems.py`, `check_grid.py`). They need
Python, NumPy, and FFmpeg and do not introduce a game dependency.

## Per-stem measurements

All values are measured on the decoded MP3s. Onset means first sample exceeding 0.01
absolute amplitude in either channel; it does **not** prove musical bar phase.

| Supplied file | First crossing (s) | Peak | RMS |
| --- | ---: | ---: | ---: |
| `0 Lead Vocals.mp3` | 161.214188 | 0.104061 | 0.00008947 |
| `1 Drums.mp3` | 0.868333 | 0.585257 | 0.104836 |
| `2 Bass.mp3` | 7.955417 | 0.402574 | 0.056598 |
| `3 Guitar.mp3` | 0.126125 | 0.568312 | 0.023558 |
| `4 Keyboard.mp3` | 0.123375 | 0.433929 | 0.065379 |
| `5 Synth.mp3` | 0.125938 | 0.335083 | 0.034736 |
| `6 Other.mp3` | 16.226896 | 0.242200 | 0.004026 |
| `7 Brass.mp3` | 7.543938 | 0.442751 | 0.031842 |

The vocals stem is nearly silent except for a transient near the end. Every stem has a
late threshold crossing at about 161.229 s. The summed signal peaks at 0.44624 in the
final 22 ms, after its preceding fade. This needs examination in the original export;
the analysis does not establish its cause.

## Tempo and origin

A 1 ms RMS drum envelope, smoothed over 5 ms, supplies positive-energy-change peaks.
Local peaks exceeding 0.015, separated by at least 120 ms, give 796 candidate attacks.
A weighted eighth-note phase-coherence scan from 115 to 125 BPM at 0.001 BPM resolution
peaks at **121.002 BPM**. Separate windows peak at 121.029 (0–50 s), 120.998 (50–100 s),
and 121.001 (100–150 s). These support approximately **121 BPM**, not exactly 120;
the three decimal places describe the scan resolution rather than tempo certainty.

The full float sum first crosses 0.01 at **0.1233125 s**, and A's 0.05 detector threshold
at **0.1256042 s**. This is a candidate opening attack, not a composer-confirmed downbeat
and not the lead-in of a newly encoded premix. The drums enter later, so A's assumption
that the opening transient marks the intended first gameplay downbeat needs verification.
The material's 4/4 bar phase is likewise not certified by onset analysis alone.

121 BPM is technically supportable without changing judgement: the source would need
`taskBpm / 121` playback rate, including 120/121 at the initial count-in, and its own
whole-bar source duration. Merely labelling it 120 would accumulate two beats of drift
over 120 seconds. No such compensation has been applied.

## Loop blocker

Using the candidate 0.1256042 s attack as beat zero and 121 BPM in 4/4:

| Proposed length | End in decoded source (s) | Consequence |
| --- | ---: | --- |
| 60 bars | 119.133869 | Removes 42.098 s of material |
| 80 bars | 158.803290 | Removes 2.429 s; strong music crosses the boundary |
| 81 bars | 160.786761 | Removes 0.445 s of audible tail |
| 82 bars | 162.770232 | Adds 1.538 s of silence |

The 100 ms immediately after the 80-bar boundary has RMS 0.20212 and peak 0.60558.
After the 81-bar boundary it still has RMS 0.02631 and peak 0.07354. The source is not
just A's short silent tail with a small rounding discrepancy. Choosing a bar count,
truncating that tail, or inserting a long rest would be an audible arrangement decision.
There is not enough evidence to certify any of these as the intended loop.

Needed before enabling B: a loop-ready export or an explicit approved musical edit,
with confirmed downbeat and loop length. Lossless WAV stems should live in
`bgm/arrangement-b/`, named as listed in that directory's README.

## Preliminary loudness, not a shipping gain

Summing all eight decoded stems at unity in float gives peak **1.188295 (+1.50 dBFS)**
and RMS **0.166507 (-15.57 dBFS)**. Scaling to A's 0.97 sample-peak target would use
**0.816296**. No 16-bit sum or clipping was used for this analysis.

The existing A MP3 decoded through the same tool measures RMS **0.087537 (-21.16 dBFS)**
and peak **0.918695**. Matching full-file RMS after the hypothetical B normalization
would suggest B bus gain **0.3627**, versus A's unchanged **0.5632**. This is only an
estimate: the approved loop edit, new lossy encode, perceived loudness, codec overshoot,
and SFX headroom must be measured/listened to before setting production gain.

Generated B MP3 size: **not applicable — no approved loop/master, no shipping encode**.
Generated B MP3 lead-in: **not measured — no shipping encode**.

## Rotation discrepancy to resolve

The current registry contains **29 acts**, with saved-compatible rotation eras:

- Levels 1–50: 25 acts.
- Levels 51–106: 28 acts, opening with the three newly added acts.
- From level 107: 29 acts, opening with the paintbrush.

`LevelSpec.lap` is the number of earlier appearances of the particular act; new acts
begin at lap zero. It is not globally `floor((level - 1) / VIGNETTES.length)`.
Using its parity gives A at level 51 and level 63, but also A at level 76 (B was requested
there). The next era-wide pass starts at 79; at level 82 an older act's visual lap reaches
3 even though the three new acts have only reached 1. At later expansion seams parity
can differ within an era pass. Using 29 globally would already break the 25→26 boundary.

Choose whether music follows stable 25-level chapters (the explicit requested ranges;
the initial era's size supplies 25 without a duplicated literal), era-wide passes, or
each act's visual lap. No ordering, keepsakes, difficulty, or saved progress was changed.

## Integration plan after source validation

Keep A's URL and measurements unchanged. Extend the existing encoder to explicit
arrangement inputs and one premix each. Add a typed arrangement registry with per-source
BPM, bars, lead-in bounds/fallback, and gain. Keep chapter selection separate from scoring.
An eventual C would add a registry entry and selection-cycle entry after the same source
validation; it would not add runtime stems or require save migration.

Select the frontier arrangement on shell entry and the requested level's arrangement
before scheduling its count-in. Fix it for the entire attempt. Fade out, stop/disconnect,
release the old source/buffer references, and serialize loading of the next track.
Never decode the next arrangement concurrently with a prior in-flight decode. Normalize
only the selected file; handle late scene changes/disposal and failed B loads with an A
fallback. Preserve global master mute, title separation, and fresh-count-in resume.

These are planned changes, **not implemented behavior**. At 48 kHz, even the supplied
161.232-second decode occupies about 59.05 MiB of stereo float PCM; normalization adds
another similarly sized allocation temporarily. A permanent A+B cache is not proposed.

After implementation, test selection/boundaries/deeper laps, source ownership/release,
in-flight switching races, fallback, per-source normalization/rate/gain, mute, resume,
and title separation. On Android, listen through a complete B loop, compare A/B with SFX,
exercise frontier transitions and old-level replays, background/resume, mute, and failed
B downloads. None of those B playback checks can yet be claimed as passed.

## Commands run

Restored dependencies using `npm ci` after the GitHub pull; package manifests and the
lockfile are unchanged. Then:

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: passed, 86 files / 1,058 tests. No tests added or timeouts changed.
- `npm run build`: passed. Existing warnings include unresolved Fredoka/Nunito font
  paths, an unset Sentry DSN, and mixed static/dynamic imports.
- `npm run music:encode`: failed before encoding. The existing script uses
  `new URL(...).pathname` as a filesystem path, yielding a duplicated Windows drive
  prefix and percent-encoded spaces (`C:\C:\Users\...`). Its extension should fix this
  with Node's `fileURLToPath`. Neither A's premix nor any B premix was written.

The passing checks validate the unchanged application baseline, not an implemented
second arrangement. Only this report, `docs/MUSIC.md`, and the B source README changed.
