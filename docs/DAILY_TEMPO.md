# Daily Tempo

One act, one chart drawn fresh each day and the same for everyone, stars like a level's,
free to play, and rewards that pay once a day. It is the title screen's first block whenever
`DAILY_TEMPO_AVAILABLE` (`src/config/dailyTempo.ts`) is true, which it now is; turning the
flag off hides the block, the daily objective and the leaderboard button at once.

| File | What it holds |
| --- | --- |
| `src/config/dailyTempo.ts` | The flag, the bands, `DAILY_CHART` (seed, version, the bands' tuning) and `DAILY_REWARDS` |
| `src/game/dayKey.ts` | The one day key (`dailyTempoDay`, UTC−7), the time to the next day, the weekday, `daySeed` |
| `src/game/dailyChart.ts` | The chart: a pure function of (seed, version, day). Pinned by `tests/fixtures/daily-chart-v1.json` |
| `src/game/dailyRewards.ts` | What a run's stars pay, once a day: hearts, the bonus restart, the won timer; `tiny-tempo.daily.v1` |
| `src/scenes/DailyScene.ts` | The card, the run and the result, as three phases of one scene |
| `src/ui/dailyCard.ts`, `src/ui/dailyPlaque.ts` | The card's and the result's layout, pure |
| `src/ui/starMeter.ts`, `src/ui/rewardLadder.ts` | The run's meter and the three reward rows, pure |
| `src/ui/menuRow.ts` | Which blocks stand on the title screen's row, and where |
| `src/playgames/dailyTempo.ts` | The leaderboard, as before (`docs/LEADERBOARDS.md`) |

## The chart

**A chart is a pure function of `(seed, version, day)`.** The day is `dailyTempoDay`'s key —
Play Games' daily clock, UTC−7 all year — so the chart, the rewards paid for it, the best
kept for it and the leaderboard turn over together. The seed and version are `DAILY_CHART`'s.
One seeded stream is read in a fixed order: the step of an area (1–10), the act, the look,
then each task's phrase; a later draw never moves an earlier one.

**It is a level by another route.** The area step gives the chart its role, as a level's step
does (`PROGRESSION.choreography`); the role gives its band (`BAND_FOR_ROLE`): opener and
recovery are *light*, challenge and finale are *tough*, the six between are *steady* — 20 /
60 / 20 with no second weight table. A band is a point on the one difficulty curve
(`DAILY_CHART.bands`):

| Band | Tasks | Curve value `d` | Tempo cap | Thresholds (`starThresholds(d)`) |
| --- | --- | --- | --- | --- |
| light | 4 | 0.35 | 132 BPM | 54 / 69 / 85 |
| steady | 6 | 0.50 | 142 BPM | 60 / 73 / 87 |
| tough | 8 | 0.70 | 150 BPM | 68 / 79 / 89 |

The band's `d` sets the tempo, the tier and the thresholds exactly as a level's does
(`baselineShape`, `dimensionsOf`, `starThresholds` in `game/levels.ts`), shifted by the
choreography row's tempo and tier offsets at full strength. The phrases come from
`PATTERN_TIERS` by the loop a level's do: a tier rising from the band's floor to its ceiling,
no phrase twice running, a fresh one while the tier has one, the tempo ramping from 120 to the
peak, one lead-in bar before the first task and the breather at the midpoint of a six- or
eight-task chart. `starThresholds` was extracted from `levelSpec` unchanged
(`tests/levels.test.ts` asserts the identity), so a chart's stars are a level's stars.

**Version 1 keeps to the eighth-note tiers**: no triplets or sixteenths, no plateau
vocabulary, no last-offbeat hold. The Daily is open from the title screen to a player on
level 3 and one on level 300, and the tiers are the vocabulary both have. Each is a
version-2 question. **Any change to `DAILY_CHART` is a new version**, since every player's
chart for a day has to be the same chart for the leaderboard to mean anything;
`actCount` is pinned at the registry's length (36) so an appended act joins the pool only
when the version moves, and `tests/dailyChart.test.ts` pins eight days and checks a year.

## The card

Under the shared header row (back, *Daily Tempo*, the leaderboard puck where one is offered)
and the date line (*FRIDAY · NEW PATTERN IN 6H 12M*, polled once a second): the act's tile
(its keepsake drawing, in colour once owned, over the act's name and the day's best), the
reward ladder (three rows, the band's chip), then either the dashed explainer or, once a won
timer is on the shelf, that timer's row with Start, and Play where every screen's block sits
with *Free to play. No heart needed.* under it. On a short frame the gaps close, then the
picture shrinks, then the stack scales, never below `DAILY_CARD.minScale`
(`tests/dailyLayout.test.ts`). The card keeps the music of the screen that opened it. A day
that turns under the card redraws it whole.

## The run

A level's loop, as `PlayScene` runs it: the `RoundController`, the judge and the scorer, the
turn block and its count-in, the breather's tiles, the acts from the registry, one
`AudioEngine`. Each task's plan carries its own lead-in; the next task's demonstration starts
on the downbeat the coda's slide lands on, with the tempo and the stems moving there
(`canPlaceNextTask` guards the swap as it does in a level). Over the act: the mode's pill,
one bead a task, and the **star meter** — a bar to 100% with a notch at each threshold,
filled to the mean accuracy of the tasks finished so far and the stars over it lit as the
fill passes them. **It moves once per finished task, never per tap**: a round's accuracy is
not known until the round ends, and a number that moved on every tap would move again on
the next.

**An interrupted run is not a run.** Backgrounding, the wrong orientation, a stall or a lost
audio context ends it once, with nothing scored, paid or sent (`daily_abandoned`), and the
result says so with Try again. The pause puck opens a sheet over a run that goes on
underneath; only Leave ends it. Nothing is spent: no heart, no attempt, no ad.

## The result

The plaque's tray a level's result has (`ui/resultLayout.ts`: three seats, three chips, the
score and its line), hung on two ropes, the reward ladder with this run's tiers marked
*PAID*, earlier ones *EARLIER* and the rest dashed with their thresholds, the won timer's
toast with Start, and Continue back to the card. The plaque, the ladder and the toast scale
down together on a short frame, never below `PLATE.minScale`. The result pucks are back to
the card, Try again and the leaderboard.

A finished run is scored and paid **once**, local first (`recordDaily`): the stars from
`starsFor(meanAccuracy, chart)`, then `applyDailyRewards`, then the day's objectives
(`dailyObjectiveReport`: a run and never a level, so "Clear a level" never moves on it while
"Finish today's Daily Tempo" and the Perfect counts do), then the leaderboard where offered,
with the run's **start** time so a run that crossed 07:00 UTC lands on the day it was played.

## Rewards

`applyDailyRewards(run, now)` keeps one record per day (`tiny-tempo.daily.v1`: day, band,
best, best stars, runs, the highest tier paid, won minutes) and pays the tiers in
`(paid, newPaid]`, each once a day whatever the number of runs:

| Stars | Pays | Where it goes |
| --- | --- | --- |
| 1 | +1 heart, a won timer | `grantRewardHeart`: into the bar, or a **spare sixth heart** (`HEALTH.spareMax`) when the bar is full, spent first by the next attempt |
| 2 | +1 restart, a longer timer | `grantBonusRestart`: one bonus restart for the Daily Tempo day, on top of the local day's two, spent after them |
| 3 | +1 heart, the longest timer | as tier 1 |

The won timer is one item a day on the shelf (`won:<day>`, `docs/BILLING.md`), its length the
band's value for the stars reached (light 15/30/45, steady 20/40/60, tough 30/60/90 minutes,
never above 90): a better run later in the day **lengthens it and resets its hour**; a run
after it was started grants the difference as a new won item. Won timers start within an hour
or expire off the shelf. The record is validated on read, discarded for another day, guarded
by a session set so a refused write cannot pay a tier twice, and **left alone by Reset
progress** (a reset must not pay the day again).

## What is where

- **Device-local**: the day's record (`tiny-tempo.daily.v1`), the bonus restart (inside
  `tiny-tempo.restarts.v1`), the spare heart (inside `tiny-tempo.health.v1`). None is in a save
  code or the cloud snapshot.
