# Arrangement B source files

This folder already contains the eight WAV **working copies decoded from the supplied
MP3 stems**, at 48 kHz / stereo / PCM16, 7,739,136 frames each. They are not original
lossless masters. See `provenance.json` for source filenames and hashes.

The encoder requires these exact names:

- `0 Lead Vocals.wav`
- `1 Drums.wav`
- `2 Bass.wav`
- `3 Guitar.wav`
- `4 Keyboard.wav`
- `5 Synth.wav`
- `6 Other.wav`
- `7 Brass.wav`

Run `npm run music:encode` to regenerate the single shipping B premix. `edit.json`
records the explicit 121 BPM / 64-bar interior-loop edit. The original outro is excluded;
no timing correction is hidden in the source WAVs.

To reproduce these working copies from the extracted original MP3 archive, run
`node scripts/prepare-arrangement-b.mjs "path/to/extracted/stems"` (local FFmpeg required).

Replacement original WAV masters can use the same names, but must share the exact sample
rate, channel count, PCM16 format, and frame count. Re-measure tempo, onset and loop
boundaries and update provenance/edit metadata before encoding a different delivery.
Do not silently reuse the current edit on differently aligned masters.

See [MUSIC.md](../../docs/MUSIC.md) for measurements, memory, selection, and phone QA.
