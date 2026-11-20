/**
 * The live AdMob app and its two units for Tiny Tempo: the rewarded unit the player opts
 * into, and the interstitial shown when the player leaves a level they played (`INTERSTITIAL`).
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
   * The interstitial shown on the way out of a level the player played, cleared, failed or
   * quit, paced by `INTERSTITIAL`. An empty string turns the format off: nothing is loaded and
   * nothing is shown.
   */
  interstitialUnitId: 'ca-app-pub-6818267616933452/6246850626',
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

/**
 * When the interstitial may play: on the way out of a level, whether the player cleared it,
 * failed it or quit it, once an attempt has begun. Google allows one at a break between levels
 * and forbids one straight after another or after every action (docs/INTERSTITIAL.md); the
 * level itself, never a single tap, is the unit here, and `minGapMs` is the floor between ads.
 * Every value is a business knob rather than a fact — tune them from the analytics, not by
 * feel. The counts are session memory: nothing is stored.
 */
export const INTERSTITIAL = {
  /**
   * The first level whose exit can show one. Levels 1–5 are a new player's first minutes, at
   * 14–18 seconds of play each, so an ad there would be the first thing about money they meet.
   */
  fromLevel: 6,
  /** At most one interstitial per this many played level exits from `fromLevel` on: every exit. */
  everyLevels: 1,
  /**
   * The least time after any full-screen ad has closed, the player's own rewarded ads
   * included, before an interstitial may open. Google forbids one straight after another, and
   * this keeps one off the heels of a rewarded ad or a level entered and left at once. Thirty
   * seconds is about one level's round trip on levels 6–14 (18–23 s of play, then the result
   * and the map) and well under it later, so a brisk player may skip one early on and ordinary
   * play sees one on nearly every exit.
   */
  minGapMs: 30_000,
} as const;

function testDeviceIds(raw: unknown): readonly string[] {
  if (typeof raw !== 'string') return [];
  return Object.freeze(raw.split(',').map(id => id.trim()).filter(id => /^[0-9A-Fa-f]{32}$/.test(id)));
}
