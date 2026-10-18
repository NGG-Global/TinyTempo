# The act schedule

Which act plays which level. `DEBUT_LEVELS` in `src/vignettes/registry.ts` is the whole
schedule; `src/vignettes/rotation.ts` reads it; `tests/rotation.test.ts` holds it to its
rules.

## The rule

Every act has a **debut level**, the level it first plays on. Every other level plays the
act that has gone longest without a turn among those that have debuted. So:

- a new act arrives exactly where the table says, and nowhere earlier;
- no act plays two levels running;
- once every act has debuted, each one plays exactly once in any run of 35 levels.

A level's `lap` is still the number of earlier levels its act played, which is what an act
indexes its looks with, and `actLevel(vignette, lap)` still reads the schedule backwards.

## The schedule

| Area | Levels | New acts | Debut levels |
| --- | --- | --- | --- |
| 1 | 1–10 | hammer to paper, nine | 1–9 |
| 2 | 11–20 | egg, bubble wrap, light switch | 11, 12, 13 |
| 3 | 21–30 | doorbell, roller | 21, 22 |
| 4 | 31–40 | hotel bell, balloon | 31, 32 |
| 5 | 41–50 | stapler, fisherman | 41, 42 |
| 6 | 51–60 | DJ scratch, trombone | 51, 52 |
| 7 | 61–70 | clapping hands, snare | 61, 62 |
| 8 | 71–80 | bongos, slushy | 71, 72 |
| 9 | 81–90 | apple, barber | 81, 82 |
| 10 | 91–100 | popcorn, toothbrush | 91, 92 |
| 11–17 | 101–170 | paintbrush, nose, dish, prospector, ice cream, frog, glasses | 101, 111, 121, 131, 141, 151, 161 |

**Every area introduces at least one act until the cast is complete.** A new act arrives on
an area's opener or its first pattern level, the two easiest steps of the area's
choreography (`docs/DIFFICULTY.md`), and never on a finale, which is a reprise of its area
(`docs/FINALES.md`). `checkDebuts` refuses a finale.

**Why ten acts by level 9 and two an area to 100.** Levels 1–9 are the game's opening, one
act a level, exactly as they always were. The pace after that is set by Endless Mode: it
unlocks on clearing level 100 and draws on the acts the road has introduced by then
(`eligibleActs`), and rules version 1 pinned that pool as the first twenty-eight acts in
registry order (`tests/fixtures/endless-rules-v1.json`). Twenty-eight acts in ten areas,
with none on a finale, is nine in the first, three in the second and two in each after.
So the pool, its order and the first forty steps of every run are what they were, and the
Endless leaderboard needed no new rules version. The last seven acts follow one an area.

After level 161 the cast is complete and no area introduces an act. Variety from there
is the acts' looks, which change by lap (`docs/VARIANTS.md`). Holding to one new act an
area past 170 means making one act per ten levels.

## What it replaced

The rotation grew in **eras**: an era from a level cycled the first n acts of the registry,
and every era but the last had to span whole laps. A new act could only join at an era
boundary past every keepsake level, two full laps out, so each act pushed the next one
further: the barber at 51, the paintbrush at 107, the nose and dish at 165, the prospector
at 227, ice cream at 291, the frog and glasses at 357. Of the first forty areas, thirty-one
introduced nothing, and the last seven acts sat where few players get.

## Keepsakes, and what testers held

A keepsake is owned by three stars on the level where its act plays a given lap
(`docs/SCRAPBOOK.md`), so the new schedule moved every keepsake from level 10 on. Levels
1–9 kept theirs. `tests/fixtures/keepsakes.json` now pins the new levels.

Nobody had passed level 50 at the change, but players had three-starred levels on the old
schedule. `src/game/keepsakeLegacy.ts` keeps what they held: `LEGACY_KEEPSAKE_LEVELS` is
the old level of every keepsake, frozen, and on the first launch of this build the device
records which keepsakes its save owned under the old schedule (`tiny-tempo.keepsakes.v1`).
They stay owned. The record only adds, a damaged record reads as empty and is never
rewritten, and the Preload scene takes it before any level can be played.

It is the device's record. Auto Backup carries it with the rest of the WebView's storage;
a save code or a Saved Games restore onto a device that never ran the old schedule brings
back the progress, and with it every keepsake the new schedule awards, but not one held only
on the old schedule.

## Appending an act

Append its definition to `VIGNETTES` and its debut level to `DEBUT_LEVELS`, after the last.
That moves every level from the debut onward, keepsakes included, so put the debut past the
furthest level players have reached, which the analytics' level events show, or extend the
grandfathering. A debut at or below level 100 also changes Endless Mode's pool, which is a
new rules version and a new leaderboard.
