# In-app review

Google Play can ask a player to rate the game from inside it. There is no
Settings entry, no custom question first and no link out to the store: this is
Google Play In-App Review, called directly, the same way updates and billing are
called directly.

A sideloaded debug APK, a build from Android Studio, and the browser never see a
review dialog. Play only answers for a package it itself installed — internal
testing, closed testing, or production. That is not a bug in the adapter.

## The shape

```
PlayScene.showSummary   offer(clear)     the facts about the finished level, nothing decided
PlayScene Continue      launch()         the flow, then leaveForMap, on every branch
  →  AppReview          appReview.ts     the milestone, the wait, when the opportunity is spent
  →  ReviewRecord       reviewRecord.ts  the one stored bit: which milestones were tried
  →  AppReviewClient    native.ts        the bridge, and nothing else
  →  PlayReviewPlugin.java               ReviewManager
  →  Google Play
```

`appReview.ts` imports no native code and no Phaser, which is why the whole of
the policy is tested under node with a fake client. The Java is deliberately
dull: it asks Play for a `ReviewInfo`, holds it, and shows the flow it describes
when told. If a rule about reviews lives in the Java, it is in the wrong file.
The browser, and every native build until `bootAppReview` says otherwise, holds
`stubAppReview`, which offers nothing and calls nothing — a different object
rather than a flag, so a development mock can never stand in for Play in a
release.

## Why level 10

Level 10 is the first area finale. Clearing it is the first thing a player has
*finished* — an area's ten levels and the presentation that closes them — rather
than merely started, and it comes before any star gate, purchase or empty heart
bar can have coloured the session. It is also early enough that most players who
will ever form an opinion have reached it.

It asks nothing else. Not three stars, not an accuracy above the clear bar, not
Premium, not a purchase, not an ad, not the day's objectives, and not any guess
about whether the player is enjoying themselves. Asking only the players who
seem happy is the thing Play's policy forbids, and the game does not do it.

## Eligibility

`reviewMilestoneFor` in `src/review/appReview.ts` opens a milestone when all of
these hold, and it is the only place the rule is written:

- the level is exactly a milestone's level — `REVIEW_MILESTONES` holds one entry,
  `first-finale` at level 10;
- the level was cleared (one star or more);
- the clear was a finale clear — PlayScene's own `finaleCleared`, the same bit
  that puts the "Area complete" ribbon on the plaque;
- progress saved (`saveProgress` reported the write landed), because a clear the
  next launch cannot find is not a milestone;
- the milestone has not been attempted on this device (`ReviewRecord`).

Running as the native app is the sixth condition, and it is not a flag: the
browser holds the stub, which returns null from `offer` before any of the above
is read.

Level 9, a failed level 10, an unsaved one, a level 10 result that is not a
finale clear, a replay after the attempt, and level 20 all open nothing.
`tests/appReview.test.ts` pins each.

## When it prepares, and when it launches

**Nothing happens when the summary first appears.** The finale's own presentation
— the pennants settling, the star reveal, the fanfare, the ribbon, a keepsake's
card — runs exactly as it did.

`showSummary` calls `appReview().offer(...)` with the four facts above once the
result is on the plaque. On a milestone, the adapter starts `requestReviewFlow`
in the background and returns; nothing awaits it, so the result screen keeps
every one of its beats and stays fully interactive.

`launch()` runs from the cleared result's **Continue**, and from nowhere else.
That is `PlayScene.continueFromSummary`, a path of its own: the map puck and the
mid-run sheet still go through `leaveForMap` and never see a review. Continue:

1. waits for the preparation, up to `REVIEW_WAIT.prepareMs` (1.5 s) — by then
   the screen has usually been up for many seconds, and past it the player goes
   to the map without a dialog rather than looking at a button that did nothing;
2. records the attempt, then calls `launchReviewFlow` and waits for Play to
   hand control back, up to `REVIEW_WAIT.launchMs` (20 s) — a native task that
   never completes would otherwise hold the player on the result screen for
   good; if Play's own sheet is up it stays up over the map, which is harmless;
3. goes to the map, through the same `leaveForMap` every other exit uses.

Step 3 runs on every branch. Play Store missing, the API unavailable, a non-Play
install, a refused request, a preparation that failed or is still pending, a
launch that failed, a bridge that threw, a device offline: each is the map a
moment later, with no popup and no error. None of them is reported to Sentry;
they are the expected shape of the API, not faults. A breadcrumb records the
offer and the launch result, so a crash report from the map after a finale says
what preceded it.

