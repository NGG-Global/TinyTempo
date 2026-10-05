# Staging

How the thirty-two acts sit on screen: what they stand on, how big their subject is, and
where their light comes from. Presentation only. No beat, contact, judgement, score or
level changed, and no act was moved in the registry or the rotation.

## Two staging languages

- **The open table: the first nine acts.** Each lays itself out and stands on a surface
  that runs the width of the screen: the hammer's bench, the saw's trestles, the knives'
  boards, the bug's tiles.
- **The household lifecycle: twenty-three acts.** `HouseholdVignette.layout` places the
  stage in a band between `safe.top + 320·ui` and `safe.bottom - 410·ui`, and most of
  these acts draw their scene inside a framed card. The card used to float in the upper
  half of the screen over empty paper. The backdrop's pool of light also fell behind it,
  where nothing showed it, so a framed act read flat next to the warmly lit hammer.

## The shelf, and the light on the card

`vignettes/staging.ts` holds the shared staging, and it is pure apart from its two
drawers. An act names its card in its `super` call: `FRAME_CARD`, `PANEL_CARD`, or its own
rectangle. `HouseholdVignette` then paints two Graphics inside the act's stage, one under
the act's art and one over it. Both are drawn in `layout`, once per viewport, so they cost
nothing per frame. Because they live inside the stage, they slide with the table between
tasks and come home with it in `update`.

- **Under the art: the shelf.**
  - The card rests on a shelf that runs past it at each end. The shelf has a lit top face,
    a front face, an edge and a catch of rim light, and takes the treatment's outline.
  - Three shadows go with it, each from `castShadow`, so all of them fall down and to the
    right as every shadow in the game does: the card's shadow on the wall behind it, the
    shelf's own shadow below its front edge, and a contact seam where the card's foot
    meets the shelf.
  - The timber comes from the act's paper and glow (`shelfColour`). On a light paper it is
    a step darker and warmed toward the glow. On a dark one, the trombone's night sky, it
    is a step lighter. Either way it stays in the act's own colour family rather than one
    brown for everyone.
- **Over the art: the light on the card.**
  - A rim of light runs along the card's top and left edges, strongest at the corner
    nearest the light.
  - A falloff darkens the card toward its lower right. It is nothing over the half that
    faces the light, and peaks at about a quarter in the far corner.
  - The falloff is a triangle fan from the card's centre whose vertices carry their own
    alpha (`fillGradientStyle`). WebGL interpolates that exactly, so it follows the card's
    rounded corners. The canvas renderer ignores per-vertex colour, so there the fan is
    invisible and the rim is flat, and nothing is wrong.

**Codas.** Nothing an act does is drawn under the new staging. The shelf is under the art,
so the balloon's burst scraps, the roller's handle, the clap crowd rising from below and
the DJ's sleeves all pass in front of it, as they used to pass in front of the paper. The
light is over the art, as light is. A coda inside the card is shaded by it like everything
else there, and the rim is only four units wide along the card's own edge.

**Room.** The shelf never reaches the verdict's pill. `roomBelowCard` measures the space
from the card's foot to the pill's top, using `verdictLine` from `ui/trackMetrics.ts`, the
same function PlayScene places the verdict with, so the two cannot drift apart.
`shelfFor` then fits the shelf to that space: its wall shadow gives way first, then its
front face, then its top face. `tests/staging.test.ts` pins the result.

| Frame | Room below the card | What stands there |
| --- | --- | --- |
| 393×851 phone | about 200 stage units | The full shelf and its shadow |
| 375×667 phone | about 49 stage units | The full shelf, with its shadow shortened |
| 768×1024 tablet | under 1 stage unit | No shelf: the contact seam and the wall shadow only |

On the 4:3 tablet the verdict's pill already reaches the card's foot, as it did before
this pass, so there is no room for a shelf and none is drawn.

### Which acts stand on what

