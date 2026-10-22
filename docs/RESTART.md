# Restart

**A heart pays for an attempt; a restart pays with a restart.** Restarts are a resource of
their own beside hearts (`game/dailyRestarts.ts`): **two a day**, reset at the player's
midnight. They replace the heart a mid-level restart used to cost, so no action is charged
twice: hearts pay for starting a frontier level and for Try again, and the restart puck, once
the run has scored, uses one of the day's restarts and goes back to task 1 on the same attempt
and the same heart. With none left, the sheet offers a rewarded ad for one restart, or Keep
playing.

Only the restarts that used to cost a heart count: a frontier attempt past the protected
first area (`attemptCostsHeart`), after its first scored response, without a replay timer
running or the legacy Premium. Everything else stays free and unlimited — a restart before
the first scored tap, any finished level, levels 1–10 — so practice and star-chasing are
never limited.

**A replay timer makes every restart free while it runs** (`game/replayTimer.ts`,
`docs/BILLING.md`): four Play consumables — 30 minutes, 1 hour, 2 hours, 1 day — each adding
its span to one device-local timer, from the end of a running one or from now. The puck
restarts at once, nothing is asked, today's two are not touched, and the puck's badge turns
brass and reads what is left ("29m", "1h", "23h"), as the map's store puck does, with the full
figure on the store card (`docs/BILLING.md`). The timers are sold on the empty sheet,
under Watch ad & Restart, as a brass **Replay timer** block that opens a picker of the four
with Play's prices; a tap on a row buys it and restarts the level. Settings → Workshop store
sells the same four. **Premium is unlimited and no longer sold**: it was sold as unlimited
hearts and no ads, a bought one-time product cannot be taken back, and capping it would take
something from people who paid, so an account that owns it keeps its free restarts.

Resume is unchanged. After an interruption it continues the same attempt and never costs
anything.

Why it changed: a restart ending the attempt and spending a heart meant a player's whole
session could go on restarts, and the heart that pays for a level was doing two jobs. Two a
day, then an ad, keeps restarts from being free and unlimited (the original problem) without
taking hearts for them.

## The states

`restartKind` in `game/restart.ts` decides the puck's behaviour. It is pure:

| Kind | When | The puck does |
| --- | --- | --- |
| `try_again` | The level's result is recorded | What the result's Try again does: a new attempt, which needs a heart. No sheet. |
| `immediate` | A finished level, a protected level (1–10), a running replay timer, the legacy Premium, or no attempt yet | Restarts at once, free, on the same attempt. No sheet. |
| `confirm_free` | A frontier attempt before its first scored response | **Restart from the beginning? / No restart will be used.** Restart · Keep playing |
| `confirm_restart` | A frontier attempt after its first scored response, with a restart left today | **Restart level? / Uses 1 of today's 2 restarts.** (or *Uses your last restart for today.*) Restart (restart chip, **1**) · Keep playing |
| `out_of_restarts` | The same, with none left today | **No restarts left / Watch an ad to restart now. 2 more tomorrow.** Watch ad & Restart (video chip, **+1**) · **Replay timer** (brass, *Unlimited restarts for a while*, from the cheapest price) · Keep playing |

The Replay timer block opens the sheet's second page, the `timers` picker: **Unlimited
restarts / Restart as often as you like while it runs.**, four cream rows — *30 minutes*,
*1 hour*, *2 hours*, *1 day* — each with its Play price on a coral chip, and **Back**. A row
buys that timer (`buyTimerToRestart`): the sheet reads *Waiting for the store…* meanwhile,
a cancelled or failed purchase says why under the note and leaves the sheet up, and a paid
one restarts the level at once on the same attempt (`restart_confirmed` with cost `timer`),
if the run that asked is still the run (`ticketStillApplies`); the timer is the player's
either way. The picker is `restart_requested`'s sheet `timers` and `purchase_offer_shown`
once per product per opening.

