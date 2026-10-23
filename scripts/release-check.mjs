#!/usr/bin/env node
/**
 * Two checks that stand in front of a release build, because 0.1.15 went to Play built from
 * a checkout that was behind main: none of the timing details, the cloud save, the per-route
 * Tap offset, kept mastery or the restart sheet were in it, and nothing said so.
 *
 *   node scripts/release-check.mjs source     before the build: this checkout has all of
 *                                             origin/main, and the version it ships is committed
 *   node scripts/release-check.mjs contents   after the build: the bundle carries every shipped
 *                                             feature in RELEASE_MARKERS
 *
 * `RELEASE_SOURCE_OFFLINE=1` lets `source` pass when origin cannot be reached, and says so;
 * it never lets a checkout that is known to be behind through.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Text each shipped feature puts in the bundle, as written in its source. String literals
 * survive minification, so a feature missing from the build is a marker missing from it.
 * Add one when a feature ships; `tests/releaseCheck.test.ts` fails if a marker stops
 * appearing in `src/`, so the list cannot rot into checking for text nobody writes.
 */
export const RELEASE_MARKERS = Object.freeze([
  { feature: 'Tutorial count-in and tap-along pass', text: 'Count down', source: 'src/game/TutorialRun.ts' },
  { feature: 'Play Games Saved Games', text: 'tiny-tempo-progress', source: 'src/playgames/cloudSave.ts' },
  { feature: 'Timing details on the result', text: 'TIMING DETAILS', source: 'src/scenes/PlayScene.ts' },
  { feature: 'Tap offset per audio route', text: 'Bluetooth audio', source: 'src/game/routeCalibration.ts' },
  { feature: 'Kept mastery: a flawless replay', text: 'IN THE POCKET AGAIN', source: 'src/scenes/PlayScene.ts' },
  { feature: 'Restart sheet', text: 'Restart from the beginning?', source: 'src/ui/restartSheet.ts' },
  { feature: 'Two free restarts a day, then an ad', text: 'No restarts left', source: 'src/ui/restartSheet.ts' },
  { feature: 'Daily reminder offer and switch', text: 'A reminder in the evening?', source: 'src/game/screenHints.ts' },
  { feature: 'Tap offset lane, reasons and check run', text: 'Try a steadier beat', source: 'src/game/calibrationCopy.ts' },
  { feature: 'Rasterised map, Scrapbook and menus', text: 'baked:', source: 'src/ui/bakedLayer.ts' },
  { feature: 'Credits: the original score', text: 'Alon Attaly', source: 'src/config/credits.ts' },
  { feature: 'Endless Mode', text: 'Run interrupted', source: 'src/scenes/EndlessScene.ts' },
  { feature: 'A heart kept on two stars, the first area free', text: 'keepAtStars', source: 'src/game/health.ts' },
  { feature: 'Review offered on the first two-star finale', text: 'minStars', source: 'src/review/appReview.ts' },
  { feature: 'Tutorial opens on tapping along', text: '1 / 2 · TAP ALONG', source: 'src/scenes/TutorialScene.ts' },
  { feature: 'Tutorial step analytics', text: 'tutorial_step_ended', source: 'src/monetization/analytics.ts' },
  { feature: 'Early or late beside the verdict', text: 'verdictTag', source: 'src/scenes/PlayScene.ts' },
  { feature: 'Android back button on every screen', text: 'handleBack', source: 'src/core/backButton.ts' },
  { feature: 'Silence while the app is in the background', text: 'setAppActive', source: 'src/audio/backgroundSilence.ts' },
  { feature: 'Analytics off until chosen where consent is required', text: 'analyticsChosen', source: 'src/game/settings.ts' },
  { feature: 'Ad content capped', text: 'maxAdContentRating', source: 'src/config/ads.ts' },
  { feature: 'Try again guarded and priced', text: 'summaryWallAt', source: 'src/scenes/PlayScene.ts' },
  { feature: 'Feedback from Settings', text: 'Tell us what to fix or keep', source: 'src/scenes/SettingsScene.ts' },
  { feature: 'Resume continues from the task it stopped in', text: 'continuing', source: 'src/game/playAnalytics.ts' },
  { feature: 'Codas ring on when the next task is placed', text: 'cancelPlan', source: 'src/audio/AudioEngine.ts' },
  { feature: 'Introductions for the offbeat and the long phrase', text: 'Between the beats', source: 'src/game/conceptIntro.ts' },
  { feature: 'Every act ending read against the level bar', text: 'partialBand', source: 'src/game/taskVerdict.ts' },
  { feature: 'The plateau vocabulary', text: 'X X - X X - - X X - X - X X X -', source: 'src/game/levels.ts' },
  { feature: 'A steady lean named on the route card', text: 'Tune the Tap offset for this audio.', source: 'src/game/routeCalibration.ts' },
  { feature: 'A new act in every area, and the keepsakes testers held kept', text: 'tiny-tempo.keepsakes.v1', source: 'src/game/keepsakeLegacy.ts' },
  { feature: 'Five more areas, Space to Art Deco', text: 'Art Deco', source: 'src/game/levels.ts' },
  { feature: 'The instant camera act', text: 'One for the album.', source: 'src/vignettes/registry.ts' },
  { feature: 'First-visit hints on the Scrapbook, Settings and Endless', text: 'Keepsakes for three stars', source: 'src/game/screenHints.ts' },
  { feature: 'How to play moves to Settings after the lesson', text: 'Take the short lesson again', source: 'src/scenes/SettingsScene.ts' },
  { feature: 'Tap-to-open gates and area badges', text: 'Area badge collected', source: 'src/scenes/MapScene.ts' },
  { feature: 'The last-beat offbeat held to level 11, with its introduction', text: 'Ends after beat 4', source: 'src/game/conceptIntro.ts' },
  { feature: 'Reset progress holds, on the device and across Play Games', text: 'tiny-tempo.reset.v1', source: 'src/game/progress.ts' },
  { feature: 'Words over the first levels, and the ball through level 3', text: 'No ball this time', source: 'src/game/teachCopy.ts' },
  { feature: 'Replay timers for sale, Premium honoured but withdrawn', text: 'replay_timer_30m', source: 'src/monetization/types.ts' },
  { feature: 'The Workshop store on the map, with the timer left', text: 'Restore purchases', source: 'src/monetization/copy.ts' },
  { feature: 'US-state opt-outs passed to Unity Ads', text: 'UnityAdsPrivacy', source: 'src/monetization/native.ts' },
]);

