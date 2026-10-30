# UX pass on the core loop

A response to the *Tiny Tempo: UX improvements to the core loop* package: six proposals for the
Menu, Map, Play and Result screens, plus three smaller fixes. Each proposal was checked against
the code before anything was built. This records what was built, what already existed, and what
was changed from the proposal and why.

## Already in the game

The package's Result screens were captured from a forced three-star outcome, so they could not
show the rows that only appear short of three stars.

- **Replay level N above Continue** (proposal 3). A clear short of three stars has shown a wood
  *Replay level N* block over Continue since the result plaque was refined (`offersReplay`,
  `planResult`).
- **"Third star at 85%"** (part of proposal 2). The next-star strip appears on every result
  short of three stars (`nextStarCopy`).
- **The score line opens the details** (part of proposal 1). On a real result the line under the
  score reads *TIMING DETAILS* in ink with a chevron. It reads "On the beat" only when no beat was
  judged, which is how a forced result is made. What was missing is that it did not look like a
  control.

## Built

**Result**
- The *TIMING DETAILS* line is drawn as a raised pill with its chevron inside, centred as one
  control (`drawTimingToggle`, `TIMING_TRAY.pillHeight`).
- A new row under the next star says what the run changed (`progressCopy` in
  `game/resultCopy.ts`). It has at most two lines, chosen in this order:
  - **Stars added:** "+2 stars · 39 in all".
  - **A new best:** "New best, up from 74%". Percentages are rounded down, as the score is, and
    a rise of under a whole percent is not called new.
  - **The next level, on a first clear only:** "Up next: level 14". On a replay, Continue does
    not lead on, so this line is left out.
- A run that changed nothing gets no row. A finale's own card already names the next gate, so a
  finale never says "Up next".
- The row is the one optional row in `planResult`: it is laid out only where it fits without
  shrinking the plaque. On a 16:9 phone with a finale's card it gives way. Nothing else does.

**Menu and labels**
- *How to play* leaves the title screen once the lesson has been passed (`lessonOnMenu`). It
  moves to Settings → Help, which opens the lesson with `source: 'settings'`; Android's back
  returns there, and the lesson now stops the title theme itself.
- A player who skipped the lesson keeps the block, because they have not had the lesson.
- The row holds at most two blocks (`ui/menuRow.ts`): **Daily Tempo first** whenever it is
  shipped, then Endless once level 100 is cleared, else How to play. With all three wanted,
  How to play leaves the row for Settings → Help, which carries the lesson in every build.
  **The row is laid along a span, from the objectives puck to the Play block's right edge**,
  and the puck's left edge sits on Play's (`MENU.rowGap`), so the puck, the row and the block
  square up as one object on the bench. Centred on the screen at a fixed width, the row sat
  inside Play's edges by a different amount on every frame and the puck stood alone at the
  screen's edge — on a tablet, a third of the width away from the row it belongs to.
  The Daily block shows today's stars on a chip and a coral dot until the day has had a run;
  it opens the Daily card with the theme carried on, since the card's Play is the gesture.
- First-visit labels sit on the icon-only pucks (`ui/puckLabel.ts`), each until it has been
  opened:
  - *Scrapbook*, until its screen hint has been closed (`docs/SCREEN_HINTS.md`).
  - *Objectives*, beside or over its puck, never on a block.
  - *Opens after level 100*, beside the map's locked Endless puck.
- The labels are device-local teach flags (`puckObjectives`, `puckEndless`).
- PLAY is unchanged and still opens the map. "Play level 13" would have described a destination
  the button does not go to.

**Map**
- The map's one coral is the dock's Play disc.
- The frontier puck is cream with the ink number (`FRONTIER_PUCK`). It has a dashed ring, and its
  bar-line ripple is now in the area's ink rather than coral. The area's ink is used, not the
  game's, because the game's ink disappears on Dusk's dark ground.
- The trail's current bead is an ink ring.
- Locked stops carry no padlock: the faded puck says so, and a closed gate's barrier says why. A
  locked finale keeps its rim badge, since its plate names the act rather than saying it is
  locked.
- Trail beads go from radius 6 to 7.5 at a pitch of 31. *Finale in N* goes from 18 to 22 design
  units.
- The star gate's hazard stripes are still coral. They mark a barrier, not an action, and were
  not part of the proposal.

**Play**
- The turn block is drawn at `blockScale(s)`, 1.2 times the scene's scale, on all three screens
  that draw it: levels, Endless and the lesson.
- It grows in place around the same face line, so it is still anchored at the thumb.
  `verdictLine` grows the rows inside it, so the household shelf and the verdict pill keep their
  spacing.

## Changed from the proposal

- **Turn block at 1.2, not 1.4, and kept low.** Moving the block up under the shelf would take it
  out of thumb reach. Thumb reach is an absolute distance from the grip, so the block is anchored
  a fixed distance from the bottom (`LAYOUT.trackOffsetFromBottom`).
- **Why not 1.4.** On a 720-unit-wide phone the frame's width caps an eight-beat row, and the
  owner slots grow too. Its sockets would come out at radius 20.4 at 1.4, against 22.6 at 1.2.
- **On a 16:9 phone** the larger block rises about 19 units into the stage. The bug-and-shoe
  act's bug already sat on the verdict pill there before this change, and now touches the
  block's top edge too. It reads, but it is the closest fit in the cast.

## Not checked

- Everything here was checked in headless Chromium on 20:9 and 16:9 phone frames, and the hint
  cards also on a 4:3 tablet frame.
- Nothing was checked on a real device.
- The larger turn block was not captured on a tablet: the headless run paused that level before
  the block was on screen.
