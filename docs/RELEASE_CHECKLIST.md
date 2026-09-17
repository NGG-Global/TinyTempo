# Play Console release readiness

Audited against the repository at `claude/sweet-meitner-9bnhvq`. Two parts: what
the product is missing, and everything that has to be done before an upload.

**On Play policy specifics.** Everything marked *(verify)* is a Google Play rule
rather than a fact about this repository. Play changes target-API deadlines,
Billing Library minimums, listing asset specs and the Data Safety form regularly,
and they are not worth taking from memory — check each against the current
Play Console help pages when you get there. Everything not marked *(verify)* was
read out of the repository and is accurate as of this audit.

---

## Part 1 — What the product is missing

### Things that would hurt after launch, in the order they would hurt

**1. ~~No crash reporting.~~ Done — needs a Sentry account to switch on.**
`core/errors.ts` captures window errors, unhandled rejections and explicit
reports, with de-duplication, a session cap, breadcrumbs and redaction;
`diagnostics/sentry.ts` is the vendor adapter, loaded only when a DSN was built
in. See `docs/DIAGNOSTICS.md`. What is left is operational, not code: create the
project, set the four environment variables, and run the sourcemap upload once
for real — it has only been exercised on its failure path here.

**2. ~~Progress lives only on the device.~~ Done — needs one check on hardware.**
Two answers, neither of them an account. Auto Backup is now declared rather than
left to the platform default: `backup_rules.xml` and `data_extraction_rules.xml`
name the WebView's storage directory, which covers a new phone and a reinstall
with no player effort. And `TransferScene` shows progress as a checksummed save
code and accepts one back, which covers cleared data, a lost device and a support
email. Restoring merges, so it can only ever add. Backup rules are file-level and
all seven keys share one store, so the premium cache could not be excluded — it
is bounded instead, and a restored backup can no longer grant Premium forever.
See `docs/SAVES.md`. What is left needs hardware: take and restore a real backup.

**3. Analytics goes nowhere.** `monetization/analytics.ts` is a typed event bus
with a default sink that logs in DEV and does nothing in a production build. Ten
commerce events are already instrumented — `health_empty`,
`rewarded_offer_shown`, `purchase_completed` and the rest — and every one of them
is discarded. You would ship a monetization funnel and be unable to see it. The
hook is deliberately provider-agnostic, so this is an afternoon's work, not a
rebuild.

**4. No in-app support route.** The store listing will carry a contact email, but
a player who loses progress or is charged twice has no path from inside the game.
Related: the address in the published privacy policy and terms is
`dor1612@gmail.com` — a personal Gmail on an NGG Global product. Worth moving to
a role address before the listing goes live.

### Real gaps that are not launch blockers

**5. One music track.** `docs/MUSIC.md` describes a single premixed 60-bar loop
at 120 BPM, and the game is endless. A player in a twenty-minute session hears it
roughly twenty times. For a rhythm game this is the largest retention risk on the
list; the seven WAV stems are already in `bgm/`, so a second arrangement is
cheaper than it looks.

**6. English only.** No localization layer at all — every string is a literal in
the scene that draws it. `android:supportsRtl="true"` is set but nothing is
authored RTL. Hebrew is an obvious first candidate for an NGG title.

**7. No Play Games Services.** No achievements, no leaderboards, and no Saved
Games. Saved Games was the obvious answer to gap 2 and is no longer needed for
it; achievements and leaderboards are still worth having for their own sake, and
would want a sign-in the game does not otherwise ask for.

**8. No rate prompt, no share, no "what's new".** Nothing asks a happy player to
review, which is what drives early ranking.

**9. Audio is one mute switch.** No separate music and effects levels. Common
request, and the `AudioEngine` already separates the two buses.

**10. Accessibility stops at reduced motion.** `core/motionPreference.ts` is
honoured throughout, which is good. But the coral-on-green palette has had no
colour-vision check, there is no text-size option, and the judged-tap windows in
`config/rhythm.ts` are not adjustable for players who need a wider one.

**11. Rewarded ads are the only ad surface, in one placement.** That is the
player-friendly choice and I would not change it, but it means revenue leans
almost entirely on the $4.99 Premium. Worth knowing before you model anything.

**12. The identity is inconsistent, and one half of it is permanent.** The
`applicationId` is `com.ngg.smallacts`; the app is called Tiny Tempo.
**The application ID can never be changed once published.** Decide now whether
you can live with it. `package.json` says `0.1.0`, Android says `versionName
"1.0"`, and the settings footer reads from `package.json` — so the app currently
tells the player one version and the store another.

---

## Part 2 — The checklist

### A. Build and signing — nothing here exists yet

- [ ] **Create an upload keystore.** Back it up somewhere that is not this
      repository and not one person's laptop; losing it means you cannot update
      the app without Play's key-reset process.
- [ ] **Uncomment the keystore ignores in `android/.gitignore`** (lines 56–58).
      They ship commented out, so a `.keystore` dropped in `android/` would be
      committed.
- [ ] **Add a release `signingConfig`** to `android/app/build.gradle`. Read the
      credentials from environment variables or an untracked
      `android/keystore.properties`, never from the file itself.