/** Which markers a built bundle is missing. */
export function missingMarkers(bundle, markers = RELEASE_MARKERS) {
  return markers.filter(marker => !bundle.includes(marker.text));
}

/**
 * The verdict on the checkout a release is built from. `behind` is how many commits of
 * origin/main it lacks, or null when origin could not be reached.
 */
export function sourceVerdict({ behind, offlineAllowed = false, versionUncommitted = false, dirty = [] }) {
  const errors = [];
  const warnings = [];
  if (behind === null) {
    if (offlineAllowed) warnings.push('origin/main could not be reached; RELEASE_SOURCE_OFFLINE=1 lets this build go ahead unchecked.');
    else errors.push('origin/main could not be reached, so this checkout cannot be shown to hold everything merged. Connect and retry, or set RELEASE_SOURCE_OFFLINE=1 knowingly.');
  } else if (behind > 0) {
    errors.push(`This checkout is ${behind} commit${behind === 1 ? '' : 's'} behind origin/main: merged work would be missing from the release. Run \`git pull origin main\` and build again.`);
  }
  if (versionUncommitted) {
    errors.push('package.json\'s version is changed but not committed. It is the only version the app has (versionName, versionCode, Sentry\'s release), so commit it before building what Play will receive.');
  }
  if (dirty.length > 0) warnings.push(`Uncommitted changes go into this build: ${dirty.join(', ')}`);
  return { ok: errors.length === 0, errors, warnings };
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function checkSource() {
  let behind = null;
  try {
    git(['fetch', '--quiet', 'origin', 'main']);
    behind = Number(git(['rev-list', '--count', 'HEAD..origin/main']));
  } catch {
    behind = null;
  }
  let dirty = [];
  let versionUncommitted = false;
  try {
    // Names only: porcelain's two status columns start with a space that trimming eats.
    dirty = git(['diff', '--name-only', 'HEAD']).split('\n').filter(Boolean);
    versionUncommitted = dirty.includes('package.json') && git(['diff', 'HEAD', '--', 'package.json']).includes('"version"');
  } catch { /* not a git checkout: the fetch above already failed and says so */ }
  return sourceVerdict({ behind, offlineAllowed: process.env.RELEASE_SOURCE_OFFLINE === '1', versionUncommitted, dirty });
}

function checkContents(dist = 'dist') {
  const assets = join(dist, 'assets');
  let bundle = '';
  try {
    for (const name of readdirSync(assets)) if (name.endsWith('.js')) bundle += readFileSync(join(assets, name), 'utf8');
  } catch {
    return { ok: false, errors: [`No built bundle in ${assets}. Run the build first.`], warnings: [] };
  }
  const missing = missingMarkers(bundle);
  return {
    ok: missing.length === 0,
    errors: missing.map(marker => `Missing from the bundle: ${marker.feature} ("${marker.text}"). The build is older than the code that ships it.`),
    warnings: [],
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  const result = mode === 'source' ? checkSource() : mode === 'contents' ? checkContents() : null;
  if (!result) {
    console.error('Usage: node scripts/release-check.mjs source|contents');
    process.exit(2);
  }
  for (const warning of result.warnings) console.warn(`release-check: ${warning}`);
  for (const error of result.errors) console.error(`release-check: ${error}`);
  if (!result.ok) process.exit(1);
  console.log(`release-check ${mode}: ok${mode === 'contents' ? ` (${RELEASE_MARKERS.length} features present)` : ''}`);
}
