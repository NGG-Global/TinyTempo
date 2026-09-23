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
 * Billing, Play Games and in-app updates are plugins in this module rather than npm
 * packages, which buys directness and costs the two guarantees a package would have given.
 * Nothing makes Gradle pull the libraries in, and nothing makes Capacitor register
 * the plugins — `cap` regenerates MainActivity from its own template if the file
 * is ever lost. Either omission compiles, installs and runs; the only symptom is
 * a store that reports itself unavailable, Games that never signs in, or an install
 * that never updates itself.
 */
const mainActivity = read('android/app/src/main/java/com/tinytempo/app/MainActivity.java') ?? '';
if (!mainActivity.includes('registerPlugin(PlayBillingPlugin.class)')) {
  notes.push('MainActivity.java does not register PlayBillingPlugin, so this build has no\n'
    + '    billing in it — every purchase would report the store as unavailable. Add\n'
    + '    registerPlugin(PlayBillingPlugin.class) before super.onCreate.');
}
if (!mainActivity.includes('registerPlugin(PlayUpdatePlugin.class)')) {
  notes.push('MainActivity.java does not register PlayUpdatePlugin, so this build cannot\n'
    + '    offer in-app updates — every install would stay on the version it shipped.\n'
    + '    Add registerPlugin(PlayUpdatePlugin.class) before super.onCreate.');
}

const appGradle = read('android/app/build.gradle') ?? '';
if (!appGradle.includes('com.android.billingclient:billing')) {
  notes.push('android/app/build.gradle has no com.android.billingclient:billing dependency,\n'
    + '    so PlayBillingPlugin cannot compile. See docs/BILLING.md.');
}
if (!appGradle.includes('com.google.android.play:app-update')) {
  notes.push('android/app/build.gradle has no com.google.android.play:app-update dependency,\n'
    + '    so PlayUpdatePlugin cannot compile. See docs/UPDATES.md.');
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

/*
 * Play Games Services fails the same way billing does, and worse: every piece of it is
 * configuration that compiles and installs whatever it says. The APP_ID meta-data is what
 * the Games SDK reads before any JavaScript runs, and against a wrong value — an OAuth
 * client id, a Firebase app id, the AdMob one — sign-in simply never succeeds, on a screen
 * that has no UI for it yet. The Application class is what calls PlayGamesSdk.initialize,
 * and `cap` regenerates MainActivity from its own template if the file is ever lost, which
 * would silently drop the plugin registration with it.
 */
const PGS_PROJECT_ID = '863268283344';
const manifest = read('android/app/src/main/AndroidManifest.xml') ?? '';
const application = read('android/app/src/main/java/com/tinytempo/app/TinyTempoApplication.java') ?? '';
const pgsProjectId = (/<string[^>]*name="game_services_project_id">([^<]*)<\/string>/.exec(strings)?.[1] ?? '').trim();

if (pgsProjectId !== PGS_PROJECT_ID) {
  notes.push('strings.xml does not carry the Play Games Services project id:\n'
    + `      found    ${pgsProjectId || '(missing)'}\n`
    + `      expected ${PGS_PROJECT_ID}\n`
    + '    The Games SDK reads this before anything else and signs nobody in without it.\n'
    + '    It is the numeric Games project id, not an OAuth client id or the Firebase app id.');
}
if (!manifest.includes('com.google.android.gms.games.APP_ID')) {
  notes.push('AndroidManifest.xml has no com.google.android.gms.games.APP_ID meta-data, so the\n'
    + '    Games SDK has no project to authenticate against. See docs/PLAY_GAMES.md.');
}
if (!manifest.includes('android:name=".TinyTempoApplication"')) {
  notes.push('AndroidManifest.xml does not name .TinyTempoApplication, so PlayGamesSdk.initialize\n'
    + '    never runs and authentication silently never happens.');
}
if (!application.includes('PlayGamesSdk.initialize')) {
  notes.push('TinyTempoApplication.java does not call PlayGamesSdk.initialize, so the Games SDK\n'
    + '    is never started. See docs/PLAY_GAMES.md.');
}
if (!mainActivity.includes('registerPlugin(PlayGamesPlugin.class)')) {
  notes.push('MainActivity.java does not register PlayGamesPlugin, so the web layer would see\n'
    + '    Play Games as permanently unavailable. Add registerPlugin(PlayGamesPlugin.class).');
}
if (!appGradle.includes('com.google.android.gms:play-services-games-v2')) {
  notes.push('android/app/build.gradle has no play-services-games-v2 dependency, so the Play\n'
    + '    Games classes cannot compile. See docs/PLAY_GAMES.md.');
}
// Declarations only: the file's own comments name the v1 coordinate in order to warn
// against it, and a check that cannot tell those apart cries wolf on every build.
const declaresGamesV1 = appGradle
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .some((line) => /\b(implementation|api|compileOnly)\b[^\n]*com\.google\.android\.gms:play-services-games(?!-v2)/.test(line));
if (declaresGamesV1) {
  notes.push('android/app/build.gradle depends on the deprecated Play Games Services v1 SDK\n'
    + '    (com.google.android.gms:play-services-games). Only play-services-games-v2 may be\n'
    + '    used; the two do not belong in the same build.');
}

/*
 * The Daily Tempo leaderboard id (`src/config/leaderboards.ts`). Empty is allowed — it is
 * how a build ships before the leaderboard exists, and the game simply offers no
 * leaderboard. What is not allowed is a value the Games SDK will refuse on every call: the
 * numeric Games project id pasted into the wrong field is the likely one, and it fails as
 * silently as a wrong APP_ID does. The rule is the one `leaderboardId` applies at runtime.
 */
const leaderboards = read('src/config/leaderboards.ts') ?? '';
const dailyTempo = read('src/config/dailyTempo.ts') ?? '';
const boardId = /^\s*dailyTempo:\s*'([^']*)'/m.exec(leaderboards)?.[1] ?? '';
const modeShips = /DAILY_TEMPO_AVAILABLE\s*=\s*true/.test(dailyTempo);
if (boardId !== '' && (!/^[A-Za-z0-9_-]{8,64}$/.test(boardId) || /^\d+$/.test(boardId))) {
  notes.push('src/config/leaderboards.ts has a Daily Tempo leaderboard id the Games SDK will refuse:\n'
    + `      found    ${boardId}\n`
    + '    It must be the Leaderboard ID from Play Console → Play Games Services → Leaderboards\n'
    + `    (letters, digits, - and _), not the numeric Games project id ${PGS_PROJECT_ID}.`);
}
/*
 * A leaderboard id that passes the character rule can still be wrong in a way that fails
 * silently on device: one retyped from a screenshot, where I and l, O and 0, o and 0 look
 * alike. The first id this game was given arrived exactly that way. The Console's ids are
 * URL-safe base64 of a small protobuf that carries the Games project id, so decode it and
 * check it names this project. The layout is observed rather than documented by Google,
 * so a mismatch is a warning to go and copy the id again, never a failed build.
 */
