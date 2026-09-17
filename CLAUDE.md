# Development guidelines

## Current state

Boot → Preload → `MenuScene` → `MapScene` (endless scrollable road, ten-level
areas) → `PlayScene` for one level → back to the map, with `SettingsScene`
reachable from the menu and the map. `src/game/levels.ts` derives every level
(tasks, per-task tempo ramp from 120 BPM, pattern tier, clear bar, stars) from
one curve in `src/config/progression.ts`; keep new difficulty knobs on that
curve. `src/game/progress.ts` owns saved progress and `src/game/settings.ts`
owns player settings; both validate every field on read, because storage can be
blocked, stale or tampered with.

Seventeen vignettes rotate strictly by registry order: `levelSpec` picks
`VIGNETTES[(level - 1) % VIGNETTES.length]`, so reordering or inserting an entry
in `src/vignettes/registry.ts` silently reassigns every level's vignette. New
acts are appended so the earlier levels keep theirs.
Presentation lives inside the vignette; the rhythm controller, judge and scorer
stay authoritative, as `docs/VERTICAL_SLICE.md` sets out.

Three acts carry more than one look. `LevelSpec.lap` counts how many times the
rotation has come round before a level, PlayScene passes it to `create(scene, lap)`,
and the act indexes its own list with it: bug & shoe has three bugs and sneaker
colourways (`bugLooks.ts`), the bicep curl three people at the bench
(`curlLooks.ts`), and scissors & paper two sets of three shapes (`PAPER_SHAPE_SETS`).
Lap 0 is always the original look, so the first seventeen levels are unchanged. Add
variety this way, as a new look inside an existing act, rather than as a registry
entry. See `docs/VARIANTS.md`.

Scissors & paper is the ninth act. Its three cutout shapes rotate per task;
`paperMotion.ts` derives success (70%+), partial (40–69%) and failure from the
round accuracy passed to `Vignette.finish`. Other acts retain their binary
endings. Its five-beat reveal hold adds one bar to the default coda; holds must
complete whole bars with the contact and two slide beats. See
`docs/SCISSORS_PAPER.md`. In DEV only, `?debug&level=9` opens it directly.

Egg cracking, Bubble wrap, Light switch and Doorbell are acts 10–13. They share
the lifecycle in `HouseholdVignette.ts`, with independent drawings and material
voices in `audio/householdSounds.ts`. Their five-beat finale holds preserve the
downbeat and allow the egg drop, pop cascade, room reveal and door swing to
complete. See `docs/HOUSEHOLD_ACTS.md`.

Paint roller, Hotel bell, Balloon pump and Stapler are acts 14–17, on the same
lifecycle: one Graphics each, curves in `errandMotion.ts`, voices in
`audio/errandSounds.ts`, and the same five-beat hold. The roller's picture is a
coarse grid so a stripe of any width is whole columns; the balloon grows only on
judged hits and bursts on a rough coda. See `docs/ERRAND_ACTS.md`.

`HouseholdVignette.update` re-anchors the stage to its laid-out home every frame,
as every other act does in its own `update`. `Vignette.translate` is the
between-task slide and is an absolute offset from that home, applied by PlayScene
right after `update`; an act that skips the re-anchor walks off screen.

Three chrome screens follow the refined design in `docs/UI_REFINEMENTS.md`: Settings is
labelled sections scrolling between a pinned title and a pinned Done, with calibration on
its own `CalibrateScene`; the level result is a plaque that hangs on ropes and takes a
knock from each medal; and out-of-hearts is one ranked sheet, on the map and mid-run.
Two version traps live there. **Phaser 4 dropped WebGL geometry masks** — `setMask` warns
and no-ops off the canvas renderer — so a clipped region is a second camera's viewport,
never a mask. And a control inside a scrolling list fires on the pointer *release*:
`TapInput` reports the press, which is right only where the press is the musical event.

**A dressed letter only takes an outline its own fill can carry.** `typeStroke` returns
`null` below `OUTLINE_CONTRAST`, and `ui/type.ts` then draws no stroke and lifts the letter
on a pale drop. The workshop's thick border is for cream on timber or coral; the game's ink
and every act's and area's ink self-shaded to a near-black border at under 2:1, which reads
as a thicker, muddier stem and closes Fredoka's counters. A new act's ink is covered by
`tests/ui.test.ts` without anyone remembering this.

