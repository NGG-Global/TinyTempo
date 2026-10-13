# Tablets

Reported from an Android tablet running the Play build: **the game freezes when a level
ends.** This records what was checked, what was found, what changed, and what is still
open. It is the first pass at tablets; `CLAUDE.md` said until now that no tablet had been
looked at.

## What was checked

Eight tablet profiles were driven in headless Chromium with touch emulation and a coarse
pointer, in portrait and landscape: 600×960, 768×1024, 800×1280 and 1024×1366 CSS pixels,
and the same four turned sideways. On each, the title screen, the map, Settings, the
Scrapbook, the save code, Help, Tap offset, the tutorial and a level were opened, and every
screen was rotated mid-session and back. **No JavaScript error was thrown on any of them.**
A full level to its result was also run under a virtual clock on a phone and a landscape
tablet profile.

**The freeze was not reproduced in the browser.** The browser cannot reach the native side
of the Play build (Play Games, in-app review, the device's audio stack), and a software
renderer at tablet resolution runs too slowly to tell a real stall from its own. What follows
is therefore a set of defects that each produce exactly the reported symptom on a device,
fixed at the cause, plus the reporting that will confirm which one a given tablet hits.

## What was found

| # | Finding | Effect on a tablet |
| --- | --- | --- |
| 1 | The result opens only when the **heard audio clock** reaches the end of the last coda (`PlayScene.update`). | A device whose output stream stops reporting progress leaves a finished, saved level on its last frame for good: the freeze as reported. |
| 2 | A **suspended AudioContext** was waited on forever (`PlayScene.tick`, `TutorialScene.update`). The wait was written for a one-frame Bluetooth rebuffer. | Audio focus lost to another app, or an output that idles, stops every clock the level runs on. Nothing advances, nothing is judged, and nothing on screen says to tap. |
| 3 | **Continue waited up to 20 s** for Play's in-app review to hand back, with every control on the result inert. | On the first area finale (level 10), a device where Play never answers sat on a frozen-looking result for twenty seconds. |
| 4 | **Android 16 ignored the portrait lock** on every tablet, because an app targeting API 36 has `screenOrientation` ignored at sw600dp+. | Most people hold a tablet sideways: the game ran at 2048×1280 logical units with every screen laid out for portrait, and the map alone held 82 MB of textures against a phone's 32 MB. |
| 5 | Under the **canvas renderer** — what a tablet with a blocklisted GPU falls back to — the hammer's bench and the bug's mat each owned a canvas of their fixed size, 5700×2500 and 5000×2500. | 57 MB on the title screen before anything else, 50 MB more on the bug act. |
| 6 | On a short frame — a tablet, less so a 16:9 phone — the **open-table acts scale to the frame's height**, and two of them reached the level's two-line intro headline. | The hammer's raised head crossed "stick."; the paper act's mat sat on "paper magic.". The other seven open-table acts were checked and clear it. |

Measured texture memory on the map after entering it (headless Chromium, 36 levels cleared):

| Profile | WebGL | Canvas renderer |
| --- | ---: | ---: |
| 393×851 phone | 32 MB | 87 MB |
| 800×1280 tablet, portrait | 34 MB | 89 MB |
| 1280×800 tablet, landscape | 82 MB | 137 MB |
| 1366×1024 tablet, landscape | 69 MB | 124 MB |

## What changed

1. **The result has a wall-clock deadline** (`resultDue` in `game/RoundController.ts`).
   When the last coda starts, its end is also read on `performance.now()`; if the heard clock
   has not reached it `RHYTHM.resultGraceMs` (1.5 s) later, the result opens anyway. The level
   was scored and saved before either, so nothing is lost. Each time this happens it is
   reported once to crash reporting as *Result opened on the wall clock: the audio clock
   stalled*, with the clock's mode, the context's state and how far behind it was — the
   evidence that will say whether this is what a given tablet does.
2. **A suspension that outlasts a rebuffer pauses the level** (`suspendedTooLong`,
   `RHYTHM.suspendedPauseMs`, 750 ms). The level goes through the same `interrupt` a
   backgrounded app does: after the last task it shows the result, otherwise *Paused* and
   **Resume**, whose tap is the gesture that brings the context back. The tutorial does the
   same. A breadcrumb records it.
3. **Continue waits at most 3 s for Play's review** (`REVIEW_WAIT.launchMs`). If Play's sheet
   is up, the map loads under it, as `docs/IN_APP_REVIEW.md` already allowed.
4. **The app declares itself a game** (`android:appCategory="game"` on `<application>`).
   Games are the documented exception to Android 16's large-screen rule (developer.android.com,
   *Behavior changes: Apps targeting Android 16 or higher*), so the portrait lock holds on
   tablets again and a tablet plays the portrait layout at 800–960×1280, the size every
   screen was designed and checked at. `scripts/check-android-config.mjs` warns if the
   attribute is ever removed.
5. **The two open-table floors are sized to the frame** (`vignettes/floorSpan.ts`): one frame's
   width either side, for the between-task slide, and down to the frame's foot, rounded to
   128 units so a URL bar collapsing does not reallocate a canvas each frame. On a phone that
   is about a sixteenth of the old canvas; under WebGL nothing changes but the numbers.

6. **The hammer keeps its raised head under the household acts' band** (`PLAY_HEADROOM`, 320 UI
   units from the frame's top, the line every household act starts at), and the paper act's mat
   starts 20 units lower. A tall phone is unchanged; a 4:3 tablet's hammer is about a fifth
   smaller. Checked at 393×851, 375×667 and 768×1024.

Pinned by `tests/levelEnd.test.ts`.

## How the game behaves on a tablet now

- **Android app, phone or tablet:** portrait, as designed. On a 16:10 tablet the logical
  frame is 800×1280 and on a 4:3 one 960×1280; every screen centres its portrait column and
  fills the extra width with its own background. Seen for every screen at 600×960, 768×1024,
  800×1280 and 1024×1366.
- **Landscape still works where the platform allows it**: a tablet browser, a freeform or
  split-screen window, a Chromebook, or a player who sets the app's aspect ratio by hand in
  Android's settings. Every screen lays out and rotates without error, but uses the width
  poorly: a portrait column in the middle of a wide frame. That is the next step if landscape
  is ever wanted as a first-class layout; it is a design decision, not a fix.

## Still open

- **Confirm on the device that froze.** Install a build with these changes, play to the end of
  a level in the orientation it froze in, and check Sentry for the stalled-clock report and the
  *audio suspended* breadcrumb. Play Console → Android vitals → *Crashes and ANRs*, filtered to
  the tablet model, shows anything native. `chrome://inspect` on a desktop with the tablet over
  USB gives the WebView's console and a Performance trace of the moment it freezes.
- **The map's landscape memory** (82 MB) is unchanged; with the portrait lock it is reached only
  in a landscape browser or window.
- **A landscape layout** for the map, the Scrapbook and Settings, if wanted (above).
- Not yet seen on a physical tablet.
