# Play Console release readiness

Audited against the repository on 24 September 2026. Two parts: what
the product is missing, and everything that has to be done before an upload.

**On Play policy specifics.** Everything marked *(verify)* is a Google Play rule
rather than a fact about this repository. Play changes target-API deadlines,
Billing Library minimums, listing asset specs and the Data Safety form regularly,
and they are not worth taking from memory — check each against the current
Play Console help pages when you get there. Everything not marked *(verify)* was
read out of the repository and is accurate as of this audit.

---

**For the order to do all this in, see `docs/PLAY_UPLOAD.md`.** This file is the audit —
what is missing and why it matters. That one is the sequence, including which steps have
waiting periods and therefore have to start first.

## Part 1 — What the product is missing

### Things that would hurt after launch, in the order they would hurt

**1. ~~No crash reporting.~~ Done, and confirmed against the live project.**
`core/errors.ts` captures window errors, unhandled rejections and explicit
reports, with de-duplication, a session cap, breadcrumbs and redaction;
`diagnostics/sentry.ts` is the vendor adapter, loaded only when a DSN was built
in. An event the game itself produced has now reached the dashboard and alerted.
See `docs/DIAGNOSTICS.md`. One operational step remains: **run the sourcemap
upload once for real**, because it has only ever been exercised on its failure
path. Until then every stack trace from a release build arrives minified, which
is the one thing that makes a crash report useless.

**2. ~~Progress lives only on the device.~~ Done — needs one check on hardware.**
Two answers, neither of them an account. Auto Backup is now declared rather than
left to the platform default: `backup_rules.xml` and `data_extraction_rules.xml`
name the WebView's storage directory, which covers a new phone and a reinstall
with no player effort. And `TransferScene` shows progress as a checksummed save
code and accepts one back, which covers cleared data, a lost device and a support
email. Restoring merges, so it can only ever add. Backup rules are file-level and
every key shares one LevelDB store — progress, settings, the tutorial, the teach
flags, hearts, the refill ledger, the daily heart, the premium cache, daily
objectives, and the Daily Tempo best (unused while that mode is off) — so the
premium cache could not be excluded. It is bounded instead, and a restored backup
can no longer grant Premium forever. See `docs/SAVES.md`. What is left needs
hardware: take and restore a real backup.

**3. ~~Analytics goes nowhere.~~ Done — the project exists; DebugView is still unconfirmed.**
Commerce events and the gameplay events in `game/playAnalytics.ts` (levels,
stars, gates, the tutorial, finales, the Scrapbook, objectives) reach Google
Analytics for Firebase through `@capacitor-firebase/analytics`, behind the same
split crash reporting uses: `analytics/eventShape.ts` holds Firebase's limits as
pure functions, and `analytics/firebase.ts` is the only file that knows the
vendor. Play Games leaderboard events are on the same bus and are not sent while
`DAILY_TEMPO_AVAILABLE` is false. Worth being precise about what the commerce
events bought: Play Console already reported purchases and AdMob already reported
impressions, so what was invisible was the **top** of the funnel — offers shown,
and the players who declined. Settings → Privacy carries a **Share usage data**
switch, and consent deliberately does not travel in a save code. See
`docs/ANALYTICS.md`. The Firebase project and `google-services.json` are in place
for `com.tinytempo.app`. What is left is operational: restrict the API key,
confirm an event in DebugView, and decide EEA consent.

**4. ~~No in-app support route.~~ Done.** Settings → Help is an address plus the
seven lines a reply would otherwise have to ask for — build, device, level,
premium, hearts, reporting state and the save code — shown in full before
anything is sent. The boot panel carries the address too, for the player who
cannot reach Settings at all; because a device that refuses every canvas context
kills Phaser's import-time detection and `/src/main.ts` never runs, that one is an
inline script rather than bundle code. See `docs/SUPPORT.md`.

The contact address, `dor1612@gmail.com`, is correct and stays: this is a personal
project rather than an NGG product, whatever the repository host suggests.

