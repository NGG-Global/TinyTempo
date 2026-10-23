# Unity Ads through AdMob mediation

Unity Ads is a second bidder for the one rewarded ad, behind Google AdMob. It is not a
second ad SDK the game drives: AdMob initialises it, asks it to bid, and presents the ad it
wins with, through the same `prepareRewardVideoAd` / `showRewardVideoAd` calls the game
already makes. Nothing about rewards changed — a heart is still granted from one verified
`Rewarded` event, once (`monetization/admob.ts`) — and there is still no banner, no
interstitial and no second placement.

There is no Unity game id or placement id anywhere in this repository. They belong to the
AdMob mediation mapping, which is where the adapter reads them.

## The shape

```
admob.ts boot       consent (UMP) → partnerPrivacy.sync() → MobileAds.initialize → prepare
  →  MobileAds.initialize        starts every adapter, Unity's among them
       →  Google's Unity adapter (com.google.ads.mediation:unity)
            forwards the GDPR answer (IABTCF_AddtlConsent) and the age tags itself
            initialises Unity Ads with the game id from the AdMob mapping
  →  usOptOut.ts       reads UMP's US-state record (GPP); true only on a recorded opt-out
  →  native.ts         nativePartnerPrivacyClient: the bridge, and nothing else
  →  UnityAdsPrivacyPlugin.java  MetaData privacy.consent = false
```

## Versions

| Piece | Version | From |
| --- | --- | --- |
| Google Mobile Ads SDK | 25.4.0 | `playServicesAdsVersion`, already pinned for `@capacitor-community/admob` |
| Unity Ads SDK | 4.20.1 | `unityAdsVersion`, Maven Central (`com.unity3d.ads:unity-ads`) |
| Google's Unity adapter | 4.20.1.0 | `unityMediationAdapterVersion`, Google's Maven (`com.google.ads.mediation:unity`) |

Google's adapter changelog says 4.20.1.0 was "built and tested with" Mobile Ads 25.4.0 and
Unity Ads 4.20.1, and the adapter's POM depends on exactly `play-services-ads:25.4.0`, so the
three resolve to one Mobile Ads version and nothing is upgraded beside them. Google's page has
since moved to 4.21.0.0, tested with Mobile Ads 25.5.0: taking it means moving
`playServicesAdsVersion` too, which is outside the AdMob plugin's own range today. Do it as
its own change, after the release notes. `tests/unityMediation.test.ts` holds the tested
combinations, so one version moved without the others fails the gate.

Both repositories were already in `android/build.gradle` (`google()` and `mavenCentral()`).
The adapter's floor is API 23 and Unity's 19, under the app's 24. Unity brings Kotlin's
standard library 2.1 and coroutines as runtime dependencies; the app module compiles Java
only, so no Kotlin plugin is needed. This is not the Next-Gen Mobile Ads SDK and not Unity
LevelPlay; `scripts/check-android-config.mjs` warns if LevelPlay ever appears beside AdMob.

## What starts when

- **At process start**, before any JavaScript: Unity's AAR registers an `androidx.startup`
  initializer (`AdsSdkInitializer`). Read from its bytecode in 4.20.1, it stores the
  application context, the launch time and the orientation, and asks Play services to install
  its Cronet network provider. It does not initialise Unity Ads. It cannot be held back
  without removing it from the merged manifest, which Unity does not document, so it is left.
- **Unity Ads itself** is initialised by the adapter inside `MobileAds.initialize`, which the
  game calls only once UMP's `canRequestAds` is true. A player who refuses consent never
  starts it.

## Consent

**GDPR, UK and Switzerland — handled by the adapter.** From 4.19.0.1 Google's adapter reads
UMP's IAB TCF record (`IABTCF_gdprApplies`, `IABTCF_AddtlConsent`) and sets Unity's
`gdpr.consent` itself. Nothing in the game repeats it. What makes it work is account-side:
Unity Ads must be among the ad partners the UMP GDPR message lists (see the manual steps).

