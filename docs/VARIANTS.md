# Act variants

Every act changes its look on each return visit, so the endless map does not
show the same scenes over and over. The looks added no registry entry: every level
keeps the act it had.

## How a look is chosen

`levelSpec` exposes `lap`, the number of earlier levels its act played. Levels 1 to 25
are lap 0 and 26 to 50 lap 1 for the first twenty-five acts; from level 51 the rotation
carries the first twenty-eight (`ROTATION` in `src/vignettes/registry.ts`),
so the first twenty-five return for lap 2 on 54 to 78, and the barber, popcorn and
toothbrush play lap 0 on 51 to 53. From level 107 the rotation carries the paintbrush too
(`docs/PAINTBRUSH.md`). A level's act and lap are `levelSpec`'s; the level of
an act's lap is `actLevel`, and the level numbers below are read from it.
`PlayScene` passes it to `VignetteDefinition.create(scene, lap)`; every act indexes
its list modulo the list's length, through `lookAt` where the list is a data module.
Lap 0 is always the original look, so nothing a player has already seen changes.

The look is fixed for the level. The paper act still cycles its shapes per task,
but within the set the lap selected.

| Act | Lap 0 | Lap 1 | Lap 2 | Lap 3 | Lap 4 | Data |
| --- | --- | --- | --- | --- | --- | --- |
| Bug & shoe (level 3, 28, 56…) | Plum bug, slate sneaker, coral tab | Ladybird, navy sneaker, mustard tab | Green beetle, burgundy sneaker, sky tab | Plum again | Ladybird again | `src/vignettes/bugLooks.ts` |
| Bicep curl (level 6, 31, 59…) | The coach: quiff, moustache, teal singlet, bolt | The sprinter: bun, plum singlet, star | The veteran: bald, grey beard, amber singlet, stripes | The coach again | The sprinter again | `src/vignettes/curlLooks.ts` |
| Scissors & paper (level 9, 34, 62, 90…) | Star, heart, angel | Butterfly, fir tree, tulip | Crown, bell, mushroom | Gingerbread man, maple leaf, rocket | Star set again | `PAPER_SHAPE_SETS` in `src/vignettes/paperMotion.ts` |
| Light switch (level 12, 37, 65, 93…) | Sage salon | Morning kitchen | Green study | Rose bedroom | Salon again | `src/vignettes/lightLooks.ts` |
| Doorbell (level 13, 38, 66, 94…) | Teal four-panel | Crimson six-panel | Ochre cottage | Navy planks | Teal again | `src/vignettes/doorLooks.ts` |
| Slushy (level 24, 49, 77, 105, 131…) | Berry | Blue raspberry | Lime | Orange | Grape | `src/vignettes/slushyLooks.ts` |
| Apple (level 25, 50, 78, 106…) | Red apple | Pear | Peach | Strawberry-iced donut | Apple again | `src/vignettes/appleLooks.ts` |
| Paintbrush (107, 136, 165, 194…) | Sunset | Sailboat | Tabby | Flower | Sunset again | `src/vignettes/canvasLooks.ts` |

The other twenty-one each have three looks. Lap 3 is lap 0 again. Words stay the act's:
a golden tomato is still a tomato, a harbour window is still a window.

