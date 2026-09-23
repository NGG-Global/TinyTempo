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
