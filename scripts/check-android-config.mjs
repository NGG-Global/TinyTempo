import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Says what an Android build is missing, before it is built rather than after.
 *
 * Two of these fail by producing a build that looks fine. `google-services.json` is
 * gitignored because the repository is public, so a fresh clone has none and Capacitor's
 * Gradle template then applies no Google Services plugin at all — the APK simply has no
 * Firebase in it, and the only symptom is a dashboard that stays empty, which is
 * indistinguishable from an app nobody has played. And the AdMob app ID is written in two
 * files that nothing keeps in step, so an edit to one of them produces a build that runs
 * as a different app, or as no AdMob app at all.
 *
 * Warnings, not errors: a debug APK for a quick look on a handset is a legitimate thing
 * to build without any of this, and a script that refuses would just be worked around.
 */

const root = new URL('../', import.meta.url);
const read = (path) => {
  const file = fileURLToPath(new URL(path, root));
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
};

const notes = [];

const services = read('android/app/google-services.json');
const analyticsOn = (read('.env') ?? '').includes('VITE_ANALYTICS=on');
if (services === null) {
  notes.push(analyticsOn
    ? 'VITE_ANALYTICS=on but android/app/google-services.json is missing, so this build\n'
      + '    has no Firebase in it and will send no events. Download it from the Firebase\n'
      + '    console (Project settings -> your Android app). See docs/ANALYTICS.md.'
    : 'android/app/google-services.json is missing, so this build has no Firebase in it.\n'
      + '    Fine for a debug look; not for anything you expect events from.');
} else if (!services.includes('"package_name": "com.tinytempo.app"')) {
  // A file from the wrong Firebase app is worse than none: the plugin applies, the SDK
  // starts, and every event is filed under an app this is not.
  notes.push('android/app/google-services.json does not name com.tinytempo.app. Firebase\n'
    + '    would file this build\'s events under a different app. Re-download it for the\n'
    + '    right Android app in the Firebase console.');
}

/*
 * A RevenueCat key names the store it talks to. A Google Play key begins `goog_`;
 * anything else configures the SDK against a different store, which is a perfectly good
 * thing to develop against and a silent disaster to ship — the SDK starts, the catalogue
 * loads, and nobody can actually pay through Play.
 */
const key = (/^VITE_REVENUECAT_GOOGLE_API_KEY=(.*)$/m.exec(read('.env') ?? '')?.[1] ?? '').trim();
if (key !== '' && !key.startsWith('goog_')) {
  notes.push(`VITE_REVENUECAT_GOOGLE_API_KEY does not start with "goog_", so it is not a\n`
    + '    Google Play key and this build cannot take money through Play. Fine while you are\n'
    + '    developing against another store; check it before you ship.');
}

/*
 * The AdMob app ID is carried by two files that share no source: the manifest needs it
 * before any JavaScript runs, and the adapter needs it in the bundle. Neither Gradle nor
 * tsc can see the other, so a half-finished edit builds cleanly and starts the SDK against
 * whichever app the manifest happens to name. The unit ID fails the same way one level
 * down — a unit belonging to another publisher never fills, which on a dashboard is
 * indistinguishable from an app in which nobody watches ads.
 */
const TEST_PUBLISHER = 'ca-app-pub-3940256099942544';
const strings = read('android/app/src/main/res/values/strings.xml') ?? '';
const ads = read('src/config/ads.ts') ?? '';
const manifestAppId = (/<string name="admob_app_id">([^<]*)<\/string>/.exec(strings)?.[1] ?? '').trim();
const configAppId = /^\s*appId:\s*'([^']*)'/m.exec(ads)?.[1] ?? '';
const configUnitId = /^\s*rewardedUnitId:\s*'([^']*)'/m.exec(ads)?.[1] ?? '';

if (manifestAppId.startsWith(TEST_PUBLISHER) || configAppId.startsWith(TEST_PUBLISHER)) {
  notes.push('The AdMob IDs are still Google\'s public test IDs. They serve test ads and are a\n'
    + '    policy violation in production. See docs/PLAY_UPLOAD.md step 6.');
} else if (manifestAppId !== configAppId) {
  notes.push('The AdMob app ID differs between the two files that carry it:\n'
    + `      strings.xml    ${manifestAppId || '(missing)'}\n`
    + `      config/ads.ts  ${configAppId || '(missing)'}\n`
    + '    The manifest is what the SDK reads at startup, so this build would run as the app\n'
    + '    named there. Make them match.');
}

const publisher = /^(ca-app-pub-\d+)/.exec(configAppId)?.[1];
if (publisher !== undefined && !configUnitId.startsWith(`${publisher}/`)) {
  notes.push('The rewarded unit ID in src/config/ads.ts is not from the same publisher as the\n'
    + '    app ID, so it belongs to a different AdMob account. Requests against it will not\n'
    + '    fill, and an ad that never loads looks exactly like an ad nobody asks for.');
}

if (notes.length > 0) {
  console.warn(`\n  ⚠ ${notes.join('\n\n  ⚠ ')}\n`);
}