| Act | Lap 0 | Lap 1 | Lap 2 | Data |
| --- | --- | --- | --- | --- |
| Hammer & nail (1, 26, 54…) | Coral handle, dark head, pine bench | Teal handle, brass head, walnut | Mustard handle, blue steel, ash | `hammerLooks.ts` |
| Window cleaning (2, 27, 55…) | Lilac frame, garden | White frame, harbour | Dark frame, dusk | `windowLooks.ts` |
| Saw & timber (4, 29, 57…) | Pine | Cherry | Walnut | `sawLooks.ts` |
| Knife & tomato (5, 30, 58…) | Red | Gold | Purple | `tomatoLooks.ts` |
| Knife & cucumber (7, 32, 60…) | Garden green | Dark | Pale | `cucumberLooks.ts` |
| Knife & banana (8, 33, 61…) | Ripe | Green | Spotted | `bananaLooks.ts` |
| Egg cracking (10, 35, 63…) | Cream | Brown | Blue | `eggLooks.ts` |
| Bubble wrap (11, 36, 64…) | Mint | Pink | Ice | `bubbleLooks.ts` |
| Paint roller (14, 39, 67…) | Plaster wall, sun / heart / rocket | Sage wall, tree / flower / boat | Dusk wall, moon / star / lamp | `rollerLooks.ts` |
| Hotel bell (15, 40, 68…) | Chrome bell, red livery | Brass bell, navy livery | Copper bell, forest livery | `bellLooks.ts` |
| Balloon pump (16, 41, 69…) | Red, blue, yellow | Coral, mint, cream | Purple, orange, green | `balloonLooks.ts` |
| Stapler (17, 42, 70…) | Red body | Teal body | Black body | `staplerLooks.ts` |
| Fisherman (18, 43, 71…) | Yellow mac | Navy mac | Rust mac | `fishermanLooks.ts` |
| DJ scratch (19, 44, 72…) | Magenta booth | Amber booth | Lime booth | `scratchLooks.ts` |
| Trombone (20, 45, 73…) | Gold horn | Silver horn | Rose horn | `tromboneLooks.ts` |
| Clapping hands (21, 46, 74…) | Green sleeves | Plum sleeves | Navy sleeves | `clapLooks.ts` |
| Snare drum (22, 47, 75…) | Red lacquer | Blue lacquer | Bare maple | `snareLooks.ts` |
| Bongos (23, 48, 76…) | Terracotta | Walnut | Painted | `bongoLooks.ts` |
| Barber (51, 79, 133…) | Chestnut mop, navy cape, mint shop | Ginger curls, burgundy cape, blue shop | Jet black, forest cape, cream shop | `barberLooks.ts` |
| Popcorn (52, 80, 134…) | Buttered, blue glazed bowl | Cinema tub, red and white | Caramel corn, wooden bowl | `popcornLooks.ts` |
| Toothbrush (53, 81, 135…) | Teal brush, mint paste, chrome mirror | Pink brush, strawberry paste, wooden mirror | Orange brush, blue gel, green mirror | `brushLooks.ts` |

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

### The rest of the rotation

Each of the eighteen is the same drawing with a swapped palette, and two of them
swap a feature the palette cannot carry:

- **Window** keeps the wipe, the glove and the sill. The view beyond the pane is
  the original garden, a harbour (water, a sail, a headland) or dusk (a low sun,
  lit windows, a moon). Frame, glove, sill and sky shift with it.
- **Paint roller** keeps the stroke. The wall colour changes, and so does the
  gallery: lap 0 is still `PAINT_IMAGES` (sun, heart, rocket), chosen by
  `paintImage` exactly as before. Later laps load a tree, a flower and a boat, or
  a moon, a star and a lamp, through `rollerImage(roundId, lap)`.

Everywhere else the subject stays what it was. The hammer's head and nail, the
saw's timber and glove, the three fruits, the egg's shell, the bubble sheet, the
bell's metal and the bellboy's livery, the balloon colours and bunting, the
stapler's body, the fisherman's mac, the DJ booth, the trombone's brass and
clothes, the clapping sleeves, the snare's lacquer and the bongo shells are
records in that act's `*Looks.ts`. Motion, sounds and judgement are untouched.
The snare's lower rim is its own field: the shipped red ellipse is `0xc5594e`, a
hair off the shell highlight, and lap 0 keeps that.

## Adding a look

Append to the act's list. Never insert or reorder: the index is the lap, so an
insertion would change what a returning player sees on a level they have already
cleared. Keep new records to colours and feature flags; if a variant needs new
motion, it is a new act and needs a request.

The pure modules are unit-tested under node (`tests/bug.test.ts`,
`tests/curl.test.ts`, `tests/paper.test.ts`, `tests/light.test.ts`,
`tests/door.test.ts`, `tests/treatLooks.test.ts`, `tests/actLooks.test.ts`).
In DEV, `?debug&level=28` is the ladybird, `31` the sprinter, `34` the butterfly, `37`
the kitchen, `38` the crimson door, `49` blue raspberry and `50` the pear. The eighteen
lap-1 looks are the same offset: 26 the brass hammer, 27 the harbour, then 29, 30, 32,
33, 35, 36, 39–48. Lap 2 of the first twenty-five is 53 on from lap 0 (54 to 78): the
new paper sets are levels 62 and 90, the peach 78, the donut 106, and the slushy's later
flavours 77, 105 and 133. The barber, popcorn and toothbrush show their second looks on
79, 80 and 81. `actLevel` is the one source for these numbers; the look a level shows is
`lap % looks`, so a growing rotation never changes lap 0.
