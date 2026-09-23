# Play Games Services

Play Games Services v2 on the Android build. Authentication only: the SDK is initialized,
the player is signed in where the platform allows it, and the web layer can ask who they
are. Saved Games is **not** implemented — see the plan at the end.

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
```

The two leaderboard calls are v2's `LeaderboardsClient` (`submitScoreImmediate`,
`getLeaderboardIntent`) and resolve like the rest, as do the achievement calls on
`AchievementsClient` (`unlock`, `getAchievementsIntent`; see `docs/ACHIEVEMENTS.md`). Scenes do not call them directly: the
Daily Tempo leaderboard goes through `playgames/dailyTempo.ts`, which owns the id, the best
score and the retry. See `docs/LEADERBOARDS.md`.

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

## Saved Games: the plan, not the implementation

Saved Games is enabled in the Play Console and `SnapshotsClient` is present in the SDK, but
**nothing writes a snapshot yet.** This was left deliberately: getting conflict resolution
wrong corrupts saves, and the existing system has no undo.

The good news is that the payload already exists and is already the right shape.

### What would travel

`game/saveCode.ts` already defines the portable set, because a save code has exactly the
same problem:

```ts
interface SaveData {
  progress: Progress;                 // unlocked + best accuracy per level
  settings: PortableSettings;         // calibrationMs, muted, haptics
  tutorialComplete: boolean;
}
```

That is what a snapshot should carry — as the same bytes `encodeSaveCode` already
produces, so one encoding is tested once and a snapshot and a save code cannot disagree.

### What must not travel, and why

| Storage key | Cloud? | Reason |
| --- | --- | --- |
| `small-acts.progress.v1` | yes | earned, and merges |
| `tiny-tempo.settings.v1` | yes (the portable three) | preferences |
| `small-acts.tutorial.v1`, `small-acts.teach.v1` | yes | preferences |
| `tiny-tempo.health.v1` | **no** | hearts restore as an exploit |
| `tiny-tempo.fills.v1`, `tiny-tempo.daily-heart.v1` | **no** | consumable ledgers; replaying them re-grants |
| `tiny-tempo.premium.v1` | **no** | a *cache*, not the truth |

**`tinytempo_premium` stays authoritative through Google Play Billing.** The premium cache
already carries a `checkedAt` and expires precisely so a restored Android backup cannot
grant Premium forever; a cloud save that carried it would reintroduce exactly that, with a
wider reach. Consumable purchase state must not be restored through Saved Games either —
`redeemFill` is idempotent per claim id, and a snapshot that replayed a spent claim would
either re-grant it or silently swallow a real one.

`saveCode.ts` already refuses to carry hearts, the ledgers, the premium cache and the
analytics consent flag, and its `PortableSettings` type makes that a compile error rather
than a convention. A Snapshots implementation should reuse that type for the same reason.

### Conflict resolution

`mergeProgress` is the answer and already exists: it takes the higher frontier and the
higher accuracy per level, so a merge can only ever add. That is what makes conflict
resolution safe here — two devices' snapshots merge without either losing, and there is no
"which one wins" question to get wrong.

The shape would be:

1. `PlayGames.getSnapshotsClient(activity)` on the native side, behind the same bridge.
2. Open with a fixed snapshot name and
   `SnapshotsClient.RESOLUTION_POLICY_MOST_RECENTLY_MODIFIED` as a floor, then merge the
   two payloads with `mergeProgress` rather than trusting the policy's pick.
3. Write on the events that already mean "progress changed" — `recordResult` and a level's
   summary — debounced, never per frame.
4. Read once, after `refresh()` reports authenticated, and merge into local. Never replace.
5. `Player.getPlayerId()` keys whose snapshot it is, so switching accounts cannot silently
   merge two people's progress.

### What is left to decide

Whether a first sign-in on a device that already has local progress should merge silently.
`mergeProgress` makes it safe, but "safe" and "expected" are different questions, and the
save code's own answer — merge, because a restore that can only add needs no confirmation a
player cannot answer well — is probably the right precedent.

## Not settled here

Everything about this needs a device with a Play Games account; a headless browser and a
Gradle build can only show that it compiles, links and is configured. Specifically
unverified: that authentication actually succeeds against project `863268283344`, that
Play's own sign-in UI appears where expected, and how the flow behaves for a player who
has Play Games but declines. See the testing steps in the handover notes.
