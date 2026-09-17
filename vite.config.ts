import { createRequire } from 'node:module';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const { version } = createRequire(import.meta.url)('./package.json') as { version: string };

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

  resolve: {
    // Mirrors `paths` in tsconfig.json; change both together.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
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
     * `npm run build:release` sets `SOURCEMAP=hidden` to emit them for Sentry and then
     * deletes them from `dist/` once they are uploaded, so the bundle never references
     * them and the APK never carries them. CI's "no sourcemaps ship" check is what
     * proves the deletion happened, and it runs against a plain `npm run build`, where
     * this stays `false`. `npm run dev` is unaffected either way.
     */
    sourcemap: process.env.SOURCEMAP === 'hidden' ? 'hidden' : false,
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
