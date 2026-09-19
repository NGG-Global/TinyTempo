# Getting to a Play Console upload

`RELEASE_CHECKLIST.md` is the audit — what is missing and why it matters. This is the
order to do it in. They disagree deliberately: the checklist is grouped by subject, and
subjects are not the order anything can actually be done in.

Each step is marked with who it belongs to:

| | |
| --- | --- |
| 👤 | Only you can do it — an account, a key, a piece of writing, a decision |
| 🔧 | Repo work — ask and I will do it |
| ⏱ | Has a waiting period, so it cannot be left until the end |

**Everything marked *(verify)* is a Google policy that changes.** Check it against the
Console rather than against this file; some of it will be out of date by the time you read
it, and a policy I state confidently and wrongly is worse than one I flag.

---

## Read this before planning anything

⏱ **A new personal developer account may have to run a closed test with 12 testers for 14
continuous days before it can apply for production access.** *(verify — this applies to
personal accounts created after late 2023, and both numbers have moved before.)*

If that still holds, it sets your launch date, and nothing else on this page is on the
critical path. Everything below can be done during those two weeks; none of it can shorten
them. So do Phase 0 first, today, even if the game is not finished.

---

## Phase 0 — Accounts (start now, they all have waiting periods)

1. 👤⏱ **Create the Play developer account.** One-off fee, and identity verification that
   takes days rather than minutes. The developer name is **Dor Vadai**, and the privacy
   policy and terms now name that as the publisher and data controller. Play verifies the
   name and displays it publicly, so the two have to stay in step: change one and the
   other has to follow.
2. 👤 **Create the AdMob account and app**, then one **rewarded** ad unit. You need the app
   ID and the unit ID in Phase 1.
3. ✅ ~~Create a billing provider account.~~ Not needed — purchases go straight to Google
   Play Billing from the app. There is no SDK key, no dashboard and no second place to
   define the products; Play Console is the only one. See step 30.
4. 👤 **Create the Firebase project** and add an Android app with package name
   `com.tinytempo.app`. Download `google-services.json`.
5. 👤 **Get the Sentry values**: the DSN is already working, but a release also needs
   `SENTRY_ORG`, `SENTRY_PROJECT` and an auth token with project-write scope.

---

## Phase 1 — Put the real keys in

Nothing here is optional. Anything still unticked is a placeholder today.

6. ✅ ~~**Replace the AdMob IDs.**~~ Done — the live app `…6818267616933452~3245294136`
   and rewarded unit `…6818267616933452/9892619657` are in both places that carry them,
   and `scripts/check-android-config.mjs` now compares the two after every `cap sync`
   rather than trusting them to stay in step:
   - `android/app/src/main/res/values/strings.xml` → `admob_app_id`
   - `src/config/ads.ts` → `appId` and `rewardedUnitId`

   Two things follow from these being live. Confirm in the AdMob console that the unit is
   a **rewarded** unit — the ID does not say, and the adapter only ever calls
   `prepareRewardVideoAd`, so a unit of any other format simply never loads. And register
   any handset you tap ads on as a test device before you do: a live unit on the bench
   serves real inventory, which is invalid traffic.
7. 👤 **Create `.env` from `.env.example`** and fill in:

   ```
   VITE_SENTRY_DSN=…                  # empty disables crash reporting silently
   VITE_ANALYTICS=on                  # anything else sends no events
   VITE_ANALYTICS_CONSENT=…           # where the Settings switch starts
   ```

   `.env` is gitignored on purpose — a DSN is a write credential — so it does not travel
   with the repo and a fresh clone has none of this. `npm run build` now warns when the
   DSN is missing and `npm run build:release` refuses outright.
8. ✅ ~~**Drop `google-services.json` into `android/app/`.**~~ Done — it is in place for
   `com.tinytempo.app` and Gradle's conditional apply now resolves true. It is
   **gitignored**, because this repository is public: the key is extractable from any APK
   and Google calls the file safe to commit, but a Firebase key is unrestricted until
   somebody restricts it and publishing it cannot be undone. A fresh clone therefore
   needs it downloaded again, and `scripts/check-android-config.mjs` says so after every
   `cap sync` rather than leaving an empty dashboard to imply it.