### Real gaps that are not launch blockers

**5. One gameplay loop.** The title screen has its own track (`audio/ThemeMusic.ts`).
Everywhere else, `docs/MUSIC.md` describes a single premixed 60-bar loop at 120
BPM, and the game is endless. A player in a twenty-minute session hears that loop
roughly twenty times. For a rhythm game this is the largest retention risk on the
list; the seven WAV stems are already in `bgm/`, so a second arrangement is
cheaper than it looks.

**6. English only.** No localization layer at all — every string is a literal in
the scene that draws it. `android:supportsRtl="true"` is set but nothing is
authored RTL. Hebrew is an obvious first candidate given where this is written.

**7. ~~No Play Games Services.~~ Sign-in and achievements are in; Saved Games is still a plan.**
Play Games Services v2 authenticates on Android and is never required to play.
Five achievements unlock from clearing levels 10–50 and are derived from the
save, so an old save is owed them on the first signed-in launch. One leaderboard
id exists for a Daily Tempo that does not: `DAILY_TEMPO_AVAILABLE` is false, so
nothing is submitted and no button shows. Saved Games is deliberately not
written — see the plan in `docs/PLAY_GAMES.md`. The player id crosses the bridge
and reaches no log, crash report or analytics event.

**8. No rate prompt, no share, no "what's new".** Nothing asks a happy player to
review, which is what drives early ranking.

**9. Audio is one mute switch.** Haptics and the tap-offset calibration are
separate controls. There are still no separate music and effects levels. Common
request, and the `AudioEngine` already separates the two buses.

**10. Accessibility stops at reduced motion.** `core/motionPreference.ts` is
honoured throughout, which is good. But the coral-on-green palette has had no
colour-vision check, there is no text-size option, and the judged-tap windows in
`config/rhythm.ts` are not adjustable for players who need a wider one.

**11. Rewarded ads are the only ad surface, in one placement.** That is the
player-friendly choice and I would not change it, but it means revenue leans
almost entirely on the $4.99 Premium. Worth knowing before you model anything.

**12. ~~The identity is inconsistent~~ — half fixed; the version half remains.**
The `applicationId` is now `com.tinytempo.app`, renamed from `com.ngg.smallacts`
while that was still possible: **an application ID can never be changed once
published**, and the old one carried both a company prefix this is not published
under and the project's former name. The legal pages now name Dor Vadai as
publisher and data controller, which has to match the Play developer account
exactly.

The version half is closed. `package.json` is the only version (`0.1.0` today):
`versionName` is that string and `versionCode` is derived from it (100). The
settings footer, the support subject and the Sentry release tag read the same
string. Raise it before the first upload if the store listing should say 1.0.0.

---

## Part 2 — The checklist

### A. Build and signing — the key is the only part left

- [ ] **Create an upload keystore**, and write `android/keystore.properties`
      pointing at it. Back the keystore up somewhere that is not this repository
      and not one person's laptop; losing it means you cannot update the app
      without Play's key-reset process. `docs/PLAY_UPLOAD.md` step 9 has the
      `keytool` line and the file format.
- [x] ~~**Uncomment the keystore ignores in `android/.gitignore`.**~~ Done —
      `*.jks`, `*.keystore` and `keystore.properties` are all ignored, verified
      by dropping one of each in and checking `git status`.
- [x] ~~**Add a release `signingConfig`.**~~ Done — it reads the untracked
      `android/keystore.properties` and applies only when that file exists, so a
      machine without the key still builds a debug APK.
- [ ] **Enrol in Play App Signing** when you create the Console entry. Verified:
      it is required for every app created after August 2021, so this is not a
      choice. Google then holds the app signing key and your keystore is only the
      *upload* key — which means a lost or leaked upload key is recoverable
      through a reset in Play Console, rather than the end of the app.
- [ ] **Generate a keystore for this app, not ElmTrackr's.** Play permits one
      upload key across several apps and advises against it: a leak would force a
      reset on every app sharing it. The developer account is shared; the key
      should not be.
