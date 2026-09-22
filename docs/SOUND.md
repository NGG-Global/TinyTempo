# Recorded beats

Six acts take a recorded beat instead of a synthesized one. Everything else in the
game still comes out of `src/audio/*Sounds.ts` as maths, and every one of these six
keeps its synthesized voice as the fallback.

| Act | File | Voice |
| --- | --- | --- |
| Window cleaning | `sfx/wipe-1.wav`, `sfx/wipe-2.wav` | two takes, alternated |
| Bug & shoe | `sfx/shoe.wav` | one take |
| Bicep curl | `sfx/grunt.wav` | one take |
| Scissors & paper | `sfx/scissors.wav` | one take |
| Trombone | `sfx/trombone-1.mp3`, `sfx/trombone-2.mp3` | two takes, alternated |
| Clapping hands | `sfx/clap.wav` | one take |

Only the **beat** changes for the first four: success, rough, scrape and judder are still
synthesized, so a level's reactions are unchanged. The trombone is the exception on that
too: its success and rough voices are the delivered `sfx/trombone-success.mp3` and
`sfx/trombone-fail.mp3`, because a fanfare and a "wah wah" were performed for it, and the
synthesized fanfare and sagging note in `tromboneSounds.ts` are only the fallback.

The clap goes furthest: all three of its endings were performed, so `sfx/clap-success.mp3`,
`sfx/clap-partial.mp3` and `sfx/clap-fail.mp3` are a full house, a scattered few and a
shrug with nobody behind it. It is the only act with a recording for the *middle* ending,
which is why `VignetteSounds.partial` exists — it is optional, and an act with three
endings and two voices still plays `rough` in the middle, as scissors & paper and the
fisherman always have.

Its endings are also the only ones longer than the hold they play in: four seconds of
applause against 2.8 at the fastest tempo. `AudioEngine.playFinish` takes the instant the
coda has to be clear by — the next task's own downbeat — and fades it out under that, so
applause never lands on the beats the player has to copy next. After the last task there
is no next task and it rings out under the summary.

## What this costs

260 KB of WAV and 340 KB of MP3, beside the 2.4 MB music track and the 3.7 MB title
theme. They ride the same route as the music: files outside `public/`, referenced
through `import.meta.url` so Vite hashes and emits them, and served from local storage in
the Android WebView.

WAV rather than MP3 deliberately, for the percussive one-shots. An MP3's encoder delay is
padding the decoder is supposed to strip and browsers do not agree about; on a 2.4 MB track
that is detected once and dropped once (`detectLeadIn`), but on a 140 ms percussive one-shot
fired on every beat it is exactly the error this act cannot afford. At these lengths the
saving would have been around 160 KB.

The trombone's four takes are MP3, as delivered, and that is a deliberate exception rather
than a lapse. Two things changed the sum. `trimToAttack` now finds the attack at decode
whatever silence precedes it, encoder delay included, so the alignment error the rule
exists to prevent is removed by the bank rather than by the container — and measured after
Chromium's decoder, the two notes start at 0.00 ms and 0.02 ms. And these are sustained
notes of 1.0 s and endings of 2.0 s, six seconds of stereo in all: as WAV they would weigh
about 1.06 MB, some 40% of the music track, against 150 KB as MP3. Neither is dual-mono,
so folding would edit the delivered sound. A percussive take should still arrive as WAV.

## Alignment is not optional

A recorded one-shot carries whatever silence sat in front of the take. As delivered:

| File | Silence before the transient |
| --- | --- |
| `grunt.wav` | 0.1 ms |
| `wipe-1.wav` | 1.6 ms |
| `wipe-2.wav` | 5.2 ms |
| `shoe.wav` | 6.6 ms |
| `scissors.wav` | **25.4 ms** |
| `trombone-1.mp3` | 0.0 ms |
| `trombone-2.mp3` | 0.02 ms |
| `trombone-success.mp3` | 0.0 ms |
| `trombone-fail.mp3` | 0.0 ms |
| `clap.wav` | 0.00 ms |
| `clap-success` master | 27.9 ms |
| `clap-fail` master | 70.7 ms |
| `clap-partial` master | 114.5 ms |

A beat sound is scheduled *on* the grid, so that silence is not padding — it is lateness.
25 ms against a 55 ms Perfect window would be charged to every demonstration beat, and
then to the player copying what they heard: they would tap where the sound was, be judged
where the grid is, and lose Perfects for it. The whole `AudioClock` design exists to put a
tap on the sample the player is hearing; shipping a beat whose attack is 25 ms behind its
own cue would give that back.

