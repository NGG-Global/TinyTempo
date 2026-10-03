# Cloud save: Play Games Saved Games

Progression follows the signed-in Google Play Games player across reinstalls and
devices, on the Play Games Services v2 bridge the game already had. Nothing about it is
required to play: a device with no Play Games, no network, a declined sign-in or a cloud
that will not answer plays exactly as before, from local storage, and the cloud catches up
when it can.

**Status.** Code complete and covered by `tests/cloudSave.test.ts`; the Java bridge
compiles against the pinned `play-services-games-v2:22.1.0` (see *Verification*). **Not
yet verified on hardware**: no Play-installed build has synced between two real devices.
The device matrix at the end is what that verification is.

| Piece | File |
| --- | --- |
| Schema, codec, merge, binding, sync (pure, tested) | `src/playgames/cloudSave.ts` |
| Wiring: storage, debounce, resume, support line | `src/playgames/cloudSync.ts` |
| Adapter types and the inert stub | `src/playgames/playGames.ts` |
| Bridge validation, base64 | `src/playgames/native.ts` |
| Native: `SnapshotsClient` open / read / write / resolve | `android/.../PlayGamesPlugin.java` |
| Boot and resume hooks | `src/playgames/boot.ts` |
| Save boundaries | `scenes/PlayScene.ts` (a cleared level), `scenes/TransferScene.ts` (a restored code) |
| Tests | `tests/cloudSave.test.ts`, plus `tests/playGames.test.ts`, `tests/achievements.test.ts` |

## What is stored in Play Games

One snapshot per player, named `tiny-tempo-progress`, forever. The schema version is
inside the payload, never in the name. The payload is `CloudSaveV1`, serialized as
canonical JSON (fixed key order, levels ascending), a few hundred bytes for a typical save:

```json
{
  "version": 1,
  "progress": { "unlocked": 13, "best": { "1": 100, "2": 88, "3": 91 } },
  "tutorial": "complete",
  "teach": { "seen": true, "triplet": true, "sixteenth": false, "scrapbook": false }
}
```

| Field | Source | Merge |
| --- | --- | --- |
| `progress.unlocked` | `small-acts.progress.v1` | highest, and never below what `best` implies |
| `progress.best` | `small-acts.progress.v1` | highest per level |
| `tutorial` | `small-acts.tutorial.v1` | `complete` > `skipped` > `none` |
| `teach.seen`, `.triplet`, `.sixteenth`, `.scrapbook` | `small-acts.teach.v1` | logical OR |

Levels above `CLOUD_SAVE.maxLevel` (20 000) are not carried, which bounds the payload far
under Play's 3 MB; the frontier is bounded as `progress.ts` bounds it. Stars, keepsakes and
achievements are **derived** from `best` and never written (`game/stars.ts`,
`game/scrapbook.ts`, `playgames/achievements.ts`), so a cloud restore carries them without
knowing it, exactly as a save code does.

### Intentionally device-local

| Not in the cloud | Key | Why |
| --- | --- | --- |
| Hearts, regeneration time | `tiny-tempo.health.v1` | restoring them is an exploit |
| Rewarded-ad and refill claims | `tiny-tempo.fills.v1` | a consumable ledger; replaying it re-grants |
| Daily heart | `tiny-tempo.daily-heart.v1` | per-device, per-day |
| Premium cache | `tiny-tempo.premium.v1` | a cache; Play Billing is the truth |
| Calibration offset, volumes, mute, haptics | `tiny-tempo.settings.v1` | **device** preferences — a Bluetooth offset on one phone is wrong on another |
| Analytics and advertising consent | `tiny-tempo.settings.v1`, UMP | belongs to the device and its jurisdiction |
| Daily objectives and stamps | `tiny-tempo.objectives.v1` | the device's own calendar |
| `teach.replayTip` | `small-acts.teach.v1` | about the hearts, which stay with the device |
| Active attempt, run state | memory | nothing to restore |

`encodeCloudSave` writes exactly the four fields above and the test asserts the serialized
text against the names and values of everything in this table. The native side never sees
the text: it carries base64 bytes and decides nothing.

## When loads and writes happen

| Moment | What runs | Where |
| --- | --- | --- |
| Boot, once Play Games reports the player signed in | `reconcileCloud()` | `playgames/boot.ts` |
| Return to the foreground (`visibilitychange`), at most every 20 s | `reconcileCloud()` | `watchCloudResume` |
| A level is cleared and saved | `queueCloudSave()`, debounced 2.5 s | `PlayScene.recordOutcome` |
| A save code is restored and saved | `queueCloudSave()` | `TransferScene.apply` |
| Progress arrives from the cloud | `syncAchievements(progress)` | `onImported` |