With no attempt yet (the first start still loading, or the empty-hearts screen), the puck
is a start, gated like any other.

**The puck carries the count.** On a level where a restart would use one, the restart puck
wears a small badge with today's restarts left: ink with a cream number while any are left, a
hollow cream badge at 0, and brass with the time left while a replay timer runs, read every
half second so the minutes turn. It is not drawn where restarts are free for another reason
(a finished or protected level, Premium), so it never shows a number that means nothing.
Coral stays the action's.

The sheet (`ui/restartSheet.ts`) is a cream card in the game's own panels: the coral block
for the action and bench wood for Keep playing. What the action takes is drawn on a chip: the
restart glyph and a 1, or a video's play mark and +1. It stands above the player's rows, so
the run stays readable behind it. The refill and Premium offers the out-of-hearts sheet used
to carry are gone with it: a restart never costs a heart now, so there is no heart to sell.

**The run keeps running behind the sheet.** Opening it pauses nothing, ends nothing and
spends nothing. A tap off the card is still the player's beat. A tap on the card's face does
nothing.

**The sheet follows the run, and never acts on a stale reading.** Every half second, and
the moment the scored response begins, `liveSheet` is re-read:

- a free sheet becomes the daily one when the response begins;
- an empty sheet left open past midnight becomes the daily one (the ad is never offered
  while a restart is there), and so does the timer picker over it;
- the picker stays open while the empty sheet is what the run would raise (`liveSheet`'s
  `shown`), since it is that sheet's own second page;
- any of them becomes the free one, which never mentions a cost, if a timer or Premium
  arrives;
- the sheet closes when the result is recorded.

After any change the sheet ignores taps for `RESTART_SHEET_ARM_SEC` (0.45 s), so a thumb
already on its way cannot land on a button it did not read. Confirm also re-checks before it
acts: if the run no longer matches what the sheet says, the sheet changes and asks again.
**The daily restart is written before the restart runs** (`useDailyRestart`), so a restart
that went ahead has always been paid for, and a sheet whose last restart was used elsewhere
asks again instead of restarting free.

## Attempt ids: Resume vs Restart

`PlayScene.startRound(mode)` names its mode explicitly (`attemptForStart`). It no longer
infers it from whether a result exists.

| Mode | Used by | Attempt |
| --- | --- | --- |
| `resume` | Resume, Retry after a failed audio start, the first start, the empty screen's Today/Watch/Refill/Premium | Continues the unfinished attempt; a finished one is never resumed |
| `free_restart` | Every restart from the puck: the free sheet, `immediate`, a daily restart and a rewarded one | The same attempt from task 1, on the heart it began with; the pass is unscored again |
| `new_attempt` | Try again and the replay block after a result | Ends the attempt in hand, and a new id spends at the next downbeat |

**A new attempt is ended once, before anything can fail.** `releaseAttempt`
(`abandonAttempt`) runs synchronously, before the audio unlocks. The heart the old attempt
spent stays spent, and the old attempt now holds nothing, so it can never be refunded. The
analytics run is abandoned in the same step. Once the audio runs, `beginAttempt` on the new
id spends exactly one heart.

If the audio then fails, no attempt holds a heart and the player still has the one they were
about to spend. Retry spends it.

## Try again, on the result

**Try again says what it costs before it is pressed.** On a level where a new attempt spends
a heart — past `HEALTH.protectedThrough`, unfinished, no Premium — the block carries the
restart sheet's chip, a heart and a **1** (`tryAgainCost` in `game/restart.ts`, the same rule
`beginAttempt` charges by). Where it spends nothing, there is no chip.

**And the result ignores taps for `RESULT_ARM_SEC` (0.7 s) after it appears** (`resultArmed`).
The summary opens on the last coda's end, and a player still tapping the rhythm lands a tap or
two on it: on a failed result that was Try again, a new attempt and a heart, taken by a thumb
that had not read the result; on a cleared one, Continue, leaving the result unread. The block
takes about that long to rise into place, so the first tap the block is ready for is the first
the result takes.

