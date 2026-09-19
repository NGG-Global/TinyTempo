import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Runs one Gradle task, named by the caller.
 *
 * `assembleDebug` makes the APK for a look on a handset. `bundleRelease` makes the AAB
 * Play takes — new apps cannot be published as an APK — and that one is checked before it
 * starts: without `android/keystore.properties` the release build type has no signing
 * config, so Gradle would happily produce an unsigned bundle and the first sign of trouble
 * would be Play rejecting the upload.
 */

const root = new URL('../', import.meta.url);
const androidDirectory = fileURLToPath(new URL('android/', root));

const task = process.argv[2] ?? 'assembleDebug';
const RELEASE_TASKS = new Set(['bundleRelease', 'assembleRelease']);

if (RELEASE_TASKS.has(task) && !existsSync(fileURLToPath(new URL('android/keystore.properties', root)))) {
  console.error(`
  ✗ ${task} needs android/keystore.properties, and there is none.

    Play will not take an unsigned bundle, so this stops here rather than building one.
    Create the file — it is gitignored, and so is the keystore it points at:

      storeFile=/absolute/path/outside/this/repo/upload.jks
      storePassword=…
      keyAlias=…
      keyPassword=…

    Keep the keystore itself somewhere that is neither this repository nor only this
    machine. Losing it means you cannot update the app without Play's key reset process.
    See docs/PLAY_UPLOAD.md steps 9-12.
`);
  process.exit(1);
}

const windows = process.platform === 'win32';
const executable = windows ? (process.env.ComSpec ?? 'cmd.exe') : './gradlew';
const args = windows ? ['/d', '/s', '/c', `gradlew.bat ${task}`] : [task];
const result = spawnSync(executable, args, {
  cwd: androidDirectory,
  stdio: 'inherit',
});

if (result.error) throw result.error;
if (result.status === 0 && task === 'bundleRelease') {
  console.log('\n  ✓ AAB at android/app/build/outputs/bundle/release/app-release.aab\n');
}
process.exitCode = result.status ?? 1;
