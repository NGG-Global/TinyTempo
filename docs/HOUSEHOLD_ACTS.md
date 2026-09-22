# Household acts

Four procedural vignettes are appended to the rotation. Levels 1–9 retain their
introductions; later levels cycle through the whole registry, twenty-one entries
now that the errand acts, the fisherman, the DJ scratch, the trombone and the
clapping hands follow these four.

| First level | Act | Each beat | Successful finale | Rough finale |
| --- | --- | --- | --- | --- |
| 10 | Egg cracking | Egg knocks the ceramic rim and recoils | Shell halves separate; white and yolk drop into the bowl | An uneven, incomplete crack holds the yolk back |
| 11 | Bubble wrap | One accurately hit bubble collapses | Eight neighboring pockets pop in a serpentine cascade | Remaining bubbles stay intact |
| 12 | Light switch | Rocker toggles a floor lamp | The cutaway interior and a five-light fitting emerge | Lamp turns off; room stays hidden |
| 13 | Doorbell | Porcelain button depresses with a two-tone chime | Door swings inward onto a warm hallway and a ginger cat | Door remains completely shut |

The authoritative round score selects success at 70%. The vignette does not
judge timing. `finish` schedules the reveal at the host's audio-clock contact;
it does not reveal early when the result arrives. Five hold beats plus contact
and two slide beats form two complete musical bars. The 1.65-second reveal fits
inside the hold even at 150 BPM.

`HouseholdVignette` owns reset, pause, demo deduplication, viewport layout and
teardown. Demonstration state is separate from player progress. Missed beats do
not create actions, and extra taps do not consume bubble pockets. Every task
starts fresh. No tweens, timers, extra input handlers, or AudioContexts are
created by these acts. Reduced motion removes secondary ripples, sparkles,
splash and cat sway, while preserving essential action feedback.

`householdSounds.ts` synthesizes five voices for each act: action, success,
rough, extra-tap accent and omission accent. Seeded excitation, modal resonances,
short attack ramps, tail fades and soft saturation keep samples repeatable and
bounded. Bubble animation and audio share `BUBBLE_CHAIN` offsets. Egg landing
occurs at 0.6 seconds; chandelier bulbs begin at 0.28 seconds with 0.09-second
spacing; the door hinge begins at 0.16 seconds.

The light switch and doorbell take a look from the rotation lap, as
`docs/VARIANTS.md` sets out: lap 0 keeps the original salon and the teal
four-panel door; later visits open a kitchen, a study or a bedroom, and a
crimson, ochre or navy leaf. The lamp, the rocker, the hinge and the cat do not
change.

In development, open `?debug&level=10` through `?debug&level=13`. Accurate,
Rough and Spam replay exercise the real input path. `tests/household.test.ts`
covers lifecycle isolation, pause/reset, failure-gated reveals, chain capacity,
bar alignment, and deterministic unclipped sound at 44.1 and 48 kHz.