| Acts | Staging |
| --- | --- |
| Light switch, doorbell, roller, bell, balloon, stapler, fisherman, DJ scratch, trombone, clap, snare, bongos, slushy, apple, barber, popcorn, toothbrush, nose, dish, prospector | Their card, on a shelf, lit |
| Paintbrush | **Freestanding** (`framed: false`). It has no card: its wall is the paper's own colour. Its easel's legs used to end on nothing. It now stands on a short shelf under its footprint, with a pool of shadow under its feet. There is no wall shadow, rim or falloff, because there is no card face to light. |
| Egg | **Opts out.** It has no card. It stands on its own worktop, which runs almost the full stage width, so it is already grounded the way the open-table acts are. |
| Bubble wrap | **Opts out.** The sheet is the subject, seen from above, and it lies on the surface its own drop shadow implies. A shelf under it would stand the sheet up on edge. |

The fisherman was suggested as an opt-out because it draws its own water. It keeps the
shelf: the water is inside its card, and the card itself floated like the others. Three
acts already draw a few units of surface below their card's foot: the doorbell's mat, the
roller's floor and the bell's counter. Those now sit on the shelf's top face rather than
on nothing.

## Subject scale

### How it was measured

Every act was measured at lap 0, before a round, on the 393×851 frame, which is a logical
720×1559. The bounding box of each act's main subject was taken from its drawing code in
stage units, then transformed by the act's own layout. The box includes the outline.

- **Width** is a percentage of the frame's width, 720.
- **Height** is a percentage of 829, the band the household acts are laid out in on that
  frame. It is used for every act, so all thirty-two are compared on one scale.
- **Size** is √(width × height), a single linear measure. Width alone misleads: the
  cucumber is wide and short, and the athlete is narrow and tall.

The bounds were then checked against captures of the running game.

The "main subject" is the thing the beat acts on: the bug, not the shoe; the bell, not
the lobby. Where an act has two candidates, the table names the one used.

### The audit

Sorted by size, at lap 0. The bug and the bell are shown before and after this pass.

| Act | Subject | Width % | Height % | Size |
| --- | --- | ---: | ---: | ---: |
| Bug & shoe (before) | the bug | 11.4 | 8.3 | 9.7 |
| Hotel bell (before) | the bell | 16.5 | 11.2 | 13.6 |
| **Bug & shoe (now, ×1.75)** | the bug | 20.0 | 14.5 | **17.0** |
| Stapler | the stapler | 20.1 | 16.6 | 18.3 |
| **Hotel bell (now, ×1.4)** | the bell | 23.1 | 15.7 | **19.0** |
| Fisherman | the fisherman | 16.6 | 27.5 | 21.4 |
| Light switch | the lamp | 14.5 | 33.1 | 21.9 |
| Popcorn | the bowl | 35.5 | 16.1 | 23.9 |
| Slushy | the cup | 23.4 | 25.6 | 24.5 |
| Barber | head and hair | 30.5 | 20.6 | 25.1 |
| Cucumber | the cucumber | 54.4 | 12.4 | 26.0 |
| Banana | the banana | 41.3 | 17.1 | 26.6 |
| Prospector | the boulder | 34.9 | 24.8 | 29.4 |
| Nose | the face | 31.4 | 29.7 | 30.5 |
| Tomato | the tomato | 33.8 | 28.2 | 30.9 |
| Snare | the drum | 43.5 | 21.9 | 30.9 |
| Clapping hands | the hands | 38.8 | 26.9 | 32.3 |
| Trombone | player and horn | 42.5 | 25.2 | 32.7 |
| **— median —** | | | | **32.75** |
| Scissors & paper | the folded sheet | 24.9 | 43.3 | 32.8 |
| Apple | the apple | 31.5 | 35.1 | 33.3 |
| Balloon pump | pump and balloon | 42.5 | 28.7 | 34.9 |
| Paintbrush | the canvas | 41.5 | 30.6 | 35.6 |
| Bongos | the drums | 58.9 | 22.1 | 36.1 |
| Toothbrush | mouth and brush | 60.8 | 22.1 | 36.6 |
| Dish | the plate | 39.9 | 34.6 | 37.2 |
| Doorbell | door and frame | 37.0 | 49.5 | 42.8 |
| Egg | egg and bowl | 51.3 | 40.1 | 45.4 |
| DJ scratch | the deck | 50.0 | 41.3 | 45.4 |
| Saw | the timber | 112.5 | 18.6 | 45.7 |
| Paint roller | the wall picture | 68.0 | 39.1 | 51.6 |
| Bicep curl | the athlete | 33.8 | 86.7 | 54.1 |
| Bubble wrap | the sheet | 68.8 | 49.6 | 58.4 |
| Hammer & nail | hammer and nail | 55.6 | 63.2 | 59.3 |
| Window | the window | 77.7 | 75.2 | 76.4 |

