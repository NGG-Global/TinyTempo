# Act variants

Five acts change their look on each return visit, so the endless map does not
show the same twenty scenes over and over. No registry entry was added: the
standing rule that a new entry reassigns every level still holds, and every level
keeps the act it had.

## How a look is chosen

`levelSpec` exposes `lap`, the number of completed passes through the rotation
before this level: `floor((level - 1) / VIGNETTES.length)`. With twenty-one acts,
levels 1 to 21 are lap 0, 22 to 42 are lap 1, and so on — every act appended to the
rotation lengthens the lap, so the level numbers below move with it. `PlayScene` passes it to
`VignetteDefinition.create(scene, lap)`; an act with one look ignores it, an act
with several indexes its list modulo the list's length. Lap 0 is always the
original look, so nothing a player has already seen changes.

The look is fixed for the level. The paper act still cycles its shapes per task,
but within the set the lap selected.

| Act | Lap 0 | Lap 1 | Lap 2 | Lap 3 | Data |
| --- | --- | --- | --- | --- | --- |
| Bug & shoe (level 3, 24, 45…) | Plum bug, slate sneaker, coral tab | Ladybird, navy sneaker, mustard tab | Green beetle, burgundy sneaker, sky tab | Plum again | `src/vignettes/bugLooks.ts` |
| Bicep curl (level 6, 27, 48…) | The coach: quiff, moustache, teal singlet, bolt | The sprinter: bun, plum singlet, star | The veteran: bald, grey beard, amber singlet, stripes | The coach again | `src/vignettes/curlLooks.ts` |
| Scissors & paper (level 9, 30, 51…) | Star, heart, angel | Butterfly, fir tree, tulip | Star, heart, angel again | Butterfly set again | `PAPER_SHAPE_SETS` in `src/vignettes/paperMotion.ts` |
| Light switch (level 12, 33, 54, 75…) | Sage salon | Morning kitchen | Green study | Rose bedroom | `src/vignettes/lightLooks.ts` |
| Doorbell (level 13, 34, 55, 76…) | Teal four-panel | Crimson six-panel | Ochre cottage | Navy planks | `src/vignettes/doorLooks.ts` |

## What a look may change

A look is colours and a few drawn features. Geometry, motion curves, timing,
sounds, judgement and copy are shared, so a variant costs a data record and a
small switch in the drawing code rather than a new act:

- **Bug & shoe** swaps the shell colour and its markings (sheen patch, ladybird
  head and dots, or a beetle's metallic band), and the sneaker's canvas and heel
  tab. The drop, squash and the floor are untouched.
- **Bicep curl** swaps skin, flush and crease tones, the singlet and its trim, and
  three features drawn per look: hair (quiff, bun or bald with a fringe), facial
  hair (moustache, full beard or none) and the chest badge. The gym, the
  chalkboard, the arm's swell and the dumbbell are shared.
- **Scissors & paper** adds three right-half contours with the same constraints as
  the first set (start and end on the fold, x within 0–194, |y| within 194), a
  paper colour each, glint positions, and per-shape crease and detail marks in
  `drawKeepsake`. `paperReveal` gives the butterfly a faster rock and lift and
  keeps the tree on the mat; the success, partial and failure endings are shared.
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

## Adding a look

Append to the act's list. Never insert or reorder: the index is the lap, so an
insertion would change what a returning player sees on a level they have already
cleared. Keep new records to colours and feature flags; if a variant needs new
motion, it is a new act and needs a request.

The pure modules are unit-tested under node (`tests/bug.test.ts`,
`tests/curl.test.ts`, `tests/paper.test.ts`, `tests/light.test.ts`,
`tests/door.test.ts`). In DEV, `?debug&level=23`, `?debug&level=26`,
`?debug&level=29`, `?debug&level=32` and `?debug&level=33` open the lap 1 looks
directly. The lap numbers move whenever an act is appended, since the rotation
gets longer; the look a level shows is `lap % looks`, so appending never changes
lap 0.
