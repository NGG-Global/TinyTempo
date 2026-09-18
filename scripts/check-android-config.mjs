import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Says what an Android build is missing, before it is built rather than after.
 *
 * Two of these fail by producing a build that looks fine. `google-services.json` is
 * gitignored because the repository is public, so a fresh clone has none and Capacitor's
 * Gradle template then applies no Google Services plugin at all — the APK simply has no
 * Firebase in it, and the only symptom is a dashboard that stays empty, which is
 * indistinguishable from an app nobody has played. And the AdMob IDs ship as Google's
 * public test app, which serves test ads happily and is a policy violation in production.
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

const strings = read('android/app/src/main/res/values/strings.xml') ?? '';
if (strings.includes('ca-app-pub-3940256099942544')) {
  notes.push('The AdMob app ID is still Google\'s public test ID. It serves test ads and is a\n'
    + '    policy violation in production. See docs/PLAY_UPLOAD.md step 6.');
}

if (notes.length > 0) {
  console.warn(`\n  ⚠ ${notes.join('\n\n  ⚠ ')}\n`);
}
