import { createRequire } from 'node:module';
import { fileURLToPath, URL } from 'node:url';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { defineConfig } from 'vite';

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

export default defineConfig({
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
        // The plugin reports its own build telemetry to Sentry's org. This is NGG's
        // build, not theirs.
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
});
