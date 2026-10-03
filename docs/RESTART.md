# Restart

**One heart is one real attempt at an unfinished frontier level.** Before this change, the
restart puck continued the attempt it was pressed on: the level started over on the same
attempt id and the heart that id had already spent. On a frontier level that meant
unlimited free retries for as long as the player kept pressing it before the result.

Now a restart before the player's first scored response is still free. A restart after it
ends the attempt and begins a new one, which costs a heart through `beginAttempt` like any
other attempt. The player is told which one it will be before anything is spent.

Resume is unchanged. After an interruption it continues the same attempt and never costs a
heart.

## The states

`restartKind` in `game/restart.ts` decides the puck's behaviour. It is pure:

| Kind | When | The puck does |
| --- | --- | --- |
| `try_again` | The level's result is recorded | What the result's Try again does: a new attempt. No sheet. |
| `immediate` | A finished level, a protected level (1–5), Premium, or no attempt yet | Restarts at once, free, on the same attempt. No sheet. |
| `confirm_free` | A frontier attempt before its first scored response | **Restart from the beginning? / No heart will be used.** Restart · Keep playing |
| `confirm_paid` | A frontier attempt after its first scored response, with a heart | **Restart level? / This run will end. Restarting uses 1 heart.** Restart (♥ 1 chip) · Keep playing |
| `out_of_hearts` | The same, with no heart | **Out of hearts / Get a heart and restart this level.** Watch ad & Restart (♥ +1 chip) · Refill 5 hearts · ∞ Unlimited hearts · Keep playing |

With no attempt yet (the first start still loading, or the empty-hearts screen), the puck
is a start, gated like any other.

The sheet (`ui/restartSheet.ts`) is a cream card in the game's own panels: the coral block
for the action, bench wood for the refill and Keep playing, brass for Premium. The heart is
drawn on a chip, the same way the play screen's Watch block draws its +1. It stands above
the player's rows, so the run stays readable behind it.

**The run keeps running behind the sheet.** Opening it pauses nothing, ends nothing and
spends nothing. A tap off the card is still the player's beat. A tap on the card's face does
nothing.

**The sheet follows the run, and never acts on a stale reading.** Every half second, and
the moment the scored response begins, `liveSheet` is re-read:

- a free sheet becomes the paid one when the response begins;
- an empty sheet becomes the paid one when a heart regenerates (the ad is never offered
  while a heart is there);
- either becomes the free one, which never mentions a heart, if Premium arrives;
- the sheet closes when the result is recorded.

After any change the sheet ignores taps for `RESTART_SHEET_ARM_SEC` (0.45 s), so a thumb
already on its way cannot land on a button it did not read. Confirm also re-checks before it
acts: if the run no longer matches what the sheet says, the sheet changes and asks again.

## Attempt ids: Resume vs Restart

`PlayScene.startRound(mode)` names its mode explicitly (`attemptForStart`). It no longer
infers it from whether a result exists.

| Mode | Used by | Attempt |
| --- | --- | --- |
| `resume` | Resume, Retry after a failed audio start, the first start, the empty screen's Today/Watch/Refill/Premium | Continues the unfinished attempt; a finished one is never resumed |
| `free_restart` | The free sheet, and every `immediate` restart | The same attempt from task 1 |
| `new_attempt` | The paid sheet, the empty sheet after a heart is found, Try again and the replay block after a result | Ends the attempt in hand, and a new id spends at the next downbeat |

**A new attempt is ended once, before anything can fail.** `releaseAttempt`
(`abandonAttempt`) runs synchronously, before the audio unlocks. The heart the old attempt
spent stays spent, and the old attempt now holds nothing, so it can never be refunded. The
analytics run is abandoned in the same step. Once the audio runs, `beginAttempt` on the new
id spends exactly one heart.

If the audio then fails, no attempt holds a heart and the player still has the one they were
about to spend. Retry spends it.

**When the scored response begins.** `PlayScene.scoredResponseBegun` is set when the
controller enters `respond`, or judges a tap, on a task that counts (`scoredResponseBegins`).
The controller judges nothing earlier than the Good window before the response, so a judged
tap means the response has begun. These never set it:

- the first-run demonstration pass (`teach`);
- a finer grid's introduction (`intro`);
- the DEV rehearsal.

Only a new attempt clears it. Resume keeps it, because the attempt it continues has already
been played.

## The rewarded restart

Watch ad & Restart reuses the same rewarded video and the same one-heart grant as the play
screen's Watch and the map's: `watchForHeart` → `monetization().showRewarded()` →
`redeemHeart(claimId)`. All three placements now go through `watchForHeart`. There is no
restart token and no new product.

