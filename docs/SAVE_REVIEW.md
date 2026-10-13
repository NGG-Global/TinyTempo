# Saved progress: review and recommendations

A review of how Tiny Tempo keeps a player's progress today, where it is exposed, and what
to change, in priority order. Written from the code as it stands; every finding marked
*confirmed* was read in the source, and every one marked *to verify* depends on platform
behaviour that has to be checked on a device or in current Google or Capacitor documentation.
`docs/SAVES.md` and `docs/CLOUD_SAVE.md` remain the reference for how each part works.

## How it works today

**One store on the device.** Everything the game keeps is in the WebView's `localStorage`,
which on Android is one LevelDB store under the app's `app_webview/` directory. Progress is a
single key, `small-acts.progress.v1`: the highest level the player may start and their best
accuracy on every cleared level. Stars, keepsakes and mastery are not stored at all; they are
derived from those best accuracies on every read, which is why no second record can ever
disagree with the first.

| Key | Holds | Leaves the device by |
| --- | --- | --- |
| `small-acts.progress.v1` | Frontier, best accuracy per level | Auto Backup, save code, cloud |
| `small-acts.tutorial.v1`, `small-acts.teach.v1` | Lessons seen | Auto Backup, cloud (tutorial also in the code) |
| `tiny-tempo.settings.v1` | Volumes, mute, haptics, Tap offset per audio route | Auto Backup; save code without the Tap offset |
| `tiny-tempo.health.v1`, `.fills.v1`, `.daily-heart.v1` | Hearts and their ledgers | Auto Backup only |
| `tiny-tempo.premium.v1` | Premium cache, expires after 30 days | Auto Backup only |
| `tiny-tempo.objectives.v1`, `.review.v1`, `.daily-tempo-best.v1` | Daily objectives, review record, daily best | Auto Backup only |
| `tiny-tempo.cloud.v1` | Which Play Games player this device's progress belongs to | Auto Backup only |

**When it is written.** Once per finished level, in `PlayScene.recordOutcome`, as one
`setItem` of the whole progress object. The write is checked: if storage refuses it the result
reads *Couldn't save*, the failure is reported to crash reporting, and the keepsake, objectives,
achievements and cloud upload that would have followed are all held back, so nothing claims
progress the next launch will not find. *Confirmed.*

**When it is read.** Every field is validated: levels must be whole numbers, accuracies are
clamped to 0–100, and a frontier is never below the levels actually cleared. *Confirmed.*

**Three ways progress leaves the device, none of them an account:**

1. **Android Auto Backup** of the WebView directory, scheduled by the operating system.
2. **The save code** in Settings: the progress, settings and tutorial flag as a short
   checksummed string the player copies and enters on another device.
3. **Play Games Saved Games**: a cloud snapshot synced automatically when the player is
   signed in to Play Games — at launch, on resume, after a cleared level and after a restored
   code — and bound to that Play Games player on this device.

**Every restore merges and never replaces.** A code or a cloud snapshot can only raise the
frontier and raise a level's best; it can never take anything away. That is the single most
important design decision in the system, and it is the right one.

## What is good, and should stay

- Merge-only restores: no restore, conflict or second device can lose a cleared level.
- Derived ownership: stars, keepsakes and mastery cannot drift from the accuracies.
- Validation on every read, and a save failure the player is told about.
- Nothing a player owes or buys (hearts, Premium, consent) travels in a code or the cloud.
- Pure, tested modules: `tests/progress.test.ts`, `tests/saveCode.test.ts`,
  `tests/cloudSave.test.ts`.

## Findings, in priority order

### High

**H1. One damaged write resets the player to level 1, and the next level destroys the rest.**
*Confirmed* (`game/progress.ts`, `loadProgress`). An unreadable progress value is read as an
empty save, silently, with no report. The player starts at level 1, and the first level they
clear overwrites the damaged value, so whatever could have been recovered from it is gone.
There is no second copy to fall back on.

**H2. The cloud save has never been seen working between two real devices.** *Confirmed* as
documented in `docs/CLOUD_SAVE.md`. The Play Console steps are also marked unverified: that
Saved Games is switched on for the game, the OAuth configuration, and the Data safety
declaration. Until that is done, the cloud is a feature the players are relying on that has
only been tested in code.

**H3. When the cloud stops working, nobody can tell.** *Confirmed.* A sync failure shows up
only as a crash-reporting breadcrumb and one line in the support report. Two states stop sync
for good with nothing on screen: a cloud snapshot that cannot be read is never overwritten
(`playgames/cloudSave.ts`), and a damaged device binding can be repaired only by resetting all
progress. A player can believe their progress is backed up for months when it is not.

### Medium

**M1. "Reset progress" does not stick for a signed-in player.** *Confirmed*
(`SettingsScene.resetTapped`). Because the cloud only adds, the next sync merges the old
progress straight back. The code comments say so; the player is not told.