While Continue is under way every control on the result screen is inert: a
second tap on Continue, the map puck, the restart puck and the replay block do
nothing until the map. That is what makes one tap and five taps the same, and
what keeps a restart from starting a level the map is about to land on.

A failed level's Try again is unchanged and never passes through any of this.

## The one stored bit

`tiny-tempo.review.v1` holds the milestones this device has tried:

```json
{ "version": 1, "attempts": [
  { "milestone": "first-finale", "level": 10, "at": 1700000000000, "appVersion": "0.1.10" }
] }
```

It is read with the same defensive validation as every other key — a damaged or
blocked store reads as "never tried" — and it deliberately does **not** travel in
a save code and is not merged with one. A review prompt is Play's one question to
this device; restoring a code on a new phone must neither re-ask nor silence it.
It is the ninth key in the WebView's one LevelDB store, so Auto Backup carries it
with the rest, which is the right direction: a restored phone that has already
been asked is not asked again.

**The opportunity is spent when a launch is tried, not when one is offered.** A
preparation that fails, or is still pending when Continue is pressed, has asked
the player nothing, so it costs nothing: the record is not written and the next
clear of level 10 — a replay — offers again. A launch that is tried is recorded
*before* the call, whether or not Play then completes it, because from that
instant the game cannot tell whether a dialog was shown, and Play's own quota
already keeps a retried launch from being a second prompt. On top of the record,
the adapter launches at most once per session, so a device whose storage refuses
the write still never sees two sheets in one sitting.

Once recorded: replaying level 10 offers nothing, level 20 offers nothing (it is
no milestone), and a fresh launch reads the record, not memory.

## What the game cannot know, and does not guess

`launchReviewFlow` completes whether it showed the dialog, quietly declined to
because of Play's quota, or the player dismissed it — and it does not say which.
That is by design on Google's side, so the prompt cannot be gamed. The game
therefore treats a completed launch as "TinyTempo attempted the review flow" and
nothing more: no rating, no submission, no sentiment is known, inferred or
recorded, and no analytics or logic is built on one. A player who sees no dialog
on level 10 has lost nothing; a player who sees one and closes it has, from the
game's side, done exactly the same thing as one who rated it.

## Adding a milestone

A later opportunity — the fifth finale, a major version — is one more entry in
`REVIEW_MILESTONES`. The scene, the record, the bridge and the Java do not
change. The record carries `appVersion` so a version-based milestone has
something to read. Do not add one lightly: Play's quota is per device and time
window, and a milestone that lands inside it is silently a no-op.

## Testing on Android

The bridge is `PlayReviewPlugin.java`, registered by hand in `MainActivity`
beside billing, Play Games and updates, and pulled in by
`com.google.android.play:review` (`playReviewVersion` in `variables.gradle`).
`scripts/check-android-config.mjs` checks both after every `cap sync`, because
`cap` regenerates `MainActivity` from its own template if the file is ever lost
and a build without the registration compiles, installs and simply never asks.

**Install through Play.** A Studio-sideloaded APK or an `adb install` will
reach `launch` and get nothing, or a rejection, from `requestReviewFlow`. Use an
internal or closed testing track, install from the Play Store on a device
signed into a tester account, and note that Play shows the dialog only for an
account that has not already left a review and only within its quota. Google's
own guidance for testing is the internal app sharing and internal testing tracks;
it is not possible to force the dialog from a production install.

To verify the closed-testing build:

1. Reset the record. Clearing the app's storage does it (Settings → Apps →
   TinyTempo → Clear storage), and so does uninstalling; there is no in-game
   reset because there is nothing for a player to gain from one.
2. Clear levels 1–10 (a fresh install starts at level 1). Watch the level 10
   finale complete uninterrupted: pennants, stars, fanfare, ribbon.
3. Tap Continue. Play's review sheet should appear over the result screen, or
   not, at Play's discretion. Close it, or rate. The map follows.
4. Replay level 10 and clear it: no sheet. Clear level 20: no sheet.
5. Force-stop and reopen; clear level 10 again: still no sheet, because the
   record is stored.

For an unattended check of the bridge itself, the Play library ships
`com.google.android.play.core.review.testing.FakeReviewManager`, which completes
both tasks without a store. It is not wired in; swap it for the factory in a
local branch if the plugin needs exercising without a tester account.