8b. 👤 **Restrict the API key** in the Google Cloud console — an Android restriction
   (package name plus signing SHA-1) and an API restriction to the services in use. The
   key ships inside the APK whatever you do with the file, so restriction is the actual
   protection and secrecy is not.

---

## Phase 2 — Make the repo able to produce an uploadable file

**It can now**, and everything in this phase but the key itself is done. `npm run
android:bundle` produces a signed AAB; it refuses to start if there is no keystore, rather
than building an unsigned bundle Play would reject on upload.

9. 👤 **Generate an upload keystore** and back it up somewhere that is neither this
   repository nor one laptop. Losing it means you cannot update the app without Play's key
   reset process. **I will not generate this for you** — a signing key should not pass
   through a tool's hands, and it should not exist in a session transcript.

   ```
   keytool -genkeypair -v -keystore upload.jks -alias upload \
     -keyalg RSA -keysize 2048 -validity 10000
   ```

   Then write `android/keystore.properties`, which is gitignored:

   ```
   storeFile=/absolute/path/outside/this/repo/upload.jks
   storePassword=…
   keyAlias=upload
   keyPassword=…
   ```
10. ✅ ~~**Uncomment the keystore ignores.**~~ Done — `*.jks`, `*.keystore` and
    `keystore.properties` are ignored, and they stay that way because this repository is
    public and a published upload key cannot be taken back.
11. ✅ ~~**Add a release `signingConfig`.**~~ Done — it reads `android/keystore.properties`
    and is applied only when that file exists, so a machine without the key still builds a
    debug APK.
12. ✅ ~~**Add an `android:bundle` script.**~~ Done — it runs `build:release` (so Sentry
    gets the sourcemaps), syncs, and runs `bundleRelease`. New apps must publish as an App
    Bundle, which is why there is no release APK path.
13. ✅ ~~**Align the version numbers.**~~ Done — `package.json` is the one source.
    `versionName` is its version verbatim and `versionCode` is derived from it (1.4.2 →
    10402), so a release is a `package.json` bump and nothing else. Today that is
    `0.1.0` → `versionCode 100`. **Raise it before the first upload if you want to ship
    as 1.0.0.**
14. 👤 **Decide `minifyEnabled`.** It is `false`. The game is one WebView so R8 buys
    little, but write down which way you chose and why rather than leaving it a default.
15. 👤 **Enrol in Play App Signing** when you create the Console entry. Required for every
    app created after August 2021, so it is not a choice — and it is what makes the
    keystore in step 9 only an *upload* key. Google holds the app signing key, so a lost or
    leaked upload key is a reset in Play Console rather than an app you can never update.
    Generate a key for this app rather than reusing another app's: Play allows one key
    across several, and advises against it, because a leak would force a reset on all of
    them. The developer account is shared between apps; the key should not be.
16. 👤 **Confirm the target API level.** `android/variables.gradle` sets 36, which is at or
    above any floor I know of *(verify the current one)*.

---

## Phase 3 — Prove it on a real handset

A desktop browser does not reproduce touch latency, GPU limits, or the URL bar collapsing
mid-frame. Everything below needs hardware and none of it has been done.

17. 👤 **Install the release build on a phone** and play through several levels.
18. 👤 **Back up and restore** — `adb shell bmgr backupnow com.tinytempo.app`, wipe the
    app's data, `adb shell bmgr restore`. Confirm levels, settings and hearts return, and
    that Premium does **not** come back from a backup older than 30 days.
19. 👤 **Confirm an analytics event in DebugView** —
    `adb shell setprop debug.firebase.analytics.app com.tinytempo.app`, then watch
    DebugView in the Firebase console. Firebase batches for up to an hour otherwise, so an
    empty dashboard proves nothing.
20. ✅ ~~**Run `npm run build:release` once for real.**~~ Done — maps uploaded and filed
    under `tiny-tempo@0.1.0`, with nothing left in `dist/` and no credential in the
    output. What remains is to read a **symbolicated** trace, which needs a release build
    on a device: install it, trigger a crash, and check the frames in Sentry name real
    files and lines rather than `index-9zeIT.js:1:48213`.
20b. 👤 **Rotate the Sentry auth token** if it has been anywhere but a secret store. It
    has project-write scope and reissuing takes a click.
