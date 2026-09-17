# Commerce analytics

Ten commerce events were already fired at every offer, purchase and watch —
`health_empty`, `rewarded_offer_shown`, `purchase_completed` and the rest — and every
one of them was discarded. `monetization/analytics.ts` was a typed bus with a default
sink that logs in DEV and does nothing in a production build, so the game would have
shipped a monetization funnel that nobody could see.

## What was already visible, and what was not

Worth being precise about, because it decides what this is for.

| Signal | Already reported by | Authority |
| --- | --- | --- |
| Purchases, revenue, conversion, refunds | RevenueCat dashboard | Store receipts — better than a client event |
| Rewarded impressions, eCPM, fill | AdMob dashboard | The ad server itself |
| **Offers shown, and who did not take them** | nothing | — |

So the gap was never "we cannot count purchases". It was the **top of the funnel**: how
many players ran out of hearts, how many saw an offer, and how many walked away from it.
That ratio is the number that says whether the price is wrong or the placement is, and
neither RevenueCat nor AdMob can see it because neither is present when a player declines.

## Shape

Three layers, the same split `diagnostics/` uses for crash reporting.

| Layer | File | What it is |
| --- | --- | --- |
| Bus | `src/monetization/analytics.ts` | Typed events, no provider. Unchanged by this work. |
| Rules | `src/analytics/eventShape.ts` | Firebase's name and parameter limits, as pure functions. No plugin import, unit-tested under node. |
| Vendor | `src/analytics/firebase.ts` | The Firebase adapter. The only file that knows the vendor. |
| Wiring | `src/analytics/boot.ts` | Attaches the provider on native, when a build asked for one. |
| Config | `src/config/analytics.ts` | Whether to attach, and the consent to start under. |

### It wraps the sink; it never replaces it

`diagnostics/boot.ts` has already installed a wrapper that turns every commerce event
into a crash breadcrumb, because a crash during a purchase is exactly the crash worth
reading. Replacing the sink would take that away **silently** — events would keep
flowing to Firebase, and the next crash report would simply arrive with no purchase
trail in it, which is not a failure anyone would notice. So `installAnalyticsProvider`
keeps the installed sink and calls both, and attaches after `installDiagnostics` so it
inherits the bridge rather than being wrapped by it.

A test asserts the order, because this is a one-line mistake with an invisible cost.

## What a bare `logEvent` does not do

**Firebase enforces its limits by discarding.** An event name that is too long, starts
with a reserved prefix, or carries a parameter Firebase dislikes is not rejected — it is
accepted and dropped. Nothing throws and nothing logs. You find out weeks later, when
somebody asks why a number looks low.

`eventShape.ts` is that check, moved somewhere it can be tested:

- **Names** — 40 characters, must start with a letter, letters/digits/underscores only,
  and none of the `firebase_`, `google_`, `ga_` prefixes Google reserves.
- **String values** — truncated to 100 characters rather than dropped, because a
  truncated product id still names the funnel step and a missing one does not.
- **Everything else** — booleans become 1/0 so a funnel can count them; objects, arrays,
  null, empty strings, `NaN` and `Infinity` are left out, since none has a
  representation Firebase keeps.
- **Parameter count** — capped at 25.

The ten event names and every payload key are asserted against these rules in
`tests/analytics.test.ts`, and the test fails if an eleventh event is added without being
listed. That is where the mistake is cheap; at runtime it is invisible.

**Re-check the numbers rather than trusting the comment.** These are Google Analytics for
Firebase's documented limits, and Google has changed them before. What will not change is
that exceeding one loses data quietly.

## Why the native plugin and not the Firebase JS SDK

`@capacitor-firebase/analytics` talks to the native SDK, so events arrive as **Android**
events and line up with Play Console and AdMob. The web SDK in a WebView reports as a web
data stream, which does not. The project already carried two native Capacitor plugins
(AdMob and RevenueCat), so the plugin itself was not a new kind of dependency.

