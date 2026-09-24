# Area finales

The last level of every area is its finale: the same loop, the same scoring and the same
heart, presented as the area's destination. It is a bigger moment, not a new test — nothing
in it is a rhythm the area has not already played.

| File | What it holds |
| --- | --- |
| `src/game/levels.ts` | `isAreaFinale`, `areaLevels`, `openingBeats`, `areaRepertoire`, and the reprise that composes a finale's tasks. `LevelSpec.finale`. |
| `src/game/finale.ts` | What a finale is dressed in: the area it closes, the next one, its treatment, the map's marks and the dock's trail. Pure. |
| `src/ui/finaleStage.ts` | The one renderer every treatment is drawn by: pennants, title card, "Area complete" ribbon. |
| `src/ui/finalePose.ts` | Their poses as pure `f(t)`. |
| `src/audio/finaleSounds.ts` | The opening's roll and the payoff's fanfare, synthesized. |
| `src/config/progression.ts` | `PROGRESSION.finale`: the opening's length and the music's starting level. |

## Which levels

`isAreaFinale(level)` is `level % PROGRESSION.areaSize === 0`, and nothing else in the game
names a finale's level number. The map, PlayScene and analytics all ask that function (or
`LevelSpec.finale`, which is it). `tests/finaleAreaSize.test.ts` re-runs the derivation with
an area of four levels to keep it that way.

## What a finale plays

**Its shape is the curve's; its patterns are the area's.** The choreography's `finale` row
still decides the length and the tempo ramp — the top of the area (`docs/DIFFICULTY.md`).
Every pattern is then replaced by one the area's earlier levels already used
(`areaRepertoire`): a tier task takes the highest tier of that repertoire at or below its
own; a subdivided task takes a pattern of the same grid, or of the other grid if the area
played that one and it fits the tempo, or else a tier pattern. Within the level it prefers a
pattern it has not used yet and never repeats the task before it, so a finale walks through
the area's material instead of drilling one phrase. The draws come from their own seeded
stream, so a finale is the same level on every attempt and composing it moves nothing else.

What follows, and is tested for levels 1–300:

- **No new concept.** Every finale pattern appears in an earlier level of its area; no
  finale uses a tier or a grid the road has not already shown.
- **No harder than the curve.** A finale task's tier is never above the curve's for that
  task; length, tempo and lead-ins are the curve's exactly.
- **The same rules.** Clear bar and star thresholds are the curve's (pinned by
  `level-thresholds.json`); `recordResult`, the star gates and `beginAttempt` treat a
  finale like any level — one heart on the frontier, none on a replay, a refund on three
  stars, and a clear unlocks the next area's first level and nothing else.

The opening is longer: `PROGRESSION.finale.openingBars` (two) instead of one bar, through
the same `leadBeats` mechanism the breather uses, so the scheduler and the turn block see
nothing new. Only the finale rows of `tests/fixtures/levels-choreography.json` moved.

## How it is presented

A finale is one `FinaleStage` in PlayScene, created from `areaFinale(level)`, and PlayScene
only tells it *when* — the opening's downbeat, the clear. It never decides *what*.

- **The environment.** A line of pennants (lanterns on Dusk) is strung over the act for the
  whole level, under the room dim, so it steps back for the player's turn with the rest of
  the workshop. Each pennant swings at its own phase; a clear throws them up.
- **The title card.** It drops in on ropes where the result plaque will later hang —
  "Area finale", the area's name, "The best of Grass, one more time" — and is hauled out of
  the way half a beat before the first demonstration, so it never covers the example.
- **The music build.** When the level's music starts on this opening, the loop comes in at
  `musicFloor` (40%) of its level and swells to full on the first demonstration downbeat,
  and a snare roll builds across the opening's last bar and stops 60 ms short of it, so
  the example's first beat is heard on its own. Both are scheduled on the context clock at
  placement, like every cue. After a finer grid's introduction the loop is already at full
  level, so there is no swell — ducking it there would read as a fault.
- **The payoff.** On a clear the headline names the area; a second after the summary — once
  the third medal has landed — a ribbon unrolls across the plaque's ropes: "Area complete ·
  Next stop: Pavement", with confetti from both ends and a brass fanfare. A keepsake card
  earned by the same clear waits 0.7 s longer than usual so each has its moment. A failed
  finale is an ordinary "Again?"; a clear whose save failed says "Couldn't save" and shows
  no payoff, since the next launch would not find the area complete.
