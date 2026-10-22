# Play Console: the in-app products, field by field

What to enter for each product in **Play Console → Monetize with Play → Products → In-app
products → Create product**. The ids are the only values the code reads
(`src/monetization/types.ts`); every other field is Google's and is shown to the player in
Play's own purchase dialog and order emails, so it is written to match the game's words.

Before the first product can be created, Play needs one uploaded build (any track, a draft
is enough) that declares the billing permission. The Billing Library adds
`com.android.vending.BILLING` to the manifest by itself, so any AAB built from this
repository qualifies.

**Form labels move.** The field names below are as the Console presented them when this was
written and should be checked against the form in front of you; the *values* do not move.

## The four replay timers

Create all four. Every field is the same shape; only the id, the span and the price differ.

| Field | `replay_timer_30m` | `replay_timer_1h` | `replay_timer_2h` | `replay_timer_1d` |
| --- | --- | --- | --- | --- |
| **Product ID** (cannot be changed later) | `replay_timer_30m` | `replay_timer_1h` | `replay_timer_2h` | `replay_timer_1d` |
| **Name** (55 characters at most; what Play's purchase sheet shows) | `Replay timer · 30 minutes` | `Replay timer · 1 hour` | `Replay timer · 2 hours` | `Replay timer · 1 day` |
| **Description** (200 characters at most) | `Unlimited level restarts for 30 minutes on this device. Adds to a timer already running. Does not add hearts or remove ads.` | `Unlimited level restarts for 1 hour on this device. Adds to a timer already running. Does not add hearts or remove ads.` | `Unlimited level restarts for 2 hours on this device. Adds to a timer already running. Does not add hearts or remove ads.` | `Unlimited level restarts for 24 hours on this device. Adds to a timer already running. Does not add hearts or remove ads.` |
| **Product type** | One-time product (under *In-app products*, never *Subscriptions*: the app queries `ProductType.INAPP` only) | same | same | same |
| **Purchase option** | Exactly one, of type **Buy**. The app takes the first purchase option Play returns and ignores the rest, and there is no rent path. If the form asks whether the product is consumable, answer **consumable**: the app consumes every timer after granting it, so it can be bought again | same | same | same |
| **Default price** | your choice — see below | your choice | your choice | your choice |
| **Local prices** | Let Play convert from the default price, or apply a pricing template if you keep one; check that no country falls under Play's minimum price | same | same | same |
| **Tax and compliance** | Digital content, a game item; nothing physical, nothing streamed, no subscription. Answer the regional questions (such as whether the product is a "digital good" for a given country) as for any in-game item | same | same | same |
| **Icon** | `store/products/replay_timer_30m.png` | `store/products/replay_timer_1h.png` | `store/products/replay_timer_2h.png` | `store/products/replay_timer_1d.png` |
| **Status** | **Active**. An inactive product, or one with no price in the player's country, is left out of the game's catalogue and its row simply says the store is unavailable | same | same | same |

**Pricing.** Nothing in the code assumes an amount; Play's localized price string is shown as
it comes. A ladder where the longer timer costs less per minute is the usual shape, for
example (USD, a suggestion to model against your own numbers, not a recommendation from
data): 30 minutes 0.99, 1 hour 1.49, 2 hours 1.99, 1 day 2.99. Whatever the ladder, keep
the 30-minute timer the cheapest: the out-of-restarts sheet reads its price as "from …".

## The icons

One per product in `store/products/`, 1024 px square, 32-bit PNG, well under 8 MB, with no
words, prices or branding: the refill is the five hearts full; each timer is the game's own
stopwatch with its span on the dial — a half sweep for 30 minutes, a full lap for an hour,
two laps for two hours, a dial turned to day and night for a day — in a colour of its own.
They are drawn by `src/ui/productArt.ts` and written by `node scripts/product-icons.mjs`
(Playwright needed, as for the achievement import); `preview.png` beside them shows all six
on one sheet. `tests/productArt.test.ts` checks each file against the Console's format.

## The heart refill, unchanged

`heart_refill_full` is already in the Console. Nothing about it changes. Confirm it is
**Active** with a price, and that its one purchase option is of type Buy. Its icon is
`store/products/heart_refill_full.png`, if the Console has none yet.

## Premium: leave it exactly as it is

`tinytempo_premium` is no longer offered by the game and is still honoured for every Play
account that bought it (`docs/BILLING.md`). **Do not delete it, and do not deactivate it.**
Play keeps a bought one-time product whatever the Console says, but a deleted product makes
every owned copy look like a purchase of something that does not exist, and Restore could no
longer name it. Its name, description and price can stay as they are (an icon is drawn for
it too, `store/products/tinytempo_premium.png`, should the Console ask); nobody sees them from
inside the game any more.

## After the products exist

1. Add the tester Google accounts under **Setup → License testing**, so purchases on the
   testing tracks are not charged.
2. Install the game from a testing track (a sideloaded APK is not a Play install and sees
   no catalogue).
3. Play a level past 10 to its first scored response, use both of the day's restarts, then
   on the empty sheet tap **Replay timer**: the picker's four rows must show Play's prices,
   not *Buy*.
4. Buy the 30-minute timer: the level restarts at once and the restart puck's badge turns
   brass and reads `30m`.
5. Buy the 1-hour timer while the first runs: the badge reads `1h`, and Settings → Workshop
   store's badge reads *Timer running · 1 hr 29 min left* or thereabouts, since the hour was
   added to what was left.
6. Settings → Workshop store → **Restore** on a tester account that never bought Premium
   must say *No purchases to restore*; on one that did, *Premium restored.*

The release checklist (`docs/RELEASE_CHECKLIST.md`, section D) carries the same steps as
boxes to tick.