- [ ] **Enrol in Play App Signing** *(verify — required for new apps)*.
- [ ] **Produce an AAB, not an APK.** `scripts/build-android.mjs` runs
      `assembleDebug` and nothing else; `npm run android:apk` is a debug path.
      Add a `bundleRelease` script. *(verify — new apps must publish as AAB.)*
- [ ] **Decide on `minifyEnabled`.** It is `false` in the release build type.
      The game is one WebView, so R8 buys little, but leaving it off is a
      decision rather than an oversight — write down which.
- [ ] **Wire `versionCode` / `versionName` to one source.** They are hardcoded to
      `1` and `"1.0"` with no bump step; `package.json` is at `0.1.0` and is what
      the settings footer prints.
- [ ] **Confirm `targetSdkVersion`.** `android/variables.gradle` sets 36, which
      is at or above any minimum I am aware of — *(verify the current floor.)*
- [ ] **Check the shipped AAB size and the sourcemap guard.** CI already fails if
      a sourcemap reaches `dist/`; confirm the same for the bundle.

### B. Turn crash reporting on

The code is in and tested; these are the account-side steps.

- [ ] Create a Sentry project with platform **Browser → JavaScript** (`browser`),
      confirmed against Sentry's own platform table. Not Capacitor, not Android.
      Ignore the onboarding wizard that follows — the SDK and `init` are already in
      the repo, and following it would create a second initialisation.
- [ ] Set `VITE_SENTRY_DSN` for release builds. It is a write credential for an
      issue stream, so a debug build should not carry the production one.
- [ ] Set `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT` in the release
      environment only — never in the bundle.
- [ ] **Run `npm run build:release` once against the real project** and confirm a
      test error arrives *symbolicated*. Only the failure paths have been exercised
      here — no upload has ever landed, because this repository has no credentials.
- [ ] Confirm an event is actually visible in the Sentry dashboard. Sentry's own
      guidance is that the task is not done until you have seen one.
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

### C. Replace every placeholder — these are hard blockers

- [ ] **AdMob application ID** in `android/app/src/main/res/values/strings.xml`
      is Google's public test ID (`ca-app-pub-3940256099942544~3347511713`).
- [ ] **AdMob rewarded unit ID** in `src/config/ads.ts` is the matching test
      unit. Both must become real IDs from your own AdMob account.
- [ ] **RevenueCat public key.** `VITE_REVENUECAT_GOOGLE_API_KEY` is unset, and
      `src/monetization/boot.ts` deliberately keeps billing on the stub when it
      is empty — so a release built today would show the store and sell nothing.
      Inject it in the release build and confirm it reaches the bundle.
- [ ] **Confirm the Play Billing Library version** the RevenueCat Capacitor
      plugin pulls in *(verify — Play enforces a minimum.)*

### D. Play Console — products and services

- [ ] Create the Play Console app entry; claim `com.ngg.smallacts`.
- [ ] Create the in-app products with the exact IDs the code uses:
      `tinytempo_premium` (one-time) and `heart_refill_full` (consumable) —
      both from `src/monetization/types.ts`.
- [ ] Wire those products into RevenueCat and create the `tinytempo_premium`
      entitlement with that identifier.
- [ ] Link the AdMob app to the Play listing.
- [ ] Publish `app-ads.txt` at the root of your developer-website domain and
      declare that domain in AdMob. You already publish to
      `ngg-global.github.io/TinyTempo/`, which is a project path, not a root —
      you may need a domain you control.
- [ ] Set up a merchant account for paid distribution.

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
- [ ] Category, tags, and a contact email that is not a personal Gmail.

### F. Play Console — the forms that get apps rejected

- [ ] **Data Safety.** Declare what the SDKs collect, not what your code does:
      AdMob collects device and advertising identifiers; RevenueCat collects a
      purchase history and an anonymous app user ID; **Sentry now receives crash
      reports** — declare these under Crash logs and Diagnostics. The game's own
      save data leaves the device only through Android's own backup, to the
      player's Google account, which is worth stating accurately. The privacy
      policy now says so, and describes the save code.
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
- [ ] Privacy policy URL: `https://ngg-global.github.io/TinyTempo/privacy/` is
      live and covers advertising, purchases, retention, children and — as of the
      crash-reporting change — a section 6 on what a crash report contains and what
      it does not. Re-publish Pages so the live page matches the app you submit.

### G. Testing before you promote anything

- [ ] Run the release AAB on a real handset — an APK built from `assembleDebug`
      does not prove the signed bundle works.
- [ ] **Buy each product end to end with a licence tester account.** Premium,
      then a refill, then Restore on a fresh install.
- [ ] Watch a real rewarded ad and confirm the heart lands.
- [ ] Exercise the AdMob consent form in an EEA/UK locale.
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
- [ ] Attach an analytics provider to the existing sink (gap 3).
- [ ] ~~Decide on cloud save~~ — done: Auto Backup plus a save code, `docs/SAVES.md`
      (gap 2).
- [ ] Settle the `com.ngg.smallacts` application ID — it is permanent (gap 12).
- [ ] Align `versionName`, `versionCode` and `package.json`.

### I. After launch

- [ ] Watch Play Vitals for ANRs and crash rate.
- [ ] Watch the funnel from the events you are already firing.
- [ ] Have a reply process for reviews, especially lost-progress reports.
- [ ] Keep a release branch and a changelog.
