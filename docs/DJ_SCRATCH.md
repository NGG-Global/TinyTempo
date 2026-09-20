# DJ scratch

One vignette appended to the rotation at request, as act 19. Levels 1 to 18 keep
their acts, and the act's own first level is 19. The trombone (`docs/TROMBONE.md`)
has since been appended after it as act 20.

| Each beat | Successful finale | Rough finale |
| --- | --- | --- |
| The hand on the record shoves it back and draws it in, one short scratch, while the other hand cuts the crossfader open and shut | Both hands come off and go up, the record spins back and coasts, the booth's beams and wash come up and the meter pumps | The needle pops out of the groove, skids across the record in sparks and stops off the edge; the platter runs down and one red LED is left lit |

The act reuses `HouseholdVignette` for the lifecycle and is one `draw(now,
ending)` over a single Graphics. Its endings are binary, like the household and
errand acts.

## The scratch

`scratchPush` is the beat: 0 as the hand lands, 1 at the end of the shove
(`pushBeats`, 0.14 of a beat) and back to 0 by `returnBeats` (0.42), so a quick
pair at 150 BPM reads as two scratches rather than a wobble. The record's angle
is the platter's idle 33⅓ rpm turn minus the shove in radians, and the hand turns
about the spindle with it. `faderCut` is the other hand: open on the beat, shut
inside 0.3 of a beat.

The demonstration never consumes the subject. The mixer's meter is lit from the
demonstration's beats while watching and from the player's judged hits after the
handover, which start at none. An extra tap still scratches and cuts, and a
missed beat jolts the hand, and neither moves the meter.

## The booth

Everything is shaded from the shared key light in `ui/light.ts`, with cast
shadows under the mixer, the plinth and both hands. The record has grooves, a
sheen that stays fixed under the room light while the track bands, the cue
sticker and the label turn, and one of three label pressings cycling by task.
The hand has a shaded heel, lit fingers with nails and knuckle creases, a ring,
a wristband and a hoodie sleeve anchored at the table's edge.

## Timing and sound

`scratchFinale` puts the needle skip at `SCRATCH_MOTION.skipAtSec` (0.22 s), and
`scratchSounds.ts` puts the rough voice's pop there; the test finds the buffer's
loudest sample at that instant. The spin-back is rotation and has no still form,
so it is zero under reduced motion, and the lights step on rather than fade.
Every ending settles inside the five-beat hold at every tempo, which the tests
assert against `TaskSequence`.

The voices use the household acts' method with one addition: a state-variable
band-pass stepped per sample, because a scratch is vinyl noise with its resonance
swept up through the shove and down through the return. The test checks that
sweep by counting zero crossings. The success voice adds the spin-back's falling
whirr, a crowd swell and a chord; the rough voice adds the skid and a low rumble
after the pop.

In development, open `?debug&level=19`.
