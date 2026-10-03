# Tap offset per audio route

One phone is about 20 ms through its speaker and 150–300 ms through Bluetooth earbuds. With a
single stored offset, a player who calibrated with earbuds in and then played on the speaker
was judged a fifth of a second early on every tap, with nothing on screen to say why. Each
audio output route now keeps its own Tap offset, and the active route chooses which one the
judge uses.

## Routes

| Route | What Android reports | Label |
| --- | --- | --- |
| `speaker` | `TYPE_BUILTIN_SPEAKER`, `TYPE_BUILTIN_SPEAKER_SAFE` | Phone speaker |
| `wired` | wired headset or headphones, USB headset, USB device or accessory, line and aux out | Wired audio |
| `bluetooth` | A2DP, LE audio headset, speaker or broadcast, hearing aid | Bluetooth audio |
| `unknown` | a browser, a device that has not answered yet, or only HDMI, dock or earpiece | This device |

`AudioRoutePlugin.java` reads `AudioManager.getDevices(GET_DEVICES_OUTPUTS)` and follows
changes through `AudioDeviceCallback`, relaying only the category — never a device name or
address. Bluetooth SCO is deliberately not counted: it is the call path, and a headset's media
goes over A2DP or LE audio. Individual earbuds are not told apart: a second pair is still
`bluetooth`.

**Which output is "active" is inferred.** Android has no public call naming the device media
is playing through (the per-attributes query is a system API), so the plugin takes the
connected outputs in the order Android's media routing prefers them: Bluetooth, then wired or
USB, then the speaker. That covers the case that matters, earbuds in and earbuds out. Two
external outputs at once, such as earbuds and a wired headset together, is where the
platform's own choice could differ, and it is **unverified on a device**.

The browser has no plugin, so its route is always `unknown` and it behaves exactly as before:
one offset.

## Storage and migration

`tiny-tempo.settings.v1`, now written as version 2:

```json
{ "version": 2, "calibration": { "speaker": 18, "bluetooth": 142 }, "muted": false, ... }
```

Only routes that have a measurement are written. Every value is read with `clampCalibration`
(±500 ms); a value that is not a finite number reads as uncalibrated
(`readRouteCalibration` in `game/routeCalibration.ts`).

**A version-1 save's single `calibrationMs` is not discarded.** It becomes the `legacy` slot.
Until a native route is known, which is always the case in a browser, `unknown` uses it, so
nothing changes. The first real route a device reports **adopts** it, unless that route already
has a value; the legacy slot then empties and the result is written once (`adoptLegacy`,
called from `setRoute`). The reasoning: a player calibrates on the setup they play with, and
the update arrives on that same setup. If the guess is wrong, Settings names the route beside
the value, one tap from Tune or Reset. A legacy value of exactly 0 is treated as never
calibrated, because version 1 could not tell the two apart.

**Device-local.** The offset is in no cloud save (`CloudSaveV1` never carried it). A save code
still has its one calibration field, written with the active route's value so an older build
restoring the code gets something sensible, but **this build no longer restores a code's
calibration**: an offset describes one device's audio path, and a code is how progress moves
between devices.

## When the offset changes

The clock's `calibrationMs` is written by `syncClockCalibration` (`audio/audioRoute.ts`), and
only where a plan is placed:

- a level's next task (`PlayScene.beginPlan`), which follows the previous task's result, so
  nothing still being judged can see the value move;
- a tutorial pass (`TutorialScene.startJudged`);
- the calibration screen, which judges nothing;
- an engine being created (`sharedAudio`).

**A route change on its own never writes the clock.** Earbuds connected mid-phrase are judged
on the offset that phrase started with, and the next task picks up Bluetooth's. Nothing is
cancelled. The platform's own reported output lag, which `AudioClock` reads live, is a
separate correction and still follows the device, as it always has.

An uncalibrated route uses **0**, never another route's value. Zero is what the clock did
before calibration existed, and it is already corrected by the platform's reported lag.

## What the player sees

- **Settings → Timing**: "Tap offset", then the active route's value or *Not calibrated*,
  then the route's name. Reset appears only when the active route has a value, and resets that
  route only. The row updates if the route changes while Settings is open.
- **The calibration screen** names the route it is measuring ("Bluetooth audio · currently
  +142 ms", or "not calibrated yet"), saves to that route only, and drops a run in progress or
  an unkept result if the route changes, because that measurement belongs to the old route.
- **The map** shows a small card above the next-level block: "Bluetooth audio detected /
  Calibrate timing for the best accuracy.", with Tune and a close mark. Tune opens the
  calibration screen, and Back returns to the map. It never appears over a level.

The card appears when the active route is uncalibrated **and** either it is Bluetooth, where
the error is largest, or the player has calibrated some other route. A new player on their
phone's speaker is the default case, already corrected by the platform's own lag, and is never
shown it. Closing it silences it for that route until the app starts again; nothing is stored
(`suggestCalibration`, `routeNoticeWanted`).

## Files

| File | What it holds |
| --- | --- |
| `game/routeCalibration.ts` | Routes, labels, the stored shape, validation, migration, the note's rule; pure |
| `audio/audioRoute.ts` | The live route, listeners, the clock sync, saving and resetting the active route |
| `audio/routeNative.ts` | The plugin bridge; validates every answer |
| `audio/routeBoot.ts` | Native-only start; the browser never leaves `unknown` |
| `ui/routeNotice.ts` | The map's card |
| `android/.../AudioRoutePlugin.java` | `AudioManager`, `AudioDeviceInfo`, `AudioDeviceCallback` |
| `tests/audioRoute.test.ts` | Migration, independence, selection, unknown routes, the mid-task boundary, corrupt storage, the note |

`scripts/check-android-config.mjs` warns if `MainActivity` stops registering the plugin, which
`cap sync` would do if it ever regenerated the file.

## Verified, and not

- Unit tests cover migration, per-route independence, active-route selection, unknown and
  malformed routes, the browser path, the mid-task boundary against a real `AudioClock` and
  judge, calibration and reset on one route only, and corrupt storage.
- `AudioRoutePlugin.java` compiles against the Android 36 platform jar and Capacitor core.
- **Not run on a device.** The definition-of-done sequence — calibrate on the speaker,
  connect earbuds, calibrate Bluetooth, disconnect, reconnect — needs a handset with Bluetooth
  earbuds. The two-outputs-at-once case is unverified, as noted above.
