/**
 * The live AdMob app and rewarded unit for Tiny Tempo.
 *
 * `appId` is duplicated in `android/app/src/main/res/values/strings.xml`, because the
 * manifest needs it before any JavaScript runs and the two files share no source. They
 * must stay identical: a mismatch is not a build error, it is an SDK that initialises
 * against an app this is not, so `scripts/check-android-config.mjs` compares them after
 * every `cap sync`.
 *
 * Both are live units. An ad requested from a handset on the bench is real inventory and
 * counts as invalid traffic, which is a policy matter rather than a bug — serve test ads
 * to any device you tap through yourself.
 *
 * @see https://developers.google.com/admob/android/test-ads
 */
export const ADMOB = {
  appId: 'ca-app-pub-6818267616933452~3245294136',
  rewardedUnitId: 'ca-app-pub-6818267616933452/9892619657',
  /**
   * The most mature ad content the game will show. Parental guidance, one step above
   * General: the game declares an audience of 13 and over, but its cartoon workshop will
   * draw younger players too, and an ad is the one thing on screen the game did not make.
   * The cost is some fill, on a format that is only ever opted into.
   */
  maxAdContentRating: 'ParentalGuidance',
  /**
   * Google's test ads in place of the live unit, in every build but a release. The live
   * ids are in every build, CI's debug APK included, and a live ad watched on the bench is
   * invalid traffic on the account (`__RELEASE_BUILD__`, set only by `build:release`).
   */
  testAds: !__RELEASE_BUILD__,
  /**
   * Phones that get test ads even from a release build: the ones you play on yourself.
   * Hashed device ids, comma separated, from `VITE_ADMOB_TEST_DEVICES`; Logcat prints a
   * phone's id the first time it requests an ad.
   */
  testDevices: testDeviceIds(import.meta.env.VITE_ADMOB_TEST_DEVICES),
} as const;

function testDeviceIds(raw: unknown): readonly string[] {
  if (typeof raw !== 'string') return [];
  return Object.freeze(raw.split(',').map(id => id.trim()).filter(id => /^[0-9A-Fa-f]{32}$/.test(id)));
}
