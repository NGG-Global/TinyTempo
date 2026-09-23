# Daily objectives

Three small objectives a day, each pointing at a different part of the game: something to
play, something to play well, and something to go back to. There is no currency, no pass,
no shop and nothing to buy or watch. Finishing all three stamps the day on a card.

| File | What it holds |
| --- | --- |
| `src/game/objectives.ts` | The pool, the daily draw, progress, storage and validation. Pure; no Phaser. |
| `src/ui/objectivesCard.ts` | The card: the three, the week's stamps, when the next set comes. |
| `src/ui/icons.ts` | `drawChecklist`: the puck's glyph, ticked as the day goes. |
| `src/scenes/PlayScene.ts` | Counts Perfect hits and flawless tasks for the pass, and reports the level once. |
| `src/scenes/MenuScene.ts`, `src/scenes/MapScene.ts` | The puck that opens the card. |

## The pool

Ids are stable analytics values and storage keys, at most 12 characters, never renamed.
Titles may be reworded. "Early" means the frontier is level 10 or below.

| Id | Family | Weight | Title | Target | Offered when |
| --- | --- | --- | --- | --- | --- |
| `clears` | play | 3 | Clear N levels | 2 early, else 3 | Always |
| `new-level` | play | 3 | Clear a new level | 1 | The frontier is playable (no star gate in front of it) |
| `acts` | play | 2 | Clear levels from 3 different acts | 3 | At least three different acts are reachable |
| `finale` | play | 1 | Clear an area finale | 1 | A reachable level is an area finale |
| `triplets` | play | 1 | Clear a level with triplets | 1 | A reachable level uses triplets |
| `sixteenths` | play | 1 | Clear a level with sixteenths | 1 | A reachable level uses sixteenths |
| `daily-tempo` | play | 2 | Finish today's Daily Tempo | 1 | A Daily Tempo exists — **never today** (`DAILY_TEMPO_AVAILABLE` is false) |
| `perfects` | skill | 3 | Land N Perfect hits | 15 early, else 30 | Always |
| `flawless` | skill | 2 | Answer a task all Perfect | 1 | Always |
| `three-star` | skill | 2 | Finish any level with three stars | 1 | Always |
| `improve` | mastery | 3 | Raise the stars on a finished level | 1 | A cleared level is short of three stars |
| `replays` | mastery | 3 | Replay 2 finished levels | 2 | Any level is cleared |
| `new-stars` | mastery | 2 | Earn N new stars | 2 early, else 3 | Reachable levels have at least N stars still to earn |
| `keepsake` | mastery | 1 | Find a keepsake for the Scrapbook | 1 | A reachable level's keepsake is not yet owned |

**Reachable** means a cleared level (always replayable, and a replay never costs a heart)
or the frontier while no star gate holds it. The frontier may cost a heart, but hearts
refill on their own every 20 minutes, so reaching it today never needs an ad or a purchase.

## Selection rules

1. **The day** is the local calendar date, `calendarDay` in `game/health.ts` — the same
   helper the daily heart uses — so the set turns over at the player's own midnight.
2. **Eligibility** is read from the save once, when the day's set is first drawn. The set
   is then stored and does not change for the rest of that day, however far the player
   gets.
3. **One per family**: the first slot draws from *play*, the second from *skill*, the third
   from *mastery*, each by weight. A family with nothing eligible hands its slot to the
   rest of the pool. So every day asks for replay or mastery whenever the save has anything
   to go back to, and a brand-new player still gets three things they can do on level 1.
4. **Deterministic**: the generator is seeded by an FNV-1a hash of the date string and the
   pool is walked in its own order, so the same date and the same save always draw the
   same three (`tests/objectives.test.ts` checks this over a year of dates).
5. **Nothing inaccessible**: finer grids are never asked for before a level that uses them
   is reachable, a new level never while a star gate holds the frontier, the Daily Tempo
   never while it does not exist. The same test checks every draw of 365 days against six
   kinds of save.

## Progress

A level reports once, from PlayScene's `recordOutcome` — the one step every finished
attempt passes exactly once. The report carries the pass that finished: its Perfect hits,
its flawless tasks, whether it cleared, this run's stars and the level's saved stars before
and after. A restart starts a new pass, and an abandoned attempt reports nothing. A clear
whose save failed does not count, since the next launch would not find it. The first-run
teaching pass and a finer grid's introduction are not counted: neither is judged as the
level.

A finished objective never moves again, progress never runs past its target, and "different
acts" counts distinct acts rather than levels.

## Storage and recovery

One key, `tiny-tempo.objectives.v1`: the day, the three with their progress, the stamped
days (the last 60) and the stamp total. Every field is checked on read:

- A set that is not exactly three known, distinct objectives with trusted targets (each
  objective lists the targets it may carry) is discarded whole, and the day's set is drawn
  again from its seed. Progress is clamped to the target.
- Stamps are recovered on their own: invalid dates are dropped, duplicates merged, and the
  total is never below the number of stamped days. A damaged set never costs stamps.
- Blocked storage falls back to an in-memory copy, so the day's progress lasts the session.
- A clock moved backwards simply draws a fresh set for the date it now reads.
- Settings → Reset progress redraws today's set for the empty save and keeps the stamps.

Nothing here travels in a save code (see `docs/SAVES.md`).

## The reward

A stamp for each day all three were finished. The card shows the last seven days as seats,
today's ringed, and the total. There is **no streak**: a missed day is an empty seat, the
total only goes up, and nothing on screen mentions losing anything. There is nothing to buy
to protect or restore it, because there is nothing to lose.

## The UI

A puck with a clipboard glyph whose three boxes tick as objectives are finished — on the
title screen beside *How to play*, and on the map under the sign's left end. A coral dot
appears when something was finished since the card was last opened. The card is the only
place progress bars appear; the road carries none.

## Analytics

`objective_progress`, `objective_completed` and `daily_objectives_all_completed`, sent from
the level's single report: at most one event per objective per level, a completion instead
of a progress event, and the stamp once per day (`docs/ANALYTICS.md`). No dates are sent.

## Adding an objective

Append an entry to `OBJECTIVE_POOL` with a new id, its family and weight, its allowed
targets, a title, an `eligible` rule that only reads what the save can reach, and an
`advance` that only reads the level report. If it needs a fact the report does not carry,
add the fact to `ObjectiveReport` and `objectiveReport` — never a purchase, an ad or a
heart. The tests check the new entry's id, that it is only drawn when eligible, and that
its title asks for nothing commercial.

## Checked, and not

Driven in headless Chromium: the puck and card on the title screen and the map on 20:9 and
16:9 frames, the all-done state, closing by tapping off the card, and a real level played to
its result, which moved three objectives, saved them, and sent one event for each. Tested
under four time zones for the midnight turnover and the week row. Not yet seen on a device.