Crash reporting is `core/errors.ts` (capture, no vendor) behind `diagnostics/` (the
Sentry adapter), the same split `monetization/` uses — see `docs/DIAGNOSTICS.md`.
**A throw inside a Phaser `update()` fires sixty times a second**, so reports are keyed
by message plus top frame and re-sent only on a power-of-two repeat; nothing added to a
sink may throw, and nothing may send a query string or a device file path. Capture is
installed before Phaser is constructed. **Every Sentry integration that captures on its
own is filtered out** (`diagnostics/integrations.ts`): one that is missed reports around
the capture layer, with no dedupe, redaction, breadcrumbs or context, and the same throw
arrives twice — `BrowserApiErrors`, which wraps `setTimeout` and `addEventListener`, did
exactly that until it was found by reading the posted envelopes. Sourcemaps are still never shipped: only
`npm run build:release` emits them, and `@sentry/vite-plugin` uploads and deletes them,
which is what CI's "no sourcemaps ship" check keeps honest. That plugin **warns instead
of failing** on a missing token or a failed upload, which would ship a release whose
every trace is minified, so `vite.config.ts` throws on both and
`scripts/check-no-sourcemaps.mjs` fails the build if a `.map` survives.

Music is one premixed stereo MP3 normalized to a 120 BPM, 60-bar loop
(`docs/MUSIC.md`), encoded from the seven WAV masters by `npm run music:encode`.
The `AudioEngine` is game-wide via `audio/sharedAudio.ts` and is unlocked by the
menu's PLAY tap. `AudioClock.calibrationMs` is the one place output latency is
corrected, and it applies to judged input only — never to cue scheduling or
visuals, which the device does not delay.

**A level runs on two clocks, and a deadline must name the right one.** `AudioClock.now()`
is the context time of the sample the player is hearing, so every phase, judgement and
visual in `PlayScene` lands with the sound it belongs to. Anything the scene *schedules*
is placed on `context.currentTime`, which sits the device's output latency ahead of that
reading — milliseconds through a speaker, 200–400 ms through Bluetooth. A deadline read on
one clock for a tick that arrived on the other charges that latency to the level: the task
change did exactly that, and interrupted every level on a headset a beat before the next
task. `canPlaceNextTask` is that deadline now, and it is the next task's own downbeat.

A task is a demonstration phrase and then the player's response, back to back on
the bar line: nothing waits between them, and nothing waits between one task and
the next. The only pauses in a level are its opening `RHYTHM.leadInBeats` bar and,
for a level of `PROGRESSION.breatherFromTasks` tasks or more, one
`PROGRESSION.breatherBars` breather at its midpoint. Both are the same mechanism —
`LevelTask.leadBeats`, counted in by `createRoundPlan`. Because no bar separates
the demonstration from the response, **a vignette's demonstration must not consume
its subject**: it plays the action in full and leaves the cumulative state alone,
since there is no longer anywhere to restore it.

Two standing rules that predate the current state and still hold: debug replay
controls exist only with DEV and `?debug`, and **do not add a vignette without a
request** — a new entry in the registry reassigns every level.

## History

Superseded, and kept only for the reasoning that produced the current design.
Nothing below is a description of the code as it stands.

### The two-vignette milestone

The default was the Hammer + Nail vignette (see `docs/HAMMER_NAIL.md`).
Keep presentation inside `src/vignettes/HammerNailVignette.ts`; the existing
rhythm controller/judge/scorer remain authoritative.

### The timing-only milestone

PlayScene was Rhythm Lab: one authored phrase, a tempo toggle, and no vignettes
or progression. Four rules survive from it and are not negotiable. Gameplay has
one TAP action, using Phaser's unified pointer event and the original DOM
timestamp. The drag and player helpers are unused starter code, and
drag-to-position must not return to the rhythm scene. `AudioEngine` owns the only
AudioContext; Phaser sound is disabled. Visual frame or tween time must never
become the musical clock.

