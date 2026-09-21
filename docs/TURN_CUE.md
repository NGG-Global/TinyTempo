# The turn cue, and the first run

The play HUD redrawn from a Claude Design handoff (`Game UI design refinements 2`,
"Turn handover", synced against `main` on 2026-09-19). No change to the musical
loop, the audio schedule, the plan or the phase machine: `RoundController`'s
phases, `judge.ts` and `scoring.ts` are untouched, and nothing here decides
anything. Everything below is rendering, derived per frame from values the plan
already carries.

## What was wrong

Tiny Tempo's call-and-response runs the demonstration straight into the response
with no bar between them, and every cue used to fire on the same frame at that
boundary: the headline word flipped, the plaque changed colour, the plate warmed,
the beads emptied. `PlayScene.showPhase` said so itself — *"this flip is the only
thing that tells the player their turn has started. It cannot be deferred a
frame."*

Three things follow, and none of them is about signal volume.

1. **The cue arrived on the downbeat it announced.** In a rhythm game the player
   needed to be winding up a beat earlier, so the first beat was gone before the
   cue registered.
2. **Nothing held a persistent model of whose turn it was.** One row of beads
   changed meaning between the two halves, so the player had to remember state
   rather than read it.
3. **The primary cue was at the top of the screen**, while their eyes were on the
   act and their thumb was at the bottom.

## The block

`ui/turnBlock.ts` draws two rows at the thumb and one token between them. Its
geometry imports no Phaser and is worked out under node, the same split
`ui/switch.ts` keeps between where a control sits and how it is painted.

- **The shelf** is the demonstration's row: a plank recessed *into* the bench,
  with a bead per pattern hit that lights as the beat sounds. The order of the
  fills is the whole effect — the hole is drawn first and the plank sits inside
  it, so what shows is a shadow along the top edge and bounced light along the
  bottom. Drawing the highlight first puts the catch of light on the top lip,
  which is what a plank standing *proud* of the bench would have.
- **The face** is the player's row: the existing coral plate, in the existing
  place. **Its centre stays at `trackY`** — the thumb zone does not move; the
  shelf was added above it.
- **Both rows share the same column centres.** The pattern visibly drops straight
  down from their row into yours, and if the columns do not line up the whole
  metaphor fails. One `trackGeometry` result serves both.
- **The baton** is a coral disc carrying the current owner's glyph, and it is the
  single object that answers "whose turn is it". A sunken slot at each row's left
  end is its home on that side — the slot is what makes it read as *changing
  hands* rather than merely moving, and the bow in its path carries it over the
  columns it is handing across rather than down a wall beside them.

Both glyphs are geometry (`drawHammerMark`, `drawTapMark` in `ui/icons.ts`), for
the reason `gear.ts` already records: enough Android system fonts lack a glyph to
show a tofu box. The hammer is drawn at an angle, and Graphics can rotate neither
a rounded rectangle nor a fill, so the rotation happens in the points — the same
approach `heartPoints` takes to a shape Graphics has no primitive for.

**The socket ring is `#8f3620`, deliberately not `PALETTE.coral`.** The ring has to
stay legible once the plate underneath it warms to coral, and coral on coral is
invisible: that is exactly why the old plate's cue read as a wash rather than as
four targets. A struck socket keeps the Perfect/Good distinction the row already
had — a Good fills a smaller disc inside the same full ring — because the reason
for it has not changed.

## The runway

`handover(plan, now)` in `game/beatTrack.ts` returns two numbers, and everything on
the block is a function of them.

```
runwayFrom = plan.targets[0] - RHYTHM.runwayBeats * beat
runway     = 0 → 1 across the handover
yours      = 0 → 1 over beat * 0.18 from the first target
```

`runwayFrom` lands **inside the demonstration's own bar** — the last two beats the
game is still playing. Nothing is added to the loop and no cue moves. From those
two numbers: the face warms to 44% of coral before the downbeat, the sockets ring
up left to right like a lit fuse, the baton crosses, the row lifts into the thumb,
and the workshop steps back.

**By the downbeat, nothing new appears.** Every cue has already finished arriving.
That is the point of the design and the thing to protect in review;
`tests/beatTrack.test.ts` pins it.

`RHYTHM.runwayBeats` is a knob because on the densest patterns two beats may crowd.

The stage light moves with it. `turnOpen(now, handoverAt, phase)` in
`vignettes/motion.ts` replaced a per-act `easeOut((now - respondAt) / TURN_OPEN_SEC)`
keyed to when `respond` fired, so the light now opens toward the player across the
handover instead of starting on the beat it announces. Each act takes
`handoverAt` from the plan in its own `reset`, which is why no new hook was
needed; `respondAt` was the light's only consumer in nine of the ten acts and is
gone from them. **The light is the only thing that moves this early.** The
demonstration is still running, so nothing that consumes the act's subject may
start here.

## No words