## Back, in a level

Android's back is two presses in a level, never one (`levelBackAction` in `core/backButton.ts`):
the first pauses a running level — by the path a backgrounded app takes, so Resume continues
the same attempt — or closes the restart sheet as Keep playing; only a second, from a paused
level, goes to the map, by the path the map puck takes. A level waiting to start, or showing
its result, leaves on the first. An ad or purchase in flight keeps the press.

**When the scored response begins.** `PlayScene.scoredResponseBegun` is set when the
controller enters `respond`, or judges a tap, on a task that counts (`scoredResponseBegins`).
The controller judges nothing earlier than the Good window before the response, so a judged
tap means the response has begun. These never set it:

- the first-run demonstration pass (`teach`);
- a finer grid's introduction (`intro`);
- the DEV rehearsal.

A new attempt or a restart clears it: the pass starts again unscored, so a restart before it
scores again is free. Resume keeps it, because the attempt it continues has already been
played.

## The rewarded restart

Watch ad & Restart shows the same rewarded video every placement shows
(`monetization().showRewarded()`), through `watchForRestart`. The reward is one restart, used
at once: nothing is banked, so there is no grant to dedupe and nothing left over if the run
moved on while the ad played. It does not touch the day's count or a heart.

| Case | Today's restarts | Hearts | Restart |
| --- | --- | --- | --- |
| Reward confirmed, same run | unchanged | unchanged | yes, the same attempt from task 1 |
| Ad unavailable, closed early, failed or threw | unchanged | unchanged | no; the sheet says why (`rewardedFeedback`) |
| Reward confirmed, but the run finished, paused or was replaced meanwhile | unchanged | unchanged | no, and nothing is kept |
| Reward confirmed, scene gone | unchanged | unchanged | no |

The checks that guard this:

- the commerce lock, so only one watch is out at a time;
- a `RestartTicket` (attempt id and start request, checked by `ticketStillApplies`), so a
  reward that returns after a pause, a result or another start restarts nothing.

The play screen's Watch and the map's still grant a heart through `watchForHeart` and
`redeemHeart`, with a fresh claim id; the restart sheet no longer uses that path.

## Analytics