Nothing is written per tap, beat, judgement or frame, and nothing awaits any of this. A
sync is one read, at most one write, and whatever conflict rounds those two need. Requests
that arrive during a sync collapse into one further run after it. Every Play Games call is
bounded by `CLOUD_SAVE.timeoutMs`; a call that never answers is a timeout, not a hang.

The resume watcher is installed whether or not sign-in has happened at boot: a player who
signs in later from Settings → Achievements is owed their cloud on the next resume, and the
next cleared level queues a save as it always does.

## How a sync runs

`createCloudSync(deps).sync()` in `cloudSave.ts`, every step of which is an outcome, never
a throw:

1. **Skip** when the build has no Play Games (`unavailable`), the player is signed out, or
   Play Games cannot say who the player is (`no_player`). Nothing is adopted blind.
2. **Bind** the device to the player (below).
3. **Read** the snapshot. Nothing stored yet is an empty save. Malformed text is a
   failure and is **not written over** — it may be a read that went wrong, and local is the
   only copy that cannot be. A newer schema is `unsupported`: local untouched, cloud untouched.
4. **Import first.** `final = merge(local, remote)`; if that adds anything to the device
   it is written to the device now, and achievements are synced from it. The write merges
   with what storage holds *at that moment*, so a level cleared while the read was in
   flight is kept.
5. **Upload** only if `final` adds anything to the cloud. A write that fails leaves
   `imported` true in the outcome: the player lost nothing, the cloud is behind until next time.

### Conflicts

