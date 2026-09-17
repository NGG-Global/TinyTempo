# Crash reporting

The game is a WebView with a megabyte and a half of JavaScript in it. The failure
that matters is a JavaScript exception, not a native crash: it shows the player a
black screen and, before this, reached nobody. Play Vitals sees ANRs and native
crashes in the Capacitor shell, which is not where this game lives.

## Shape

Two layers, the same split `monetization/` uses for ads and billing.

| Layer | File | What it is |
| --- | --- | --- |
| Capture | `src/core/errors.ts` | Provider-agnostic. Hooks, dedupe, rate limit, breadcrumbs, redaction. No network, no vendor, unit-tested under node. |
| Vendor | `src/diagnostics/sentry.ts` | The Sentry adapter. Lazily imported, and only when a DSN was built in. |
| Wiring | `src/diagnostics/boot.ts` | Installs capture synchronously in `main.ts`, attaches the vendor afterwards. |
| Config | `src/config/diagnostics.ts` | DSN, release and environment, same shape as `config/billing.ts`. |

Capture is installed **before** `new Phaser.Game(...)`, so the likeliest failure on
a strange device — a WebGL context the driver declines — is already being watched.
The vendor chunk is ~85 kB (29 kB gzipped) and is fetched only when a DSN exists,
so development builds and forks never download it.

## What the capture layer does that a bare `Sentry.init()` does not

- **Collapses a stuck frame.** A throw inside a Phaser `update()` fires sixty times
  a second. Reports are keyed by message plus top frame and re-sent only on a
  power-of-two repeat, so sixty identical throws cost six reports, not sixty. The
  `seen` count rides along, which is what tells a one-off from a loop in the issue
  list. Verified in a real browser, not only in tests.
- **Caps the session** at `ERRORS.perSession` reports however many distinct faults
  arrive.
- **Never takes the game down.** Every sink call is guarded. A reporter that throws
  is worse than no reporter.
- **Redacts** query strings (`?debug&level=9`) and device file paths
  (`file:///data/user/0/...`) before anything leaves.

## Why `@sentry/browser` and not `@sentry/capacitor`

`@sentry/capacitor` adds native crash capture, a Gradle dependency, a plugin sync
and a third initialisation order to get right beside AdMob's and RevenueCat's. It
buys native crashes, which for this game are rare and already visible in Play
Vitals. The browser SDK catches what actually breaks here, with the stack traces
that matter, and touches no native code. If native capture is ever wanted for its
own sake, `@sentry/capacitor` wraps this same SDK and only `diagnostics/sentry.ts`
changes.

## Breadcrumbs

The trail is the spine of a useful report. Three sources, all free:

- `BaseScene.create()` — one crumb per scene, so the trail reads as the route the
  player took without a single call site saying so.
- `PlayScene` — level started and level finished, with the act and the accuracy.
- The ten existing commerce events, bridged in `diagnostics/boot.ts`. A crash
  during a purchase is exactly the crash worth reading. The bridge *wraps* the
  analytics sink rather than replacing it, so a real analytics provider later
  loses nothing.

A real report from a walkthrough looks like:

```
context : {"release":"tiny-tempo@0.1.0","scene":"play","level":6,"act":"curl"}
trail   : boot -> scene {"key":"menu"} -> scene {"key":"map"}
          -> scene {"key":"play"} -> level started {"level":6,"act":"curl","attempt":1}
```

## Releasing with sourcemaps

Stack traces from a minified bundle are useless, so a release uploads sourcemaps
and then deletes them.

```
VITE_SENTRY_DSN=https://…    # built into the bundle
SENTRY_AUTH_TOKEN=…          # release-time only, never in the bundle
SENTRY_ORG=…
SENTRY_PROJECT=…
npm run build:release
```

`build:release` sets `SOURCEMAP=hidden`, so Vite emits maps without referencing
them from the bundle, then `scripts/upload-sourcemaps.mjs` uploads and **deletes
them from `dist/`** — including when the upload fails. That deletion is as
important as the upload: `cap sync` copies `dist/` verbatim into the APK, and a
`.map` left behind ships ~11 MB of readable engine and game source to every
install. CI's "no sourcemaps ship" check runs against a plain `npm run build`,
where `sourcemap` stays `false`, and is what proves the guard still holds.

The release string is `tiny-tempo@<package.json version>` on both sides. If they
drift, traces arrive unsymbolicated and the whole exercise buys nothing.

## Still to do

- **The upload step is untested here.** It runs `npx @sentry/cli sourcemaps upload`
  and has only been exercised on its failure path, because this repository has no
  Sentry credentials. Run it once against a real project before trusting a release.
- No in-app opt-out switch. The privacy policy says so plainly. Worth adding to
  Settings if reporting ever grows past diagnostics.
- `sampleRate` is 1. Correct for launch; revisit if the audience grows enough for
  the free tier to matter.