The median does not move with the two changes, since both acts stay below it.

### The band

**A main subject's size is between half and twice the median: 16% to 65%.** The band is
taken from the cast's own middle, not from a number chosen in advance. Inside it are
acts as different as the stapler on its desk and the hammer on its bench. Outside it are
three acts, and the three are not alike:

- **The bug: 9.7, raised to 17.0.** It was the smallest subject in the cast: a purple dot
  under a sneaker four times its length. It is now drawn 1.75× (`BUG_SIZE`).
  - The bug has its own Graphics, centred on its body. The scale is applied there, and its
    rest height is scaled with it, so its feet stay on the floor the sole lands on.
  - Its outline is divided back out, so it carries the shoe's weight of line. Its shadow
    is scaled with it, and its rest alpha is unchanged.
  - The stomp, the dodge, the contact stops (`[0, -95, 80, -45]`) and the finish hop do
    not move. Its three looks differ only in colour and markings, so all three grow alike.
- **The hotel bell: 13.6, raised to 19.0.** The one thing the player taps was lost on a
  lobby counter. It is now drawn 1.4× (`BELL.size`), scaled about its base, which stays on
  the marble top.
  - At this size it clears the register on the left and the card holder on the right.
  - It is drawn after the bellboy, so he still rises out of the counter behind it.
  - Its three looks differ only in metal, so all three grow alike.
- **The window: 76.4, unchanged.** It is above the band because the window *is* the stage:
  the act is a close-up of a pane being wiped. Making it smaller would make it a picture of
  a window rather than the window. That is a design decision, so it is **left for Dor**
  rather than changed here.

### What the brief expected, and what the measurement says

The brief named the bug, the bubble wrap and possibly the curl.

- **The bug** is the clearest outlier, and is fixed.
- **The bubble wrap** measures inside the band, at 58.4. The sheet is nearly 70% of the
  frame's width. It looked small on the website's poster tiles because of how those are
  cropped, not because of how the game draws it.
- **The curl** is inside the band at 54.1, between the bubble wrap and the hammer. Its
  height alone, 87% of the band, is the tallest in the cast. That is the athlete standing
  full length, and it is noted rather than changed.
- **The hotel bell** was not on the list. It was the second-smallest subject in the cast,
  and it is the one other change.

Two acts were changed. The brief's limit of three before checking with Dor was not
reached.

## The website's tiles

`scripts/capture-acts.mjs` crops every act at `{ x: 0, y: 190, width: 390, height: 480 }`
on a 390×844 page. On that page a household card's foot is at about y 517, and its shelf and
the shelf's shadow end by about 555, so both are inside the tile. The bug's floor is at about y 591, also
inside. Nothing this pass moved needs a crop of its own.

The saw's blade and stand do run out of its tile, as the brief noted. That is not from
this pass, and fixing it needs a per-act crop override. **The tiles were not re-recorded**,
because re-recording overwrites `legal/acts/*`, the website's assets. Recording them
again, and the saw's crop, are left for Dor to ask for.
