# Billing

Two one-time products, bought through Google Play Billing directly. There is no billing
provider, no dashboard but Play Console, no SDK key, and no server.

| Play product | Play type | What the app does with it |
| --- | --- | --- |
| `tinytempo_premium` | One-time product | Non-consumable. Acknowledged, **never** consumed |
| `heart_refill_full` | One-time product | Consumable. Granted, then consumed, so it can be bought again |

The ids live in `src/monetization/types.ts` and are the same strings Play Console uses.
Nothing else defines them.

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

The consumable is fulfilled in one order and it matters:

1. Play reports the purchase as `PURCHASED`.
2. Grant the refill, through `health.ts`, keyed by a claim id that is **persisted**.
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

A consumed heart refill is not owned any more and cannot come back through restore. That
is correct, and it is why the button says "Premium restored" rather than promising hearts.

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

**No subscriptions.** Both products are one-time, and the client only ever queries
`ProductType.INAPP`.

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