The three clap figures are measured on the WAV masters, before encoding; the shipped MP3s
carry whatever delay their encoder adds on top of that, which has not been measured here
because nothing in this repository decodes MP3. It does not need to be: those three are
codas rather than beats, they are never scheduled on the grid, and `trimToAttack` drops
whatever lead the decoder reports in any case. The one clap that *is* on the grid is
`clap.wav`, which starts on its first frame.

`trimToAttack` drops the lead at decode. Nothing else about the sound changes — this is
alignment, not a mix decision, and it is the same thing `MusicSystem` already does to the
track. `attackFrame` is pure and tested: it scans every channel, takes the first frame over
`ATTACK_THRESHOLD`, and returns 0 rather than swallowing a sample it cannot find a start
in.

## Two takes

`VignetteSounds.action` is a `Voice` — one buffer, or several. The engine rotates through
them one per beat, so the window's pane is wiped one way and then the other rather than
the same 140 ms of squeegee eleven times running. Rotation is per *act*, not per task: a
level that changes tempo between tasks does not restart the alternation and play the same
take twice across the join.

Nothing else about a voice changes. Success, rough and the two accents stay single
buffers, because none of them repeats often enough for the identical sample to be the
problem.

The trombone is built on this alternation: its two takes are two *notes*, and the slide in
the picture moves between two positions to match. That only works because the engine's
rotation is deterministic and the picture can count along with it, which `docs/TROMBONE.md`
sets out — the action voice is scheduled for every cue and every target when a task is
placed, so the n-th sounding beat of the level always gets the same take.

## Failing soft

`SampleBank.load` never rejects. A sample that 404s, fails to decode, or never arrives
because the device is offline is simply absent, and `recordedVoice` hands back the
synthesized voice the act shipped with. A failed bank is a game that sounds like it used
to, not a broken one — which is why the bank is loaded *beside* the music rather than
inside its atomic load, whose failure legitimately stops a level from starting.

It is awaited in `PlayScene.startRound`, because the act's voices are built synchronously
right after, and warmed unawaited in `MenuScene` so the decode has usually happened before
anyone reaches a level.

The bank is keyed to the context that decoded it. A context it has not seen clears it
rather than handing back buffers that context cannot play.

## Levels, and what is not settled

The files play as delivered. No normalization is applied, because loudness is a mix
decision and the delivered file is the sound that was asked for. The measured levels, for
whoever makes that call next:

| File | Peak | RMS |
| --- | --- | --- |
| `wipe-2.wav` | −0.6 dBFS | −11.6 dB |
| `wipe-1.wav` | −0.7 dBFS | −13.5 dB |
| `shoe.wav` | −5.1 dBFS | −20.9 dB |
| `grunt.wav` | −7.4 dBFS | −23.3 dB |
| `scissors.wav` | −2.8 dBFS | −28.5 dB |
| `trombone-1.mp3` | −0.03 dBFS | −14.9 dB |
| `trombone-2.mp3` | −0.8 dBFS | −16.3 dB |
| `clap.wav` | −0.07 dBFS | −17.3 dB |
| `clap-fail` master | −1.0 dBFS | −16.0 dB |
| `clap-success` master | −1.4 dBFS | −17.8 dB |
| `clap-partial` master | −0.7 dBFS | −27.5 dB |
| `trombone-success.mp3` | −2.0 dBFS | −19.5 dB |
| `trombone-fail.mp3` | 0.0 dBFS | −16.8 dB |

The synthesized beats they sit among run −22 to −17 dB RMS. So the two wipes are roughly
6 dB hotter than the loudest thing the game made for itself, and the scissors around 7 dB
quieter than the softest — a 17 dB spread across five files that all play at the same 0.65
gain. That will be audible against the music bed before it is audible in isolation, and it
is not something a headless browser can settle. It wants a listen on a handset, and then
either a re-export or a per-sample gain.

Four of the takes (`grunt`, `shoe`, `scissors`, `clap`) are dual-mono — identical channels
— so folding them to mono would halve their share of the download losslessly. Not done,
because it edits the delivered files for 100 KB.

The clap's partial take is around 10 dB quieter than its success take, which is the point:
a scatter of applause is not a full house. It is the same judgement as the spread above,
and it wants the same listen on a handset.

## Masters, and what ships

A percussive take ships exactly as delivered. A coda of several seconds does not: as WAV
the clap's three endings are 1.6 MB, two thirds of the music track, and as MP3 they are
184 KB. So those three live in `sfx/masters/` as the delivered WAV — the source of truth,
referenced by nothing and therefore never bundled — and `npm run sfx:encode` writes the
MP3s beside the other one-shots. It is the arrangement the music already uses, on the same
pure-JavaScript encoder, and it is the same trade the trombone's endings made when they
arrived as MP3.
