# Percussion and picnic

Four acts are appended to the registry, introducing snare drum, bongos, slushy
and apple at levels 22–25. The first 21 levels retain their acts; levels 26–50
rotate through all 25 entries. (From level 51 the rotation also carries the barber,
popcorn and toothbrush; see `docs/BARBER_POPCORN_TOOTHBRUSH.md`.) Pattern seeds, tempos
and scoring are unchanged.

All four use `HouseholdVignette`: demonstration state is separate from player
state, the stage returns home before each transition offset, pauses freeze the
heard clock, and reset clears the previous task. The slushy and apple count
`hitTimes`, so extra taps and omissions cannot consume them. Up to 82% is consumed
during the phrase; success finishes the remainder, while failure preserves the
remaining portion for the brain freeze or worm reveal.

The snare has maple sticks, a lacquered shell and chrome hardware. A successful
coda plays a nineteen-stroke roll and accent; failure drops and bounces both
sticks. The bongos have different-sized skin heads, wooden staves, metal tension
rods and animated hands. Their success plays a short two-pitch phrase; failure
plays a descending, faltering phrase before the hands shrug.

The berry slushy has a clear, condensation-covered cup, granular ice, falling
drink level and a striped straw connected to the drinker's mouth. Failure brings
a hand to the temple, squeezed eyes and snowflakes. The apple's silhouette
changes with scalloped bites instead of covering the artwork with background
paint. Success leaves a cream core, seeds and peel at each end. Failure brings a
segmented worm through an occluding hole.

On later laps the slushy is poured in blue raspberry, lime, orange and grape
(`slushyLooks.ts`), and the plate holds a pear, a peach and then a strawberry-iced
donut (`appleLooks.ts`), each named on the map and in its verdict; the donut is eaten
from one side across and draws a wasp rather than a worm. See `docs/VARIANTS.md`.

`audio/treatSounds.ts` renders material sounds into the game's existing audio
context: modal snare and bongo resonances, filtered wire noise, wood impacts,
resonant straw suction and short clusters of apple fractures. Each action has
two subtly different takes. Finales and their animation share contact times in
`treatMotion.ts`. A DC filter, attack/release envelopes and soft saturation keep
the buffers clean. The five-beat hold contains the 1.8-second codas at 150 BPM;
the engine still owns cancellation and the next-task audio deadline.

For a browser preview, run `npm run dev` and open `?debug&level=22` through
`?debug&level=25`. The existing debug replay controls exercise perfect and missed
rounds. Reduced motion suppresses flourishes, traveling bubbles and falling-stick
motion, while leaving the outcome visible. `tests/treats.test.ts` checks registry
placement, progress bounds, finale contacts, audible onsets and audio safety at
44.1 and 48 kHz; `tests/household.test.ts` covers the shared lifecycle.
