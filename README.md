# Tiny Tempo

An endless mobile rhythm game, built in [Phaser 4](https://phaser.io) with
TypeScript and Vite. Portrait, touch-first, with Android as the primary
platform via Capacitor.

Watch a short rhythm, then tap it back. One vignette per level, several tasks
per level, and a road of levels that never ends.

## How the game is put together

Boot → Preload → **menu** → **map** → **play** → back to the map, with a
**settings** screen reachable from the menu and the map.

The first Play opens a skippable **tutorial** before the map. **How to play** on
the menu replays it at any time. It uses the same hammer, workshop surfaces,
fonts and sound engine as gameplay:

1. A slow animated example shows **tap, tap, wait, tap**, then a finger copies
   it as the sign switches from **Watch** to **Your turn**.
2. Guided practice waits indefinitely at each required tap. Tap anywhere on
   the stage; glowing beads prompt the hits, a hollow **WAIT** bead teaches the
   gap, and completed taps receive checkmarks. There is no score or failure.
3. A preview at the game's starting tempo demonstrates that the player's turn
   begins on the next beat, with no extra pause. **Let's play** saves tutorial
   completion separately from level progress and opens the map.

Replay, mute and skip remain available. Backgrounding, interrupted audio or
turning a touch device sideways pauses the lesson; resume restarts the current
demonstration or practice. `src/game/TutorialRun.ts` owns the guided sequence,
and `src/scenes/TutorialScene.ts` presents it without changing level timing or
judgement rules.

- **The map** is an endless scrollable road grouped into ten-level areas:
  Grass, Pavement, Sand, Snow, Dusk, then the same five again numbered II, III
  and so on. It renders a bounded window of levels, not the whole road.
- **A level** is one vignette and three to eight tasks. A task is a demonstration
  phrase and then the player's response, back to back on the bar line — nothing
  waits between the two, and nothing waits between one task and the next. One
  preparation bar opens the level so the player can find the pulse, and a level
  of six tasks or more gets one four-bar breather at its midpoint with the beat
  kept alive through it.
- **Thirteen vignettes** rotate strictly by registry order in
  `src/vignettes/registry.ts`: Hammer & nail, Window cleaning, Bug & shoe, Saw &
  timber, Knife & tomato, Bicep curl, Knife & cucumber, Knife & banana,
  Scissors & paper, Egg cracking, Bubble wrap, Light switch, Doorbell. `levelSpec` picks
  `VIGNETTES[(level - 1) % length]`, so reordering or inserting an entry
  reassigns every level's vignette. New acts are appended so the earlier levels
  keep theirs.
- **Scissors & paper** first appears at level 9 and cycles through star, heart
  and angel cutouts across tasks. At 70% or higher the paper unfolds cleanly;
  40–69% produces an uneven, unfinished cutout; below 40% it tears and crumples.
  Its reveal adds one musical bar between tasks, preserving the downbeat.
  See [scissors and paper](docs/SCISSORS_PAPER.md).
- **The household acts** first appear at levels 10–13. Crack an egg into a glazed
  bowl, pop a sheet of bubble wrap, discover an elaborate room behind a light
  switch, or ring a doorbell to be welcomed by a cat. Their successful finales
  use a five-beat hold, and the door stays fully closed on failure. See
  [household acts](docs/HOUSEHOLD_ACTS.md).
- **Difficulty** comes from a single curve, `d(level) = 1 − e^(−(level−1)/25)`,
  in `src/config/progression.ts`. It drives tempo, task count, pattern tier and
  the clear bar together: easy for the first few areas, still climbing at level
  60, then a hard-but-fair plateau while the seeded patterns keep changing. Every
  level starts at the music's 120 BPM and ramps task by task toward its peak, up
  to 150 BPM.
- **Judgement** is Perfect within ±55 ms, Good within ±130 ms, otherwise Miss.
  Extra taps score as Miss and penalise weighted accuracy. The thresholds live in
  `src/config/rhythm.ts`; the judge itself is pure and knows nothing about
  presentation.
- **Progress** — unlocked level and best accuracy per level — is saved in
  localStorage by `src/game/progress.ts`, recorded the instant the last task
  resolves rather than when the summary draws.

## Music

One premixed stereo MP3, `bgm/mix/tiny-tempo.mp3` (2.4 MB), normalized at load
into an exact 120 BPM, 60-bar loop whose origin is the first downbeat. The seven
WAV masters (161 MB, drums, bass, guitar, keyboard, percussion, synth, brass)
stay in `bgm/` as the source of truth; `npm run music:encode` sums them and
writes the shipped track, and `--stems` also writes the per-stem MP3s a future
dynamic mix would need. Tempo follows the level: `setRate` ramps playback rate on
a task downbeat, so pitch rises with tempo. See
[music notes](docs/MUSIC.md) for the measured metadata and the caveats that still
need a listening check.

## Audio latency

`AudioClock` maps the DOM event timestamp of a tap onto the audio output
timeline. The settings screen measures the device's output delay from a bare
metronome — eight taps, the median of `tap − nearest beat` — and stores it in
`src/game/settings.ts`. The offset applies to judged input only, never to cue
scheduling or visuals. It matters most on Bluetooth output, where Android can
delay sound past the Good window.

## Development

```sh
npm ci
npm run dev        # HMR on port 5173, bound to the LAN
npm run typecheck
npm run lint
npm test
npm run build      # type-checks first, then bundles to dist/
```

Vite does not type-check on its own, so `npm run build` runs `tsc --noEmit`
first and fails on a type error. The same four commands run in CI on every push
and pull request (`.github/workflows/ci.yml`), which also fails the build if a
sourcemap reaches `dist/`.

Test on a handset early. The dev server binds to all interfaces, so a phone on
the same network can open `http://<your-machine-ip>:5173`. A desktop browser at a
phone-sized viewport does not reproduce touch latency, digitiser jitter, GPU
fill-rate limits, audio output delay, or Android Chrome's collapsing URL bar.

### Development-only controls

With `import.meta.env.DEV` and `?debug`: a timing and resource readout, and
Accurate, Good, Rough and Spam replay plus a music toggle in a DOM panel. The
replays dispatch real DOM events through the normal Phaser input path; they do
not inject grades. In development, `?debug&level=9` opens Scissors & paper
directly; use level 2 for Window cleaning or level 5 for Knife & tomato.
Tap the stage to play, or use Accurate/Good/Rough replay to exercise outcomes.
Production builds omit the preview route and replay controls.

## Android build

Capacitor 8 wraps the web build. `npm run android:apk` builds the bundle, syncs
it into `android/`, and produces
`android/app/build/outputs/apk/debug/app-debug.apk` (debug-signed,
portrait-locked, `com.ngg.smallacts`). It needs JDK 21 and an Android SDK with
platform 36 and build-tools 36.0.0, pointed at by the untracked
`android/local.properties` (`sdk.dir=...`). A clean debug APK is about 7.3 MB;
an incremental one can carry stale merged assets, so run `./gradlew clean
assembleDebug` before shipping a build to anyone.

## Layout

```
src/
  main.ts       Entry point; creates the game, reports boot failure
  audio/        AudioEngine, output-clock mapping, music, per-vignette synthesis
  config/       Design box, game config, scene keys, palette, rhythm, progression, music
  core/         Viewport, BaseScene, safe-area probe, DOM shell
  game/         Level generation, round controller, scoring, progress, settings
  input/        Unified timestamped taps
  rhythm/       Patterns, scheduling and pure timing judgement
  scenes/       Boot, Preload, Menu, Tutorial, Map, Play, Settings
  textures/     Generated material tiles
  ui/           The drawing system: light, panels, type, icons, motion, materials
  vignettes/    One module per act, plus their pure motion curves
```

Two pieces carry most of the mobile-specific work:

**`core/Viewport.ts`** resolves the live layout frame. The game runs under
`Phaser.Scale.EXPAND`, so the logical game size is not constant — it tracks the
device's aspect ratio (720x1559 on a 20:9 phone, 960x1280 on a 4:3 tablet).
Layout code asks the viewport for `full`, `safe`, `content` or `designBox`
rather than hardcoding coordinates.

**`core/BaseScene.ts`** splits scene setup into `build()` (create objects, runs
once) and `layout()` (position them, runs on every viewport change), and owns
the resize subscription and teardown. On Android a resize is routine, not an
edge case.

`CLAUDE.md` documents the conventions in full, including several
version-specific traps in this stack that are easy to reintroduce.

## Assets

All art is procedural Phaser geometry drawn at runtime. The one authored image is
the icon master, `assets/icon/tiny-tempo-1024.jpg`; `npm run icons` cuts every
Android launcher icon and the web favicon from it, so no generated PNG is ever
edited by hand. It needs `ffmpeg` on PATH. The repository does ship binary audio: the WAV masters in `bgm/` and the
MP3s encoded from them, which together are the great majority of the checkout.
Only the premixed MP3 reaches the bundle. Sound effects are synthesized locally
per vignette in `src/audio/`, so nothing is downloaded at runtime but the one
music track and the typefaces: four variable fonts under `public/fonts/`, each
under the SIL Open Font License with its `OFL.txt` alongside, registered by
Phaser's font loader before the menu builds.

## Orientation

The game is portrait-only. A browser cannot enforce that — the Screen
Orientation API can lock orientation only from fullscreen on Android — so a
touch device held in landscape gets a "rotate your device" prompt instead. The
prompt is gated on a coarse pointer, so a landscape desktop window is left
alone. The native build declares the lock in its manifest and never shows it.

## Legal (Google Play)

The Privacy Policy and Terms of Service live in `legal/` as a static site,
separate from the game bundle so they are not copied into the APK. GitHub
Actions (`.github/workflows/pages.yml`) deploys that folder to GitHub Pages
when `legal/` changes on `main`.

Enable **Settings → Pages → Source: GitHub Actions** once. After the workflow
runs, paste these HTTPS URLs into the Play Console listing (and the Data
safety form, which must match the privacy policy):

- Privacy Policy: `https://ngg-global.github.io/TinyTempo/privacy/`
- Terms of Service: `https://ngg-global.github.io/TinyTempo/terms/`

The pages state the current product as it is in code: on-device progress,
optional AdMob rewarded ads, optional Google Play heart refill and Premium,
RevenueCat for entitlements, no Tiny Tempo account. Contact on the pages is
`dor1612@gmail.com`. Preview locally with any static server, for example
`python3 -m http.server --directory legal 4174`.

## Documentation

- [Game design](docs/GAME_DESIGN.md) and
  [technical architecture](docs/TECHNICAL_ARCHITECTURE.md) — the design and
  engine notes. Both carry historical sections, marked as such.
- [Vertical slice](docs/VERTICAL_SLICE.md) — the vignette contract and what a
  vignette may and may not own.
- One document per vignette: [hammer](docs/HAMMER_NAIL.md),
  [window](docs/WINDOW_CLEANING.md), [saw](docs/SAW_TIMBER.md),
  [tomato](docs/TOMATO_KNIFE.md), [curl](docs/BICEP_CURL.md),
  [cucumber](docs/CUCUMBER_KNIFE.md), [banana](docs/BANANA_KNIFE.md).
- [Music](docs/MUSIC.md) — measured metadata, the premix, and open listening
  questions.
