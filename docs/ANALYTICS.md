# Analytics

Two families of event travel on one bus: the **commerce funnel** below, and the
**gameplay and progression** events that follow it (see
[Gameplay and progression events](#gameplay-and-progression-events)). Both share the
provider, the consent switch, the shaping rules and the crash-breadcrumb bridge, which is
why gameplay was added to this bus rather than given one of its own.

## Commerce

Ten commerce events were already fired at every offer, purchase and watch —
`health_empty`, `rewarded_offer_shown`, `purchase_completed` and the rest — and every
one of them was discarded. (An eleventh, `replay_timer_granted`, joined them with the
replay timers: `product` and `minutes_left`, the whole timer after the purchase added its
span, since purchases stack. The `product` on every purchase event is now one of the four
`replay_timer_*` ids or `heart_refill_full`; `tinytempo_premium` only ever appears on an
old event, since nothing offers it. A twelfth, `store_opened`, fires when the map's store card
opens — `source`, whether a `timer` was running, the `hearts` held and `premium` — and every
row the card shows fires `purchase_offer_shown`, as the restart sheet's picker does.)
`monetization/analytics.ts` was a typed bus with a default
sink that logs in DEV and does nothing in a production build, so the game would have
shipped a monetization funnel that nobody could see.

## What was already visible, and what was not

Worth being precise about, because it decides what this is for.

| Signal | Already reported by | Authority |
| --- | --- | --- |
| Purchases, revenue, conversion, refunds | Play Console | Store receipts — better than a client event |
| Rewarded impressions, eCPM, fill | AdMob dashboard | The ad server itself |
| **Offers shown, and who did not take them** | nothing | — |

So the gap was never "we cannot count purchases". It was the **top of the funnel**: how
many players ran out of hearts, how many saw an offer, and how many walked away from it.
That ratio is the number that says whether the price is wrong or the placement is, and
neither Play nor AdMob can see it because neither is present when a player declines.

## Shape

Three layers, the same split `diagnostics/` uses for crash reporting.

| Layer | File | What it is |
| --- | --- | --- |
| Bus | `src/monetization/analytics.ts` | Typed events, no provider. Commerce and gameplay names and payloads. |
| Ledger | `src/game/playAnalytics.ts` | What a level, the tutorial and practice report, and the one-shot rules. Pure, tested under node. |
| Rules | `src/analytics/eventShape.ts` | Firebase's name and parameter limits, as pure functions. No plugin import, unit-tested under node. |
| Vendor | `src/analytics/firebase.ts` | The Firebase adapter. The only file that knows the vendor. |
| Wiring | `src/analytics/boot.ts` | Attaches the provider on native, when a build asked for one. |
| Config | `src/config/analytics.ts` | Whether to attach, and the consent to start under. |

### It wraps the sink; it never replaces it

`diagnostics/boot.ts` has already installed a wrapper that turns every commerce event
into a crash breadcrumb, because a crash during a purchase is exactly the crash worth
reading. Replacing the sink would take that away **silently** — events would keep
flowing to Firebase, and the next crash report would simply arrive with no purchase
trail in it, which is not a failure anyone would notice. So `installAnalyticsProvider`
keeps the installed sink and calls both, and attaches after `installDiagnostics` so it
inherits the bridge rather than being wrapped by it.

A test asserts the order, because this is a one-line mistake with an invisible cost.

## What a bare `logEvent` does not do

**Firebase enforces its limits by discarding.** An event name that is too long, starts
with a reserved prefix, or carries a parameter Firebase dislikes is not rejected — it is
accepted and dropped. Nothing throws and nothing logs. You find out weeks later, when
somebody asks why a number looks low.

`eventShape.ts` is that check, moved somewhere it can be tested:

- **Names** — 40 characters, must start with a letter, letters/digits/underscores only,
  and none of the `firebase_`, `google_`, `ga_` prefixes Google reserves.
- **String values** — truncated to 100 characters rather than dropped, because a
  truncated product id still names the funnel step and a missing one does not.
- **Everything else** — booleans become 1/0 so a funnel can count them; objects, arrays,
  null, empty strings, `NaN` and `Infinity` are left out, since none has a
  representation Firebase keeps.
- **Parameter count** — capped at 25.

- **Reserved event names** — `error`, `session_start`, `app_update`, `first_open` and the
  rest of the names the SDK logs for itself (`RESERVED_EVENT_NAMES`).

Every event name and every payload key is asserted against these rules in
`tests/analytics.test.ts`, and the test fails if an event is added without being listed.
`tests/playAnalytics.test.ts` goes further for gameplay: it plays a scripted session that
reaches every gameplay event and checks each payload *as sent* passes `shapeParams`
unchanged. That is where the mistake is cheap; at runtime it is invisible.

**Re-check the numbers rather than trusting the comment.** These are Google Analytics for
Firebase's documented limits, and Google has changed them before. What will not change is
that exceeding one loses data quietly.

## Why the native plugin and not the Firebase JS SDK

`@capacitor-firebase/analytics` talks to the native SDK, so events arrive as **Android**
events and line up with Play Console and AdMob. The web SDK in a WebView reports as a web
data stream, which does not. The project already carried a native Capacitor plugin
(AdMob), so the plugin itself was not a new kind of dependency.

### The optional peer, and the stub

The plugin declares `firebase` as an **optional** peer and loads its web implementation
behind `() => import('./web')`. On Android the bridge is used and that chunk is never
fetched; in a browser `analytics/boot.ts` returns before the plugin is touched at all. So
the web path is unreachable on both platforms the game runs on — but the bundler still
has to resolve it, and `npm run build` failed with six `MISSING_EXPORT` errors until it
could.

Installing `firebase` to satisfy it would have put the entire JS SDK into a bundle that
would never call it. Instead `vite.config.ts` aliases `firebase/analytics` to
`src/analytics/firebaseWebStub.ts`, whose exports **throw** rather than no-op: if that
path is ever reached, something changed about how the plugin picks an implementation, and
a silent no-op would look exactly like analytics working.

Measured after the change: no Firebase JS SDK in any chunk, the vendor chunk is 1.5 kB,
and the main bundle grew by 0.36 kB. A browser build with `VITE_ANALYTICS=on` fetches
neither the vendor chunk nor the web stub, because the platform check comes first.

## Consent

Collection starts **denied** and is turned on only by `VITE_ANALYTICS_CONSENT=granted`.
`setConsent` is called before `setEnabled`, because the other order leaves a window,
however short, in which the SDK collects under a consent state nobody has set.

**The adapter also gates on its own side.** Denied consent turns the SDK's collection off,
but that is the SDK's promise; `firebase.ts` additionally refuses to hand any event across
the bridge while consent is not granted. The gate closes *before* the SDK is told of a
denial and opens only *after* the SDK has accepted a grant, and a slower grant that
resolves after a newer denial cannot reopen it. `tests/analyticsConsent.test.ts` stages
each of those orders against a mocked plugin.

**Nothing is collected before the game has read the answer.** Firebase starts collecting
the moment it is initialised unless the manifest holds it, and the game applies consent only
once its JavaScript has booted — so every launch used to send an app open and a session
before the player's answer was read. `AndroidManifest.xml` now sets
`firebase_analytics_collection_enabled` to false (Firebase's documented way to hold
collection until consent) and every `google_analytics_default_allow_*` consent-mode default
to false. `setFirebaseConsent` grants `analytics_storage` and re-enables collection at
runtime when the answer is yes; the advertising signals stay denied, because analytics
consent is never advertising consent. `scripts/check-android-config.mjs` warns if any of
the five goes missing.

**It does not use the AdMob consent *answer*, only its region.** `canRequestAds` answers a
question about *advertising*, not about analytics storage, and treating one as the other
is exactly the conflation the GDPR purpose rules exist to prevent. What the game does take
from UMP is *where the player is*: its first status at boot, `REQUIRED` or `OBTAINED` where
a consent message is shown (the EEA, the UK and Switzerland, for the GDPR message) and
`NOT_REQUIRED` elsewhere (`monetization/consentRegion.ts`, reported by `admob.ts` before any
form is shown). `analytics/startingConsent.ts` (pure) decides from it:

| The player's switch | Region | Collection this session |
| --- | --- | --- |
| Moved by the player (`analyticsChosen`) | any | what they chose |
| Never moved | regulated | **off**, and the switch is written off so Settings shows it |
| Never moved | unknown (no answer in 8 s, no network, no plugin) | off for this session; nothing written |
| Never moved | open | the build's default, `VITE_ANALYTICS_CONSENT` |

So a player in the EEA, the UK or Switzerland is asked nothing and sends nothing unless
they turn the switch on, and a player elsewhere starts where the build says.

One window remains, and it closes itself. Firebase keeps `setAnalyticsCollectionEnabled`
across launches, over the manifest's hold, so a grant an earlier build applied runs from
launch until this boot applies the new answer — up to `REGION_WAIT_MS`. That is the first
launch after updating, for a player in a regulated region who never moved the switch: the
boot then writes the switch off and denies collection natively, and every later launch is
held. Denying first on every launch would close it, at the cost of every granted player's
opening events; for the handful of closed-test installs this applies to, it was not worth it. **The region
comes from the UMP message configured in AdMob**: with no GDPR message there, UMP answers
`NOT_REQUIRED` everywhere and the regulated row never applies — configure it before a
public release. The privacy policy states this behaviour for a build with
`VITE_ANALYTICS_CONSENT=granted`; a build without it starts off everywhere, and the policy's
"elsewhere it starts on" would then be wrong.

### The switch

Settings → Privacy → **Share usage data**, wired to `setAnalyticsConsent`. The stored
answer is the source of truth and the SDK is told afterwards, in that order on purpose: a
consent call that cannot be delivered — no provider in this build, no network, a browser —
must not leave the switch showing something the save disagrees with, because the save is
what the next boot reads.

AdMob's own UMP privacy-options form is a different control, on the same Settings
section only while `privacyOptionsRequirementStatus` is `REQUIRED`. It does not
drive analytics consent, and the analytics switch does not drive ads.

`Settings.analytics` defaults to whatever `VITE_ANALYTICS_CONSENT` says, and a save
written before the switch existed falls back to the same default rather than being read as
a yes. `Settings.analyticsChosen` records whether the switch has ever been moved, so the
boot can tell a player's answer from a default; a save from before it reads as not chosen. That is the opposite of the rule `haptics` follows, and deliberately so: a missing
preference can be assumed, a missing consent cannot.

**Consent does not travel in a save code.** `SaveData.settings` is a
`Pick<Settings, 'calibrationMs' | 'muted' | 'music' | 'sfx' | 'haptics'>` so the compiler enforces it.
Consent belongs to a device and the jurisdiction its owner is in; restoring a code must
not answer that question on a phone whose owner was never asked it.

**What is left is account-side.** Configure the UMP GDPR message in AdMob, which is what
tells the game a player is in a region that asks for consent. If you would rather ask EEA
players for analytics consent in the UMP form itself than leave it off until they find the
switch, that is a change to the message and to `startingConsent` together — the switch is a
control, and an unchosen default in a regulated region is never treated as a yes.

## Turning it on

```
VITE_ANALYTICS=on               # attach the provider
VITE_ANALYTICS_CONSENT=granted  # start collecting (see Consent above)
android/app/google-services.json
```

All three are needed and none alone does anything. Capacitor's Gradle template applies
the `com.google.gms.google-services` plugin **only when `google-services.json` exists**,
so a build without it is not broken — it simply has no Firebase in it, and the adapter's
`try/catch` leaves the bus on the breadcrumb bridge.

### `google-services.json` is not committed

**This repository is public.** Google documents the file as safe to check in, and the key
inside it is extractable from any shipped APK, so it is not a secret in the usual sense.
But a Firebase API key is unrestricted until somebody restricts it, public repositories
are scraped for exactly this, and publishing it is irreversible while committing it later
is one line. So it is gitignored, like `.env`.

**Restrict the key in the Google Cloud console rather than relying on it staying hidden**
— an Android restriction (package name plus signing SHA-1) and an API restriction to the
services actually in use. The key ships in the APK either way; restriction is the only
thing that makes that safe, and it is worth doing whether or not the file is ever
committed.

The cost of not committing it is that a fresh clone builds an APK with no Firebase in it
and nothing says so. `scripts/check-android-config.mjs` runs after `cap sync` and says it
out loud, along with two neighbouring traps: a `google-services.json` from the **wrong**
Firebase app, which is worse than none because the plugin applies and every event is filed
under an app this is not, and the two copies of the AdMob app ID drifting apart. Warnings rather than errors, because a quick debug APK is a legitimate thing
to build without any of it — except on the release path. `npm run android:bundle` passes
`--release`, and then a build with `VITE_ANALYTICS=on` and no `google-services.json`, or one
whose file names another app, **refuses** instead. Version 0.1.9 reached Play with analytics
on and no Firebase in the bundle: every check was green, and the only symptom was a
dashboard that stayed empty.

## Gameplay and progression events

Nineteen events, fired from `src/game/playAnalytics.ts`, which PlayScene, TutorialScene and
MapScene call. The ledger is pure — no Phaser, no vendor — so each guarantee here is a unit
test rather than a hope. On a level that opens with a subdivision introduction,
`level_started` and `duration_ms` include it; its try is never a `task_completed`.

### What they answer

| Question | Read it from |
| --- | --- |
| Where do players stop progressing? | `level_started` with `mode = frontier`, by `level`: the last level each player started and never completed |
| Which levels fail unusually often? | `level_failed` ÷ (`level_completed` + `level_failed`), by `level`, `mode = frontier` |
| Where do retries increase? | `level_retried` count and `retry_count` on `level_completed`, by `level` |
| Do triplets and sixteenths spike difficulty? | `task_completed.accuracy` by `grid`, holding `level` or `bpm` steady; `level_failed.grid` |
| How often are old levels replayed? | `level_replayed`, or `level_started` with `mode = replay` |
| How often does a star rating improve? | `star_improved`, with `previous_stars` → `stars` |
| How often does a star gate block a player, and by how much? | `star_gate_reached` with `gate_short` and `unlocked`; `star_gate_opened` for the ones got through, with `replays`, `improvements` and `stars_gained` when this session saw the gate close |
| How many complete or skip the tutorial? | `tutorial_started` → `tutorial_completed` / `tutorial_skipped`, by `source` |
| Where in the tutorial do players drop off? | `tutorial_step_started` → `tutorial_step_ended` by `step` and `attempt`; the last `tutorial_step_started` with no end, completion or skip after it is where a player closed the app |
| How long from launch to the first scored tap? | `tutorial_started.since_launch_ms` (`source = first_play`) plus `elapsed_ms` on the first `tutorial_step_ended` for `along`, which is an upper bound; the target is about 30 s |
| Which task inside a failed level is hardest? | `level_failed.weakest_task`, and `task_completed.accuracy` by `task_index` |
| Which phrases cost players most? | `task_completed.accuracy` by `pattern`, against the mean of its `pattern_tier` |
| Is a failure the player or the device? | `task_completed.lean_ms` and `accuracy` by `route` and `offset_set`; a steady lean on an uncalibrated `bluetooth` route is latency, not rhythm |

### Schema

Every parameter is a number or a string from a small closed set — a handful of values at
most, every one named in this file. No tap
timestamp, no pattern, no id, no name and nothing about the device is sent. Indices are
**1-based** — `level`, `area`, `task_index`, `weakest_task` — so a dashboard reads the way
the game does. `area` is `floor((level - 1) / 10) + 1`.

The **level parameters** (`LevelParams`) ride on every level event:

| Parameter | Type | Meaning |
| --- | --- | --- |
| `level` | int | The level number |
| `area` | int | 1-based area; area 1 is levels 1–10 |
| `role` | 8 values | The level's step in its area: `opener`, `pattern`, `tempo`, `endurance`, `recovery`, `combination`, `challenge`, `finale` (`docs/DIFFICULTY.md`) |
| `task_count` | int | Tasks in the level |
| `bpm` | int | The level's peak tempo (its last task's) |
| `pattern_tier` | int | Highest pattern tier among its tasks, 0–4 |
| `grid` | `eighth` \| `triplet` \| `sixteenth` | The finest grid any task asks for. `eighth` is the tiers' own grid |
| `clear_accuracy` | int | Mean accuracy that clears it (one star) |
| `mode` | `frontier` \| `replay` | `replay` when the level was already cleared before this attempt |
| `previous_stars` | int | Stars the level held before this attempt, 0–3 |
| `retry_count` | int | Failed attempts on this level earlier in this app session, with no clear since |
| `heart_cost` | 0 \| 1 | Whether this attempt spent a heart |

| Event | Fires | Parameters |
| --- | --- | --- |
| `level_started` | An attempt's audio is running and its heart is settled. Once per attempt | Level parameters |
| `level_retried` | With `level_started`, when `retry_count ≥ 1` | Level parameters |
| `level_replayed` | With `level_started`, when `mode = replay` | Level parameters |
| `level_completed` | The level is scored and earned at least one star. Once per attempt | Level parameters, `accuracy`, `stars`, `duration_ms`, `restarts`, `weakest_task`, `weakest_accuracy` |
| `level_failed` | The level is scored and earned no star. Once per attempt | Level parameters, `accuracy`, `duration_ms`, `restarts`, `weakest_task`, `weakest_accuracy` |
| `level_abandoned` | The player leaves an unfinished attempt (the map puck, or the scene going away mid-level) | Level parameters, `task_index` (the task left during), `duration_ms`, `restarts` |
| `task_completed` | A task is judged to its end. Once per task per pass | `level`, `area`, `mode`, `task_index`, `task_count`, `bpm`, `pattern_tier`, `grid`, `accuracy`, `perfect`, `good`, `miss`, `extra`, `flawless`, `error_ms`, `pattern`, `lean_ms`, `route`, `offset_set` |
| `star_improved` | A cleared **replay** earns more stars than the level held. A first clear is not an improvement | `level`, `area`, `stars`, `previous_stars`, `accuracy`, `gate_have` |
| `star_gate_reached` | The map opens with the frontier held by a star gate. Once per gate per app session — the first time that gate is met | `area` (the one the gate opens), `level` (its first), `gate_required`, `gate_have`, `gate_short`, `unlocked` (highest level the save may start) |
| `star_gate_opened` | A result lifts the gate that was holding the frontier | `area`, `level`, `gate_required`, `gate_have`, `unlocked`. When this session already sent `star_gate_reached` for that gate: `replays`, `improvements`, `stars_gained` — the ledger's own events in between, not a stored session |
| `area_opened` | The player taps a ready gate open on the map: the unlock plays and the area's badge is stamped (`game/areaGates.ts`, `docs/STAR_GATES.md`). After `star_gate_opened`, which is when the stars met the ask | `area`, `level`, `gate_have` |
| `tutorial_started` | TutorialScene is entered | `source` (`first_play` \| `menu`), `repeat` (1 when already completed once), `since_launch_ms` (the page clock: on a cold start, roughly launch to lesson; meaningful for `first_play`) |
| `tutorial_step_started` | A pass of the lesson begins: the opening tap-along, a try on their own, or *Watch again* | `step` (`along` \| `try` \| `watch`), `attempt` (that step's passes this visit, from 1), `resumed` (1 when an interruption restarted the same attempt), `elapsed_ms` (since the visit began), `repeat` |
| `tutorial_step_ended` | A pass runs to its end | `step`, `attempt`, `verdict` (`clear` \| `early` \| `silent` \| `partial`, or `watched` for *Watch again*), `hits`, `elapsed_ms`, `repeat` |
| `tutorial_completed` | *Let's play* | `tries`, `passed` (0 when the lesson offered the way on without a clear try), `duration_ms`, `repeat` |
| `tutorial_skipped` | *Skip* | `step` (`along` \| `try` \| `watch` \| `done`), `tries`, `duration_ms`, `repeat` |
| `concept_intro_shown` | A new rhythm's introduction begins (`docs/SUBDIVISIONS.md`). Shown again if the player leaves before a try is judged. Was `subdivision_intro_shown`, renamed before any event reached a dashboard | `concept` (`offbeat` \| `longPhrase` \| `triplet` \| `sixteenth`), `level`, `mode` |
| `concept_intro_completed` | The introduction hands over to the level. Once per showing | `concept`, `level`, `tries` (1 or 2), `accuracy` (the better try, never counted toward the level), `passed` |
| `scrapbook_opened` | The Scrapbook opens (`docs/SCRAPBOOK.md`) | `source` (`menu` \| `map`), `owned`, `total` |
| `collectible_unlocked` | A finished level earns its keepsake: three stars where it had fewer. Once per keepsake per session; never for keepsakes a save already owned | `vignette` (28 act ids), `collectible` (keepsake id), `level`, `first` (the device's first, with the longer note), `owned` |
| `area_finale_started` | An area finale's attempt begins (`docs/FINALES.md`), beside its `level_started`. Once per attempt: Resume and every restart from the puck continue it; Try again is a new attempt | `level`, `area`, `treatment` (`grass` \| `pavement` \| `sand` \| `snow` \| `dusk` \| `garden` \| `swamp` \| `village` \| `castle` \| `default`), `mode`, `retry_count`, `heart_cost` |
| `level_mastered` | A level's **first** IN THE POCKET run: every scored task flawless, on a level the save did not already hold at 100 (`docs/MASTERY.md`), beside its `level_completed`. Never on a flawless replay of a mastered level, never on map render | `level`, `area`, `vignette`, `mode`, `task_count`, `accuracy`, `stars` |
| `restart_requested` | The restart puck reached the restart flow mid-level (`docs/RESTART.md`) | `level`, `area`, `placement` (`restart`), `restarts_left`, `premium`, `timer` (a replay timer running), `sheet` (`none` \| `free` \| `daily` \| `empty` \| `timers`) |
| `restart_confirmed` | A restart is going ahead. Once per restart, however it was paid for | `level`, `area`, `placement`, `restarts_left` (today's, after this one), `premium`, `timer`, `cost` (`free` \| `daily` \| `rewarded` \| `timer`, the last a timer bought on the sheet) |
| `restart_cancelled` | A restart sheet closed without restarting | `level`, `area`, `placement`, `restarts_left`, `premium`, `timer`, `sheet`, `reason` (`keep_playing` \| `run_ended` \| `paused` \| `left`) |
| `rewarded_restart_failed` | The no-restarts sheet's Watch did not end in a restart. `run_ended`: the run had moved on, and nothing is kept | `level`, `area`, `placement`, `reason` (`unavailable` \| `cancelled` \| `failed` \| `run_ended`) |
| `area_finale_completed` | The finale cleared, beside its `level_completed`, from the same single close | `level`, `area`, `treatment`, `mode`, `stars`, `accuracy` |
| `area_finale_failed` | The finale scored under its clear bar, beside its `level_failed` | `level`, `area`, `treatment`, `mode`, `accuracy` |
| `objective_progress` | A daily objective moved without finishing (`docs/OBJECTIVES.md`). Once per objective per finished level — a level of twenty Perfects is one event, never twenty | `objective` (pool id), `slot` (1–3), `progress`, `target` |
| `objective_completed` | A daily objective reached its target, in place of its progress event | `objective`, `slot`, `target`, `completed` (finished today, 1–3) |
| `daily_objectives_all_completed` | The day's third objective finished and the day was stamped. Once per local day | `stamps` (total held), `week` (stamped days of the last seven) |
| `leaderboard_score_submitted` | Play Games accepted a Daily Tempo best (`docs/LEADERBOARDS.md`). Only a score that beat the day's best is ever sent | `leaderboard` (`daily_tempo`), `accuracy` (rounded %), `new_best` (Play Games' own daily-best flag), `retry` (a kept best sent later) |
| `leaderboard_submit_failed` | A submission Play Games did not accept. The best is kept and retried. Never sent for a signed-out player, a browser or an unconfigured build — nothing was attempted | `leaderboard`, `reason` (`offline` \| `timeout` \| `failed` \| `invalid` \| `unavailable`), `retry` |
| `leaderboard_opened` | The leaderboard button was tapped, whatever came of it | `leaderboard`, `result` (`shown` \| `signed_out` \| `failed` \| `invalid` \| `unavailable` \| `unconfigured`), `sign_in` (the tap had to offer sign-in first) |
| `reminder_offer_shown` | The daily reminder's one-time offer opened on the map (`docs/REMINDERS.md`) | `stamps` |
| `reminder_offer_closed` | The offer closed | `choice` (`remind` \| `not_now` \| `back`) |
| `reminder_permission` | The player asked for the reminder, and what Android answered | `source` (`offer` \| `settings`), `result` (`granted` \| `denied`) |
| `reminder_disabled` | The reminder switched off in Settings | `source` (`settings`) |
| `calibration_measured` | A Tap offset run finished (`docs/UI_REFINEMENTS.md`) | `route`, `outcome` (`measured` \| `few_taps` \| `uneven`), `offset_ms` (proposed; 0 on a failure), `spread_ms`, `reported_ms` (the platform's own lag), `check` (a run against an offset kept this visit) |
| `calibration_kept` | A measured offset was kept for its route | `route`, `offset_ms`, `change_ms`, `check` |
| `practice_started` | Reserved: no practice mode exists yet | `level` |
| `practice_completed` | Reserved | `level`, `accuracy`, `duration_ms` |

On a task: `accuracy` is the task's own, rounded 0–100; `perfect`, `good`, `miss` and
`extra` are counts; `flawless` is 1 when every beat was Perfect and no extra was tapped, the
same test the *Flawless!* strike and mastery apply (it used to ignore extras, and counted
tasks the game did not celebrate); `error_ms` is the mean absolute timing error of the landed
taps, rounded, and **absent** when nothing landed rather than sent as a misleading zero.
`pattern` is the phrase's id; `lean_ms` the **median** signed error of the landed taps
(negative early, absent when nothing landed), the same lean the timing details show;
`route` the audio route the task was heard through and `offset_set` whether that route has a
Tap offset of its own — the two that separate a device's latency from a hard phrase. A task
cut short by a pause and replayed reports its credited accuracy (`docs/RESTART.md`).
On a level result, `duration_ms` is wall-clock from the start of the pass that finished
(a restart resets it), `accuracy` is the same mean the save used, and `weakest_task` is
the lowest-accuracy task of that pass, earliest on a tie.

### One report per thing that happened

- **An attempt is PlayScene's heart attempt id.** Resume after a pause and a free restart
  are the same attempt by the heart rules, so they continue the run instead of firing a
  second `level_started`. A free restart, and a Resume before any task finished, go round
  again from task 1 and `restarts` counts them; a Resume after a finished task carries on
  from the task it stopped in (`continuing`), keeps the tasks already reported and is not a
  restart. Every restart from the puck — free, a daily restart or a rewarded one — is the same
  attempt from task 1 and counts in `restarts`; only Try again after a result is a new attempt
  (`docs/RESTART.md`). A finished or abandoned id is never reopened.
- **`level_completed` / `level_failed` fire from `recordOutcome`,** the one step every
  finished run passes exactly once — including the run whose coda a notification
  interrupts, which is why it is not the summary. The ledger closes the run as well, so a
  second call cannot report twice even if the scene's own guard were lost.
- **A task is reported once per pass.** A resumed attempt goes back to task 1 and plays its
  tasks again; those plays are real and are reported, and `restarts` on the result says
  how many passes there were. They are rare, but a per-task report that must exclude them
  can use `level_completed.restarts = 0` runs.
- **Scene recreation.** Phaser reuses a scene instance, so field initializers do not run on
  a second visit. PlayScene's `build()` now clears the attempt id, outcome and run, which
  is also what stops a stale Resume id from a level the player walked away from reaching
  the ledger. The ledger itself is module state and outlives every scene.
- **Session scope.** `retry_count`, the gate dedupe and the three counters between a
  closed gate and its opening live in memory and reset with the process. Nothing new is
  stored, so there is no new storage key for Auto Backup to carry and nothing for a save
  code to leak. The counters are the ledger's own `level_replayed` and `star_improved`
  events, not a second record of the session.

- **A finale reports twice as much, never twice as often.** Its `area_finale_*` events
  ride beside the level's own, from the same `beginLevel` and the same close, so a finale
  funnel is a filter on one event name while every level report stays complete. An
  abandoned finale sends `level_abandoned` and no finale result.

`level_started` − (`level_completed` + `level_failed` + `level_abandoned`) is the number of
attempts cut off by the app being killed mid-level — there is no reliable moment to report
those, and none is attempted.

### Never at the game's expense

Every public method of the ledger swallows its own failure, and the bus already swallows
the sink's; `tests/playAnalytics.test.ts` drives a whole session through a sink and a clock
that both throw. Nothing in a level waits on analytics: `track` is synchronous and the
Firebase call is fire-and-forget.

### The breadcrumb trail

The crash-breadcrumb bridge now forwards every event **except `task_completed`**. The trail
is a ring of 24, and a level fires up to eight task events — enough to push the purchase
that caused a crash off the report meant to explain it. PlayScene already writes its own
`level started` / `level finished` breadcrumbs, which is the gameplay a crash report needs.

### Setting it up in Firebase

Custom event parameters are collected without any console work, but **GA4 only shows them
in standard reports and Explorations once they are registered** as custom definitions
(Admin → Custom definitions), and registration is not retroactive. Register dimensions for
the parameters used to group — `level`, `area`, `role`, `vignette`, `collectible`, `treatment`, `objective`, `slot`, `mode`, `grid`, `pattern_tier`, `task_index`,
`weakest_task`, `source`, `step`, `stars`, `previous_stars` — and metrics for the ones
averaged — `accuracy`, `duration_ms`, `retry_count`, `gate_short`, `gate_have`, `replays`, `stars_gained`, `weakest_accuracy`,
`restarts`, `error_ms`. GA4 caps custom definitions per property (at the time of writing,
50 event-scoped dimensions and 50 metrics on a standard property); check the current limit
before registering everything. The BigQuery export, if it is linked, carries every
parameter without registration.

## Not verified

- **No event has ever reached a Firebase project.** The project now exists and its
  `google-services.json` is in place for `com.tinytempo.app`, so a release build will
  carry Firebase — but there is no Android SDK on this machine to build an APK with, so
  nothing has been run. What was verified is the shaping, the composition order, the
  chunking, the browser's refusal to load any of it, and that Gradle's conditional apply
  now resolves true.
- **DebugView is the check to run first.** `adb shell setprop debug.firebase.analytics.app
  <package>` then watch DebugView in the Firebase console: Firebase batches events for up
  to an hour otherwise, and a first look at an empty dashboard proves nothing.
- **No gameplay event has reached Firebase either.** The ledger, the scene wiring and the
  consent gate are tested under node; the path through the native plugin is the same one
  the commerce events take and is just as unexercised on a device.
- No user properties and no user id are set. The game has no accounts, and an id would be
  a new category of data in the privacy policy for no question anyone is asking.
