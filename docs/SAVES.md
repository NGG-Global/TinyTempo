# Progress off the device

Progress lived in one place: the WebView's local storage on one handset. Clear the app
data, lose the phone, or move to another device, and it was gone with no route back. This
is the two answers to that, because neither is sufficient alone.

| | Covers | Player effort |
| --- | --- | --- |
| Android Auto Backup | A new phone, a reinstall | None — it just happens |
| Save code | Cleared data, a lost device, support, leaving Android | Keep a string somewhere |

Neither is an account. The game has no server, no sign-in and nothing to sign in to, and
adding one for this would be a disproportionate answer to a problem two declarative files
and one pure module solve.

## Auto Backup

`allowBackup` was already `true` — it is the platform default — but with no rules
declared, which meant the backup's contents were whatever Android decided to include.
`res/xml/backup_rules.xml` (API ≤ 31) and `res/xml/data_extraction_rules.xml` (API 31+)
now name it: `app_webview/`, the WebView's storage directory, and nothing else.

Both files are needed and neither replaces the other. Android reads the first on older
releases and the second from 31 onwards, and a device running 31+ with only the old file
falls back to a default that is not what these rules say.

**The rules are file-level, and localStorage is one file.** Every key the game writes
lives inside one opaque LevelDB store: progress, settings, the tutorial, the teach flags,
hearts, the refill ledger, the daily heart, the premium cache, daily objectives, and the
Daily Tempo best (nothing writes it while that mode is off). "Back up progress but not
the premium cache" cannot be expressed. Everything goes or nothing does.

That is why the premium cache is bounded rather than excluded. `readPremiumCache` now
carries a `checkedAt` and refuses a cache with no timestamp, a future one, or one older
than `PREMIUM_CACHE_MAX_AGE_MS`. Before that, a restored backup handed a new device
`entitled: true` with nothing to check it against and no expiry — Premium forever, on any
device, from a backup file. The cache is a grace period for a player who is offline, not
a licence, and it now behaves like one.

## The save code

`src/game/saveCode.ts`. Crockford base32 over a compact binary record, checksummed,
printed in groups of five:

```
04BG1-NQZ0S-E4WS0-07M00-00000-005G0-00000-00000-0004F-Q8
```

| Bytes | Holds |
| --- | --- |
| 0 | Format version. A code from a newer version is refused, not guessed at. |
| 1–2 | Highest unlocked level |
| 3–4 | Calibration offset, signed |
| 5 | Muted, haptics, tutorial complete |
| 6 … n−1 | One byte per level from 1, holding a rounded accuracy; zero means not cleared |
| n | Checksum: the sum of every preceding byte |

One byte per level sounds wasteful and is not: a level nobody cleared costs a zero byte,
which base32 and the run of zeros between clears compress into very little to read. A
300-level save is under 600 characters, and a typical one is under 60.

**What travels is what the player earned, never what they owe or own.** Levels, best
accuracies, calibration, the two switches, the tutorial flag. Not hearts, not the refill
ledger, not the daily-heart ledger, not the premium cache — restoring any of those is
either an exploit or an incoherence, and a purchase comes back through the store's own
Restore, which is the only place it can be checked. `tests/saveCode.test.ts` asserts the
shape of a decoded save, so a later field cannot quietly join the code.

### Why Crockford's alphabet

`I`, `L`, `O` and `U` are excluded, so the characters that get misread never appear in a
code. They are still *accepted* on the way in and mapped to what was meant — `I` and `L`
to `1`, `O` to `0` — because the one time a code is typed rather than pasted is a support
email from someone who has already lost their progress once.

### Why the padding bits are checked

A single mistyped character is the failure this format exists to catch, and the checksum
catches all of them but one: the last character carries a few real bits and the rest is
padding, which `fromBase32` discards. A slip landing only there changes no byte, so the
checksum cannot see it, and the code decodes correctly anyway — harmless, but it means a
sweep of every position against every character does not come back clean, which is the
test that has to hold. Rejecting a non-canonical tail, as RFC 4648 recommends, closes it.

It is reported as a **typo** rather than as a malformed code. The two failures need
different words: a character outside the alphabet means this was never a save code, and a
character inside it that lands wrong means a real code with a slip in it. Telling the
second player to check their typing is the difference between a fixable problem and a
dead end.

### Restoring merges, and never replaces

`mergeProgress` takes the higher frontier and the better accuracy per level, so a restore
can only ever add. The alternative — replacing — silently destroys whichever side was
behind, with no undo, usually unnoticed until much later. Merging is also what lets the
restore happen on one tap instead of behind a confirmation dialog a player has no good way
to answer: there is nothing to warn about, because nothing can be lost.

Settings and the tutorial flag are preferences rather than achievements, so they come
across whole.

## What rides along without being written

Stars and the Scrapbook's keepsakes are both derived from the accuracies a save already
carries (`game/stars.ts`, `game/scrapbook.ts`), so a code restores them, and a merge can
only add to them, without either appearing in the format. Nothing about them needs a
version bump.

The daily objectives and their stamps (`tiny-tempo.objectives.v1`, `docs/OBJECTIVES.md`)
do **not** travel in a code: a day's set belongs to the device's local date, and stamps are
a per-device record of play. Auto Backup carries the key with the rest of the WebView store.

## The screen

`TransferScene`, reached from Settings → Progress → Save code, on the same pattern
`CalibrateScene` follows: a task that needs the screen to itself gets it, and Settings
keeps the row.

Copy uses the Clipboard API where there is one and says so plainly where there is not —
it needs a secure context and a permission a WebView can decline, so it is a convenience
over the card, never the only way to get the code out. The code stays legible on screen
either way.

**Entry is DOM, and that is deliberate.** `#code-overlay` in `index.html`, shown by
`askForSaveCode` in `core/shell.ts`. A real `<input>` is what opens the system keyboard in
an Android WebView, and it brings the platform's own paste, selection and cursor handling
with it. A keypad drawn on the canvas would reimplement all of that worse and lose paste,
which is how a code actually arrives. This is the fourth web API the game depends on,
added on the same terms as `navigator.vibrate`: feature-detected, silent when it is not
there, and never firing for anything the player did not just do.

The screen says what the code carries and what it does not, on the screen itself. The
alternative is a player restoring a code, finding their hearts and their purchase missing,
and writing in about it.

## Verified

In Chromium at 393×851, not only in tests:

- A seeded save encodes, and the code re-encodes byte-identically after a round trip.
- A code typed in lower case with the dashes stripped restores in full.
- A typo is refused as a typo; cancelling leaves storage untouched.
- Restoring the same code twice reports that nothing was ahead of what was there.

## Still to do

- **The Android side is unverified.** The backup rules are declared but no backup has been
  taken and restored on a real device — `bmgr backupnow` / `bmgr restore` against a debug
  build is the check, and it needs hardware.
- Clipboard write is untested inside a Capacitor WebView. The failure path is handled and
  the code is readable on screen regardless, but whether the button works there is not yet
  known.
