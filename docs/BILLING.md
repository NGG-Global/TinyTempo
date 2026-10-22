# Billing

Six one-time products, bought through Google Play Billing directly. There is no billing
provider, no dashboard but Play Console, no SDK key, and no server.

| Play product | Play type | What the app does with it |
| --- | --- | --- |
| `heart_refill_full` | One-time product | Consumable. Granted, then consumed, so it can be bought again |
| `replay_timer_30m` | One-time product | Consumable. Adds 30 minutes to the replay timer, then consumed |
| `replay_timer_1h` | One-time product | Consumable. Adds 1 hour |
| `replay_timer_2h` | One-time product | Consumable. Adds 2 hours |
| `replay_timer_1d` | One-time product | Consumable. Adds 1 day |
| `tinytempo_premium` | One-time product | **Legacy.** Non-consumable. Acknowledged, **never** consumed, **never sold** now |

The ids live in `src/monetization/types.ts` and are the same strings Play Console uses.
Nothing else defines them.

## Replay timers, and why Premium was withdrawn

Premium was sold as unlimited hearts and no ads, one payment. It took the only pacing the
game has away for good, and after daily restarts arrived (`docs/RESTART.md`) the thing a
player actually runs out of mid-level was restarts, not hearts. The replay timers sell that
and nothing else: **unlimited restarts for a while** — thirty minutes, an hour, two hours or
a day — on one timer that purchases **add to**, from the end of a running timer or from now
(`extendTimer` in `game/replayTimer.ts`). Hearts, the refill, the daily heart and the
rewarded ad are untouched; a running timer only makes the restart puck free and shows what
is left on its badge.

The timer is device-local (`tiny-tempo.replayTimer.v1`): its expiry and the claim ids of the
purchases already added. It is in no save code and no cloud snapshot, because it is paid for
and the save carries nothing a player owes or owns. The expiry is the wall clock, like the
daily heart; a clock moved back keeps what the timer already had, and an expiry more than a
week ahead is read as damage, not a licence (`parseReplayTimer`).

**Premium is honoured, and not offered.** A bought non-consumable cannot be taken back, and
Play policy and plain fairness both say a player who paid keeps what they paid for. So the
game never prices it (`CATALOGUE` leaves it out), never shows it, and refuses to sell it
(`purchase` answers *unavailable*), but `queryPurchases` still lists it for an account that
owns it, and that account keeps unlimited hearts, no ads and free restarts, on every device
it signs into, through Restore as before. Leave the product active in the Console: deleting
it would not revoke the entitlement, and would make the owned purchase look like one for a
product that does not exist.

## The shape

```
scene  →  monetization()        service.ts    timeouts, analytics, never throws
       →  Billing               playBilling.ts   every decision about a purchase
       →  PlayBillingClient     purchases.ts     the bridge, and nothing else
       →  PlayBillingPlugin.java               BillingClient
       →  Google Play
```

`playBilling.ts` imports no native code, which is why the whole of the purchase logic —
what counts as owned, what may be granted, what must be consumed, what a response code
means to a player — is tested under node with a fake client. The Java is deliberately
dull: it relays what Play says and performs the acknowledge and consume it is told to. If
a rule about purchases lives in the Java, it is in the wrong file.

## Play is the authority for Premium, and a failed question is not a "no"

Premium is not a local boolean. It is whether the player's Play account owns
`tinytempo_premium`, which `queryPurchases` answers on boot and on every resume.

There is a cache, `tiny-tempo.premium.v1`, and it exists for two honest reasons: Premium
must not flicker off during the second before Play answers, and a player who paid should
stay Premium on a plane. It is **not** a licence, and it is revoked only by a *successful*
query that does not list the product. A query that fails — offline, service down — leaves
Premium exactly as it was. Treating a failed question as a denial would take the game away
from someone who paid for it, at the worst possible moment.

The cache expires after a month, because Android's Auto Backup carries the WebView store
to a new device: without a bound, a backup taken while Premium was active would grant
Premium on the new phone forever, since offline it is never contradicted. A month is long
enough that a genuinely offline player is never cut off, short enough that a restored
backup is not a standing entitlement. The real fix is Play's own answer, which arrives the
moment there is a network.

## Grant, then consume — in that order

Every consumable — the refill and the four timers — is fulfilled in one order and it matters:

1. Play reports the purchase as `PURCHASED`.
2. Grant it, through `health.ts` or `game/replayTimer.ts`, keyed by a claim id that is
   **persisted**.
3. Only then consume it.

A crash between 2 and 3 leaves the purchase unconsumed, so Play offers it again on the
next reconcile: the grant is refused by the persisted claim id and the consume is retried.
The player keeps what they paid for and gets it once.

Consuming first would invert that. A crash would lose the refill with nothing left to
replay, because a consumed purchase does not come back. The same reasoning is why a failed
consume is never treated as a failed purchase — it is a retry, not a loss.

`PENDING` grants nothing at all. A slow payment method has not paid yet, and the
reconcile on the next resume is what eventually picks it up.

## The claim id is a digest, not the token

`health.ts` persists claim ids to survive a restart, which is the whole point of them. The
purchase token is what identifies a purchase across a restart — so using it directly would
write Play purchase tokens into WebView storage, and from there into an Auto Backup.

