# Barber, popcorn and toothbrush

Acts 26–28, appended to the registry at request. All three are on the household lifecycle
(`HouseholdVignette`): one stage re-anchored every frame, demonstration state kept apart
from the player's, judged hits alone advancing the subject, a pause freezing the heard
clock, and a five-beat hold for the ending. Each has its own curves (`*Motion.ts`), three
looks (`*Looks.ts`) and synthesized voices (`audio/*Sounds.ts`).

| Act | Id | First level | Second look | Endings |
| --- | --- | --- | --- | --- |
| Barber | `barber` | 51 | 79 | Three, from the round's accuracy |
| Popcorn | `popcorn` | 52 | 80 | Two |
| Toothbrush | `toothbrush` | 53 | 81 | Two |

## Why they start at level 51

The rotation used to be `VIGNETTES[(level - 1) % VIGNETTES.length]`, and appending an act
kept levels 1 to n while reassigning every level after them. The Scrapbook made that
unsafe: a keepsake is owned by three stars on the level where its act plays a given lap,
and levels 26–50 carry one each. Appending three acts to the old formula would have moved
every one of them — the ladybird pin from 28 to 31, and so on — taking keepsakes from the
players who hold them.

So the rotation now grows in eras (`ROTATION` in `src/vignettes/registry.ts`, the maths in
`src/vignettes/rotation.ts`):

- **Levels 1–50** cycle the first twenty-five acts twice, exactly as before. Nothing a
  player has seen, earned or owns on those levels changes.
- **From level 51** the rotation carries all twenty-eight. The era opens on the acts it
  adds — barber, popcorn, toothbrush on 51, 52, 53 — and then runs in registry order, so
  the first twenty-five return for their third look on 54–78 and the new three come round
  again on 79–81.

`LevelSpec.lap` is now defined as how many earlier levels the act played, which is what
it always meant for the looks and what keeps a look's lap honest across the seam.
`actLevel(vignette, lap)` in `src/game/levels.ts` is its inverse and the only way to name
an act's nth level; `level + VIGNETTES.length` no longer does.

Levels past 50 do change act. They carry no keepsake and no act-specific achievement,
and progress, stars and unlocks are stored by level, so a save is untouched; a player
already past level 50 simply sees different acts when they replay those levels.

**Appending a fourth act** means adding an era to `ROTATION` at a level past every
keepsake level, so no pinned keepsake can move. `checkRotation` (run by
`tests/rotation.test.ts`) refuses a table whose last era does not carry the whole
registry, whose earlier eras do not span whole laps, or that shrinks.

## Barber

A customer in a barber's chair under a pinstriped cape, a striped pole turning on the wall,
and a mop of hair over their eyes. The mop is twelve locks — eight round the back, four
across the fringe — cut in `BARBER_MOTION.order`: the left side and left of the fringe
first, then over the crown, the rest of the fringe and down the right. Each judged hit cuts
the next locks to the task's style (a crop, a quiff or a side parting, cycling per task),
and each cut lock drops a curved tuft that tumbles to the tiles and stays there. The
customer's eyes are squeezed shut and their teeth gritted for the whole cut.

A round can cut three quarters of the mop (`reach`). The demonstration snips the air just
beside the first lock and cuts nothing, because the answer follows it without a bar
between. The ending is the reveal, from `barberOutcome(accuracy)`:

- **70%+**: a three-snip flurry finishes the cut, the shears leave, the cape is whisked
  off to the right, the customer opens their eyes to a grin, the fresh cut gleams and the
  pole spins.
- **40–69%**: the cape comes off on what there is. Because of the cut order, that is one
  side short and the other long, with one eye peering out from under the fringe and one
  eyebrow raised.
- **Below 40%**: the cape stays on and a knitted beanie drops over the damage, landing
  with a squash. Hair sticks out from under it.

Its middle ending has its own coda (`partial` in `createBarberSounds`), so the plaque's
words and the sound agree.

## Popcorn

A saucepan on a gas ring and a bowl on the worktop. Every judged hit pops the pan: it
jolts, flashes at the mouth, and throws that pop's pieces in an arc into the bowl. The
bowl fills a layer at a time (`HEAP`: from inside the bowl up to a dome over the rim),
reaching 80% by the end of the round. The demonstration's kernels hop out and drop
straight back into the pan, so the example never fills the bowl the player is about to.

- **70%+**: one enormous kernel swells in the pan, rattling it, and at 0.42 s bursts in a
  starburst that shakes the counter. Its giant popped piece arcs up and lands on top of
  the heap, and the rest of the bowl rains in behind it, spread over one fixed window so
  the last piece lands well inside the hold whatever was left.