The sequence is: reward confirmed → one heart granted → old attempt ended → new attempt
begins and spends that heart → the level restarts. The player never presses Restart again.
The balance ends where it started, with a fresh attempt.

| Case | Hearts | Attempt | Restart |
| --- | --- | --- | --- |
| Reward confirmed, same run | +1, then −1 | new | yes |
| Ad unavailable, closed early, failed or threw | unchanged | unchanged | no; the sheet says why (`rewardedFeedback`) |
| Reward confirmed, but the run finished, paused or was replaced meanwhile | +1, kept | unchanged | no |
| Reward confirmed, scene gone | +1, kept | already abandoned by the scene's shutdown | no |
| Reward confirmed, audio fails on restart | +1, kept | old ended, none held | no; Retry spends the heart |

The checks that guard this:

- the commerce lock, so only one watch is out at a time;
- a fresh `restart:N` claim id, which `claimHeart` grants once whatever the SDK fires;
- a `RestartTicket` (attempt id and start request, checked by `ticketStillApplies`), so a
  reward that returns after a pause, a result or another start restarts nothing.

Refill and Premium from the empty sheet use the same purchase and the same `redeemFill` as
the play screen's offers. On success they restart: a refill spends one of its five hearts,
Premium spends none.

## Analytics

All on the gameplay bus, through `playAnalytics`. Each carries `level`, `area`,
`placement` (`restart`), `hearts` (held when it happened) and `premium` (0/1). Nothing about
the device or the player.

| Event | Fires | Adds |
| --- | --- | --- |
| `restart_requested` | The puck reached the restart flow | `sheet`: `none` (free level, Premium) \| `free` \| `paid` \| `empty` |
| `restart_confirmed` | A restart is going ahead. Once per restart | `cost`: `free` \| `heart` \| `rewarded` \| `refill` \| `premium` |
| `restart_cancelled` | A sheet closed without restarting | `sheet`, `reason`: `keep_playing` \| `run_ended` \| `paused` \| `left` |
| `rewarded_restart_failed` | The empty sheet's Watch did not end in a restart | `reason`: `unavailable` \| `cancelled` \| `failed` \| `no_heart` \| `run_ended` |

`rewarded_offer_shown` gains the placement `restart`, once per showing of the empty sheet.
The service's own `rewarded_started`, `rewarded_completed` and `rewarded_failed` fire as
they always have. The funnel is distinguished as follows:

- **Free restart:** `restart_confirmed.cost = free`.
- **Paid-heart restart:** `cost = heart`.
- **Rewarded restart completed:** `cost = rewarded`.
- **Rewarded restart failed or cancelled:** `rewarded_restart_failed`.

The placement is `restart` rather than `mid_level_restart` because gameplay strings stay
within twelve characters (`tests/playAnalytics.test.ts`).

A paid restart ends the analytics run (`level_abandoned`) and the new attempt starts its own
(`level_started`). A free restart continues the run, and `restarts` counts it, as before.

## Files

| File | What it holds |
| --- | --- |
| `game/restart.ts` | `restartKind`, `liveSheet`, `attemptForStart`, `releaseAttempt`, `scoredResponseBegins`, `watchForHeart`, `ticketStillApplies`; pure |
| `ui/restartSheet.ts` | The sheet, its copy, its pure layout, hit test and tap guard |
| `scenes/PlayScene.ts` | `requestRestart`, the sheet's lifecycle, `watchToRestart`, `buyToRestart`, `startRound(mode)` |
| `tests/restart.test.ts` | Heart accounting, the rewarded restart, when a run has begun, the handover, the sheet, analytics |

## Known gap, unchanged on purpose

Resume after an interruption plays the level again from task 1 on the same attempt. That is
existing behaviour, and this change deliberately leaves it alone. It means backgrounding the
app mid-run and resuming is still a way back to the start at no cost.

## Not verified on a device

- **The rewarded ad on Android.** The video is a native full-screen activity. While it
  plays, the commerce lock keeps the visibility handler from pausing the level, as the play
  screen's Watch always has. Whether the WebView's audio clock keeps running or suspends
  behind the ad decides whether the run has moved on by the time the player returns. Either
  way the outcome is valid: the ticket check, and the result recorded if the run finished.
  But nobody has watched it happen on a handset.
- **The Play Billing sheet over a running level.** Same question.
- **Backgrounding with the sheet open.** `interrupt` closes the sheet; checked by reading the
  code, not on a device.
- **The stall guard.** In the headless harness (software GL at 11 fps), the controller's own
  stall guard paused the level around the time the sheet opened. Drawing the sheet measured
  1–7 ms there, against the guard's 250 ms, so the harness's frame rate is the likely cause.
  It has not been checked on a device. If the run does pause, the sheet closes and Resume is
  the way on.