## Conventions

Mobile-first Phaser 4 game project. Portrait, touch-first, with Android as the
intended primary platform.

These are the conventions for this repository. Where a rule states a reason,
the reason is the rule — if it no longer applies, change the rule deliberately
rather than working around it.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server with HMR on port 5173, exposed on the LAN |
| `npm run typecheck` | Type-check only |
| `npm run lint` | oxlint over `src` and `tests`, warnings are errors |
| `npm test` | vitest, node environment, no config file |
| `npm run build` | Type-check, then produce the production bundle in `dist/` |
| `npm run preview` | Serve the built bundle on port 4173 |
| `npm run music:encode` | Premix the WAV masters to the shipped MP3 |
| `npm run icons` | Cut every launcher and web icon from the 1024px master |
| `npm run android:apk` | Build, sync and assemble a debug APK |

The first four are the gate. CI runs exactly those on every push and pull
request, and also fails if a sourcemap reaches `dist/`.

`npm run build` runs `tsc --noEmit` first, so a type error fails the build.
Vite does not type-check on its own — `npm run dev` will happily serve code
that does not compile. Run `npm run typecheck` before assuming work is done.

### Testing on a real device

The dev server binds to all interfaces, so a handset on the same network can
load `http://<dev-machine-ip>:5173`. Do this early and often. A desktop browser
at a phone-sized viewport does not reproduce touch latency, digitiser jitter,
GPU fill-rate limits, or the URL bar collapsing mid-frame.

## Stack

- **Phaser 4.2.x** — `Phaser.AUTO` renderer (WebGL, canvas fallback)
- **TypeScript 7** — strict, plus `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`
- **Vite 8** — bundles with **Rolldown**, not Rollup
- **npm**

Four version-specific traps, all of which cost time if assumed away:

1. **TypeScript 7 removed `baseUrl`.** Entries in `paths` must be relative
   (`"@/*": ["./src/*"]`).
2. **Vite 8 uses Rolldown.** Chunking is `build.rollupOptions.output.codeSplitting.groups`.
   Rollup's `manualChunks` object form is not supported — only a function, and
   it is deprecated.
3. **Phaser 4 ships `export = Phaser`** typings against an ESM runtime build.
   `import Phaser from 'phaser'` is the form used here; named imports also work
   but do not meaningfully shrink the bundle, since the engine is monolithic.
4. **Phaser 4 dropped WebGL geometry masks.** `GameObject.setMask` and
   `Camera.setMask` are canvas-only: under WebGL they log a warning and leave
   `mask` null, so the clip silently does nothing. The replacement,
   `FilterList#addMask`, renders the mask object to a DynamicTexture. To clip a
   rectangular region, give it a camera: `cameras.add(...)` plus `setViewport`
   is a scissor rectangle and costs nothing (`SettingsScene`). A camera renders
   every object the other cameras do, so `ignore()` both ways, and note that a
   `setScrollFactor(0)` object lands offset by the second camera's viewport
   origin.

## Project layout