**US state laws — forwarded by the game.** The adapter carries no US-state signal; its
bytecode has no GPP or `privacy.consent` reference. When AdMob's US states message records an
opt-out, UMP writes it as an IAB GPP string (`IABGPP_HDR_GppString`) that the Mobile Ads SDK
reads for Google's demand and Unity never sees. Google's mediation guide leaves each partner's
US signal to the publisher, and Unity's documented signal is `MetaData` `privacy.consent`. So
`usOptOut.ts` decodes the string — the six sections AdMob accepts (US National, California,
Virginia, Colorado, Connecticut, Florida), at the versions whose layout the IAB has published —
and an opt-out of sale, sharing or targeted advertising is written to Unity as
`privacy.consent = false`, before the SDK starts and again after the privacy options.

- **Only false is ever written.** Unity keeps the value in a file and, by its own docs, prefers
  it over `gdpr.consent` when both are set. A `true` written from a US record would outlive a
  move to Europe and override a GDPR refusal; a `false` can only restrict. The price is that a
  player who opts out and later opts back in stays opted out for Unity on that device until
  the app's storage is cleared. The privacy policy says so.
- **No record is no choice.** No string, a record that says "did not opt out", a string that
  does not parse, an unknown section version: nothing is sent.
- **An opt-out that cannot be passed on stops ads.** If the string records one and the plugin
  call fails, `admob.ts` marks ads unavailable for the session rather than let Unity bid.
  A string that cannot be *read* is reported and treated as nothing on record.
- **None of this is live until the AdMob account has a US states message.** Without one UMP
  writes no US record and there is nothing to forward. That is an account decision, below.
- **`MetaData` is deprecated in Unity Ads 4.20**, and the build prints javac's deprecation
  note for `UnityAdsPrivacyPlugin.java`; it is left visible, not suppressed. Unity's newer
  Privacy API (`UnityAds.setUserOptOut(true)`, documented in its custom-consent guide) is held
  in memory rather than in a file, which would also end the "stays opted out" cost above. It is
  not used yet because Google's guide for this adapter still gives `MetaData`, the adapter
  writes the GDPR answer and the age flag through `MetaData`, and neither company documents
  how the two APIs combine — Unity says that from 4.18 each framework takes one authoritative
  signal and ignores the other. Revisit when Google's guide or adapter moves.

**Age — unchanged, and worth knowing.** The game passes neither `tagForChildDirectedTreatment`
nor `tagForUnderAgeOfConsent` (`native.ts`): it is not directed at children and knows nobody's
age. The adapter reads them too, and with neither explicitly false it sets Unity's
`user.nonbehavioral = true` on every request. Unity honours that per-user flag only when the
game is designated *mixed audience* in its dashboard; under *not directed to children* Unity
says it may serve personalised ads to all users. So the dashboard designation, not the code,
decides what Unity does with age, and it must agree with the Play Console target audience and
the privacy policy. Setting either tag in code is an audience declaration, not a tuning knob.

## Manifest

The merged manifest gains Unity's `FullScreenWebViewDisplay` activity, its startup
initializer, `<queries>` for several app stores, and the permissions `AD_ID`,
`ACCESS_ADSERVICES_TOPICS` and `ACCESS_ADSERVICES_ATTRIBUTION`, which the Mobile Ads SDK
already brings. Nothing is removed by the app.

## app-ads.txt

`legal/app-ads.txt` is published at `https://tinytempo.games/app-ads.txt` by the Pages
workflow (`.github/workflows/pages.yml` uploads `legal/` as the site root; GitHub Pages serves
it as `text/plain`). It holds Google's line only. **Unity's lines are not in it**: they are
specific to the Unity organisation and come only from its dashboard, and none were supplied.
Do not add guessed or placeholder lines — `tests/unityMediation.test.ts` refuses placeholders.

To finish it:

1. Unity Dashboard → **Setup** → **Organization Settings** → **Organization info**: set
   **Developer Website** to `https://tinytempo.games` (the root domain the Play listing names).
2. In the **App-ads.txt** section, **Show full list** and copy the whole list Unity generates.
3. Append it to `legal/app-ads.txt` **below** the Google line, keeping that line as it is;
   drop any line that duplicates one already there.