**M2. A save code can add a star.** *Confirmed* (`game/saveCode.ts`, `accuracyByte`). Accuracy is
written rounded to the nearest whole percent, star thresholds are whole percents compared with
`>=`, and the merge keeps the higher value: a best of 92.6 against a 93% threshold restores as
93 and earns a star the player never earned. Copying a code and entering it on the same device
is enough. Rounding *down* instead fixes it completely, because a whole-number threshold that a
best reaches is still reached by that best rounded down.

**M3. Save codes can be forged, and forged progress spreads.** *Confirmed.* The checksum is an
8-bit sum: it catches typing slips, not edits. A forged code unlocks levels, and from there
Play Games achievements and the cloud copy, permanently, since the cloud only adds. Without a
server there is no real protection against an edited save, and for a single-player game with
no competitive leaderboard live that is acceptable; what is worth fixing is the reach. The
decoder also accepts any number of level bytes, so a very long pasted code is not bounded
(*confirmed*); whether that can actually fill storage is *to verify*.

**M4. The storage location is not pinned.** *To verify.* `capacitor.config.ts` sets no
`server.androidScheme` or `server.hostname`, so the WebView origin — and with it the whole
`localStorage` store — is whatever the installed Capacitor version defaults to. As far as I
know, Capacitor 6 changed that default for Android and apps upgrading had to pin the old value
to keep their players' data. Confirm the origin the shipped build uses today (it is visible in
`chrome://inspect`) and pin exactly that, so a future upgrade cannot orphan every save.

**M5. A clear may not reach disk if the app is killed straight after it.** *To verify.*
Chromium writes `localStorage` to disk shortly after a change, not at the moment of the call.
I do not have a verified figure for the delay in the current Android System WebView; test by
clearing a level and force-stopping the app at once.

### Low

- **L1.** A restore writes progress, settings and the tutorial flag as three separate writes;
  a failure part-way leaves a mix. *Confirmed*; low impact, since each piece is valid alone.
- **L2.** When a second Play Games player signs in, the first player's progress is kept on this
  device but is not uploaded to their cloud first. *Confirmed*; rare.
- **L3.** No iOS build exists, and the cloud is Play Games only, so progress cannot follow a
  player across platforms. *Confirmed*; a product decision more than a defect.
- **L4.** Auto Backup is decided by the operating system. As far as I know it runs at most
  about once a day, on Wi-Fi and while charging and idle, and caps an app at 25 MB; *to verify*
  against current Android documentation. It is a safety net, not a sync.

## Recommended changes

### Phase 1 — protect what is on the device (about two days, low risk)

1. **Keep two copies of progress.** Write the progress to two keys in turn, each with a
   sequence number, and read the newest copy that validates. A damaged write then loses at
   most the last level, never the whole save.
2. **Never overwrite what cannot be read.** Move an unreadable value aside to a quarantine key
   and report it to crash reporting before anything new is written, so support can recover it
   from a save code or by hand.
3. **Read back after writing.** Confirm the stored text matches what was written before telling
   the player the level is saved.
4. **Round save codes down** (M2), cap the levels a code may carry at the code's own
   `maxLevel`, and replace the 8-bit sum with a CRC so typing slips are caught more reliably.
   Older codes keep decoding.
5. **Pin the WebView origin** in `capacitor.config.ts` once the shipped value is confirmed
   (M4).

### Phase 2 — make the cloud trustworthy and visible (three to five days)

1. **A cloud status line in Settings:** *Saved to Google Play · 2 minutes ago*, or *Not syncing*
   with the reason in plain words and a **Sync now** button.
2. **Self-repair.** Replace a cloud snapshot that cannot be read with the device's merged
   progress, after reporting it; rebuild a damaged binding without resetting progress.
3. **Reset that means what it says.** For a signed-in player, ask *This device* or *Everywhere*;
   *Everywhere* writes a reset marker to the cloud so the next sync does not merge the old
   progress back (M1).
4. **Keep forged codes out of achievements:** sync achievements only from levels cleared on a
   device, or accept the risk explicitly (M3).

### Phase 3 — prove it on devices (one to two days)

1. Two Android devices, one Play Games account: clear on one, launch the other; clear on both
   offline, then reconnect and confirm the merge; switch players on one device.
2. Auto Backup: back up and restore with `adb shell bmgr`, and on a factory-reset device.
3. Durability: clear a level and force-stop at once, ten times (M5).
4. Play Console: Saved Games switched on, OAuth consent configured, Data safety declares the
   cloud save.

### Only if Phase 3 shows data loss

Move the canonical progress out of the WebView into native storage (for example Android
`SharedPreferences` through a Capacitor plugin), keep `localStorage` as the migration source,
and add the new location to both backup-rule files. This removes the dependence on the
WebView's origin and write timing, at the cost of a migration that must be tested as carefully
as everything above.
