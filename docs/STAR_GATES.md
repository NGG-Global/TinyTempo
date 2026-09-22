# Star gates

Every level already hands out up to three stars, and until now they were a record and
nothing else: a plate under the puck, the medals on the plaque. The map's only lock was
the frontier, and the only reason to go back down the road was pride. Stars are now a
currency the road itself spends. Every area after the first is closed until the player's
**total** stars reach its requirement, a barrier stands across the road at its foot to say
so, and the collection lives on the bench where the stars a level earns fly to land.

Nothing new is stored. A level's stars are `starsFor(best)` and the collection is their
sum (`totalStars` in `src/game/stars.ts`), so the save code, Auto Backup and
`mergeProgress` carry it without knowing it. A second copy of the count could only ever
disagree with the accuracies it was summed from, and a merged save would have had to
reconcile two.

## The rule, and why it is shaped this way

Area `k` (the first is 0, and free) asks for the sum over the `k` areas behind it of a
per-area share: `firstArea` stars for the first area behind, `growth` more for each area
after, capped at `maxPerArea`. With the shipped knobs of 12, 1 and 14
(`PROGRESSION.starGate`) the gates fall at 12, 25, 39, 53, 67 and then 14 more each time.

| Gate | In front of level | Stars asked | Of the stars behind it |
| --- | --- | --- | --- |
| 1 | 11 | 12 | 40% |
| 2 | 21 | 25 | 42% |
| 3 | 31 | 39 | 43% |
| 4 | 41 | 53 | 44% |
| 5 | 51 | 67 | 45% |
| 10 | 101 | 137 | 46% |

Three properties were chosen and are pinned by `tests/stars.test.ts`:

- **It is a bank, not a quota.** Stars from anywhere count, so a strong start carries a
  player through several areas before they see a barrier (three stars through the first
  two areas opens the first four gates outright), and the loop the gate asks for is
  always "go back and do a level better", never "grind this area".
- **A decent player is never stopped.** The cap is 14 stars per ten levels, so anyone
  averaging 1.4 stars a level is at or past every gate, forever. The gate exists for the
  player who scrapes through, and even they are only ever a few levels short: two at the
  first gate, then three or four at each after it once they have topped up to pass the
  last. It never becomes a backlog for someone who keeps up with it.
- **The first gate is the softest.** Levels 1 to 10 are the ones nearly everyone
  three-stars, and asking for 2 of their 30 spare stars teaches the mechanic without
  stopping anyone.

Two rules keep it from ever being a wall. A **cleared level is never held**, whatever
area it is in: replaying what was earned is the very thing the gate asks for, and a
replay never costs a heart, so a save code from before the gates existed keeps every
level it cleared and waits only at its uncleared frontier. And the requirement is
capped where the difficulty plateaus: the clear bar tops out at 80% with two stars at
87%, and the cap stops the ask climbing with it.

## What the map shows

- **A barrier at the foot of each closed area** in the window: two brass-capped posts
  either side of the road and a striped bar across it, with a plate hanging under the
  bar carrying a brass star and the count. The gate the collection is working toward is
  coral and says `have / need`; the ones further up the road are in the area's own
  colours and say only what they want. A gate the player has passed stands open, its two
  posts left on the area line as its threshold.
- **The frontier behind a closed gate** is drawn as a locked stop and does not hop. The
  bench block stops being the next level's and becomes the errand: `2 more stars for
  Pavement`, with a brass disc that opens the finished level with the most to give
  (`levelToPolish`, the highest cleared level short of three stars), which never costs a
  heart. Tapping the held puck gives the same "not yet" ring a padlocked one does.
- **The collection on the bench**, right of the area's ten beads: a brass star, the
  count, the next gate's ask, and a slim track filling toward it. The goal shown is
  always the first gate the shown count does not open, so a player who has banked past
  several gates still sees the next thing to aim at.

## The flight

`PlayScene.leaveForMap` hands the map `earned: { level, before, after }` when a cleared
level raised its stars. The map enters with the tally **short by those stars** and the
finished level's plate showing what it had before, and after the curtain and the sign's
drop the new stars leave their sockets on the plate one at a time, arc up and across the
screen, and land on the tally's star. Each landing steps the count, rings the star and
ticks the engine's count voice; the gate's plate counts along with it. The landing that
meets the requirement lifts the bar on a damped spring and fades it, leaving the posts,
and the frontier turns coral. When the last star has settled the world is rebaked with
the collection as it now stands.

The curve is pure (`src/ui/starFlight.ts`, `tests/starFlight.test.ts`): a quadratic
arc whose control point sits above the higher end, so a star thrown down to the bench
still rises first; a pop off the plate and a shrink to the tally's size; one turn of
spin; a short trail of ghosts. Under reduced motion there is no flight: the tally is
already right and a met gate is simply open.

Two things in the scene follow from this. **Everything that reads the collection while
a flight is on reads the shown count**, not the stored one — the held frontier, the live
gate's sign, the dock — so nothing opens before the star that opens it has landed. And
**the gate being worked toward is drawn live** (`liveGate`), in the same per-frame
Graphics as the frontier's hop, rather than baked with the rest of the world, because it
is the one thing on the road that changes during a visit.
