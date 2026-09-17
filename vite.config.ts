import { createRequire } from 'node:module';
import { fileURLToPath, URL } from 'node:url';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { defineConfig, loadEnv } from 'vite';

const { version } = createRequire(import.meta.url)('./package.json') as { version: string };

/**
 * Sourcemaps are emitted only for a release that is going to upload them, because
 * `cap sync` copies `dist/` verbatim into the APK and a stray `.map` ships ~11 MB of
 * readable engine and game source to every install. `npm run build:release` sets this.
 */
const uploading = process.env.SENTRY_UPLOAD === '1';
/** Must match `DIAGNOSTICS.release`, or a stack trace arrives unsymbolicated. */
const release = `tiny-tempo@${version}`;

/**
 * Fail before building rather than after. With `SENTRY_UPLOAD=1` and no credentials the
 * plugin warns and carries on, which produces a release that looks fine and whose every
 * stack trace is minified — the failure you find out about from a crash you cannot read.
 */
function uploadCredentials(): { org: string; project: string; authToken: string } {
  const org = process.env.SENTRY_ORG ?? '';
  const project = process.env.SENTRY_PROJECT ?? '';
  const authToken = process.env.SENTRY_AUTH_TOKEN ?? '';
  const missing = [
    ['SENTRY_ORG', org], ['SENTRY_PROJECT', project], ['SENTRY_AUTH_TOKEN', authToken],
  ].filter(([, value]) => value === '').map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`SENTRY_UPLOAD=1 needs ${missing.join(', ')}. See docs/DIAGNOSTICS.md.`);
  }
  return { org, project, authToken };
  }

  /**
   * A build with no DSN reports nothing — and, until this, said nothing about it either.
   * `installDiagnostics` returns early on an empty DSN and the vendor chunk is never even
   * fetched, so the only symptom is an empty Sentry project, which looks exactly like an
   * app that has not crashed yet. That is the failure this repository already refuses to
   * accept from `@sentry/vite-plugin`, and it deserves the same treatment here.
   *
   * A plain `npm run build` only warns, because CI builds with no secrets and must still
   * pass. `npm run build:release` throws: shipping a release nobody can read a crash from
   * is the whole thing the release path exists to prevent.
   *
   * Note that `.env` is gitignored, so a fresh clone has no DSN. That is deliberate — a DSN
   * is a write credential for an issue stream — and it is exactly why this needs to be loud.
   */
  function checkDiagnosticsWiring(dsn: string, command: string): void {
    if (dsn !== '') return;
    if (uploading) {
      throw new Error(
        'SENTRY_UPLOAD=1 but VITE_SENTRY_DSN is empty, so this release would upload sourcemaps '
        + 'for a build that reports nothing. Copy .env.example to .env and fill it in. '
        + 'See docs/DIAGNOSTICS.md.',
      );
    }
    if (command !== 'build') return;
    console.warn(
      '\n  ⚠ VITE_SENTRY_DSN is empty — this build sends no crash reports and will not\n'
      + '    appear in Sentry. Copy .env.example to .env and fill it in, or ignore this if\n'
      + '    reporting is meant to be off. See docs/DIAGNOSTICS.md.\n',
    );
  }

  export default defineConfig(({ command, mode }) => {
    // Vite loads .env *after* the config is resolved, so the config has to ask for it.
    checkDiagnosticsWiring(loadEnv(mode, process.cwd(), 'VITE_').VITE_SENTRY_DSN ?? '', command);
    return {
    /**
     * The version the settings footer prints. Inlined at build time from the one place
     * the number is already kept, so the screen cannot drift from the package.
     */
    define: { __APP_VERSION__: JSON.stringify(version) },

    /**
     * Relative base so the built bundle also loads from a `file://` origin.
     * An Android WebView serves the bundle from local storage rather than a web
     * root, so absolute `/assets/...` URLs would 404 there. Keeping this
     * relative now avoids reworking the build when native packaging is added.
     */
    base: './',

    plugins: uploading
      ? [
        // Sentry's plugin must be last. It injects a debug ID into each chunk and its
        // map, which is how a minified frame is matched to a source — more robust than
        // matching on a release name and a file path, and the reason this replaced a
        // hand-rolled `sentry-cli` step.
        sentryVitePlugin({
          ...uploadCredentials(),
          release: { name: release },
          sourcemaps: {
            // The plugin's own cleanup. `scripts/check-no-sourcemaps.mjs` then refuses to
            // let the build pass if anything survived, because the cost of being wrong
            // here is paid by every installed APK rather than by this machine.
            filesToDeleteAfterUpload: ['dist/**/*.map'],
          },
          // By default a failed upload only warns and the build still exits 0 — measured,
          // not assumed. That ships a release nobody can read a crash from, so it throws.
          errorHandler: error => { throw error; },
          // The plugin reports its own build telemetry to Sentry's own org by default.
          // This build is not theirs to measure.
          telemetry: false,
        }),
      ]
      : [],

    resolve: {
      // Mirrors `paths` in tsconfig.json; change both together.
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        /*
         * `@capacitor-firebase/analytics` declares `firebase` as an optional peer and loads
         * its web implementation lazily. The game only ever uses the native one — on Android
         * through the bridge, and in a browser not at all, because `analytics/boot.ts`
         * returns before touching the plugin. Installing `firebase` to satisfy the import
         * would put the whole JS SDK in a bundle that never calls it, so the unreachable
         * branch resolves to a stub that throws if it is somehow reached.
         */
        'firebase/analytics': fileURLToPath(new URL('./src/analytics/firebaseWebStub.ts', import.meta.url)),
      },
    },

    server: {
      host: true, // expose on the LAN so a physical handset can load the dev server
      port: 5173,
    },

    preview: {
      host: true,
      port: 4173,
    },

    build: {
      target: 'es2022',
      /**
       * No sourcemaps in the shipped build. They were 10.8 MB — 38% of `dist/` — and
       * `cap sync` copies them verbatim into the APK, so every install carried readable
       * engine and game source.
       *
       * `npm run build:release` sets `SENTRY_UPLOAD=1`, which emits them hidden — present
       * for the uploader, never referenced from the bundle — and lets `@sentry/vite-plugin`
       * upload and then delete them. CI's "no sourcemaps ship" check runs against a plain
       * `npm run build`, where this stays `false`. `npm run dev` is unaffected either way.
       */
      sourcemap: uploading ? 'hidden' : false,
      // Phaser is a large single dependency; the default 500 kB warning is noise here.
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        output: {
          /**
           * Split the engine into its own chunk. Phaser changes only on upgrade,
           * so it stays cached across game-code deploys — worth doing for the
           * mobile connections the target audience is on.
           *
           * Vite 8 bundles with Rolldown, whose current chunking API is
           * `output.codeSplitting.groups`. The Rollup-style `manualChunks`
           * object form is not supported here.
           */
          codeSplitting: {
            groups: [{ name: 'phaser', test: /[\\/]node_modules[\\/]phaser[\\/]/ }],
          },
        },
      },
    },
  };
});
