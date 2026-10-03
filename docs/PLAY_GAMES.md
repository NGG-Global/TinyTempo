# Play Games Services

Play Games Services v2 on the Android build: the SDK is initialized, the player is signed
in where the platform allows it, the web layer can ask who they are, and progression
follows the player through Saved Games (`docs/CLOUD_SAVE.md`).

**Play Games is never required to play Tiny Tempo.** A device with no Play Games app, no
network, no Google account, or a player who declines, reaches the menu and plays exactly
as before. Local progress, the save code, hearts and purchases are untouched by any of it.

## What is where

| Piece | File |
| --- | --- |
| Dependency (pinned) | `android/variables.gradle`, `android/app/build.gradle` |
| Games project id | `android/app/src/main/res/values/strings.xml` |
| `APP_ID` meta-data | `android/app/src/main/AndroidManifest.xml` |
| `PlayGamesSdk.initialize` | `android/app/src/main/java/com/tinytempo/app/TinyTempoApplication.java` |
| Native bridge | `android/app/src/main/java/com/tinytempo/app/PlayGamesPlugin.java` |
| Plugin registration | `android/app/src/main/java/com/tinytempo/app/MainActivity.java` |
| Adapter (pure, tested) | `src/playgames/playGames.ts` |
| Bridge + validation | `src/playgames/native.ts` |
| Native-only gate | `src/playgames/boot.ts` |
| Configuration checks | `scripts/check-android-config.mjs` |

## v2 only

`com.google.android.gms:play-services-games-v2:22.1.0`, pinned rather than `+` for the
same reason the Billing version is: a dynamic version makes two builds of one commit
differ, and this is an authentication path.

The deprecated v1 SDK (`com.google.android.gms:play-services-games`) is **not** present and
must not be added — the two do not belong in the same build. Verified from the artifact's
own pom: v2 pulls `play-services-base`, `play-services-basement` and `play-services-tasks`
and nothing else. `scripts/check-android-config.mjs` fails a build that declares v1, and
looks at dependency lines only so the comments warning against it do not trip it.

Legacy `GoogleSignIn` / `GoogleSignInClient` are not used either. v2 has no interactive
sign-in client to drive: it attempts authentication itself when the SDK initializes, and
`GamesSignInClient.signIn()` is a retry, not the primary path.

## The project id

`@string/game_services_project_id` is `863268283344` — the **numeric Play Games Services
project id** from the Play Console. It is none of the other identifiers this app carries,
and each wrong one fails the same silent way: the SDK starts, authentication never
succeeds, and there is no UI to say so.

- Not the OAuth client id
- Not the Google Cloud textual project id
- Not the Firebase App ID (`google-services.json`)
- Not the AdMob app id (`@string/admob_app_id`, a different string in the same file)

It reaches the SDK through the manifest, which is read before any JavaScript runs:

```xml
<meta-data
    android:name="com.google.android.gms.games.APP_ID"
    android:value="@string/game_services_project_id" />
```

`scripts/check-android-config.mjs` pins the literal value, the meta-data's presence, the
Application class and the plugin registration — the same discipline the AdMob id already
gets, and for the same reason: every one of these compiles and installs whatever it says.

## Initialization

`PlayGamesSdk.initialize(this)` runs in `TinyTempoApplication.onCreate()`, which is where
Google's v2 integration guide puts it.

The Application class exists for that and nothing else. Everything else this app starts is
started where it already belongs — Capacitor and Billing from `MainActivity`, Firebase
from its own init provider, AdMob and Sentry from the web layer's boot — and none of it
moved. A throw inside `initialize` is caught: Play Games is the one capability this app is
explicitly allowed to be without, and taking the process down for it would be the worst
possible trade.

`cap sync` regenerates `MainActivity` from its own template if the file is ever lost,
which would drop both plugin registrations with it. That is why the check script looks.

## The interface the game has