- **Reduced motion.** Pennants hang still, the card and ribbon appear and disappear, and
  no confetti is thrown.

## On the map

Every finale in the map's window is drawn as a stage rather than a stop, in every state, so
the destination reads as the end of the area from a dozen levels away:

- **A plaza.** The road widens into a disc 130 units across the radius, in the road's own
  surface, edge and markings, with a dashed ring inside it.
- **Bunting** on two wood posts either side of the plaza, in the treatment's
  `pennants` (lanterns where the treatment's motif is lanterns). A post near the frame's
  edge moves in, so the line is shorter on that side rather than off the screen.
- **A crown of three star seats** over the puck, the middle one larger and highest. An
  earned seat is prize brass and an empty one hollow, read from the level's best; while a
  star flight is on they show what the level had before, and the new stars leave from them.
- **A larger puck** (67 against an ordinary stop's 46) inside two brass rings. Its hit area
  is the larger disc.
- **A wood plate** under the plaza: "Finale" over the act's title from `definitionForLap`,
  so a variant's name is the one shown.

The state comes from `finaleStopLook` (`src/ui/roadLayout.ts`), fed the state the puck is
drawn in: the frontier is coral and lit, a cleared finale an ink puck with its seats
filled, and a locked or previewed one has its bunting and plate faded toward the ground,
its rings at half strength and a padlock badge on the puck. The side flag it replaces is
gone; the dock's row of beads still ends in a flag for the area's finale, with "Finale in 3"
(or "Area finale") beside it, and when the frontier is the finale the block reads
"Finale: Trombone".

**A finale takes more road than a stop.** Every area after the first has a star gate half a
step under its first level, which is directly above the previous area's finale, and at the
ordinary step the barrier stood in the middle of the bunting. `ROAD.finaleRoom` adds 140
units above a finale and 50 below it, inside the finale's own area: the seam an area's
ground and gate change on is measured from the stop above it (`seamBelow`), so the room
never moves a gate or a terrain boundary off its level. Node y is therefore no longer
linear in the level, and the road's x at a y is a search on the road itself (`pathXAt`)
rather than a division. `tests/roadLayout.test.ts` checks the stage against the stop below
it and the gate above it on every finale in a range of windows, on phone and tablet
frames.

## Giving an area its own finale

1. Add an entry to `FINALE_TREATMENTS` in `src/game/finale.ts`, keyed by the area's base
   name in `AREAS` (later laps — "Grass II" — share it): a stable lower-case `id` (it is an
   analytics value), a `motif`, pennant and confetti colours, and a ribbon colour with its
   ink. `tests/finale.test.ts` requires 4.5:1 between ribbon and ink.
2. A new *kind* of decoration is a new `FinaleMotif` and one more case in
   `FinaleStage.drawLine`. PlayScene does not change.
3. An area with no entry wears `DEFAULT_TREATMENT`.

## Analytics

`area_finale_started`, `area_finale_completed` and `area_finale_failed` ride beside the
level's own events, from the same run and the same single close (`docs/ANALYTICS.md`).

## Not done, deliberately

- **No area keepsake.** The Scrapbook is one keepsake per level, and levels 10 and 20
  already carry their act's. An area pennant would be a second kind of keepsake, a new page
  and a new total; it is a clean follow-up (owned when the finale is cleared, derived like
  the rest), not part of this change.
- **No boss, health bar or extra rule**, and no Groove system exists to layer on.

## Checked, and not

Levels 10 and 50 were driven in headless Chromium: the title card during the opening, the
pennants and lanterns, the payoff over the plaque with a keepsake card below it on 20:9 and
16:9 frames, and the map's stages and dock trail at several frontiers — locked, previewed,
frontier and cleared, at 393 × 851, 360 × 640 and a 768 × 1024 tablet. The payoff was
attached to a real result screen rather than earned, because that environment renders at
about 12 fps and its replayed taps cannot clear the level. The swell and the roll were
confirmed scheduled, not listened to. Not yet seen or heard on a device or a tablet.