21. 👤 **Check the support route**: Settings → Help → *Write to us* should open a mail app
    with the details filled in, and *Copy details* should reach the clipboard. Both are
    conveniences over text that stays readable without them, so neither is a blocker.
22. 👤 **Buy something with a test account** — both products, plus Restore Purchases, plus
    a rewarded ad. This is the path that takes money; it should not first run in
    production.

---

## Phase 4 — The store listing

23. 👤 **Screenshots.** At least two phone screenshots *(verify the current minimum and
    sizes)*. Capture the menu, a level mid-round, the star reveal and the map.
24. 🔧 **A 512×512 icon.** `npm run icons` cuts the launcher and web sizes from
    `assets/icon/tiny-tempo-1024.jpg` but deliberately skips 512. I can add it so the
    listing icon stays derived from the same master rather than being exported by hand.
25. 👤 **A 1024×500 feature graphic.** Nothing in the repo produces this.
26. 👤 **Short description (80 characters) and full description (4000).**
27. 👤 **Category, tags, and the contact email** — `dor1612@gmail.com`, which is correct
    for a personal project and matches both legal pages.

---

## Phase 5 — The forms that get apps rejected

28. 👤 **Re-publish the GitHub Pages legal site.** The pages have changed since they were
    last published — publisher name, the analytics section, the backup and save-code
    sections — so the live URL does not currently match the app you would submit. **This
    is not routine this time.**
29. 👤 **Data Safety.** Declare what the SDKs collect, not what your code does:
    - AdMob — device and advertising identifiers
    - Google Play Billing — the purchase itself. Play is the processor; the app stores no
      purchase history of its own beyond an opaque digest that stops a refill being
      granted twice
    - Sentry — crash logs and diagnostics
    - Firebase Analytics — the ten commerce events, plus device, app and app-instance
      information, with the Settings switch named as the user control
    - Game saves leave the device only through Android's own backup, to the player's own
      Google account
30. 👤 **Target audience.** The cartoon workshop look will read as child-appealing to a
    reviewer. Your published policy says the game is **not** directed at under-13s — keep
    the Console answer consistent with it, or change both together. Answering "children"
    puts you in the Families programme, which constrains ads and SDKs sharply.
31. 👤 **Content rating questionnaire** — disclose ads and in-app purchases.
32. 👤 **Ads declaration** — yes, the app contains ads.
33. 👤 **EEA analytics consent.** The in-app switch is a control, not a lawful basis.
    Either configure the UMP message to cover analytics purposes, or do not collect in the
    EEA. Decide before the first public release, not after.

---

## Phase 6 — Products, upload, roll out

34. 👤 **Create the Console app entry** and claim `com.tinytempo.app`. **This is
    permanent** — no app can ever change its package name.
35. 👤 **Create the in-app products with these exact IDs**, or the code will not find them:
    - `tinytempo_premium` — one-time purchase
    - `heart_refill_full` — consumable
36. 👤 **Upload to internal testing first.** It is the fastest track and it is where you
    find that a key is wrong.
37. 👤⏱ **Run the closed test** if the 12-testers rule applies to you. This is the two
    weeks from the top of the page.
38. 👤 **Apply for production access, then roll out.** Start at a small percentage; crash
    reporting is live and Sentry is where you will find out whether to continue.

---

## What is already done

So you do not spend time re-doing it:

- Crash reporting, confirmed against the live project — an event the game produced reached
  the dashboard and alerted. Only the sourcemap upload is unexercised (step 20).
- Analytics, wired to Firebase behind a consent switch, with every shipped event checked
  against Firebase's own limits.
- Cloud save, two ways: Android Auto Backup declared explicitly, and a checksummed save
  code the player can carry.
- An in-app support route, with the details a reply would otherwise have to ask for — and
  the address on the boot-failure panel, for the player who cannot reach Settings.
- Legal pages written, naming Dor Vadai, covering ads, purchases, crash reports,
  analytics, backup and the save code. **They need re-publishing (step 28).**
- The package name settled as `com.tinytempo.app`, before the first upload made it
  permanent.

## The shortest honest summary

Two things block an upload no matter what else happens: **the repo cannot sign or bundle
a release** (steps 9–12), and **the legal pages must be re-published** (step 28). The
AdMob test IDs are gone (step 6). Everything else is either an account you can open today
or a form you fill in once.
