# The interstitial

One full-screen ad the player did not ask for: on a cleared level's **Continue**, before the
map opens, and only when the pacing says so. It sits beside the rewarded ad the player opts
into for a heart or a restart; there is still no banner.

## Where it plays, and where it never does

The only call site is `PlayScene.continueFromSummary`, after the review flow. That is the
break Google allows one at: the level is over, the medals, the keepsake and the next-star
rows have played, and the player has tapped to move on. It is never:

- on **Try again** — a retry is part of playing, and Google forbids an interstitial that
  appears while a player is focused on a task;
- in **the first area** (levels 1–10), where the game asks nothing of a new player and its
  hearts are free too (`HEALTH.protectedThrough`);
- on the Continue that launched the **Play review** flow, which is one ask already;
- for **Premium**, which bought no ads, or while a **replay timer** runs, since that player
  has just paid;
- in **Daily Tempo** or **Endless**, which are promised free of ads (`tests/interstitialPacing.test.ts`
  reads both scenes);
- when none is **loaded**: it is never waited for, and the player goes straight to the map.

## Pacing

`game/interstitialPacing.ts` decides, from `INTERSTITIAL` in `config/ads.ts`:

| Knob | Value | Meaning |
| --- | --- | --- |
| `fromLevel` | 11 | The first level whose clear counts |
| `everyClears` | 3 | At most one per this many counted clears |
| `minGapMs` | 3 min | Since the last full-screen ad of either kind closed |

The clear count and the time of the last ad are **session memory**, stored nowhere, so a fresh
launch starts the count again and a player who clears two levels a session sees none. A clear
is counted when its result opens, so a clear left by the map puck still counts toward the
next Continue. These are business settings, not facts: tune them from the two analytics
events below and from retention, not by feel. Google's rules are the floor, not the target:
no interstitial after every action, none straight after another, none on launch or exit.

## How it is built

`monetization/admob.ts` holds both formats behind the one consent gate: nothing is requested
until UMP's `canRequestAds`, and the content cap (`maxAdContentRating`) set at initialise
covers both. The interstitial is **loaded on request, never at boot** — `MapScene` warms it
for a save that can reach level 11, between levels rather than inside one — and `show`
settles only when the ad has **closed**: the plugin's `showInterstitial` resolves as soon as
the ad is asked to open, so the close is read from `interstitialAdDismissed` or
`interstitialAdFailedToShow`, with a 120-second limit so Continue is never held. Only one
full-screen ad is open at a time. `PlayScene` holds `commerceBusy` while it is up, as a
rewarded ad does, so the result stands still behind it and the background silence keeps the
context suspended. Every build but `build:release` loads Google's demo interstitial
(`isTesting`).

An empty `ADMOB.interstitialUnitId` turns the format off.

## Analytics

`interstitial_shown` (`level`) once one has opened and closed, and `interstitial_failed`
(`level`, `reason`: `unavailable`, `not_ready`, `failed`) when one was due and did not play.
Impressions and revenue are AdMob's to report; these say how often the pacing wanted one and
whether it was there.

## Outside the repository

- AdMob: the unit `ca-app-pub-6818267616933452/6246850626` must be an **Interstitial** unit under
  the app `…~3245294136`. Set any frequency cap **on the unit**: an app-level cap counts
  rewarded impressions too and would hold back the ads players choose to watch.
- Mediation: a group for the unit with **Unity Ads (bidding)** and a Unity interstitial
  placement (`docs/UNITY_MEDIATION.md`).
- Play Console: "Contains ads" is already declared. The Data safety form should not change,
  since the SDKs are the same, but confirm it.

Sources: Google AdMob Help, *Disallowed interstitial implementations*
(support.google.com/admob/answer/6201362), *Create an interstitial ad unit* (answer/7311435),
*Set frequency caps for apps or ad units* (answer/6244508).