- [x] ~~**Produce an AAB, not an APK.**~~ Done — `npm run android:bundle` runs
      `build:release`, syncs and runs `bundleRelease`. It refuses to start
      without a keystore rather than producing an unsigned bundle Play would
      reject on upload. Verified end to end against a throwaway key, which was
      destroyed afterwards.
- [ ] **Decide on `minifyEnabled`.** It is `false` in the release build type.
      The game is one WebView, so R8 buys little, but leaving it off is a
      decision rather than an oversight — write down which.
- [x] ~~**Wire `versionCode` / `versionName` to one source.**~~ Done —
      `package.json` is that source. `versionName` is its version verbatim,
      `versionCode` is derived (1.4.2 → 10402) and the build throws rather than
      go backwards if minor or patch passes 99. **`0.1.0` gives versionCode 100;
      bump it before the first upload if you mean to ship as 1.0.0.**
- [x] ~~**Confirm `targetSdkVersion`.**~~ 36, and Play has required 36 for new
      apps and updates since 31 August 2026.
- [ ] **Check the shipped AAB size and the sourcemap guard.** CI already fails if
      a sourcemap reaches `dist/`; the release AAB was checked once and carried
      none. Re-check on the bundle you actually upload.

### B. Turn crash reporting on

The code is in and tested; these are the account-side steps.

- [ ] Create a Sentry project with platform **Browser → JavaScript** (`browser`),
      confirmed against Sentry's own platform table. Not Capacitor, not Android.
      Ignore the onboarding wizard that follows — the SDK and `init` are already in
      the repo, and following it would create a second initialisation.
- [ ] Set `VITE_SENTRY_DSN` for release builds. It is a write credential for an
      issue stream, so a debug build should not carry the production one.
- [x] ~~Set `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT`.~~ In `.env`, which
      is gitignored. The shell also works; the build reads both, because reading only
      the shell made following `.env.example` fail.
- [x] ~~Run `npm run build:release` once against the real project.~~ Done — nine maps
      uploaded, bundle filed under `tiny-tempo@0.1.0`, `dist/` left with no `.map`, and
      no credential anywhere in the output. Still to confirm: a *symbolicated* trace in
      the dashboard, which needs a release build running on a device.
- [ ] **Rotate `SENTRY_AUTH_TOKEN`** if it has ever been pasted anywhere but a secret
      store. It carries project-write scope, and reissuing one is a click.
- [x] ~~Confirm an event is actually visible in the Sentry dashboard.~~ Done — the
      event the app produced arrived, appeared, and alerted. Two events exist: one
      synthetic (`environment: verification`) and one from the app
      (`environment: development`); the synthetic one can be deleted, it was only ever
      a probe. **If a project ever looks empty again, check the environment filter**
      before anything else — a dev session reports as `development`.
- [ ] Confirm `dist/` holds no `.map` afterwards. `@sentry/vite-plugin` deletes
      them, `scripts/check-no-sourcemaps.mjs` fails the build if any survive, and
      CI checks the same thing on a plain build.
- [ ] Set the issue retention period, and check the free-tier event quota against
      `sampleRate: 1` in `src/config/diagnostics.ts`.
- [ ] Decide whether native crash capture is worth `@sentry/capacitor` later;
      `docs/DIAGNOSTICS.md` records why it was not taken now.

### B2. Prove the save survives a real device

The code and the rules are in; these need a handset and cannot be done here.

- [ ] Take and restore a backup against a debug build — `adb shell bmgr backupnow
      <package>`, then wipe the app's data and `adb shell bmgr restore` — and
      confirm levels, settings and hearts come back. Auto Backup is quota-limited
      and throttled by the platform, so this is the only way to know it works.
- [ ] Confirm the backup is off when the player has turned it off device-wide,
      and that the game still starts cleanly with nothing to restore.
