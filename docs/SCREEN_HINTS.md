# First-visit hints

The first time a player opens the Scrapbook, Settings or Endless Mode, a card over the
dimmed screen says what the screen is for: its name, a title, three or four numbered lines
and one button. It is shown once on the device and never again.

| Screen | Title | Lines | Button | Tap outside |
| --- | --- | --- | --- | --- |
| Scrapbook | Keepsakes for three stars | What a slot shows, how a keepsake is earned, touching one | Got it | Closes |
| Settings | Make the game yours | The two volumes, the Tap offset per route, the save code | Got it | Closes |
| Endless Mode | One long run | No breaks, the tempo and bar ramps, Groove Lives, leaving ends the run | Start run | Nothing |

The words live in `game/screenHints.ts` (pure). The Endless lines read their numbers from
`ENDLESS`, so a rules change cannot leave the card describing the old rules.

## How it behaves

- **It opens once the curtain is up**, from the curtain's `reveal` callback, and is
  marked seen when it is **closed**, not when it opens: a player whose app was killed while
  reading it sees it again.
- **Every tap is the card's while it is open.** Nothing under it scrolls, slides or fires.
  Settings and the Scrapbook pass it their release, as their own controls fire on the
  release; Endless passes it the press. A tap in its first `HINT.armSec` (0.5 s) does
  nothing, so the tap that opened the screen cannot close it.
- **Android's back closes it.** On Settings and the Scrapbook the player stays on the
  screen. On Endless back leaves for the map or the title screen, since closing the card
  any other way starts the run.
- **Endless does not start under it.** On the first visit the run's `start()` waits for the
  card to close. A tap outside the card does nothing there, so a stray tap cannot start a run.
  While it is open there is nothing to invalidate, so backgrounding the app leaves it as it
  was.

## Why it has its own camera

Settings and the Scrapbook scroll their content under a second camera whose viewport is the
clip (Phaser 4 has no WebGL geometry masks). That camera renders after the main one, so a
card on the main camera was drawn under the sections. `ScreenHint` (`ui/screenHint.ts`) adds
a camera of its own after every other. That camera renders only the hint, every other camera
ignores the hint, and it is visible only while the card is open. It is built last in each
scene's `build()` for that reason.

The card is stacked from its rows' measured heights (`planHint`, `ui/hintLayout.ts`). It is
centred in the safe frame and hangs from the top on a frame too short to centre it. Lines
go through `balanceWrap`, so none ends on one word.

## Storage

Three teach flags, `hintScrapbook`, `hintSettings` and `hintEndless`, sit beside the others in
`small-acts.teach.v1` (`seenScreenHint`, `markScreenHintSeen`). They are device-local: they are
not in `CLOUD_TEACH` or a save code. A new phone has not shown its own screens, and three short
cards cost less than a cloud schema change. `hintScrapbook` is not the `scrapbook` flag: that
one says a player has been told what a keepsake is, which the first keepsake's result card
also does.

Players who used these screens before this build see each card once more.