```
src/
  main.ts              Entry point; creates the game, reports boot failure
  audio/
    AudioEngine.ts     The only AudioContext; SFX scheduling and mute
    AudioClock.ts      DOM event time to output time, plus the input offset
    MusicSystem.ts     The premixed loop: load, normalize, start, rate, gain
    *Sounds.ts         Deterministic per-vignette synthesis, one file per act
    sharedAudio.ts     Game-wide engine in the registry; applies stored settings
  config/
    design.ts          Design resolution, layout metrics, depth ordering
    game.ts            Phaser game config (every non-default value is justified)
    music.ts           Measured musical model of the shipped track
    progression.ts     The one difficulty curve and its knobs
    rhythm.ts          Timing windows and scheduling constants
    scenes.ts          Scene keys
    diagnostics.ts     Sentry DSN and release; empty DSN keeps reporting off
    style.ts           The workshop treatment: outline, exaggeration, faces, grain
    theme.ts           PALETTE: the four colours the shell, curtain and clear colour share
  core/
    BaseScene.ts       Scene base class owning the build/layout lifecycle
    errors.ts          Capture, dedupe, breadcrumbs and redaction; no vendor, no network
    haptics.ts         navigator.vibrate behind the player's setting; the one added web API
    Viewport.ts        Live layout frames (full / safe / content / designBox)
    motionPreference.ts  The one live read of prefers-reduced-motion
    safeArea.ts        Reads env(safe-area-inset-*) via a probe element
    shell.ts           Controls the DOM overlays in index.html
  diagnostics/
    boot.ts            Installs capture, then attaches the vendor when a DSN exists
    sentry.ts          The Sentry adapter; the only file that knows the vendor
  game/
    levels.ts          Derives a level spec from the curve
    RoundController.ts Phase machine for one task
    TaskSequence.ts    Task ordering within a level
    scoring.ts         Pure weighted accuracy
    progress.ts        Saved unlocks and best accuracies
    settings.ts        Saved audio offset and mute
  input/
    TapInput.ts        Unified pointer taps, original DOM timestamp preserved
    HorizontalDragBehaviour.ts   Unused starter code; do not reintroduce
  objects/
    Player.ts          Unused starter code
  rhythm/
    patterns.ts        Seeded pattern vocabulary by tier
    RhythmScheduler.ts Absolute-time cue scheduling
    judge.ts           Pure timing judgement; owns Perfect/Good/Miss
  scenes/
    BootScene.ts       Input tuning, orientation guard
    PreloadScene.ts    Texture generation and font registration
    MenuScene.ts       Title; owns the first audio gesture
    MapScene.ts        The endless road, rendered as a bounded window
    PlayScene.ts       One level: hosts a vignette, never judges
    SettingsScene.ts   Labelled sections, scrolling under a camera viewport
    CalibrateScene.ts  Tap offset: the latency measurement on its own screen
  textures/
    materials.ts       Seeded canvas tiles: paper, wood, metal, cloth, parchment
  ui/
    backdrop.ts        The shared stage behind a vignette: ground, light pool, paper
    colour.ts          hex / mix / shade, so depth tones derive from one palette
    feedback.ts        Particle presets on generated textures; the soft glow disc
    gear.ts, icons.ts  Drawn control glyphs; no symbol fonts
    light.ts           The one key light: cast shadows and lit/shade/rim faces
    panel.ts           Slabs and pucks with thickness, dressed per treatment
    path.ts            Catmull-Rom smoothing and dash spacing
    spring.ts          Physical motion as pure f(t): spring, overshoot, squash, settle
    star.ts            The star glyph
    starReveal.ts      Result poses as f(t): medals, plaque swing, jolt, chorus
    sheen.ts           The light crossing a brass panel; still under reduced motion
    switch.ts          The two-state switch; its geometry imports no Phaser
    type.ts            Display, body and label text from the treatment's bundled faces
  vignettes/
    registry.ts        The rotation. Order is the level assignment.
    Vignette.ts        The contract a vignette implements
    *Vignette.ts       One per act: all geometry, palette and motion
    *Motion.ts         Pure curves, no Phaser import, unit-tested under node
```

Add new directories along the same axis — by role, not by feature — until a
feature grows large enough to own a folder of scenes and objects together.

## The scaling model

This is the single most important thing to understand before touching layout.

The game is authored against a **720x1280 design box** and runs under
`Phaser.Scale.EXPAND`. Under EXPAND the logical game size is **not constant**.
Phaser anchors whichever axis makes the design box fit and expands the other to
match the device's aspect ratio:

| Device | Logical game size |
| --- | --- |
| 393x851 phone (20:9) | 720 x 1559 — width anchored, height expanded |
| 375x667 phone (16:9) | 720 x 1281 — close to the design box |
| 768x1024 tablet (4:3) | 960 x 1280 — height anchored, width expanded |

`EXPAND` is used instead of `FIT` because `FIT` letterboxes: on a 20:9 handset
that is black bars across roughly a fifth of the screen. The cost of EXPAND is
that no coordinate can be hardcoded.

### Rules that follow from it

- **Never position anything using `DESIGN_WIDTH` / `DESIGN_HEIGHT`.** They
  define the reference frame; they are not the runtime screen size.
