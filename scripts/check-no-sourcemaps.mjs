/**
 * Refuses to let a build pass with a sourcemap left in `dist/`.
 *
 * `@sentry/vite-plugin` deletes them itself after upload, and in testing it did so even
 * when the upload failed — but this is the one mistake whose cost is paid by every
 * installed APK rather than by the machine that made it. `cap sync` copies `dist/`
 * verbatim, so a stray `.map` ships roughly 11 MB of readable engine and game source to
 * every player. A second check costs nothing and does not depend on a third party
 * keeping that behaviour.
 *
 * It deletes what it finds and then fails, so a release cannot continue on a build whose
 * cleanup did not happen.
 */
import { readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));

function maps(directory) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...maps(path));
    else if (entry.endsWith('.map')) found.push(path);
  }
  return found;
}

const found = maps(DIST);
if (found.length === 0) {
  console.log('no sourcemaps in dist/ — safe to sync into the APK');
  process.exit(0);
}

for (const path of found) rmSync(path);
console.error(`${found.length} sourcemap file(s) survived the build and were deleted:`);
for (const path of found) console.error(`  ${path.slice(DIST.length)}`);
console.error('The Sentry plugin did not clean up. Do not ship this build; see docs/DIAGNOSTICS.md.');
process.exit(1);