### The optional peer, and the stub

The plugin declares `firebase` as an **optional** peer and loads its web implementation
behind `() => import('./web')`. On Android the bridge is used and that chunk is never
fetched; in a browser `analytics/boot.ts` returns before the plugin is touched at all. So
the web path is unreachable on both platforms the game runs on — but the bundler still
has to resolve it, and `npm run build` failed with six `MISSING_EXPORT` errors until it
could.

Installing `firebase` to satisfy it would have put the entire JS SDK into a bundle that
would never call it. Instead `vite.config.ts` aliases `firebase/analytics` to
`src/analytics/firebaseWebStub.ts`, whose exports **throw** rather than no-op: if that
path is ever reached, something changed about how the plugin picks an implementation, and
a silent no-op would look exactly like analytics working.

Measured after the change: no Firebase JS SDK in any chunk, the vendor chunk is 1.5 kB,
and the main bundle grew by 0.36 kB. A browser build with `VITE_ANALYTICS=on` fetches
neither the vendor chunk nor the web stub, because the platform check comes first.

## Consent

Collection starts **denied** and is turned on only by `VITE_ANALYTICS_CONSENT=granted`.
`setConsent` is called before `setEnabled`, because the other order leaves a window,
however short, in which the SDK collects under a consent state nobody has set.

**It is deliberately not wired to the AdMob consent flow.** The game already runs
Google's UMP form for ads, and `canRequestAds` is tempting to reuse — but it answers a
question about *advertising*, not about analytics storage, and treating one as the other
is exactly the conflation the GDPR purpose rules exist to prevent. `setFirebaseConsent`
exists so a real consent signal can be connected when there is one.

### The switch

Settings → Privacy → **Share usage data**, wired to `setAnalyticsConsent`. The stored
answer is the source of truth and the SDK is told afterwards, in that order on purpose: a
consent call that cannot be delivered — no provider in this build, no network, a browser —
must not leave the switch showing something the save disagrees with, because the save is
what the next boot reads.

`Settings.analytics` defaults to whatever `VITE_ANALYTICS_CONSENT` says, and a save
written before the switch existed falls back to the same default rather than being read as
a yes. That is the opposite of the rule `haptics` follows, and deliberately so: a missing
preference can be assumed, a missing consent cannot.

**Consent does not travel in a save code.** `SaveData.settings` is a
`Pick<Settings, 'calibrationMs' | 'muted' | 'haptics'>` so the compiler enforces it.
Consent belongs to a device and the jurisdiction its owner is in; restoring a code must
not answer that question on a phone whose owner was never asked it.

**This is still not a finished consent story.** Shipping analytics to EEA users needs the
UMP message configured to cover analytics purposes, or analytics left off there — the
in-app switch is a control, not a lawful basis. That is account-side work; see the release
checklist.

## Turning it on

```
VITE_ANALYTICS=on               # attach the provider
VITE_ANALYTICS_CONSENT=granted  # start collecting (see Consent above)
android/app/google-services.json
```

All three are needed and none alone does anything. Capacitor's Gradle template applies
the `com.google.gms.google-services` plugin **only when `google-services.json` exists**,
so a build without it is not broken — it simply has no Firebase in it, and the adapter's
`try/catch` leaves the bus on the breadcrumb bridge.

## Not verified

- **No event has ever reached a Firebase project.** There is no Firebase project and no
  `google-services.json` in this repository, and no Android SDK on this machine to build
  an APK with. What was verified is the shaping, the composition order, the chunking and
  the browser's refusal to load any of it.
- **DebugView is the check to run first.** `adb shell setprop debug.firebase.analytics.app
  <package>` then watch DebugView in the Firebase console: Firebase batches events for up
  to an hour otherwise, and a first look at an empty dashboard proves nothing.
- No user properties and no user id are set. The game has no accounts, and an id would be
  a new category of data in the privacy policy for no question anyone is asking.