- **Never use `this.scale.width` directly in layout code.** Go through
  `this.viewport`, which also accounts for safe-area insets.
- Pick the right frame for the job:
  - `viewport.full` — backgrounds only. Extends under the notch.
  - `viewport.safe` — `full` minus device safe-area insets. Nothing
    interactive may sit outside this.
  - `viewport.content` — `safe` inset by `LAYOUT.screenPadding`. The default
    for HUD and gameplay.
  - `viewport.designBox` — the centred 720x1280 frame. Guaranteed visible on
    every device, so art that must not be cropped goes here.
- Scale design-space lengths with `viewport.scaled(n)`; get hit-area sizes from
  `viewport.touchTarget(n)`.

### Scene lifecycle

Scenes that lay anything out extend `BaseScene` and implement two methods:

- `build()` — create game objects. Runs **once**.
- `layout()` — position and size them. Runs on create **and on every viewport
  change**.

`layout()` must be idempotent: no object creation, no event listeners, no
tweens started. `BaseScene` handles the resize subscription, the camera resize,
and unsubscribing on shutdown. Do not override `create()`.

Use `onResize()` for post-resize work that is not layout, such as regenerating
a texture at a new resolution.

A resize is a routine event on Android, not an edge case — Chrome collapses its
URL bar, the keyboard opens, the device rotates. Assume `layout()` runs often.

## Touch input

- **Design for the thumb.** Interactive elements belong within reach of the
  bottom edge. Note that thumb reach is an *absolute* distance from where the
  hand grips the device, so anchor controls at a fixed offset from the bottom
  (`LAYOUT.trackOffsetFromBottom`) rather than at a fraction of the height,
  which drifts out of reach on a tall handset.
- **Honour the minimum touch target.** `LAYOUT.minTouchTarget` (88 design
  units, ~48 CSS px) is the accessible floor. Hit areas are expressed in
  texture-local units and therefore shrink with an object's scale, so small art
  needs its hit area widened explicitly — see `Player.refreshHitArea`.
- **Constrain gestures deliberately.** A thumb travelling horizontally always
  drifts vertically. `HorizontalDragBehaviour` applies the horizontal component
  and discards the vertical one. Do not use Phaser's raw drag for an
  axis-locked control.
- **Support tap as well as drag.** Reaching across a large phone to drag is
  uncomfortable; tap-to-position is often the gesture players actually use.
- **Acknowledge every touch visually**, before any movement happens.
- **Leave `input.smoothFactor` at 0.** Phaser computes
  `x = newX * smoothFactor + previousX * (1 - smoothFactor)`, so the value is
  the weight of the *new* sample — a low non-zero value such as `0.2` keeps 80%
  of the previous position and lags the finger by roughly 45 game units at the
  end of a fast swipe. `0` and `1` both mean "use the exact position".

## Configuration traps

Verified by testing, and easy to reintroduce:

- **Do not set `scale.min` / `scale.max`.** They clamp the **display** size in
  CSS pixels, not the logical game size. A floor of 480 CSS px forces the
  canvas wider than a 393 px handset screen, and `autoCenter` then centres the
  overflow so content is clipped off *both* edges. Bound the logical size in
  `Viewport` instead.
- **Keep `scale.expandParent: false`.** `#game-root` is sized by CSS using
  `100dvh`, which is what keeps the canvas stable while Android Chrome
  collapses its URL bar. Letting Phaser style the parent fights that.
- **Keep `base: './'` in the Vite config.** An Android WebView serves the
  bundle from local storage, where absolute `/assets/...` URLs 404.
- **Leave `render.powerPreference` at `'default'`.** A phone has one GPU, so
  `'high-performance'` mostly opts out of power management — a poor trade for a
  2D game, costing battery life and bringing on thermal throttling sooner.

## Assets

All art is procedural: drawn as Phaser Graphics inside each vignette and scene,
or generated at boot — material tiles in `textures/materials.ts`, particle and
glow discs in `ui/feedback.ts` — and looked up by key. There are no image files.

