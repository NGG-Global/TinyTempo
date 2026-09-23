# Analytics

Two families of event travel on one bus: the **commerce funnel** below, and the
**gameplay and progression** events that follow it (see
[Gameplay and progression events](#gameplay-and-progression-events)). Both share the
provider, the consent switch, the shaping rules and the crash-breadcrumb bridge, which is
why gameplay was added to this bus rather than given one of its own.

## Commerce

Ten commerce events were already fired at every offer, purchase and watch —
`health_empty`, `rewarded_offer_shown`, `purchase_completed` and the rest — and every
one of them was discarded. `monetization/analytics.ts` was a typed bus with a default
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

**It is deliberately not wired to the AdMob consent flow.** The game already runs
Google's UMP form for ads, and `canRequestAds` is tempting to reuse — but it answers a
question about *advertising*, not about analytics storage, and treating one as the other
is exactly the conflation the GDPR purpose rules exist to prevent. `setFirebaseConsent`
exists so a real consent signal can be connected when there is one.

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
a yes. That is the opposite of the rule `haptics` follows, and deliberately so: a missing
preference can be assumed, a missing consent cannot.

**Consent does not travel in a save code.** `SaveData.settings` is a
`Pick<Settings, 'calibrationMs' | 'muted' | 'haptics'>` so the compiler enforces it.
Consent belongs to a device and the jurisdiction its owner is in; restoring a code must
not answer that question on a phone whose owner was never asked it.

**This is still not a finished consent story.** Shipping analytics to EEA users needs the
UMP message configured to cover analytics purposes, or analytics left off there — the
in-app switch is a control, not a lawful basis. That is account-side work; see the release
checklist.

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
under an app this is not, and the two copies of the AdMob app ID drifting apart. Warnings
rather than errors, because a quick debug APK is a legitimate thing to build without any
of it.

## Gameplay and progression events

Fifteen events, fired from `src/game/playAnalytics.ts`, which PlayScene, TutorialScene and
MapScene call. The ledger is pure — no Phaser, no vendor — so each guarantee here is a unit
test rather than a hope.

### What they answer

| Question | Read it from |
| --- | --- |
| Where do players stop progressing? | `level_started` with `mode = frontier`, by `level`: the last level each player started and never completed |
| Which levels fail unusually often? | `level_failed` ÷ (`level_completed` + `level_failed`), by `level`, `mode = frontier` |
| Where do retries increase? | `level_retried` count and `retry_count` on `level_completed`, by `level` |
| Do triplets and sixteenths spike difficulty? | `task_completed.accuracy` by `grid`, holding `level` or `bpm` steady; `level_failed.grid` |
| How often are old levels replayed? | `level_replayed`, or `level_started` with `mode = replay` |
| How often does a star rating improve? | `star_improved`, with `previous_stars` → `stars` |
| How often does a star gate block a player, and by how much? | `star_gate_reached` with `gate_short`; `star_gate_opened` for the ones got through |
| How many complete or skip the tutorial? | `tutorial_started` → `tutorial_completed` / `tutorial_skipped`, by `source` |
| Which task inside a failed level is hardest? | `level_failed.weakest_task`, and `task_completed.accuracy` by `task_index` |

### Schema

Every parameter is a number or a string from a closed set of at most three values. No tap
timestamp, no pattern, no id, no name and nothing about the device is sent. Indices are
**1-based** — `level`, `area`, `task_index`, `weakest_task` — so a dashboard reads the way
the game does. `area` is `floor((level - 1) / 10) + 1`.

The **level parameters** (`LevelParams`) ride on every level event:

| Parameter | Type | Meaning |
| --- | --- | --- |
| `level` | int | The level number |
| `area` | int | 1-based area; area 1 is levels 1–10 |
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
| `task_completed` | A task is judged to its end. Once per task per pass | `level`, `area`, `mode`, `task_index`, `task_count`, `bpm`, `pattern_tier`, `grid`, `accuracy`, `perfect`, `good`, `miss`, `extra`, `flawless`, `error_ms` |
| `star_improved` | A cleared **replay** earns more stars than the level held. A first clear is not an improvement | `level`, `area`, `stars`, `previous_stars`, `accuracy`, `gate_have` |
| `star_gate_reached` | The map opens with the frontier held by a star gate. Once per gate per app session | `area` (the one the gate opens), `level` (its first), `gate_required`, `gate_have`, `gate_short` |
| `star_gate_opened` | A result lifts the gate that was holding the frontier | `area`, `level`, `gate_required`, `gate_have` |
| `tutorial_started` | TutorialScene is entered | `source` (`first_play` \| `menu`), `repeat` (1 when already completed once) |
| `tutorial_completed` | *Let's play* | `tries`, `passed` (0 when the lesson offered the way on without a clear try), `duration_ms`, `repeat` |
| `tutorial_skipped` | *Skip* | `step` (`watch` \| `try` \| `done`), `tries`, `duration_ms`, `repeat` |
| `practice_started` | Reserved: no practice mode exists yet | `level` |
| `practice_completed` | Reserved | `level`, `accuracy`, `duration_ms` |

On a task: `accuracy` is the task's own, rounded 0–100; `perfect`, `good`, `miss` and
`extra` are counts; `flawless` is 1 when every beat was Perfect, the same test the
*Flawless!* strike applies; `error_ms` is the mean absolute timing error of the landed
taps, rounded, and **absent** when nothing landed rather than sent as a misleading zero.
On a level result, `duration_ms` is wall-clock from the start of the pass that finished
(a restart resets it), `accuracy` is the same mean the save used, and `weakest_task` is
the lowest-accuracy task of that pass, earliest on a tie.

### One report per thing that happened

- **An attempt is PlayScene's heart attempt id.** Resume after a pause and the restart
  puck are the same attempt by the heart rules, so they continue the run — `restarts`
  counts them — instead of firing a second `level_started`. A finished or abandoned id is
  never reopened.
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
- **Session scope.** `retry_count` and the gate dedupe live in memory and reset with the
  process. Nothing new is stored, so there is no new storage key for Auto Backup to carry
  and nothing for a save code to leak.

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
the parameters used to group — `level`, `area`, `mode`, `grid`, `pattern_tier`, `task_index`,
`weakest_task`, `source`, `step`, `stars`, `previous_stars` — and metrics for the ones
averaged — `accuracy`, `duration_ms`, `retry_count`, `gate_short`, `weakest_accuracy`,
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
