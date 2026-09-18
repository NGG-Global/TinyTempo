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
   takes days rather than minutes. The developer name must be **Tiny Tempo Games** — the
   privacy policy and terms name it as the publisher and data controller, and Play
   verifies and publicly displays it. If you would rather be named personally, tell me and
   I will change the legal pages instead; they have to agree.
2. 👤 **Create the AdMob account and app**, then one **rewarded** ad unit. You need the app
   ID and the unit ID in Phase 1.
3. 👤 **Create the RevenueCat project**, add the Android app, and get the **public** SDK key.
4. 👤 **Create the Firebase project** and add an Android app with package name
   `com.tinytempo.app`. Download `google-services.json`.
5. 👤 **Get the Sentry values**: the DSN is already working, but a release also needs
   `SENTRY_ORG`, `SENTRY_PROJECT` and an auth token with project-write scope.

---

## Phase 1 — Put the real keys in

Nothing here is optional. Every one of these is a placeholder today, and two of them are
Google's public test IDs, which is a policy violation if shipped.

6. 👤🔧 **Replace the AdMob IDs.** Currently `ca-app-pub-3940256099942544~…`, which is
   Google's test app. In two places, and they must match:
   - `android/app/src/main/res/values/strings.xml` → `admob_app_id`
   - `src/config/ads.ts` → `appId` and `rewardedUnitId`
7. 👤 **Create `.env` from `.env.example`** and fill in:

   ```
   VITE_REVENUECAT_GOOGLE_API_KEY=…   # empty keeps billing on the stub — nobody can pay
   VITE_SENTRY_DSN=…                  # empty disables crash reporting silently
   VITE_ANALYTICS=on                  # anything else sends no events
   VITE_ANALYTICS_CONSENT=…           # where the Settings switch starts
   ```

   `.env` is gitignored on purpose — a DSN is a write credential — so it does not travel
   with the repo and a fresh clone has none of this. `npm run build` now warns when the
   DSN is missing and `npm run build:release` refuses outright.
8. 👤 **Drop `google-services.json` into `android/app/`.** Capacitor's Gradle template
   applies the Google Services plugin only when that file exists, so until it does, the
   build simply has no Firebase in it and no analytics event can leave.

---

## Phase 2 — Make the repo able to produce an uploadable file

**It cannot today.** `buildTypes.release` in `android/app/build.gradle` has no
`signingConfig`, and `scripts/build-android.mjs` runs `assembleDebug` and nothing else.
There is no path from this repository to a file Play will accept.

9. 👤 **Generate an upload keystore** and back it up somewhere that is neither this
   repository nor one laptop. Losing it means you cannot update the app without Play's key
   reset process. **I will not generate this for you** — a signing key should not pass
   through a tool's hands, and it should not exist in a session transcript.
10. 🔧 **Uncomment the keystore ignores** in `android/.gitignore` (lines 56–58). They ship
    commented out, so a `.keystore` dropped in `android/` would be committed.
11. 🔧 **Add a release `signingConfig`** reading from an untracked
    `android/keystore.properties`, never from hardcoded values.
12. 🔧 **Add an `android:bundle` script** that runs `bundleRelease` and produces an **AAB**.
    *(verify — new apps must publish as an App Bundle, not an APK.)*
13. 🔧 **Align the version numbers.** `build.gradle` hardcodes `versionCode 1` /
    `versionName "1.0"`; `package.json` says `0.1.0` and is what the Settings footer
    prints. The app currently tells the player one version and the store another. They
    should come from one source with a bump step.
14. 👤 **Decide `minifyEnabled`.** It is `false`. The game is one WebView so R8 buys
    little, but write down which way you chose and why rather than leaving it a default.
15. 👤 **Enrol in Play App Signing** when you create the Console entry *(verify — required
    for new apps)*.
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
20. 👤 **Run `npm run build:release` once for real**, with `SENTRY_ORG`, `SENTRY_PROJECT`
    and `SENTRY_AUTH_TOKEN` set, and confirm a test error arrives **symbolicated**. Only
    the failure paths have ever been exercised; until this runs, every stack trace from a
    release build arrives minified, which is the one thing that makes a crash report
    useless.
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
    - RevenueCat — purchase history and an anonymous app user ID
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
- Legal pages written, naming Tiny Tempo Games, covering ads, purchases, crash reports,
  analytics, backup and the save code. **They need re-publishing (step 28).**
- The package name settled as `com.tinytempo.app`, before the first upload made it
  permanent.

## The shortest honest summary

Three things block an upload no matter what else happens: **the AdMob test IDs must go**
(step 6), **the repo cannot sign or bundle a release** (steps 9–12), and **the legal pages
must be re-published** (step 28). Everything else is either an account you can open today
or a form you fill in once.