- [ ] Check the Copy button inside a real Capacitor WebView. The Clipboard API
      needs a secure context and a permission a WebView can decline; the failure
      path is handled and the code stays readable on screen, but whether the
      button works there is untested.
- [ ] Type a code on a handset keyboard, not only paste one. The entry field is
      DOM (`#code-overlay`) precisely so the system keyboard opens; confirm it
      does, and that the layout survives the keyboard pushing the viewport.
- [ ] Confirm a restored backup does **not** carry Premium past
      `PREMIUM_CACHE_MAX_AGE_MS`, and that the store's own Restore still grants it.

### B3. Turn analytics on

The code is in and tested; these are the account-side steps.

- [x] ~~Create a Firebase project and add an Android app; download
      `google-services.json`.~~ Done, for `com.tinytempo.app`. It is **gitignored** — the
      repository is public — so a fresh clone needs it again, and
      `scripts/check-android-config.mjs` warns after `cap sync` when it is missing, when
      it names the wrong app, and when the two copies of the AdMob app ID disagree.
- [ ] **Restrict the Firebase API key** in the Google Cloud console: an Android
      restriction (package name plus signing SHA-1) and an API restriction to the services
      in use. The key ships in the APK regardless, so this is the real protection.
- [x] ~~Set `VITE_ANALYTICS=on`~~ — set locally in `.env`, along with
      `VITE_ANALYTICS_CONSENT=granted`. Leave both unset anywhere you do not want in the
      funnel; `.env` is gitignored, so no other checkout inherits them.
- [ ] Decide `VITE_ANALYTICS_CONSENT`. It sets where the Settings switch *starts*, not
      whether the player can change it.
- [ ] **Confirm an event in DebugView before trusting the dashboard.**
      `adb shell setprop debug.firebase.analytics.app <package>`, then watch DebugView in
      the Firebase console. Firebase batches events for up to an hour otherwise, so an
      empty dashboard proves nothing.
- [ ] Link the Firebase project to AdMob and to Play, which is the reason for using the
      native SDK rather than the web one.
- [ ] Set the Firebase data-retention period. The privacy policy points at it rather than
      naming a number, so the two cannot drift.
- [ ] **EEA consent is not finished.** The in-app switch is a control, not a lawful
      basis. Either configure the UMP message to cover analytics purposes, or do not
      collect in the EEA. Decide this before the first public release, not after.

### B4. Check the support route on a handset

Both buttons are conveniences over text that stays readable without them, so none of
these is a blocker — but none has been run on a device.

- [ ] Tap **Write to us** and confirm the WebView hands `mailto:` to a mail app with the
      subject and details already filled in, and that nothing breaks when no mail app is
      installed.
- [ ] Tap **Copy details** and confirm the clipboard works inside the WebView.
- [ ] Confirm the details block is legible on a small screen — it wraps with Phaser's
      advanced word wrap because a save code has no spaces to break at.
- [ ] Keep `dor1612@gmail.com` the same in `src/config/support.ts`, `index.html`'s inline
      boot handler, both legal pages, and the Play listing. Five places, no shared source.

### C. Replace every placeholder — these are hard blockers

- [x] ~~**AdMob application ID** and **rewarded unit ID**.~~ Done — the live
      `ca-app-pub-6818267616933452~3245294136` is in
      `android/app/src/main/res/values/strings.xml`, and it and
      `ca-app-pub-6818267616933452/9892619657` are in `src/config/ads.ts`. The app ID
      still lives in two files with no shared source, so
      `scripts/check-android-config.mjs` compares them after `cap sync`.
- [ ] **Confirm the unit is a rewarded unit** in the AdMob console. An ad unit ID does
      not encode its format, the adapter only ever calls `prepareRewardVideoAd`, and a
      unit of any other format fails to load rather than saying why.
- [ ] **UMP Privacy & messaging.** Create a GDPR (EEA/UK) message for the Android app
      and enable the privacy options form on it. Settings only shows **Ad privacy**
      while `privacyOptionsRequirementStatus` is `REQUIRED`; without that message the
      row never appears. Do not call `resetConsentInfo` from a production build — the
      wrapper deliberately does not expose it. Point the message's privacy policy URL
      at `https://tinytempo.games/privacy/`.