```ts
import { playGames } from '@/playgames/boot';

playGames().status              // { authenticated, player, reason }, no platform call
await playGames().refresh()     // has v2's automatic sign-in already succeeded?
await playGames().signIn()      // the manual retry; may show Play's own UI
await playGames().player()      // { playerId, displayName } | null, fetched once
await playGames().submitScore(id, score, tag)   // { submitted, newBest, reason }; never prompts
await playGames().showLeaderboard(id, 'daily')  // { shown, reason }; Play's own screen
await playGames().unlockAchievement(id)         // { sent, reason }; queued offline, repeats harmless
await playGames().showAchievements()            // { shown, reason }; Play's own screen
await playGames().readSnapshot(name)            // { kind: 'data' | 'conflict' | 'failed', ... }
await playGames().writeSnapshot(name, payload)  // { kind: 'committed' | 'conflict' | 'failed' }
await playGames().resolveSnapshot(id, payload)  // { kind: 'resolved' | 'conflict' | 'failed' }
```

The two leaderboard calls are v2's `LeaderboardsClient` (`submitScoreImmediate`,
`getLeaderboardIntent`) and resolve like the rest, as do the achievement calls on
`AchievementsClient` (`unlock`, `getAchievementsIntent`; see `docs/ACHIEVEMENTS.md`). Scenes do not call them directly: the
Daily Tempo leaderboard goes through `playgames/dailyTempo.ts`, which owns the id, the best
score and the retry (`docs/LEADERBOARDS.md`), and the three snapshot calls are made only by
`playgames/cloudSave.ts`, which owns the payload, the merge and the account binding
(`docs/CLOUD_SAVE.md`). The plugin opens snapshots with `RESOLUTION_POLICY_MANUAL` and
relays bytes; it never chooses between two devices' saves.

`bootPlayGames()` runs from `main.ts` beside `bootMonetization()`, unawaited. It gates on
`Capacitor.isNativePlatform()` — the whole of the line between a browser and a device, as
it is for monetization — and the browser keeps `stubPlayGames`, which **cannot report
anyone as authenticated**. That is what stops a development mock standing in for Play
Games in a release: the stub is a different object, not a flag on the real one.

Every call resolves. A plugin that rejects, a device without Play Games and a player who
declines are all the same answer — signed out — because none of them is a failure of the
game. Payloads crossing the bridge are validated rather than cast, and a malformed one
reads as signed out, which is the safe direction: it costs a cloud feature, never a grant.

The only UI is two rows in Settings → Progress: the Daily Tempo leaderboard (shown only when
a leaderboard is configured, the build is native and Daily Tempo exists) and Achievements
(shown only on a native build with at least one achievement configured).

## Logging

`TinyTempoPGS` in logcat carries: SDK initialization, sign-in success or failure, and
whether a player is authenticated. Failures log the exception's class name, not its
message, because a message can carry an account.

Nothing logs a token, an authorization code, a purchase token or a credential. There is no
token here to leak — `requestServerSideAccess` is the only v2 call that returns one and
this app does not make it. The player id is treated as identifying: it crosses the bridge
because a snapshot would be keyed on it, and goes no further — not into logcat, not into a
crash report, not into an analytics event. The breadcrumb `boot.ts` leaves on crash reports
carries `authenticated` and `reason` only.

No client secret or service-account JSON is in the app, and none is needed for this.

## Saved Games

Implemented — see `docs/CLOUD_SAVE.md` for the payload, the merge, conflict handling,
account isolation, the lifecycle, the manual Console steps and the device test matrix.
The shape the earlier plan here described is what was built, with two deliberate changes:
the payload is its own versioned JSON schema (`CloudSaveV1`) rather than the save code's
bytes, because a snapshot and a code answer different questions (a code must be typed; a
snapshot must be able to grow), and **settings are not in it** — calibration is a fact
about one device's audio route, and a volume is a preference about one room — so the
cloud carries earned progression and one-time lessons only.

## Not settled here

Everything about this needs a device with a Play Games account; a headless browser and a
Gradle build can only show that it compiles, links and is configured. Specifically
unverified: that authentication actually succeeds against project `863268283344`, that
Play's own sign-in UI appears where expected, how the flow behaves for a player who has
Play Games but declines, and that a snapshot written on one device arrives on another —
the matrix in `docs/CLOUD_SAVE.md` is that check.
