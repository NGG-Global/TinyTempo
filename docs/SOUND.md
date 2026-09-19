# Recorded beats

Four acts take a recorded beat instead of a synthesized one. Everything else in the
game still comes out of `src/audio/*Sounds.ts` as maths, and every one of these four
keeps its synthesized voice as the fallback.

| Act | File | Voice |
| --- | --- | --- |
| Window cleaning | `sfx/wipe-1.wav`, `sfx/wipe-2.wav` | two takes, alternated |
| Bug & shoe | `sfx/shoe.wav` | one take |
| Bicep curl | `sfx/grunt.wav` | one take |
| Scissors & paper | `sfx/scissors.wav` | one take |

Only the **beat** changes. Success, rough, scrape and judder are still synthesized for
all four, so a level's reactions are unchanged.

## What this costs

180 KB of WAV, beside the 2.4 MB music track — about 8% on top of what the game already
downloads. They ride the same route as the music: files outside `public/`, referenced
through `import.meta.url` so Vite hashes and emits them, and served from local storage in
the Android WebView.

WAV rather than MP3 deliberately. An MP3's encoder delay is padding the decoder is
supposed to strip and browsers do not agree about; on a 2.4 MB track that is detected once
and dropped once (`detectLeadIn`), but on a 140 ms percussive one-shot fired on every beat
it is exactly the error this act cannot afford. At these lengths the saving would have
been around 160 KB.

## Alignment is not optional

A recorded one-shot carries whatever silence sat in front of the take. As delivered:

| File | Silence before the transient |
| --- | --- |
| `grunt.wav` | 0.1 ms |
| `wipe-1.wav` | 1.6 ms |
| `wipe-2.wav` | 5.2 ms |
| `shoe.wav` | 6.6 ms |
| `scissors.wav` | **25.4 ms** |

A beat sound is scheduled *on* the grid, so that silence is not padding — it is lateness.
25 ms against a 55 ms Perfect window would be charged to every demonstration beat, and
then to the player copying what they heard: they would tap where the sound was, be judged
where the grid is, and lose Perfects for it. The whole `AudioClock` design exists to put a
tap on the sample the player is hearing; shipping a beat whose attack is 25 ms behind its
own cue would give that back.

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

The synthesized beats they sit among run −22 to −17 dB RMS. So the two wipes are roughly
6 dB hotter than the loudest thing the game made for itself, and the scissors around 7 dB
quieter than the softest — a 17 dB spread across five files that all play at the same 0.65
gain. That will be audible against the music bed before it is audible in isolation, and it
is not something a headless browser can settle. It wants a listen on a handset, and then
either a re-export or a per-sample gain.

Three of the five (`grunt`, `shoe`, `scissors`) are dual-mono — identical channels — so
folding them to mono would halve their share of the download losslessly. Not done, because
it edits the delivered file for 61 KB.