- [x] ~~**Billing provider key.**~~ Gone with the provider. Billing is Google Play
      Billing called directly from `PlayBillingPlugin.java`, authorised by the APK's
      signature and package name, so there is no key to inject and none to leak.
- [x] ~~**Confirm the Play Billing Library version.**~~ `android/variables.gradle` pins
      `playBillingVersion = '9.1.0'`. Play has required version 8 or later since
      31 August 2026, so this clears the floor with a generation in hand.

### D. Play Console — products and services

- [ ] Create the Play Console app entry; claim `com.tinytempo.app`.
- [ ] **Create the two one-time products** with the exact IDs from
      `src/monetization/types.ts`. Play Console is now the only place they are defined.
      Both are created under **In-app products**, not Subscriptions: the client queries
      `ProductType.INAPP`, and a subscription would not come back.
      | Play product | Play type | How the app treats it |
      | --- | --- | --- |
      | `tinytempo_premium` | One-time product | **Non-consumable.** Acknowledged, never consumed. Owning it in the Play account *is* the entitlement |
      | `heart_refill_full` | One-time product | **Consumable.** Granted, then consumed, so it can be bought again |
- [ ] **Check each product has an active price and is set to Active.** A product with no
      price returns no offer, and the game leaves a product with no localized price out of
      the catalogue rather than showing a guessed one — the button simply reports the
      store as unavailable.
- [ ] Link the AdMob app to the Play listing.
- [ ] Publish `app-ads.txt` at the root of your developer-website domain and
      declare that domain in AdMob. The live site is `tinytempo.games`.
- [ ] Set up a merchant account for paid distribution.
- [ ] **Confirm in-app updates on a Play-installed build.** A Studio-sideloaded
      APK never sees an update; that is Play's rule, not a bug. Ship a higher
      `versionCode` to an internal testing track, install the older build from
      Play, then the newer one: priority 0–3 should download in the background
      and show the restart sheet on a chrome screen, priority 4–5 should block.
      See `docs/UPDATES.md`.
- [ ] **Confirm in-app review on a Play-installed build.** The same rule: a sideload
      gets nothing from `requestReviewFlow`. From a closed-testing install with a
      fresh store, clear levels 1–10 and tap Continue on the level 10 result; Play's
      sheet appears at its discretion and the map follows either way. A replay of
      level 10 and a clear of level 20 must show nothing. See `docs/IN_APP_REVIEW.md`.

### E. Store listing assets — none of these exist in the repo

- [ ] App icon, 512×512 PNG. `npm run icons` cuts the launcher and web sizes from
      `assets/icon/tiny-tempo-1024.jpg` but deliberately skips 512; add it to the
      script so the listing icon stays derived from the same master.
- [ ] Feature graphic, 1024×500.
- [ ] Phone screenshots — at least two *(verify the current minimum and sizes)*.
      Capture the menu, a level mid-round, the star reveal and the map.
- [ ] Tablet screenshots, if you declare tablet support.
- [ ] Short description (80 characters) and full description (4000).
- [ ] Optional but worth it: a 30-second promo video.
- [ ] Category, tags, and the contact email — `dor1612@gmail.com`, which is correct
      for a personal project and matches both legal pages.

### F. Play Console — the forms that get apps rejected

- [ ] **Data Safety.** Declare what the SDKs collect, not what your code does:
      AdMob collects device and advertising identifiers; Google Play processes the
      purchases and the app keeps no purchase history of its own; **Sentry now receives crash
      reports** — declare these under Crash logs and Diagnostics. **Firebase
      Analytics now receives the commerce events and the gameplay events** (levels,
      stars, gates, tutorial, finales, Scrapbook, objectives) plus the device, app
      and app-instance information Firebase collects itself — declare these under
      App activity and Diagnostics, and note the Settings switch as the user
      control. Leaderboard events are not sent while Daily Tempo is off. **Play
      Games** receives the player id and display name when the player is signed
      in, and achievement unlocks; it does not receive a cloud save. The game's own
      save data leaves the device only through Android's own backup, to the
      player's Google account, and through a save code the player chooses to copy.
      The privacy policy says so.
