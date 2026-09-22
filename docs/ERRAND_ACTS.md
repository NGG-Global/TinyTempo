# Errand acts

Four vignettes appended to the rotation at request, as acts 14 to 17. Levels 1 to
13 keep their acts. The fisherman (`docs/FISHERMAN.md`), the DJ scratch
(`docs/DJ_SCRATCH.md`) and the trombone (`docs/TROMBONE.md`) have since been
appended as acts 18 to 20, so the rotation is twenty long and the variant laps
described in `docs/VARIANTS.md` turn over every twenty-one levels.

| First level | Act | Each beat | Successful finale | Rough finale |
| --- | --- | --- | --- | --- |
| 14 | Paint roller | The roller runs one stripe of a picture down a bare wall | The coda's stripe completes a bold graphic: a sun, a heart or a rocket, cycling by task | The roller slips part way down the last stripe and the paint runs |
| 15 | Hotel bell | The plunger drops and the desk bell rings | The bell boy rises behind the counter and tips his cap | Nobody comes; a card goes up in the holder and the bell dulls |
| 16 | Balloon pump | The handle drops and the balloon grows a step | The full balloon ties off and floats up on its string | The slack balloon bursts into scraps at 0.16 s |
| 17 | Stapler | The jaw closes and drives a staple along the pile's back edge | The last staple binds the pile: the fan squares up and the pile is lifted and set down as one | The stapler jams open and the sheets fan out further |

They reuse `HouseholdVignette` for the lifecycle: reset, pause, demonstration
deduplication, layout and re-anchoring, teardown. Each act is one `draw(now,
ending)` over a single Graphics. The demonstration never consumes the subject:
while watching, the picture is drawn from the demonstration's beats, and at the
handover it is drawn from the player's judged hits, which start at none. Only
judged hits paint a stripe, drive a staple or inflate the balloon; extra taps move
the roller, nudge the stapler and wobble the balloon without changing state.

## The picture on the wall

`PAINT_IMAGES` in `errandMotion.ts` holds each picture as a 16 by 12 grid of
palette indices. Index 0 is the ground the picture sits on and is also the paint
on the roller. `stripeColumns(stripe, stripes)` divides the sixteen columns into
`targets + 1` whole-column stripes, so a task of any length paints the wall
exactly and the coda's stripe is always the last. `tests/errand.test.ts` checks
every authored pattern in every tier covers the grid without gaps.

## Timing

Stroke curves are fractions of a beat, as the saw's are: the roller's pass is
0.42 beat, the pump handle and stapler jaw return inside half a beat, so a quick
pair at 150 BPM reads as two actions. Finales share the household acts'
five-beat hold and `ERRAND_REVEAL_SEC` of 1.65 s; every ending settles inside the
hold at every tempo, which the tests assert against `TaskSequence`.

`errandSounds.ts` synthesizes the five voices per act with the household acts'
method: seeded noise, damped partials, short attack ramps, tail fades and soft
saturation. The balloon's rough voice puts its crack at `BALLOON_MOTION.popAtSec`,
the same instant the picture bursts, and the test finds the buffer's loudest
sample there.

The stapler sits on the pile in the pile's own oblique: a dark base, a red arm
hinged at the rear, and a jaw that opens by `staplerJaw` (a readable rest gape,
wider on a jam). The right face of the stack is the thickness; the pens stand
out of the pot.

In development, open `?debug&level=14` through `?debug&level=17`.