The typefaces are the exception to "nothing but the music is downloaded". Two
variable fonts under `public/fonts/` — Fredoka for display, Nunito for body and
labels, both under the SIL Open Font License with each family's `OFL.txt`
committed beside it — load through Phaser's `load.font()` in
`PreloadScene.preload()` before the menu builds, because Phaser `Text`
rasterises at creation and never reflows for a font that arrives later. Text is
made through `ui/type.ts`, never with a font family literal.

The look is the workshop treatment in `config/style.ts`: one key light
(`ui/light.ts`), generated materials, thick outlines, and physical motion from
`ui/spring.ts`. Every drawing module reads its weights from `STYLE.current`
rather than carrying its own; a new surface uses `ui/panel.ts`, `ui/type.ts`
and `ui/icons.ts` rather than drawing a card or a glyph of its own.

The repository does ship binary audio — the WAV masters in `bgm/` and the MP3s
encoded from them — and that is the great majority of the checkout. Only the
premixed MP3 reaches the bundle; sound effects are synthesized locally per
vignette in `src/audio/`, so the game downloads one music track and nothing else.

The one authored image in the repository is the icon master,
`assets/icon/tiny-tempo-1024.jpg`. Every shipped icon — the five Android density
buckets, legacy, round and adaptive foreground, plus the web favicon and Apple
touch icon — is derived from it by `npm run icons`. Do not edit a generated PNG:
replace the master and re-run. The script needs `ffmpeg` on PATH, and nothing
else in the build does.

Other real image assets, if any are ever added, go in `public/assets/` and load in
`PreloadScene.preload()`. Prefer
one texture atlas over many loose images: each separate texture is a
state change for the GPU, and on mobile draw-call count is usually what limits
frame rate. Generate textures larger than their on-screen size — scaling down
is nearly free, scaling up is visibly soft.

## Orientation

The game is portrait-only. On the web this can only be requested, not enforced:
the Screen Orientation API can lock orientation only from fullscreen on
Android, and fullscreen needs a user gesture. `BootScene` therefore shows the
`#orientation-overlay` prompt while a **touch** device is held in landscape —
gated on `pointer: coarse` so a landscape desktop window, a normal development
setup, is never nagged.

A native build declares the lock in its manifest and never shows this prompt.

## Style

- TypeScript strict mode is non-negotiable; do not add `any` or
  `@ts-expect-error` to move past a type error.
- Name things after what they do in the game, not after their Phaser type.
- Comment the *why*, not the *what*. The comments worth keeping here are the
  ones recording a decision and its trade-off; a comment restating the code is
  noise.
- Keep magic numbers in `config/design.ts` or as a named constant at the top of
  the file that uses them.
- `window.__PHASER_GAME__` exposes the running game in **development builds
  only** — useful from a device's remote console. Do not depend on it in game
  code.

## Android packaging

Capacitor 8 wraps the web build (`capacitor.config.ts`, `android/`). `npm run
android:apk` builds, syncs and assembles a debug APK; it needs JDK 21 and an
Android SDK (platform 36, build-tools 36.0.0) referenced from the untracked
`android/local.properties`. The launcher icon is an adaptive icon: a flat `#CE5133` background — the master's own ground, sampled from the artwork, which is why it is a shade off the game's `#CF5134` coral — under a full-bleed foreground, since the artwork is a scene rather than a glyph on transparency. `res/values/colors.xml` carries the palette for the native surfaces the WebView does not paint, and the launch window is a flat paper field rather than Capacitor's stock splash bitmap, so a cold start is one colour from the launcher to the menu. The portrait lock lives in `AndroidManifest.xml`;
the DOM rotate prompt remains the browser fallback. `android/app/src/main/assets/public`
is generated by `cap sync` and is not committed. No native plugins are used; the game
depends on exactly three web APIs — Web Audio, pointer events, and `navigator.vibrate`
for the Haptics switch, which `AndroidManifest.xml` covers with the normal `VIBRATE`
permission. The vibration call was added deliberately rather than worked around (see
`docs/UI_REFINEMENTS.md`): a rhythm game played with one thumb confirms a landed tap with
sound the player may have muted and with motion the thumb is covering. It is
feature-detected at every call, fails silently, and never fires for anything the player
did not just do. A fourth web API is not covered by that reasoning.