- **Below 70%**: the pan smokes, and one burnt kernel hops out onto the worktop and rocks
  to a stop. The bowl stays as the round left it.

The bowl is drawn as a surface of revolution (`onBowl`), so the cinema tub's stripes and
the wooden bowl's grain wrap around it. Phaser's `arc` is circular; the rims are sampled
ellipses (`ellipseArc`), because a circular arc across a rim seen at an angle drew a glass
dome over the bowl.

## Toothbrush

A close-up of a grin in the bathroom mirror: sixteen teeth, eight along the top and eight
along the bottom, dull and speckled with plaque. The brush goes once round the mouth
(`BRUSH_MOTION.order`: along the top left to right, back along the bottom), scrubbing
there and back on each stroke. Each judged hit brushes the next teeth: they turn white,
glint once as they come clean and keep a highlight, and foam builds along them and
froths at the corners. The paste on the bristles is used up as it goes. The demonstration
scrubs where the brush starts, with a lather that pops straight away, and cleans nothing.

- **70%+**: three quick scrubs finish the job, the brush is put down, the foam is rinsed
  away left to right, a band of light sweeps across the smile and a gold-edged glint
  "tings" on the front teeth.
- **Below 70%**: the foam swells over the lip and runs down the chin, a bubble grows at the
  corner of the mouth and bursts, and the teeth it did not reach stay dull.

The brush is on a layer of its own, so it fades out whole when put down, and the mirror's
frame is on a layer over it, so the handle passes under the frame rather than off the
glass. Glints on teeth have a gold edge: the shared cream sparkle is invisible on white.

## Looks

| Act | Lap 0 | Lap 1 | Lap 2 |
| --- | --- | --- | --- |
| Barber | Chestnut mop, navy cape, mint shop | Ginger curls, burgundy cape, blue shop | Jet black, forest cape, cream shop |
| Popcorn | Buttered, blue glazed bowl | Cinema tub, red and white | Caramel corn, wooden bowl |
| Toothbrush | Teal brush, mint paste, chrome mirror | Pink brush, strawberry paste, wooden mirror | Orange brush, blue gel, green mirror |

No look renames its act, so none has `looks` copy.

## Keepsakes

Six, appended to `KEEPSAKE_LIST` and to `tests/fixtures/keepsakes.json`: the barber's pole
(51), a bowl of popcorn (52), the teal toothbrush (53), a ginger lock tied with a bow (79),
the cinema tub (80) and a tube of strawberry paste (81). The collection is 56.

## Sound

All synthesized, deterministic, and rendered into the game's one `AudioContext`, with a DC
blocker and gentle saturation like every other act. Each action voice has two takes.

- Barber: a snip is the edges grinding past each other, then the ring of the blades
  meeting 18 ms later. Codas: the flurry's snips, the cape's whoosh and a two-note chime; a
  cape and a quizzical hum for the middling cut; a woolly thump and a falling sigh for the
  hat.
- Popcorn: a pop is a husk crack and a short hollow ring. The clean coda is an
  accelerating crackle, the big pop (a crack, a pitch-dropping thump and a long hollow
  tail, the loudest thing in the buffer and on its cue) and a rain of small pops; the
  rough one is a crackle turning to a hiss, a dull pff and a tick where the kernel lands.
- Toothbrush: a stroke is bristle noise flickering at 92 Hz over a wet squish. The clean
  coda is three short scrubs, a rinse of rising bubbles and a bright "ting"; the rough one
  is a thinning crackle of foam, one bubble's blorp and a sigh.

Contacts are shared with the pictures through the motion modules, so the sound lands
where the drawing does; the tests check each of those onsets.

## Checking

In DEV, `?debug&level=51`, `52` and `53` open the acts, and `79`, `80`, `81` their second
looks. `tests/rotation.test.ts` covers the eras; `tests/barber.test.ts`,
`tests/popcorn.test.ts` and `tests/toothbrush.test.ts` the curves, the endings' settling
inside the hold at 120, 136 and 150 BPM, and every voice at 44.1 and 48 kHz;
`tests/actLooks.test.ts` the looks; `tests/scrapbook.test.ts` and
`tests/keepsakes.test.ts` the keepsakes.

Every look and every ending was rendered in headless Chromium at chosen moments of a
scripted round — the demonstration, each hit, each stage of each coda — and looked at. The
live game auto-pauses in that environment, which runs at about 9 fps, so no round was
played there end to end. **Not yet seen or heard on a device**: the voices have been
checked by tests for onset, level and timing, not by ear, and none of the three has been
played on a phone.
