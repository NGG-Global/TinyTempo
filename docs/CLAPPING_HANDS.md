# Clapping hands

One vignette appended to the rotation at request, as act 21. Levels 1 to 20 keep
their acts, and the act's own first level is 21.

| Each beat | Clean finale | Middling finale | Rough finale |
| --- | --- | --- | --- |
| The palms meet, flatten against each other, and are thrown apart to wait for the next one | The hands carry on applauding and a crowd of eleven pairs rises behind them under the light | Three pairs, spread across the room, answer with a scattered ripple | Nobody: the hands come apart, turn palms up, and hold the shrug |

The act reuses `HouseholdVignette` for the lifecycle and is one `draw(now, ending)`
over a single Graphics. It is the third act with three endings taken from the
authoritative round accuracy, after scissors & paper and the fisherman — and the
first whose middle ending has a voice of its own, because one was recorded for it.

## The clap

`handGap` is the beat: 0 with the palms together on the contact, 1 at the top of
the rebound (`reboundBeats`, 0.16 of a beat) and back to `readyGap` where the
hands wait by `readyBeats` (0.44), inside half a beat at every tempo, so a quick
pair reads as two claps rather than one wobble. Nothing winds up before the beat:
the hands are already apart, and the clap is the contact, so the whole motion is
after it — which is what lets the same curve be driven by a demonstration cue and
by a tap without either one anticipating.

`palmSquash` flattens the palms against each other on contact and is gone inside
`squashBeats`; `clapRing` is the ring of air, two arcs leaving the palms and
fading before they could be taken for the next clap.

The demonstration never consumes the subject. The pool of warmth on the wall is
lit from the demonstration's beats while the player is watching and from their own
judged hits after the handover, which start at none. An extra tap still claps and
a missed beat still jolts both hands, and neither warms the room.

## The hands

Each hand is laid out in its own frame — `u` outward from the centre line, `v`
down the hand — and the left hand is that frame mirrored, so the pair is one
drawing and cannot drift apart. `roundedBox` traces the palm, the cuff and every
crowd mitt, tapered toward the wrist, which is the difference between a hand and a
mitten. The hands hinge at the wrist, so their tops come apart further than their
heels do, and the shrug simply carries on turning the same way until the palm is
up: at that point the palm takes the lit face, the creases replace the knuckles,
the nails go round the other side and the fingers splay wider.

The crowd is eleven pairs with three skin tones, three sleeve colours and no two
clapping at the same rate — a crowd in lockstep is one pair of hands drawn eleven
times. `CROWD_HANDS` is ordered for the reveal: the first `POLITE_HANDS` are spread
right across the room, so a middling round is applause from three separate places
rather than three people sitting together.

## Timing and sound

`clapFinale` puts the crowd's rise at `CLAP_MOTION.crowdAtSec` and the shrug at
`shrugAtSec`, and everything it moves has arrived well inside the five-beat hold at
every tempo, which the tests assert against `TaskSequence`. Under reduced motion the
applause does not oscillate — it is a 5 Hz motion, which is what the preference is
about — the hands hold where they wait and the crowd steps on rather than sliding up.

All four voices are recordings: one pair of hands on the beat, and the three answers
a room can give. `clapSounds.ts` is the fallback for a device that never received
them and says the same three things, building its crowd out of single claps spread by
a seeded jitter and swelling rather than starting at full — the difference between a
room applauding and a drum roll. See `docs/SOUND.md` for the takes, and why the beat
ships as WAV while the three endings are encoded to MP3.

The applause runs four seconds, which is longer than the hold it plays in: at 150 BPM
a task's coda has 2.8 seconds before the next task's downbeat. `AudioEngine.playFinish`
takes the instant the room has to be clear by and fades the coda out under it, so
applause never lands on the beats the player has to copy next. After the last task
nothing follows, so it rings out under the summary.

In development, open `?debug&level=21`.
