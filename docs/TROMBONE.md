# Trombone

One vignette appended to the rotation at request, as act 20. Levels 1 to 19 keep
their acts, and the act's own first level is 20. The clapping hands
(`docs/CLAPPING_HANDS.md`) have since been appended after it as act 21, so the
rotation is twenty-one long and the variant laps described in `docs/VARIANTS.md`
turn over every twenty-one levels.

| Each beat | Successful finale | Rough finale |
| --- | --- | --- |
| One note. The two recorded takes alternate, so the slide moves between first position and an extended one on every beat, the cheeks fill for most of the beat and let go before the next, and sound rings leave the bell | The recorded fanfare: the player leans back and lifts the bell, notes and confetti pour out, the pigeon takes off and the neighbour across the way leans out applauding | The recorded "wah wah": the slide sags to the floor, the eyes close, and the neighbour's shutters slam across the window |

The act reuses `HouseholdVignette` for the lifecycle and is one `draw(now,
ending)` over a single Graphics. Its endings are binary.

## Whose beat the note is

This act's beat is unlike every other's, and the picture has to know it. In every
other act the action voice and the tap belong together; here `PlayScene` schedules
the action voice for every demonstration cue *and every target* when a task is
placed, and `AudioEngine` hands out the two recorded takes in that order, one per
sounding beat, for the whole level. The horn therefore sounds on the grid whether
or not the player taps, and the note it plays is fixed by its position in the
level.

So the slide and the cheeks follow the plan, not the tap. `soundedNotes` counts
the task's action cues and targets that have passed and when the latest did;
`TromboneVignette.notesBefore` carries the count across tasks; `noteFor(index)`
alternates; the slide travels to the new position inside 0.12 beat. The tap keeps
what it always owned: a landed note floats a quaver out of the bell and opens the
curtain across the way one step, a tap on nothing drops a grey sour note, and a
beat left unplayed jolts the horn. Only judged hits open the curtain, the
demonstration opens it from its own beats, and it starts again at the handover,
so nothing is consumed.

## The recordings

Four takes were delivered as MP3: two notes of 1.0 s and a success and a fail of
2.0 s. They join the sample bank (`SAMPLE_URLS`) as `trombone1`, `trombone2`,
`tromboneSuccess` and `tromboneFail`, and `tromboneSounds.ts` uses them as the
action's two takes and as the success and rough voices, falling back to a
synthesized brass tone of the same two notes, a fanfare and a sagging note when
any of them has not arrived. `docs/SOUND.md` records why these four are MP3 and
what they measure.

The recorded endings are 2.0 s long. The five-beat hold gives the finale 2.5 s at
120 BPM and exactly 2.0 s at the 150 BPM ceiling, and the test asserts the hold is
never shorter than the take, so no ending's tail is handed to the next task.

## The look

The rooftop at dusk, the player and the horn are shaded from the shared key light
in `ui/light.ts` with cast shadows. The trombone is drawn as tubes with an edge, a
face and a rim highlight, a fan of widening rings for the flare, and the two hands
on their braces; the near hand moves with the slide. The player has a flat cap,
round glasses, a moustache, a bow tie, a striped shirt with braces, and a near
cheek that balloons and flushes with the blow; the pigeon on the chimney bobs to
the notes.

In development, open `?debug&level=20`.
