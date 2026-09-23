# Triplets and sixteenths

How the game's rhythms get finer than an eighth note, late and gradually, without
moving a single level a player has already learnt.

## Where the ceiling was

"Four beats per bar" is `RHYTHM.beatsPerBar`, and it has not changed: every phrase is
still whole bars of four, the count-in is four, the handover opens two beats before the
first target. What was capped was the *grid inside* the bar. The five pattern tiers in
`PATTERN_TIERS` are written in half-beat steps, so no task ever asked for two taps
closer than half a beat — 200 ms at the 150 BPM ceiling — and the tiers run out by
level 37. From there the road stayed hard only by tempo and length.

## The second stage

`PROGRESSION.subdivision` puts triplets and sixteenths on top of the tiers as a second
stage of the one difficulty curve:

| Knob | Value | Meaning |
| --- | --- | --- |
| `tripletsFrom` | d ≥ 0.8 (level 43) | a level may carry a triplet task |
| `sixteenthsFrom` | d ≥ 0.9 (level 59) | a level may carry a sixteenth task |
| `fullAt` | d = 0.98 (level 99) | the share of tasks that may swap reaches `maxShare` |
| `maxShare` | 0.5 | the ceiling on how much of a level swaps, and the chance per task at `fullAt` |
| `minSpacingMs` | 110 | the closest two taps a task may ask of one thumb |

`subdivide(level, d, tasks)` in `game/levels.ts` runs **after** the tiers have chosen
every task of the level, and only when `d ≥ tripletsFrom`. It walks the tasks from the
second onward — the first task sets the pulse and is never swapped — and, with a chance
that rises from 0 at `tripletsFrom` to `maxShare` at `fullAt`, replaces a task's pattern
with one on a finer grid. It stops once `floor(count × maxShare)` tasks have swapped,
so a run of lucky draws cannot turn a level into a subdivision drill.

Each grid has two densities in `SUBDIVIDED_TIERS` — one group of the subdivision per
bar, then two — and moves to the second halfway from its own threshold to `fullAt`. So
the road goes: eighths → one triplet per bar (level 43) → two triplets per bar (57) →
one sixteenth pair per bar (59) → sixteenth runs (72), with the share of such tasks
growing underneath all of it. Measured on the curve: about one subdivided task per level
through the 40s and 50s, three from the 60s, and never more than four of a level's eight.

## Why the earlier levels did not move

The swap draws from a **second seeded stream** (`seeded(level + SUBDIVISION_SEED)`),
separate from the one the tiers draw from, and the tiers' loop is untouched. Every task
the tiers chose is still chosen; some are then replaced. Had the finer patterns been
added as tiers 5 and 6 instead, `⌊tierCount · d^0.8⌋` would have shifted for every level
and reassigned the whole road, the same way inserting a vignette into the registry does.

*Superseded:* the difficulty choreography (`docs/DIFFICULTY.md`) later reassigned the road
on purpose, so the fixture described here was replaced. The property it proved is now a
direct test — every task `subdivide` leaves alone equals `tierTasks(level)` — and the
threshold still reads the plain curve. What follows is kept for the reasoning.

`tests/fixtures/levels-before-subdivision.json` recorded every task of levels 1–120 as
the derivation produced them before this stage existed. `tests/levels.test.ts` checks
that every level below `tripletsFrom` still matches it exactly, and that above it the
tasks that did not swap still do. Regenerate the fixture only for a deliberate change to
the road.

## Tempo, and what the thumb can do

A grid is offered for a task only if its **densest** pattern still leaves
`minSpacingMs` between taps at that task's tempo (`gridFits`). A triplet step is 133 ms
at 150 BPM, so triplets fit every task the curve produces. A sixteenth is 125 ms at 120
BPM and 100 ms at 150, so sixteenths fit only up to 136 BPM — the earlier, slower tasks
of a level — and the fastest tasks stay on eighths. This is the gradual part inside a
level as well as along the road.

## The judge

`judgeTap` already assigns a tap to its nearest target, so two targets' Good cells are
bounded by the midpoint between them however close they sit. Perfect was not: at 55 ms,
two targets closer than 110 ms apart would share a Perfect cell. `windowsFor(targets)` in
`rhythm/judge.ts` narrows Perfect to under 45% of the tightest spacing in the phrase,
which only takes effect below 122 ms — sixteenths above 122 BPM — and leaves Good and the
delivery grace alone. `RoundController.start` passes it to `createJudge`, so the tutorial
and every level get it without knowing.

## Notation