- **In the cloud save**: the shelf (`held`), since a won timer is progress made that day
  (`docs/CLOUD_SAVE.md`).
- **Two "today"s.** The chart, the rewards and the bonus restart turn on the Daily Tempo day
  (UTC−7); the daily heart, the base two restarts and the objectives on the player's local
  day. Near midnight an objective can credit a Daily run to the neighbouring local day; that
  is the decision, and cosmetic.

## Analytics

`DAILY_EVENTS` in `monetization/analytics.ts`, shaped like every other event and checked by
`tests/analytics.test.ts`: `daily_opened` (the card: band, runs, paid, source),
`daily_started` (band, tasks, peak BPM, replay), `daily_finished` (band, stars, accuracy,
paid, replay), `daily_reward_paid` (once per tier per day: band, tier, hearts, restart, timer
minutes) and `daily_abandoned` (reason, tasks done). No day key, no player.

## Verified, and not

Under node: the chart over a year of days, the layouts on three frames, the meter, the
ladder, the rewards' every branch, and the scene's rules by source. In a headless browser:
the card on 20:9 and 16:9, a run's HUD with the act on the stage, a scored result with two
stars (the heart granted, the bonus restart recorded, the won timer on the shelf), and the
card after it. Not yet: a run played by hand on a handset, the leaderboard on a native build,
and the shelf reaching a second signed-in device.
