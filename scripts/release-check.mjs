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
  { feature: 'Restart sheet, out of hearts', text: 'Get a heart and restart this level.', source: 'src/ui/restartSheet.ts' },
  { feature: 'Rasterised map, Scrapbook and menus', text: 'baked:', source: 'src/ui/bakedLayer.ts' },
  { feature: 'Credits: the original score', text: 'Alon Attaly', source: 'src/config/credits.ts' },
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
