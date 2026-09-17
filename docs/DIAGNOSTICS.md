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

## Verifying it works

Development builds expose Sentry's own verification snippet. Open the console on
`npm run dev` and call:

```js
__TINY_TEMPO_TEST_ERROR__()
```

It throws a genuine `ReferenceError` on a timer, so it travels the unhandled path a
real fault takes rather than a caller's try/catch, and it tells you whether a DSN is
configured. The hook is development-only — the same rule `window.__PHASER_GAME__`
follows, and for a sharper reason: a verification hook that shipped would be a way to
crash the game from a page console. A production build contains neither the hook nor
the snippet, which `npm run build` is checked against.

What lands in Sentry, confirmed against a live DSN:

```
type       : ReferenceError            <- the thrown error's own class
value      : myUndefinedFunction is not defined
level      : fatal | tags: {"kind":"error","seen":"1"}
release    : tiny-tempo@0.1.0 | env: development
game ctx   : {"release":"tiny-tempo@0.1.0","scene":"map"}
trail      : boot -> diagnostics attached -> scene -> scene -> test error requested
```

The type is the thrown error's own — `ReferenceError`, `TypeError`, `RangeError` —
because Sentry groups an issue by it. An earlier version of the sink overwrote it with
`TinyTempo:<kind>`, which collapsed every fault in the project into one shape and told
a reader nothing a tag was not already carrying. Which capture path an error arrived
by is the `kind` tag's job.

## Releasing with sourcemaps

Stack traces from a minified bundle are useless, so a release uploads sourcemaps
and then deletes them. `@sentry/vite-plugin` does both — Sentry's own recommended
path for Vite, and what replaced a hand-rolled `sentry-cli` step here. The plugin
injects a **debug ID** into each chunk and its map, so a minified frame is matched
by identity rather than by hoping a release name and a file path line up.

```
VITE_SENTRY_DSN=https://…    # built into the bundle
SENTRY_AUTH_TOKEN=…          # release-time only, never in the bundle
SENTRY_ORG=…
SENTRY_PROJECT=…
npm run build:release
```

`build:release` sets `SENTRY_UPLOAD=1`, which turns on hidden sourcemaps and adds
the plugin. Three behaviours were measured rather than assumed, and two needed
correcting:

- **Missing credentials.** With `SENTRY_UPLOAD=1` and no token the plugin warns
  and carries on, producing a release that looks fine and whose every stack trace
  is minified. `vite.config.ts` now throws before the build starts instead.
- **A failed upload.** By default this only warns and the build still exits 0 —
  measured with a deliberately bad token. `errorHandler` now rethrows, so a
  release cannot be built from an upload that did not land.
- **Cleanup.** `filesToDeleteAfterUpload` did run even when the upload failed.
  `scripts/check-no-sourcemaps.mjs` checks anyway and fails the build if anything
  survived: `cap sync` copies `dist/` verbatim, so a stray `.map` ships ~11 MB of
  readable engine and game source to every install, and that cost is paid per
  install rather than once on this machine.

CI's "no sourcemaps ship" check runs against a plain `npm run build`, where
`sourcemap` stays `false`, and is what proves the guard still holds.

The release string is `tiny-tempo@<package.json version>` in `config/diagnostics.ts`
and in the plugin's `release.name`. If they drift, traces arrive unsymbolicated.

`telemetry: false` keeps the plugin from reporting NGG's build data to Sentry's own
organisation, which is its default.

## Where this diverges from Sentry's recommended base, and why

Sentry's `browser` skill recommends errors + tracing + session replay. This project
takes errors only, deliberately. Its orchestration skill also says never to
over-instrument, which is the same instinct.

| Signal | Here | Why |
| --- | --- | --- |
| Errors | On | The point. |
| Tracing | `tracesSampleRate: 0` | Its value in `@sentry/browser` is page-load and navigation spans. This is one canvas that never navigates and makes no API calls, so it buys one pageload transaction per session against a quota separate from errors. One line to turn on if boot-time web vitals ever matter. |
| Session Replay | Off | Replay records the DOM. The game draws to a `<canvas>`, so a replay is a still frame of an empty page — and `blockAllMedia`, which Sentry recommends, blocks the canvas anyway. Large bundle addition, real privacy surface, nothing gained. |
| Logs | Off | Out of scope for a first release. |

Five of the SDK's default integrations are filtered out, listed in
`diagnostics/integrations.ts` and asserted in `tests/sentryAdapter.test.ts`. Two of
them were found by reading the envelopes the SDK actually posts, after the first live
DSN went in:

- **`BrowserApiErrors`** wraps `setTimeout`, `setInterval` and `addEventListener` and
  reports from inside them. One thrown error arrived as **two issues**: one from this
  integration with no tags, no context and no trail, and one from the sink with all
  three. In a Phaser game that integration covers very nearly every code path.
- **`Dedupe`** drops an event resembling the one before it — which is exactly the
  power-of-two repeats that exist to show a fault is firing every frame.
- `GlobalHandlers` would likewise double-report what `captureGlobalErrors` sends.
- `Breadcrumbs` would bury the game's own trail in console and DOM noise.
- `BrowserSession` counts sessions this project does not use.

The lesson worth keeping: *anything that captures on its own has skipped
`core/errors.ts`*, and filtering one such integration is not the same as filtering
them all.

A second bug surfaced the same way. Breadcrumb `at` is milliseconds since the page
opened, and passing that to Sentry as a timestamp dated every crumb to **1970**, after
which none of them arrived. `breadcrumbEpochMs` converts to wall-clock, and a test
asserts the year is plausible rather than merely that a number was produced.

PII is controlled through `dataCollection` rather than `sendDefaultPii`, which is
deprecated and removed in SDK v11. The categories are named explicitly so a future
SDK default cannot quietly start attaching something the privacy policy does not
cover.

## Still to do

- **A successful upload is still unverified.** The failure paths are covered —
  missing credentials, a bad token, and the cleanup — but this repository has no
  Sentry credentials, so no upload has ever landed. Run `npm run build:release`
  once against the real project and confirm a test error arrives *symbolicated*
  before trusting a release.
- **No event has been confirmed in Sentry.** Sentry's own skill is firm that the
  task is not done until an event is seen in the dashboard; that needs the Sentry
  MCP or a real DSN, and neither exists here. What *was* verified is that the game
  attaches the SDK and posts an envelope to the configured ingest host.
- No in-app opt-out switch. The privacy policy says so plainly. Worth adding to
  Settings if reporting ever grows past diagnostics.
- `sampleRate` is 1. Correct for launch; revisit if the audience grows enough for
  the free tier to matter.
