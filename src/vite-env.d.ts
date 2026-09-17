/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** RevenueCat Google Play public SDK key. Empty keeps native billing on the stub. */
  readonly VITE_REVENUECAT_GOOGLE_API_KEY?: string;
}

/** Injected by `define` in `vite.config.ts`; the version string from package.json. */
declare const __APP_VERSION__: string;
