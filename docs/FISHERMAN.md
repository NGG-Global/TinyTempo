# Fisherman

One vignette appended to the rotation at request, as act 18. Levels 1 to 17 keep
their acts; the rotation is eighteen long, so the variant laps described in
`docs/VARIANTS.md` now turn over every eighteen levels, and the fisherman's own
first level is 18.

| Each beat | Successful finale (70%+) | Partial finale (40–69%) | Rough finale |
| --- | --- | --- | --- |
| The fisherman heaves back on the rod, which bows against something heavy; the rod springs up, is yanked down again, and settles inside 0.45 beat | A big fish comes out of the water, one of three, each its own way | A small silver fish is lifted clear and left dangling | An old boot or a tyre comes up, with weed on it, and hangs there dripping |

The act reuses `HouseholdVignette` for the lifecycle: reset, pause, demonstration
deduplication, layout and re-anchoring, teardown. It is one `draw(now, ending)`
over a single Graphics. `finish` is overridden to take the round's accuracy, as the
scissors act does, and `fishingOutcome` in `fishingMotion.ts` grades it into the
three endings; the registry entry carries a `partial` copy block for the middle
one. `PlayScene.playFinish` is binary, so the small fish shares the rough voice,
which is written as a plop and drips rather than a pratfall so it fits both.

## The pull

The beat is a pull, not a reel. `rodHeave` is 1 on the beat, with the rod bent
to its deepest and the fisherman leaning back from his boots, and it is not a
smooth return: the rod springs up over the first 40% of the window, is yanked
down again to `HEAVE.yankDepth` at 65%, and is at rest by 0.45 beat, so a quick
pair at 150 BPM still reads as two pulls. The float is dragged under a little
and rings spread from the line on each one.

The demonstration never consumes the subject. While watching, a shadow under the
water is drawn from the demonstration's beats, nearer the surface with each one;
at the handover it is drawn from the player's judged hits, which start at none.
Only judged hits raise it. An extra tap still heaves the rod and a missed beat
wobbles its tip, and neither moves the shadow. The shadow is the round's big fish
whatever comes up, so it never gives the ending away.

## Three big fish, three pulls

`BIG_FISH` cycles by round id, like the roller's pictures, so a level's tasks
see them in turn. Each has a colourway and a `flight`, and `haulFinale` gives
each flight its own curves:

| Fish | Flight | What happens |
| --- | --- | --- |
| Bass, green | `leap` | Straight up out of the water, a full somersault on the line, then it hangs at the top |
| Salmon, pink | `arc` | One long swing across, high in the middle, into the fisherman's arms |
| Carp, gold, the largest | `heave` | Hauled up slowly with the rod bowed the whole way and the fisherman right back on his heels |

Every catch stays under the surface until `FISHING_MOTION.breachSec` (0.28 s),
where the picture throws up a splash scaled to the outcome and both finale voices
put theirs. Everything is clear of the water by `FISHING_REVEAL_SEC` of 1.65 s,
inside the five-beat hold at every tempo, which `tests/fishing.test.ts` asserts
against `TaskSequence`. Under reduced motion there is no spin, sway or splash,
and the catch is simply lifted.

`fishingSounds.ts` synthesizes the five voices with the errand acts' method. The
pull is a thump as the weight comes onto the rod, the rod's creak, the line's
twang bending up as it tightens, and a slosh; the success voice adds the big
splash and a three-note answer, the rough voice a duller plop and drips.

In development, open `?debug&level=18`.
