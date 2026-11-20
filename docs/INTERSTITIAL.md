# The interstitial

One full-screen ad the player did not ask for: **on the way out of every level the player
played**, from level 6 on, whether they cleared it, failed it or quit it, before the map opens.
It sits beside the rewarded ad the player opts into for a heart or a restart; there is still no
banner.

## Where it plays, and where it never does

Every way out of a level goes through one of two exits in `PlayScene`, and both play the
interstitial before the map:

- `continueFromSummary` — the cleared result's **Continue**, after the review flow;
- `exitLevel` — everything else: the **map puck**, Android's **back**, the restart sheet's way
  out and the out-of-hearts **Map**, on a failed result, a cleared one left by the puck, or a
  level paused part-way through.

A running level is never interrupted: the puck and back pause a running level first
(`levelBackAction`), and only the second press leaves, so the ad always lands on a paused level
or a result, at the break between levels Google allows one at. `tests/interstitialPacing.test.ts`
reads `PlayScene` to make sure nothing leaves around the two exits.

It is never:

- on **Try again**, the **replay** block or a **restart** — none of them leaves the level, and
  Google forbids an interstitial that appears while a player is focused on a task;
- on **levels 1–5**, a new player's first minutes at 14–18 seconds of play each;
- when the player left **before an attempt began** in that visit — the out-of-hearts screen on
  arrival, a start that found no sound — since nothing was played;
- for **Premium**, which bought no ads;
- on the Continue that launched the **Play review** flow, which is one ask already;
- within **30 seconds** of any full-screen ad closing, the player's own rewarded ads included;
- in **Daily Tempo** or **Endless**, which are promised free of ads (the same test reads both
  scenes);
- when none is **loaded**: it is never waited for, and the player goes straight to the map.

A running **replay timer** does not hold it back: the timer's product text says it "does not
add hearts or remove ads" (`docs/PLAY_PRODUCTS.md`), and that is the decision.

## Pacing

`game/interstitialPacing.ts` decides, from `INTERSTITIAL` in `config/ads.ts`:

| Knob | Value | Meaning |
| --- | --- | --- |
| `fromLevel` | 6 | The first level whose exit can show one |
| `everyLevels` | 1 | At most one per this many played exits: every exit |
| `minGapMs` | 30 s | Since the last full-screen ad of either kind closed |

A level is **played** once an attempt begins in the visit (`PlayScene.played`, set beside
`beginAttempt`), and an exit is counted only then. The count and the time of the last ad are
**session memory**, stored nowhere.

Thirty seconds is about one level's round trip on levels 6–14 — 18 to 23 seconds of play, then
the result and the map — and well under it from level 15 on, so a brisk player may skip one
early and ordinary play sees one on nearly every exit. The gap is what keeps an enter-and-quit,
or a rewarded ad just watched for a heart, from being followed by an interstitial at once.

These are business settings, not facts: tune them from the two analytics events below and from
retention. Google's rules are the floor, not the target: no more than one interstitial per two
user actions, none straight after another, none on app launch or app exit. A level is many
actions and a break between levels, which is the placement Google recommends; the rules above
are what keep it on that side. **One ad per level is the aggressive end of the range** for a
game whose levels are 14–60 seconds long, so watch day-1 and day-7 retention against
`interstitial_shown` after release, and raise `everyLevels` or `minGapMs` if they fall.

## How it is built

`monetization/admob.ts` holds both formats behind the one consent gate: nothing is requested
until UMP's `canRequestAds`, and the content cap (`maxAdContentRating`) set at initialise
covers both. The interstitial is **loaded on request, never at boot** — `MapScene` warms it
for a save that can reach level 6, between levels rather than inside one — and `show`
settles only when the ad has **closed**: the plugin's `showInterstitial` resolves as soon as
the ad is asked to open, so the close is read from `interstitialAdDismissed` or
`interstitialAdFailedToShow`, with a 120-second limit so leaving is never held. Only one
full-screen ad is open at a time. `PlayScene` holds `commerceBusy` while it is up, as a
rewarded ad does, so the level stands still behind it and the background silence keeps the
context suspended; the attempt a quit abandons is released after the ad, by `leaveForMap`.
Every build but `build:release` loads Google's demo interstitial (`isTesting`).

An empty `ADMOB.interstitialUnitId` turns the format off.

## Analytics

`interstitial_shown` (`level`, `exit`) once one has opened and closed, and
`interstitial_failed` (`level`, `exit`, `reason`: `unavailable`, `not_ready`, `failed`) when
one was due and did not play. `exit` is `cleared`, `failed` or `quit` (left before a result),
so the dashboard can tell an ad after a win from one after a walk-out. Impressions and revenue
are AdMob's to report; these say how often the pacing wanted one and whether it was there.

## Outside the repository

- AdMob: the unit `ca-app-pub-6818267616933452/6246850626` must be an **Interstitial** unit under
  the app `…~3245294136`. **A frequency cap set on the unit overrides this pacing**: a cap of
  one per few minutes would leave most exits without an ad whatever `INTERSTITIAL` says, so
  remove it, or set it no tighter than the policy you want. Never set an app-level cap: it
  counts rewarded impressions too and would hold back the ads players choose to watch.
- Mediation: a group for the unit with **Unity Ads (bidding)** and a Unity interstitial
  placement (`docs/UNITY_MEDIATION.md`).
- Play Console: "Contains ads" is already declared. The Data safety form should not change,
  since the SDKs are the same, but confirm it.

Sources: Google AdMob Help, *Disallowed interstitial implementations*
(support.google.com/admob/answer/6201362, checked November 2026: "no more than one interstitial
ad after every two user actions", none on app load or exit, none straight after another, and
interstitials "at logical breaks in between your app's content (e.g. pages, stages, or
levels)"), *Create an interstitial ad unit* (answer/7311435), *Set frequency caps for apps or
ad units* (answer/6244508).