`showPhase` no longer sets `'Watch'` or `'Your turn'`, and the timber sign that hung
behind them is gone — it existed to tell those two words apart as two objects, and
there are no longer two words. The headline is kept for outcomes (`Cleared`,
`Again?`, `Paused`, `No hearts`), which are results rather than cues, and for
`Breathe`, which marks the one place in a level where nothing at all is being
asked. The row's coral line, the baton, the fuse and the lift carry the whole cue,
which is also what lets the game ship in any locale without the turn being the
thing that breaks.

## Widening the rows

The owner slot occupies a row's left end, so the rows have to be wide enough for it
to clear the first column. The allowance is measured on the **shelf**, not the
face: the shelf is inset by `shelfInset` per side, so its slot sits that much
closer to the columns and collides first. On the longest patterns the row cannot
simply be made wider — it is already at the edges of the screen — so `columnRoom`
gives the columns what the slots do not need and the pitch packs tighter instead.
That is the one place the block trades spacing for the slot, and it is the right
trade: a token sitting on top of the first socket is not a tighter row, it is a
broken one.

The verdict word and the count-in pips moved above the shelf, which now occupies
the band they used to sit in.

## Reduced motion

`reducedMotion()` is read per use, as before. Under it the baton has two states and
no travel, the fuse lights every socket together at 50% and then 100%, the heat
steps rather than ramps, and there is no lift, bow or glow pulse. The information
survives; only the motion is removed.

## The first run

Two additive layers on the same block. No tutorial scene, no modal, no overlay and
no skip button — and deliberately small, because the cue above should make them
almost unnecessary.

**The demonstration pass** plays one whole cycle before level 1's first task ever
begins: four counted beats, four demonstrated, the handover, four answered, and a
bar to let it land. The game plays both halves; the player watches. It is the same
block, the same act and the same grid the level runs on, slowed to 0.75× with the
music, so what they watch is exactly the thing they are about to be asked to do:
struck above, carried down, answered below. It costs one cycle and no words.

The pass is whole bars because the music's rate goes back to the level's tempo at
the end of them, and a rate change off the bar line shifts the loop against the
grid every task afterwards runs on. It hands the grid to the controller a beat
early — the same headroom a task change takes, and at the teaching tempo a beat is
longer in wall-clock than the level's own — and keeps the block until the real
downbeat, so the answered row holds rather than blinking empty a bar early. It
owns its own row of marks for exactly that reason: `this.outcomes` belongs to the
task the controller starts at the swap.

**The guiding ring** contracts onto the next socket over the beat before it is due,
on the level that still teaches. The ring says *where*; the beat says *when*, which
is why it never anticipates further than one beat and never shows more than one at a
time. It follows the next beat still ahead rather than the next unanswered socket —
a socket stays unanswered until the judge expires it, and on the unfailable first
task it is never marked at all, which parked the ring on a beat that had already
gone.

**The first task cannot be failed.** A missed beat on level 1's first task marks no
socket, sounds no judder and says no "Miss". Nothing was spent to attempt the level
either — `HEALTH.protectedThrough` already covers the opening five levels, so
`beginAttempt` returns without taking a heart and there was never one to skip. Note
that the round is still *scored*: the judge and the scorer stay authoritative, so a
missed beat on that task still costs accuracy toward the level's 40% clear bar. What
is suppressed is the report, not the arithmetic.

## State

Two flags, both in `game/progress.ts` and neither inside `Progress`.

- `seenDemonstration` is a stored boolean under `small-acts.teach.v1`. It is not a
  field of `Progress` because `mergeProgress` takes the better of two saves level by
  level and "has this player seen the demonstration" has no better; the same
  reasoning already keeps the tutorial flag out of a save code.
- `guidedLevel(progress)` is **derived**, not stored. "Level 1 until it has been
  cleared" is exactly what `best[1]` already records, and a second copy of that fact
  could only ever disagree with it — a restored save code carrying a cleared level 1
  would otherwise bring the training wheels back with it.

## What is not from the handoff

- The handoff says the game is Phaser 3; it is Phaser 4, which is why a clipped
  region is a camera viewport and never a mask.
- Its colour table gives literal hexes for `SHELL.cream`, `SHELL.wood` and
  `PALETTE.muted` that no longer match `config/theme.ts`. The tokens are the source
  of truth and are what the code uses.
- It keeps `TurnCue` as an internal state type and `turnSign` for results. Both were
  dead once the words went — the "plaque" that remains for a result is the one
  `drawStars` hangs on ropes — so they were removed rather than left as a trap.
- Its minimum row width (`ownerInset * 2 + beadSpan + 40`) measures slot *centre* to
  column *edge* and ignores the shelf's inset, which put the shelf's slot on top of
  the first bead at every pattern length. See **Widening the rows**.
- `TRACK` moved from `PlayScene` into `ui/turnBlock.ts` with the block it describes,
  rather than being extended where it was.
- The separate `TutorialScene` still runs on a first Play, and has since been remade
  to teach on this block rather than on a sign and a labelled bead row of its own
  (`docs/TUTORIAL.md`). The in-play pass and the ring remain the teach for a player
  who skips it.