Snapshots are opened with `RESOLUTION_POLICY_MANUAL`, so Play never picks a winner. When
two devices wrote while apart, the open returns both snapshots. The bridge relays both
payloads and holds the conflict; the game merges them **with this device's own save**,
sends the merged bytes back through `resolveSnapshot`, and the plugin resolves with them
and commits them. If resolving reveals another conflict the same happens again, up to
`CLOUD_SAVE.maxConflictRounds` (4); past that the sync gives up for now with
`conflict_unresolved` and local is untouched. A write can meet a conflict too (another
device committed between this device's read and write): it is resolved the same way, and
anything the other device added comes back down to this one.

Within a conflict: a side this client cannot read is dropped from the merge (there is
nothing in it to keep; the readable side and the device's own save are preserved); a side
from a newer client stops the sync without resolving. No timestamp, play time or "most
recent" is consulted anywhere.

### Account isolation

Local storage is device-wide; a Play Games account is not. `tiny-tempo.cloud.v1` holds a
`CloudBinding`: the device's **owner** — a salted FNV-1a hash of the player id, so the raw
id is written nowhere — and a **shelf** of previous owners' progression.

| Device remembers | Player signed in | What happens |
| --- | --- | --- |
| nobody | anyone | **Adopt**: the local progress becomes this player's and is merged with their cloud |
| player A | player A | ordinary sync |
| player A | player B | **Switch**: A's progression is shelved under A's tag; the device takes B's shelved progression, or starts empty; B's cloud is then pulled. A's cloud receives nothing of B's, B's cloud receives nothing of A's |
| player B | player A again | **Switch back**: B shelved, A's shelf restored, merged with A's cloud |
| anyone | signed out | nothing happens; the device keeps the last owner's progression |

Nothing is deleted at a switch: the shelf keeps up to `CLOUD_SAVE.maxShelf` (8) previous
owners and each owner's cloud is untouched. Hearts, settings, purchases and consent are
not part of a switch. A switch resets the tutorial and teach flags to the new owner's,
which is what a new player on this device should meet. A binding that cannot be read
stops the sync (`failed: binding`) rather than reading as "nobody's" — that would adopt
the previous owner's progress into whoever is signed in. The player id reaches no log,
breadcrumb, analytics event or storage key; the support report says only whether the
last sync worked.

Two edges to know. The switch writes the device first and the note second, so a storage
that refuses the note leaves the device holding the new player's progression under the
old owner's name, and the next sync shelves again rather than contaminating anyone; the
cost is the old owner's un-uploaded local delta, which only a device whose storage refuses
writes can incur. And the switch happens where the sync runs — boot and resume — so a
player who changes Play Games profiles mid-session sees it on the next resume.

## Offline and failure behaviour

- No network: reads fail `offline`, nothing changes, the next boot or resume tries again.
- Play Games absent, declined, or the plugin rejecting: `unavailable` / `signed_out`; the
  game is as it was.
- Snapshot API throwing: a `failed` outcome; the adapter catches every throw.
- Cloud payload undecodable: `failed: malformed`; local kept, cloud not overwritten.
- Cloud payload from a newer client: `unsupported`; both sides left as they are.
- Storage refuses writes: the sync stops before it reads the cloud (`binding: local_write`),
  since a device that cannot write cannot import either.
- The outcome is a breadcrumb (`cloud sync`, with the kind and reason) and one line in the
  support report. No UI depends on it.

## Verification

Automated: `tests/cloudSave.test.ts` (43 tests) covers the payload shape and exclusions,
the codec's salvage and refusals, the merge, the binding, every sync scenario the task
named — empty cloud, fresh device, divergence, two-device conflict, conflicting accuracy,
lessons, malformed payload, newer schema, signed out, offline and API failure, idempotence,
the same player returning, account switch and switch back, a restored save code, achievements
from imported progress — plus the in-flight race, conflict chains and their bound, the
bridge validators and the adapter's error handling. The repository gate (`typecheck`,
`lint`, `test`, `build`) passes with it.

Java: `PlayGamesPlugin.java` compiles with `javac` against the Android 36 platform jar,
`play-services-games-v2:22.1.0` and its three dependencies, Capacitor's published
`com.capacitorjs:core` AAR and the androidx chain it needs — a compile check of the
bridge against the pinned SDK, not an Android build. A full `assembleDebug` needs the
Android SDK on the build machine, as it always has.

**Not verified: real two-device behaviour.** That needs two Play-installed builds and a
Play Games tester account, and it is the matrix below.

## Manual Play Console configuration

Everything here is Console-only and cannot be checked from the repository.

1. **Saved Games on.** Play Console → Grow users → Play Games Services → Setup and
   management → Configuration → *Saved Games: On*. It was believed on when this was
   written; confirm, and **Review and publish** the Games configuration afterwards —
   an unpublished change serves nobody.
2. **OAuth consent screen scopes.** Google's current Saved Games guidance lists `games`,
   `games_lite` and `drive.appdata` for the project's OAuth consent configuration in the
   Cloud console (`drive.appdata` is where Play Games keeps snapshots). The app adds no
   runtime permission prompt for any of this: v2 sign-in is unchanged, and the snapshot
   calls use the signed-in session. *(verify against the current page: this moves.)*
3. **Testers.** While the Games configuration is unpublished, only accounts on the Testers
   list can sign in, and therefore sync.
4. **Data Safety.** Declare that Play Games receives the saved progression above (levels,
   best accuracies, lesson flags) under the player's Play Games account, in addition to
   the player id, display name and achievement unlocks already declared. The privacy
   policy and terms were updated to say so; re-publish them.

## Device test matrix

Two Android devices, one Play Games tester account (A), a second (B), builds from a Play
testing track (a sideload has no Play Games sign-in).

**Device A**
- Install from the testing track. Sign into PGS Account A.
- Complete levels 1–10. Close the app.
- Settings → Help: *Cloud save* should read `synced`.

**Device B**
- Fresh install. Same PGS Account A. Launch.
- Verify levels 1–10 restore automatically (the map opens them; no prompt).
- Improve level 4. Complete levels 11–13. Close the app.

**Device A**
- Relaunch. Verify the level 4 improvement appears and levels 11–13 appear.

**Offline conflict**
- Device A offline: improve level 7. Device B offline: improve level 8.
- Reconnect both; open each. Final state on both must hold **both** improvements.

**Account isolation**
- On one device, switch the Play Games profile from Account A to Account B (Play Games
  app → profile). Relaunch Tiny Tempo. Account B must start at level 1 with the lesson
  unseen and must not inherit A's progression; B's cloud must stay empty until B plays.
- Switch back to Account A. A's progress must still exist, including anything A did on the
  other device meanwhile.

**Device-specific calibration**
- Give A and B different Tap offsets in Settings → Calibrate. Sync. They must stay different.

**Failure paths**
- Airplane mode at launch: the game starts and plays; the support line says the last sync
  failed `offline`; back online, a resume syncs.
- Sign out of Play Games entirely: progress on the device is unchanged.

Also worth one look: the support report's *Cloud save* line in each state, and that the
Play Games app's own Saved Games list shows one entry, "Level N, M cleared".
