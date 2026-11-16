# Timing details on the result

The result plaque said a percentage and "On the beat". The scorer had already counted
Perfects, Goods, misses and extras and measured every tap's error, and all of it was
thrown away at the summary. A rhythm game's most useful sentence is the one that turns
"I got 72%" into "I am consistently early", because that is something a player can fix.

## What the player sees

The line under the score now reads **TIMING DETAILS** with a drawn chevron. A tap opens
the details **in the tray, where the medals sit**; another tap brings the medals back.
It starts closed on every result, so the medals always get their moment first.

```
24 Perfect · 5 Good · 1 Miss
EARLY  ──┼┼┼▼┼──|──────────  LATE
You tended to tap 34 ms early
Slightly early — sit behind the beat.
```

- **Counts** for the finishing pass's scored tasks. Extras appear only when there were any.
- **A hit-error bar**: one tick per judged hit, from −130 ms (Early) to +130 ms (Late),
  the Good window. The Perfect window is the lighter band in the middle, ticks inside it
  are ink and ticks outside it grey, and a coral marker sits on the lean. Many ticks
  overlap, so each is faint and a crowd of them reads dark.
- **The lean in words**, in milliseconds, or "centred".
- **One piece of advice**: the most useful single thing, below.

A level that judged nothing, such as a preview result, keeps the old "On the beat" caption
and offers no toggle.

## A tap at a time

The tray tells a player their lean after the level. The same fact is also said **on each
tap while the level is running**, beside the verdict word: **EARLY** or **LATE**
(`tapTiming` in `game/timingReport.ts`, drawn by `ui/verdictTag.ts` inside `TurnWords`,
`ui/turnWords.ts`, which a level, the Daily Tempo and Endless Mode share).

- A **Good** says which side of the beat it fell on. Negative is early, as everywhere the
  judge's errors are read.
- A **Perfect** says nothing. It is on time; naming a side inside the Perfect window would
  send a player chasing a few milliseconds the game already calls right, and it would put
  a word under every good tap of a good run.
- A tap that **reached for a beat and missed its window** — up to twice the Good window
  from a beat still unanswered — reads *Miss* with EARLY or LATE beside it. The judge marks
  it (`Judgement.near`) without changing its grade or the score; it is the tap that most
  needs telling, because the player's next one is about to make the same mistake.
- A miss with no tap, a tap between beats and a second tap on a beat already answered
  have no side, and say nothing.

There is no room above or below the word — the act's shelf is over it and the block under
it — so the tag sits beside it, the two centred as one group on the verdict's line
(`verdictGroup` in `ui/hitPose.ts`) inside one pill. Both words are made in `build` and only
shown, hidden and posed after that, so the frame of a judged tap does no raster for them.
They ride the word's own pose, so they land and leave together, reduced motion included.

## Why in the tray, not under the plaque

A row under the plaque would re-plan the whole result stack on a tap: the plaque would
jump and shrink under the thumb. On a 16:9 handset with a finale's card, the next star
and the replay block already under it, there is no room for one more row at the
plaque's minimum scale. The tray is 510 × 245 whatever else is on screen, so the details
can never push anything off the frame. The rows under the plaque — next star, keepsake,
finale card, mastery plate — stay where they were.

Medal confetti is skipped while the details are open, since the bursts would land on the
words. The toggle is checked before the summary's tap-anywhere Continue, so opening it
never continues, replays or retries. Its hit box is at least a thumb tall.

## How the advice is chosen

`game/timingReport.ts`, pure and tested in `tests/timingReport.test.ts`.

**The lean is the median signed error**, not the mean. One flubbed tap 120 ms late among
thirty taps 20 ms early must not read as "on the beat"; the median is the tap the player
makes most. It is rounded away from zero at the half, so an early lean and a late one of
the same size show the same number. **Spread is the mean distance from that median.**

| Order | Condition | Advice |
| --- | --- | --- |
| 1 | No hits | Listen for the count, then tap on Go! |
| 2 | Fewer than 4 hits | the above, or "Most beats went by" if most were missed |
| 3 | More misses than hits | Most beats went by — start right on Go! |
| 4 | Lean ≥ 60 ms, spread ≤ 30 ms, 8+ hits | Always early/late? Check your Tap offset. |
| 5 | Extras ≥ max(3, hits ÷ 4) | One tap per beat — extras cost points. |
| 6 | Spread > 40 ms and lean < 35 ms | Uneven — keep one steady pulse going. |
| 7 | Lean 12–35 ms | Slightly early — sit behind the beat. / Slightly late — lean into the beat. |
| 8 | Lean ≥ 35 ms | Early — let the beat arrive, then tap. / Late — tap as the beat lands. |
| 9 | Otherwise | Right on the beat — keep it there. |

Row 4 exists because the errors are measured after the Tap offset is applied
(`AudioClock.input`). A lean that large and that steady is more likely the device's
output lag than the player, and the Tap offset fixes it where practice cannot. Row 6
comes before a small lean because "sit behind the beat" would only move a scatter.

The thresholds are `TIMING` in `game/timingReport.ts`. Every advice line is kept to one
line at the tray's width, which the tests enforce: a 44-character line wrapped on device
with one word left over.

## Data

`scoreRound` now also returns `deltasMs`: each judged hit's signed error in target order,
negative early. Extras and misses have no entry. `meanAbsoluteErrorMs` is unchanged and
is still what the `task_completed` event's `error_ms` reports; nothing new is sent to
analytics and nothing is stored. `PlayScene` sums the scored tasks of the finishing pass
with `addRound`, reset on every new pass; the introduction to a finer grid and the
first-run demonstration are not scored and are not counted.

## Verified

In Chromium at 393 × 851 and 375 × 667, on real levels driven with taps placed early,
late and scattered: the details report 34 ms early, 51 ms late and "centred, uneven"
respectively, the toggle opens and closes without leaving the summary, and nothing
overflows the tray, including beside the Heart kept plate and a keepsake card. Not yet
looked at on a handset.