All on the gameplay bus, through `playAnalytics`. Each carries `level`, `area`,
`placement` (`restart`), `restarts_left` (today's, after this one on a confirm), `premium`
(0/1) and `timer` (0/1, a replay timer running). Nothing about the device or the player.

| Event | Fires | Adds |
| --- | --- | --- |
| `restart_requested` | The puck reached the restart flow | `sheet`: `none` (free level, a timer, Premium) \| `free` \| `daily` \| `empty` \| `timers` |
| `restart_confirmed` | A restart is going ahead. Once per restart | `cost`: `free` \| `daily` \| `rewarded` \| `timer` |
| `restart_cancelled` | A sheet closed without restarting | `sheet`, `reason`: `keep_playing` \| `run_ended` \| `paused` \| `left` |
| `rewarded_restart_failed` | The empty sheet's Watch did not end in a restart | `reason`: `unavailable` \| `cancelled` \| `failed` \| `run_ended` |

`rewarded_offer_shown` carries the placement `restart`, once per showing of the empty sheet.
The service's own `rewarded_started`, `rewarded_completed` and `rewarded_failed` fire as
they always have. **The values changed with daily restarts**: `sheet` `paid` became `daily`,
`cost` lost `heart`, `refill` and `premium` and gained `daily`, the `hearts` parameter became
`restarts_left`, and `no_heart` left `rewarded_restart_failed`. A report across the change
should split on the release.

Every restart from the puck continues the analytics run, and `restarts` on the result counts
it. Only Try again after a result ends the run (`level_abandoned` is not sent for it; the
result already closed it) and starts another.

## Files

| File | What it holds |
| --- | --- |
| `game/dailyRestarts.ts` | `RESTARTS.daily`, today's count, `spendRestart`, `useDailyRestart`; validated storage, `tiny-tempo.restarts.v1`, device-local |
| `game/replayTimer.ts` | `REPLAY_TIMERS`, `extendTimer`, `claimTimer`/`redeemTimer` (idempotent per claim id), `timerLeftMs`, `formatTimerLeft`, `shortTimerLeft`; validated storage, `tiny-tempo.replayTimer.v1`, device-local |
| `game/restart.ts` | `restartKind`, `liveSheet`, `attemptForStart`, `releaseAttempt`, `scoredResponseBegins`, `watchForRestart`, `watchForHeart`, `ticketStillApplies`, and Resume's `resumeTask`, `resumeLeadBeats`, `pauseTask`, `ceilingFor`; pure |
| `ui/restartSheet.ts` | The sheet, its copy (`dailyNote`), its pure layout, hit test and tap guard |
| `scenes/PlayScene.ts` | `requestRestart`, the sheet's lifecycle, `watchToRestart`, the puck's badge (`drawRestartCount`), `startRound(mode)` |
| `tests/restart.test.ts`, `tests/dailyRestarts.test.ts`, `tests/replayTimer.test.ts` | Heart and restart accounting, the rewarded restart, when a run has begun, the handover, the sheet and its picker, analytics, the allowance, the timer |

## Resume continues; an interruption cannot improve a task

Resume after an interruption used to play the level again from task 1 on the same attempt,
which made backgrounding the app a free way back to the start. It now continues the attempt
where it stopped (`resumeTask`): every finished task is kept, the analytics run carries on
(`continuing`, no `restarts`), and the task that was cut short replays from a fresh count-in
(`resumeLeadBeats`: its own lead-in, never less than the opening bar). A pause between two
tasks — the controller sits in `result` through the coda — continues at the next task.

Continuing on its own would have made a pause a free second go at the *current* task, so the
interrupted task is held to a ceiling: `scoreCeiling` is the most the cut-short pass could
still have made (every unjudged beat Perfect, every judged one as it was, every extra
charged), and `capRound` credits the replay no more than that. A second pause in the same
task keeps the lower ceiling (`pauseTask`). The marks and timing details stay as played; a
capped task is never flawless. A pass that finished nothing starts as it always did, teach
pass and introduction included, but its ceiling for task 1 still holds.

Groove is kept across the continuation, so a level mastered after a resume is mastered by the
same rule as any other — every task flawless in the one attempt, the same fact as a best of
100 — and the music comes back on the stems the pass had earned.

**Back and the map puck are one decision** (`levelBackAction`, read through `wayOut`): a
running level pauses first. The map puck used to leave in one tap from the middle of a task,
and `handleBack` counted the controller's `result` phase as stopped — which is also every coda
between tasks — so a single press there abandoned a paid attempt. `levelRunning` counts
`result` with no outcome yet as running.

## Not verified on a device

- **The rewarded ad on Android.** The video is a native full-screen activity. While it
  plays, the commerce lock keeps the visibility handler from pausing the level, as the play
  screen's Watch always has. Whether the WebView's audio clock keeps running or suspends
  behind the ad decides whether the run has moved on by the time the player returns. Either
  way the outcome is valid: the ticket check, and the result recorded if the run finished.
  But nobody has watched it happen on a handset.
- **The Play Billing sheet over a running level.** Same question, and now the one a
  replay timer bought from the picker goes through.
- **Backgrounding with the sheet open.** `interrupt` closes the sheet; checked by reading the
  code, not on a device.
- **The stall guard.** In the headless harness (software GL at 11 fps), the controller's own
  stall guard paused the level around the time the sheet opened. Drawing the sheet measured
  1–7 ms there, against the guard's 250 ms, so the harness's frame rate is the likely cause.
  It has not been checked on a device. If the run does pause, the sheet closes and Resume is
  the way on.