function projectOfLeaderboard(id) {
  try {
    const bytes = Buffer.from(id.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    // 0x0a <len> 0x08 <varint project> 0x10 0x02 ... : field 1 holds field 1 = project id.
    if (bytes[0] !== 0x0a || bytes[2] !== 0x08) return null;
    let value = 0n, shift = 0n, i = 3;
    for (; i < bytes.length && i < 14; i++) {
      value |= BigInt(bytes[i] & 0x7f) << shift;
      shift += 7n;
      if ((bytes[i] & 0x80) === 0) break;
    }
    // Type 2 is a leaderboard; achievements carry another type.
    if (bytes[i + 1] !== 0x10 || bytes[i + 2] !== 0x02) return null;
    return value.toString();
  } catch {
    return null;
  }
}
if (boardId !== '' && /^[A-Za-z0-9_-]{8,64}$/.test(boardId) && projectOfLeaderboard(boardId) !== PGS_PROJECT_ID) {
  notes.push('src/config/leaderboards.ts has a Daily Tempo leaderboard id that does not decode to\n'
    + `    Games project ${PGS_PROJECT_ID}:\n`
    + `      found    ${boardId}\n`
    + '    Copy it again with the copy button in Play Console → Play Games Services → Leaderboards;\n'
    + '    a retyped id (I/l, O/0, o/0) passes every other check and fails on every call.');
}
if (modeShips && boardId === '') {
  notes.push('Daily Tempo is switched on (src/config/dailyTempo.ts) but no leaderboard id is set in\n'
    + '    src/config/leaderboards.ts, so its scores are never submitted and the leaderboard button\n'
    + '    never appears. See docs/LEADERBOARDS.md.');
}

if (notes.length > 0) {
  console.warn(`\n  ⚠ ${notes.join('\n\n  ⚠ ')}\n`);
}
