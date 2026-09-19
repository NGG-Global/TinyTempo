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
} as const;