- [ ] **Content rating questionnaire.** Disclose ads and in-app purchases.
- [ ] **Target audience and content.** The cartoon workshop look will read as
      child-appealing to a reviewer. If you select a child audience you enter the
      **Families policy**, which constrains ads and SDKs sharply. Your published
      privacy policy already states the game is *not* directed at under-13s —
      keep the Console answer consistent with it, or change both together.
- [ ] **Ads declaration** — yes, the app contains ads.
- [ ] **Government apps / financial features / health** — all no.
- [ ] **Account deletion** — the game has no accounts, so this likely does not
      apply *(verify how the requirement is phrased now.)*
- [ ] Privacy policy URL: `https://tinytempo.games/privacy/` is
      live and covers advertising, purchases through Google Play Billing (no
      separate billing provider), Play Games, retention, children, crash reports,
      and analytics for both commerce and gameplay. Point Play,
      AdMob and Settings at this URL, not the old GitHub Pages copy.
- [ ] **Confirm the developer name matches the legal pages.** Both name *Dor Vadai*
      as publisher and data controller, which is the name on the Play account. Play
      verifies it and displays it publicly, so if either ever changes, change both.

### G. Testing before you promote anything

- [ ] Run the release AAB on a real handset — an APK built from `assembleDebug`
      does not prove the signed bundle works.
- [ ] **Buy each product end to end with a licence tester account.** Premium,
      then a refill, then Restore on a fresh install.
- [ ] **Register the handset as a test device in AdMob first.** The unit is live, so
      every ad you tap through on the bench is real inventory and counts as invalid
      traffic.
- [ ] Watch a real rewarded ad and confirm the heart lands.
- [ ] Exercise the AdMob consent form in an EEA/UK locale.
- [ ] Confirm Settings → Privacy shows **Ad privacy** in that locale, that the
      privacy-options form opens from it, and that refusing or withdrawing consent
      leaves rewarded ads unavailable rather than serving them anyway. The row is
      hidden unless UMP reports `privacyOptionsRequirementStatus === REQUIRED`.
- [ ] Test with no network, and with the store unavailable — the code is written
      to fall back to a stub, so confirm the copy in `monetization/copy.ts` is
      what the player actually sees.
- [ ] Test on a low-end device and on a tall 20:9 handset. The scaling model in
      `CLAUDE.md` warns that logical size is not constant.
- [ ] Confirm the portrait lock, the haptics switch, and that reduced motion is
      honoured system-wide.
- [ ] Internal testing track → closed testing → production. *(verify — Play has
      required a period of closed testing with a minimum tester count for some
      new developer accounts.)*

### H. Before the first public build

- [x] Add crash reporting (gap 1) — code done; account steps in section B.
- [ ] ~~Attach an analytics provider to the existing sink~~ — done, `docs/ANALYTICS.md`.
- [ ] ~~Decide on cloud save~~ — done: Auto Backup plus a save code, `docs/SAVES.md`
      (gap 2).
- [x] ~~Settle the application ID~~ — `com.tinytempo.app`, renamed before first
      publish because it is permanent afterwards (gap 12).
- [x] ~~Align `versionName`, `versionCode` and `package.json`.~~ Done —
      `package.json` is the only source. It is `0.1.0` today (`versionCode` 100);
      bump it before the first upload if the listing should say 1.0.0.

### I. After launch

- [ ] Watch Play Vitals for ANRs and crash rate.
- [ ] Watch the funnel from the events you are already firing.
- [ ] Have a reply process for reviews, especially lost-progress reports.
- [ ] Keep a release branch and a changelog.