4. Unity requires an `OWNERDOMAIN` line, whose value must match the seller domain in the
   relevant sellers.json. If Unity's list does not already include one, add
   `OWNERDOMAIN=<business domain>` — Unity says the site's domain may be used where there is
   no separate business domain — once the owner has confirmed the domain.
5. Run `npm test` (the format check), merge to `main`, and let the Pages workflow publish.
   Unity's dashboard reports when the file is read correctly.

## Manual steps outside the repository

**Unity Dashboard**

- Create the Tiny Tempo Android project and its **Rewarded** ad unit/placement for bidding.
- **Child-directed ad network settings**: choose the designation that matches the Play target
  audience and the privacy policy (not directed at under-13s). See *Age* above for what each
  choice does to the `user.nonbehavioral` flag the adapter sends.
- Organization settings: the developer website, then the app-ads.txt list (above).
- Testing: enable test mode for your devices under Monetization → Testing.

**AdMob**

- Mediation → the rewarded unit `ca-app-pub-6818267616933452/9892619657`: add **Unity Ads
  (bidding)** with the Unity game id and placement id. The ids live here and nowhere else.
- Privacy & messaging → GDPR message: confirm Unity Ads is among the selected ad partners, or
  the adapter has no consent to pass on for it.
- Privacy & messaging → **US states** message: decide whether to publish one. It is what gives
  players a "do not sell or share" choice for Google, and what `usOptOut.ts` reads for Unity.
  Settings shows **Ad privacy** wherever UMP says an entry point is required.
- Disable Unity test mode and remove test devices before release.

**Google Play Console**

- **Data safety**: review it with Unity Ads as an additional SDK that collects device and
  advertising identifiers and ad interaction data, under Unity's own policy. Declare what the
  SDKs collect, per Unity's and Google's current guidance; nothing here updated the Console.
- The privacy policy URL already points at the page that now names Unity Ads; it is live only
  once the Pages workflow publishes it.

## Testing on a device

Nothing in this change has run on a handset. Before a release:

- [ ] A debug build serves Google's test ads (`ADMOB.testAds`). Register your phone as an
      AdMob test device (`VITE_ADMOB_TEST_DEVICES`, or the AdMob console) before any release
      build is installed, and in Unity's dashboard enable test mode for it.
- [ ] Open **Ad Inspector** on the test device and check the Unity Ads adapter initialises
      (no error 111) with the expected adapter and SDK versions.
- [ ] In Ad Inspector, use **single ad source testing** with **Unity Ads (Bidding)** on the
      rewarded unit, watch an ad to the end, and confirm one heart lands; close one early and
      confirm none does.
- [ ] With an EEA/UK debug geography, refuse consent: no ad loads, Unity included. Accept:
      Unity can fill.
- [ ] With a US-state debug geography and a published US states message, opt out from
      Settings → **Ad privacy**, then check Logcat for no `UnityAdsPrivacy` rejection and
      confirm ads still load (contextual from Unity).
- [ ] Turn test mode off in AdMob and Unity, and remove test devices, before promoting a build.

## Sources

- Google, *Integrate Unity Ads with mediation* (Android) and its adapter changelog:
  <https://developers.google.com/admob/android/mediation/unity>
- Google, *Disclose to US users* / GPP keys UMP writes:
  <https://developers.google.com/admob/android/privacy/us-iab-support>
- Unity, *app-ads.txt support*: <https://docs.unity.com/en-us/grow/ads/optimization/app-ads-txt>
- Unity, *Consumer privacy act compliance* (`privacy.consent`, precedence over `gdpr.consent`):
  <https://docs.unity.com/en-us/ads-android/4.18.0/privacy/developer-consent/ccpa-compliance>
- Unity, *Child data laws and compliance* (dashboard designations):
  <https://docs.unity.com/en-us/ads-android/4.20.0/privacy/developer-consent/frameworks/child-data-laws>
- IAB Tech Lab, Global Privacy Platform specifications (header and US sections):
  <https://github.com/InteractiveAdvertisingBureau/Global-Privacy-Platform>
