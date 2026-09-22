# Act variants

Seven acts change their look on each return visit, so the endless map does not
show the same twenty-five scenes over and over. No registry entry was added: the
standing rule that a new entry reassigns every level still holds, and every level
keeps the act it had.

## How a look is chosen

`levelSpec` exposes `lap`, the number of completed passes through the rotation
before this level: `floor((level - 1) / VIGNETTES.length)`. With twenty-five acts,
levels 1 to 25 are lap 0, 26 to 50 are lap 1, 51 to 75 lap 2, and so on — every act
appended to the rotation lengthens the lap, so the level numbers below move with it.
`PlayScene` passes it to `VignetteDefinition.create(scene, lap)`; an act with one look
ignores it, an act with several indexes its list modulo the list's length. Lap 0 is
always the original look, so nothing a player has already seen changes.

The look is fixed for the level. The paper act still cycles its shapes per task,
but within the set the lap selected.

| Act | Lap 0 | Lap 1 | Lap 2 | Lap 3 | Lap 4 | Data |
| --- | --- | --- | --- | --- | --- | --- |
| Bug & shoe (level 3, 28, 53…) | Plum bug, slate sneaker, coral tab | Ladybird, navy sneaker, mustard tab | Green beetle, burgundy sneaker, sky tab | Plum again | Ladybird again | `src/vignettes/bugLooks.ts` |
| Bicep curl (level 6, 31, 56…) | The coach: quiff, moustache, teal singlet, bolt | The sprinter: bun, plum singlet, star | The veteran: bald, grey beard, amber singlet, stripes | The coach again | The sprinter again | `src/vignettes/curlLooks.ts` |
| Scissors & paper (level 9, 34, 59, 84…) | Star, heart, angel | Butterfly, fir tree, tulip | Crown, bell, mushroom | Gingerbread man, maple leaf, rocket | Star set again | `PAPER_SHAPE_SETS` in `src/vignettes/paperMotion.ts` |
| Light switch (level 12, 37, 62, 87…) | Sage salon | Morning kitchen | Green study | Rose bedroom | Salon again | `src/vignettes/lightLooks.ts` |
| Doorbell (level 13, 38, 63, 88…) | Teal four-panel | Crimson six-panel | Ochre cottage | Navy planks | Teal again | `src/vignettes/doorLooks.ts` |
| Slushy (level 24, 49, 74, 99, 124…) | Berry | Blue raspberry | Lime | Orange | Grape | `src/vignettes/slushyLooks.ts` |
| Apple (level 25, 50, 75, 100…) | Red apple | Pear | Peach | Strawberry-iced donut | Apple again | `src/vignettes/appleLooks.ts` |

## What a look may change

A look is colours and a few drawn features. Motion curves, timing, sounds and
judgement are shared, so a variant costs a data record and a small switch in the
drawing code rather than a new act:

- **Bug & shoe** swaps the shell colour and its markings (sheen patch, ladybird
  head and dots, or a beetle's metallic band), and the sneaker's canvas and heel
  tab. The drop, squash and the floor are untouched.
- **Bicep curl** swaps skin, flush and crease tones, the singlet and its trim, and
  three features drawn per look: hair (quiff, bun or bald with a fringe), facial
  hair (moustache, full beard or none) and the chest badge. The gym, the
  chalkboard, the arm's swell and the dumbbell are shared.
- **Scissors & paper** adds three sets of three right-half contours, each with the
  same constraints as the first (start and end on the fold, x within 0–194, |y|
  within 194, and no edge crossing another, which `tests/paper.test.ts` checks), a
  paper colour each, glint positions, and per-shape crease and detail marks in
  `drawKeepsake`: the crown's jewels, the bell's lip and clapper, the mushroom's
  spots and cream stem, the gingerbread man's icing and buttons, the maple leaf's
  veins, the rocket's porthole, fins and flame. `paperReveal` gives the butterfly a
  faster rock and lift, lets the rocket rise highest, swings the bell and rocks the
  leaf, and keeps the tree and mushroom on the mat; the success, partial and failure
  endings are shared.
- **Light switch** keeps the floor lamp, the rocker and the five-light finale on
  the same schedule. The cutaway behind them is a different room: the original
  salon, a tiled kitchen, a green study, or a dusty-rose bedroom. Wallpaper,
  window, furniture and the fitting the five bulbs hang from all swap; the lamp
  still answers every beat, independently of the hidden interior.
- **Doorbell** keeps the hinge, the swing, the hallway and the cat. The leaf
  changes: four recessed panels and a brass knocker, a crimson six-panel with a
  lion, an ochre cottage with an oval window, or navy vertical planks with a
  letter slot. Brick and frame shift with the door so the porch reads as a
  different house.
- **Slushy** keeps the cup, the straw, the drinker and the brain freeze. The
  flavour changes: the drink, its shaded far wall and meniscus, the ice granules,
  the beads running up the straw, the straw's stripe, and the fruit printed on the
  cup's label (a berry, a citrus wheel or a bunch of grapes).
- **Apple** keeps the cloth, the plate, the bite rhythm and when each ending lands.
  A pear and a peach are the same drawing with their own half-width profile, top and
  base caps, skin, flesh, lenticels and stem; the peach adds a soft blush and its
  seam, and a clean round leaves its stone rather than an apple's core. The donut is
  the exception described below.

### Words that follow the look

Every other act's look leaves the copy alone: a ladybird is still a bug, a lime
slushy is still a slushy. The apple act's looks change what is on the plate, so a
look there may also carry its own title, intro and verdict. `VignetteDefinition.looks`
is that list, indexed the same way as the act's own looks (the registry builds it
from `APPLE_LOOKS`, so the two cannot fall out of step), and `definitionForLap` in
`Vignette.ts` merges the entry over the definition. PlayScene and the map's dock read
the merged definition, so level 100 is called "Donut" on the map, opens with "Sweet
tooth." and ends with "Not a crumb." or "Buzz off!". An entry may change words only;
id, thresholds, hold, sounds and everything else stay the act's own, which
`tests/treatLooks.test.ts` pins. Lap 0's entry is empty, so level 25 is unchanged.

### The donut

A ring cannot be drawn as one silhouette in Phaser — `fillPath` has no holes — and
the act's rule is that the plate shows through where the food has gone rather than
being painted over. So the donut is scanned in rows as two half-rings either side
of the centre line (`ring` in `AppleVignette.ts`), each clipped at the bite front,
and only its true edges are stroked; the seam between the halves never is. The
side band, top face, the inner wall seen through the hole and the icing are four
such rings, then drips and sprinkles are drawn only where the donut is still there.

It is eaten from one side across (`donutFront`) rather than from both sides in
turn, because a donut bitten from both sides leaves an upright strip that no longer
reads as a donut. `consumed` still drives it, so the last mouthful is still kept for
a clean round. A clean round leaves crumbs and a stray sprinkle; a rough one brings
a wasp down to hover over what is left instead of the worm, on the worm's own
`WORM_AT` timing. The coda voices are the apple's, since sounds are per act.

## Adding a look

Append to the act's list. Never insert or reorder: the index is the lap, so an
insertion would change what a returning player sees on a level they have already
cleared. Keep new records to colours and feature flags; if a variant needs new
motion, it is a new act and needs a request.

The pure modules are unit-tested under node (`tests/bug.test.ts`,
`tests/curl.test.ts`, `tests/paper.test.ts`, `tests/light.test.ts`,
`tests/door.test.ts`, `tests/treatLooks.test.ts`). In DEV, `?debug&level=28`,
`?debug&level=31`, `?debug&level=34`, `?debug&level=37`, `?debug&level=38`,
`?debug&level=49` and `?debug&level=50` open the lap 1 looks directly; the
new paper sets are levels 59 and 84, the peach 75, the donut 100, and the slushy's
later flavours 74, 99 and 124. The lap numbers move whenever an act is appended,
since the rotation gets longer; the look a level shows is `lap % looks`, so
appending never changes lap 0.