`parseSubdivided(id, notation, stepsPerBeat)` writes a phrase on a grid of whole steps
to the beat and computes lengths by **division**. `parsePattern`'s step length cannot
write a triplet: a third of a beat has no exact binary form, twelve of them multiplied
out come to a hair over four, and `createRoundPlan` rounds the phrase up to two bars.
Every subdivided phrase is exactly one bar, opens on its downbeat, and ends at least a
third of a beat before the bar line — the next task's demonstration starts on that bar
line, and a sixteenth owed 100 ms before the hammer plays again is a trap, not a rhythm.
`Pattern.grid` records the steps per beat for tests and tooling; `LevelTask.grid` says
which finer grid a task is on, or null.

## What the rest of the game sees

Nothing new. Phrases are still one bar, targets still fall on the plan's grid, the block
still shows one socket per hit in order — it never showed timing; the shelf lights each
bead as it sounds, and the ear carries the subdivision. Acts animate from `strikeAt` and
restart cleanly on a fast retrigger. Two things are worth watching on a device once these
levels are reachable: acts whose action motion is tuned in beats (the roller's 0.42-beat
pass, the trombone's slide travel) retrigger mid-motion on a sixteenth pair, which reads
as a fast double rather than a fault but has not been polished for it; and the block on a
nine-hit phrase packs its sockets at `columnRoom`'s tightest pitch, as it already did for
tier 4.

## The first meeting

Until this, a finer grid arrived unannounced: a task two-thirds of the way into a level
simply asked for three taps inside a beat. Now the first level that uses each grid
introduces it, once, in the level itself (`game/subdivisionIntro.ts`, wired in
`PlayScene.beginIntro`).

**Where.** `firstEligibleLevel(grid)` reads the curve's own threshold (level 42 for
triplets, 59 for sixteenths today); `firstLevelWithGrid(grid)` is the first level whose
tasks actually use it (43 and 59), since eligibility only opens a chance. The trigger is
`introGrid(spec, seen)`: the level uses the grid, and the player has not met its
introduction. That one rule covers a new player, who meets it on level 43, and one who
was already past it when this shipped, who meets it the next time a level they start —
frontier or replay — uses the grid, never at launch. Where a level uses both and neither
has been met, the one the level reaches first is introduced and the other waits for the
next level, so no level opens with two lessons.

**What.** One task, in front of the level's first, on the level's own act, turn block,
judge and music:

| Bar | What happens | On screen |
| --- | --- | --- |
| 1 | The level's count-in, at 0.75× its opening tempo (90 BPM) | **New rhythm** / *3 inside the beat* (sixteenths: *4 inside the beat*) |
| 2 | The act demonstrates one simple phrase: quarters, with the new group once on beat three | the same two lines |
| 3 | The player answers, judged by the level's controller; the guiding ring shows each next beat | nothing: the words go on the downbeat |
| 4 | The act's coda and the slide, as between any two tasks | **Got it**, or **Once more** |

Below 50% the player gets one more go at once — the example again with no count-in, then
the answer — and after it the level begins whatever happened ("Let's go"). The music
returns to the level's tempo on the downbeat its first task starts. Everything from the
level's opening downbeat to that one is whole bars, for every act's coda hold, so the loop
never slips against the grid the level then runs on (`tests/subdivisionIntro.test.ts`).

**Forgiving, not different.** The introduction never counts: it adds nothing to the
level's accuracy, stars, sequence or `task_completed` events, a missed beat is not called
a miss, and an extra tap only shakes the rows. What it does *not* do is widen a window —
it runs on the ordinary Perfect and Good, at a tempo where the phrase's tightest pair is
167 ms (sixteenths) or 222 ms (triplets) apart. Forgiving here means slower, simpler and
unscored. A test plays the same subdivided task on a controller that has just run an
introduction and on a fresh one, and requires identical scores.

**Once.** The flags are `triplet` and `sixteenth` in the teach object beside
`seenDemonstration` and `seenReplayTip` (`game/progress.ts`), written when the first try has
been judged — a player who backs out during the count-in sees it again. The teach object is
now written from one list of known flags, so setting any flag keeps the others. A save from
before the introductions reads as "not met", which is what makes the graceful case work.
Neither flag travels in a save code or touches saved progress, and the level specs are a
function of the level number alone: a seen flag changes no level.

**Checked in a browser.** Levels 42, 43, 59 and 70 were driven in headless Chromium with
the debug replay panel: the triplet introduction with a retry, the sixteenth one passing
first time, no introduction once seen, and a pre-introduction save meeting it on level 70.
That environment renders at ~12 fps, so the harness raised `RHYTHM.stallMs` on the page;
the game's own guard is unchanged. It has not been played on a device.