`claimIdFor` is a 64-bit FNV-1a digest of the token. It answers "have I already granted
this?" exactly as well, and the token itself never leaves `playBilling.ts`. Nothing logs a
token, an order id, or any other purchase detail — not the Java, not the adapter, not
analytics, not Sentry.

## Restore Purchases

Play has no separate restore call: what the account owns is what `queryPurchases` returns.
Restore asks that question, grants Premium if it is there, and reports one of three
results the existing copy in `copy.ts` already knows how to say — restored, nothing to
restore, or could not ask.

A consumed heart refill or replay timer is not owned any more and cannot come back through
restore. That is correct, and it is why the button says "Premium restored" rather than
promising hearts or minutes — and why, for the accounts that never bought Premium, it says
"No purchases to restore". The button stays because the legacy owners need it on a new
device.

## Where the store is, and where the timer is shown

A store in a mobile game is reached from the hub in one tap, never from a pop-up, and never
raised by the game on its own: a sale the player did not ask to see is what reviews call
unobtrusive when it is absent and pushy when it is not. So the catalogue has one door on
the road and two more where the need arises, all selling the same five products at Play's
own prices, with the same words (`STORE_COPY`):

| Surface | Where | What it sells |
| --- | --- | --- |
| **The map's store puck and card** (`ui/storeCard.ts`, `game/store.ts`) | A price-tag puck under Objectives and Endless, labelled *Store* until it has been opened once (`puckStore`, device-local) | The refill while there is room for it, the four timers, Restore |
| Settings → Workshop store | The brass section, as before | The four timers, Restore; the refill under Hearts |
| The restart sheet's picker (`docs/RESTART.md`) | Only once the day's restarts are spent, mid-level | The four timers, and restarts at once |
| The out-of-hearts sheet | Only at zero hearts | The refill, beside the daily heart and the ad |

The card follows the objectives and Endless cards: one plate over the dimmed road, Close
and a tap anywhere off it put it away, Android's back does the same, and a purchase or a
restore that is still out holds the card and dims its rows under *Waiting for the store…*,
so nothing is left half-done behind a closed card. A row's price is read from the catalogue
on every draw and reads *Buy* until Play has answered — never a guessed amount — and in the
browser, or on a device where Play Billing did not come up, the line under the rows says the
store is not available rather than letting a dead row look live. A Premium account sees
*Unlocked* and Restore, since its hearts and restarts are already unlimited. Rows are the
touch floor tall. Every row shown is reported as `purchase_offer_shown`, and the opening as
`store_opened` (`docs/ANALYTICS.md`).

**What is left of a replay timer is shown wherever the player might wonder**, read every
second and moving by the minute, rounded up so it never reads 0 while it runs:

- the map's store puck wears a brass badge with the short form — *29m*, *1h*, *2d* — the same
  badge the level's restart puck wears, and nothing else ever; the puck never carries a sale
  or a count;
- the store card opens on a brass band under its title reading *1 hr 12 min left*, and a
  timer that ends while the card is open takes the band with it;
- the level's restart puck badge and Settings' store corner badge read the same figure.

The puck and the card take their facts from one pure function (`storeFacts` on the map,
`StoreFacts` in `game/store.ts`): the entitlement, the hearts, the timer's expiry and
whether Play answered. Nothing about the store is stored beyond the label's teach flag.

## The browser, and the line a release cannot cross

`bootMonetization` is the whole of that line. Off a native platform it returns
immediately, leaving `stubBilling` installed — and the stub cannot grant anything: the
store reports unavailable, purchase fails, restore reports no purchases, `premium()` is
false. A development mock that *granted* things would be the dangerous kind; this one
fails in the safe direction by construction.

A native build that cannot reach Play falls back to the same inert stub, and reports the
failure through `core/errors.ts` — because a release that silently sells nothing looks
exactly like a quiet day, and that is the one failure here worth waking up for.

## What is not here, and why

**No server.** Client-side Play Billing is what this game needs: the products are cheap,
the grant is local, and Play already refuses a purchase it has not taken money for. The
seam for adding verification later is `playBilling.ts` — a purchase is granted in exactly
one place, `fulfil`, so a server check would go in front of that call and nowhere else.

**No service account, no Developer API key, no `google-services.json` for billing.** An
ordinary client BillingClient purchase needs none of them, and a service-account JSON in
an APK would be a credential anyone could extract.

**No subscriptions.** A replay timer is a span bought outright, not a plan: every product
is one-time, and the client only ever queries `ProductType.INAPP`.

## Two things that will break it quietly

`MainActivity.java` registers the plugin by hand, because billing is a class in this
module rather than an npm package. If `cap` ever regenerates that file from its template,
the registration goes with it and every purchase reports the store as unavailable —
nothing fails to build. `scripts/check-android-config.mjs` checks for it after every sync,
along with the Gradle dependency.

`setOfferToken` is **required** for one-time products since Billing Library 8, which gave
them purchase options and offers of their own. A one-time purchase built without it does
not launch. The token comes from `getOneTimePurchaseOfferDetailsList()`, and a product
with no offer is left out of the catalogue rather than shown at a guessed price.
