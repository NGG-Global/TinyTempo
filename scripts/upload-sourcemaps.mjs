/**
 * Uploads the release's sourcemaps to Sentry, then deletes them from `dist/`.
 *
 * The deletion is the point as much as the upload. `cap sync` copies `dist/` verbatim
 * into the APK, so a `.map` left behind ships roughly 11 MB of readable engine and game
 * source to every install — which is what `sourcemap: false` has been guarding against.
 * This script is the only place allowed to emit them, and it always cleans up after
 * itself, including when the upload fails.
 *
 * Needs SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT. Without them it deletes the
 * maps and exits non-zero, because a release whose maps were never uploaded produces
 * unreadable stack traces and is worse than one that failed loudly.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DIST = join(ROOT, 'dist');
const { version } = createRequire(import.meta.url)('../package.json');
const RELEASE = `tiny-tempo@${version}`;

function maps(directory) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...maps(path));
    else if (entry.endsWith('.map')) found.push(path);
  }
  return found;
}

function removeMaps() {
  const found = maps(DIST);
  for (const path of found) rmSync(path);
  console.log(`removed ${found.length} sourcemap file(s) from dist/`);
  return found.length;
}

const { SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT } = process.env;
if (!SENTRY_AUTH_TOKEN || !SENTRY_ORG || !SENTRY_PROJECT) {
  removeMaps();
  console.error('SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT are required to upload.');
  process.exit(1);
}

try {
  // `npx` rather than a dependency: the CLI is a release-time tool and has no business
  // in the lockfile of a game that ships one bundle.
  const result = spawnSync('npx', [
    '--yes', '@sentry/cli@2', 'sourcemaps', 'upload',
    '--org', SENTRY_ORG,
    '--project', SENTRY_PROJECT,
    '--release', RELEASE,
    'dist',
  ], { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
  else console.log(`uploaded sourcemaps for ${RELEASE}`);
} finally {
  removeMaps();
}
