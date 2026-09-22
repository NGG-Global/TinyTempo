# Technical architecture

> **Archive, as of 11 September 2026.** This document accreted one section per milestone
> and the sections still titled "Current" describe superseded ones — seven music
> stems, four URLs, a `SESSION` table, no playback-rate control. For the state of
> the code, read `CLAUDE.md` and the README; for music, [MUSIC.md](MUSIC.md); for
> the vignette contract, [VERTICAL_SLICE.md](VERTICAL_SLICE.md). What is kept
> here is the reasoning, the measurements and the rules that produced the design,
> and those remain worth reading. The timing model below — the output-clock
> mapping, the window arithmetic, and the rule that visual time is never the
> musical clock — is still authoritative.

## Superseded: synchronized full-file stems

`audio/MusicSystem.ts` replaces `MusicBed`; `config/music.ts` owns four URLs, fixed tempo/pickup metadata, mix, output headroom and gain ramp. All stems load/decode before one common future start at source offset zero. Identical full-file loops retain the pickup. Each source remains active at zero gain and across task/vignette/summary transitions; explicit restart/interruption/disposal stops music. Core timing remains `AudioClock` and `RoundController` on the same context. Seven stems are normalized at load into exact 60-bar loops at their measured 120 BPM; the count-in starts on the loop origin. The engine is game-wide (`audio/sharedAudio.ts`), unlocked by the menu's PLAY tap. See [Music](MUSIC.md) for the measurement, normalization and the unresolved asset-size problem. This supersedes prior single-bed and tempo-progression notes.

## Superseded: authored session + third vignette

`game/levels.ts` generates each level from one difficulty curve (`config/progression.ts`): tasks, a per-task tempo ramp from 120 BPM, pattern tier and clear bar, deterministic per level. `MapScene` is the scrollable level road; `game/progress.ts` persists unlocks and stars. The host advances one task at a time, slides between tasks, steps the music's playback rate on each task downbeat, and records the level at the summary. `MenuScene` precedes the map and owns the audio gesture. It reuses `TaskSequence.ending()` for absolute coda/slide/swap/downbeat times, and `RoundController` still owns each task's timing and scoring. Session difficulty is content, not special cases in the controller. No clock, input, scheduler or judgement rules changed for this milestone.

`BugShoeVignette` implements the same contract as Hammer and Window. The only API addition is `VignetteDefinition.transition`, a pure presentation painter given Graphics, Viewport and absolute musical progress. The outgoing painter is captured before scene replacement: Hammer expands an impact ring; Window sweeps a rubber blade. Both cover the viewport at the swap. Visual completion never starts the next act.

`PlayScene.selectVignette()` centralizes disposal, registry lookup, audio-profile replacement, shared text palette and layout. Restart clears session results, pending transition, replay and music before a new origin is established. The summary stops the optional music and leaves the final cartoon illustration visible. No giant vignette switch is present.

For a new vignette, implement `Vignette`, provide a sound set and transition painter in the registry, and add one entry to `VIGNETTES`. (`SESSION` was deleted; levels come from the progression curve now, and registry order alone decides which level gets which vignette.) Full details and verification limits are in [vertical-slice notes](VERTICAL_SLICE.md). Earlier sections describe superseded milestones.

## Superseded: two implementations of one vignette API

`src/vignettes/Vignette.ts` formalizes the previously implicit lifecycle: layout, reset, phase, demonstration beat, immediate player hit, judgement (including omissions/extras), finish, pause, update, translation and destroy. Both Hammer and Window implement it. `registry.ts` provides factories, palette ink, copy, ending presentation threshold/duration and generated sound buffers. Shared easing is in `motion.ts`; Hammer's contact/recoil curves remain local.

`PlayScene` references the registry and interface, not Hammer classes/constants. On the musical midpoint of an inter-round wipe it destroys the old vignette, selects the next definition, replaces the sound set, lays out the new view and schedules its first task on the pre-existing next downbeat. Existing task slides and round cadence are reused. The wipe is sampled from the same audio time and never controls gameplay timing. The existing scene-lifetime input listener and 20 ms observer remain singular.

`AudioEngine` no longer imports Hammer synthesis or selects a Hammer profile. `setSounds({action, success, rough})` cancels outgoing task voices and installs the new buffers; `playFinish(time, successful)` schedules the definition's coda. The optional music bus continues intentionally across vignette boundaries, while restart/pause/dispose still stop it. There is no loaded music track. No changes were required in `RoundController`, `RhythmScheduler`, `TaskSequence`, patterns, input, clock mapping, judgement or scoring for Window.

Adding another vignette now means implementing visual behavior, supplying sounds/data and registering one definition. No new event bus, scene subclass hierarchy, plugin loader or rhythm implementation is needed. See [Window review and QA](WINDOW_CLEANING.md). Earlier milestones below are historical.

## Current milestone: musical multi-task rounds

`TaskSequence` owns the three-task index, per-task outcomes, round mean and the beat-derived ending/slide/next-task times. The existing `RoundController` remains the authoritative controller for **one task** (legacy class name retained); its optional absolute `startAt` lets the sequence schedule tasks on one persistent grid. `RhythmScheduler` gives preparation and handoff four beats each and pads watch/response to whole bars. Pattern hit offsets, input timestamps, judgement and score weights are untouched.

The scene's existing 20 ms observer swaps the outgoing/incoming nail halfway through the two-beat table slide, schedules the next task ahead of its downbeat, and never waits for animation completion. Rendering samples slide progress from audio time. Restart clears the transition/replay state and stops music and task voices. A late transition that cannot schedule safely ahead pauses instead of drifting the beat grid. Reduced-motion mode replaces travel with an in-place task change.

`MusicBed` is a separate looping buffer source and gain bus feeding the existing master. Task SFX cancellation cannot stop it; explicit round restart, interruption and disposal do. Music downbeat, BPM and bar-length loop are validated; see [integration contract](MUSIC.md). No tracks, streaming, automatic beat detection or time-stretching have been added.

Tests cover four count-in cues, whole-bar alignment across all tasks at multiple BPMs, rest padding, task aggregation and music-loop scheduling/validation. Earlier sections below are historical and superseded by this section.

## Previous milestone: one real vignette

`PlayScene` now composes the existing rhythm engine with `HammerNailVignette`. The vignette receives phase, demonstration, tap, judgement and finishing notifications and has no input listener, scheduler, judge or scorer. `hammerMotion.ts` contains presentation curves only. `AudioEngine('hammer')` selects synthesized impact buffers while preserving the same clock/scheduled playback API. A post-result finish sound uses that same context and is cancelled with all other voices on restart. The normal view has no debug readout; DEV `?debug` enables resource counters and pointer-replay controls. See [Hammer notes](HAMMER_NAIL.md). Earlier milestone sections below are retained as history.

Status: core timing prototype implemented, 9 September 2026. Gameplay decisions and slice scope are in [Game design](GAME_DESIGN.md). The implementation note below supersedes conflicting details in the original future architecture proposal that follows it.

## Implemented timing prototype

`PlayScene` now hosts a temporary circle-based Rhythm Lab. The start gesture is kept inside that scene rather than creating a StartScene for this small prototype. No vignette API implementations, artwork, transitions, difficulty progression or six-round session have been built.

| Files | Implemented responsibility |
| --- | --- |
| `src/config/rhythm.ts` | Perfect ±55 ms, Good ±130 ms, delivery grace 50 ms, setup lead 200 ms, two-beat preparation/handoff, 20 ms pump, 250 ms interruption threshold, calibration offset and score weights |
| `src/rhythm/patterns.ts` | Immutable X/rest parser, fractional beat support, validation and three authored patterns; 80/100/120 BPM choices |
| `src/rhythm/RhythmScheduler.ts` | Absolute round plan and advance scheduling of every demonstration/count-in cue; cancellation replaces all old voices |
| `src/rhythm/judge.ts` | Pure fixed-target matching, signed error, Perfect/Good/Miss, duplicate/extra detection, deadline expiry with delivery grace |
| `src/game/RoundController.ts`, `scoring.ts` | Clock-fed phase routing, exactly-once results, immediate eligible tap routing, interruption/restart and weighted accuracy |
| `src/audio/AudioEngine.ts`, `AudioClock.ts` | Single gesture-unlocked context, generated oscillator clicks, timestamp conversion, output-clock mapping, mute and source disposal |
| `src/input/TapInput.ts` | Phaser unified pointer-down adapter, original `pointer.event.timeStamp`, one held contact, secondary mouse filtering, outside-release/cancel cleanup |
| `src/scenes/PlayScene.ts` | Minimal debug presentation, safe-area controls, pattern/BPM selection, restart, lifecycle integration and one scene-lifetime pump |
| `tests/*.test.ts` | Automated pattern, scheduler, clock mapping, judgement, scoring, input and round-lifecycle regression tests |

Phaser's sound manager is disabled with `audio.noAudio: true`. OscillatorNode schedules are used instead of sample buffers to avoid requiring assets; both implement Web Audio scheduled-source timing. The complete short demonstration is submitted with absolute audio timestamps before it starts. The timer only observes phase/deadline progress. The scene update only draws pulses; neither a frame nor tween completion judges hits. The first scheduled cue has a 200 ms setup lead. Response has no automatic action sounds; accepted taps play an immediate, unquantized click.

The input adapter copies the original DOM timestamp synchronously from Phaser, whose installed 4.2.1 source preserves it for touch and mouse. It does not use Phaser frame time or a release event. Targets belong to fixed nearest-target cells, including already matched targets; midpoint ties go earlier. Thus a duplicate cannot migrate into the next beat. Expiry waits another 50 ms for delivery, without expanding the ±130 ms window. Timestamped input is handled immediately; the single-pointer stream is processed in delivery order rather than buffered/reordered. Arbitrarily delayed or reordered input is not promised to be recoverable.

AudioClock maps event/performance time to the output stream via a valid `getOutputTimestamp()` pair. It rejects zero, stale or backwards stamps; unavailable output mapping falls back to a paired render-clock estimate, visibly labelled `estimated`. Positive `calibrationMs` subtracts consistent lateness from captured input, and applies to input alone — never to cue scheduling or visuals, which the device does not delay. It lives on the clock instance, set from `game/settings.ts` at the point the shared engine is constructed, so the clock never has to know that storage exists. The settings screen measures it: a bare metronome, eight taps, and the median of `tap − nearest beat`. The samples are residuals against the offset already in force, so a second run refines the first. The default is zero and the stored value is clamped to ±500 ms. This is not a guarantee of physical speaker/digitizer latency; test output routes on real devices.

One setInterval is created per scene start and cleared on scene shutdown/destruction. Restart does not add timers or listeners. It cancels and disconnects scheduled oscillators, clears results and rebuilds the absolute plan. A request generation guards asynchronous audio unlock, so an older promise cannot restart an obsolete attempt. Lifecycle events invalidate ongoing/pending starts, and browser page-cache navigation no longer unconditionally destroys a cached game. Scene cleanup is idempotent on shutdown and destruction.

The callback-stall cutoff is 250 ms rather than the proposal's initial 100 ms: this tolerates small development/device scheduling hiccups while treating a major stall as an invalid attempt. It is configurable and requires handset tuning. The circle is refreshed by the controller's 20 ms observation pump, so its demo contact can appear a frame/pump late; sound scheduling and capture-time judgement remain independent. This is a debug visualization, not a precision animation system.

Tooling: `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Typecheck includes tests. Vitest is the test runner; Oxlint provides linting because the available typescript-eslint peer range does not support this project's TypeScript 7. No runtime dependency was added. The Node engine range now matches locked Vite.

Browser validation used the local in-app Chromium browser at desktop, 390×844 and 320×568 portrait sizes. Actual pointer clicks exercised all three patterns, including an X X - X X round scoring 100% and a quick double producing individual feedback. Twenty rapid UI restarts retained one pointer handler, seven voices for the latest steady round, then zero voices and a single no-input result. Console error/warning queries were empty. These checks validate browser behavior, not touch hardware or audible loopback timing. Physical Android/iOS, touch/pen hardware, Bluetooth latency, page-cache restoration on target browsers and calibration remain manual checks.

The sections below retain the broader design proposal and initial repository observations for context; their Off grade, native-only input listener plan and three-vignette scope are not the implemented prototype.

## Repository inspection

The Git/project root is `Phaser/`, one directory below the supplied workspace. The initial Git working tree was clean. All tracked source, configuration, README, `CLAUDE.md`, HTML shell, ignore rules and dependency lock metadata were inspected before writing these documents. No `AGENTS.md` was found within the workspace or its immediate parent. There were no existing docs, tests, CI files, asset binaries or installed `node_modules`.

| Area | Observed state | Implication |
| --- | --- | --- |
| Package | `tiny-tempo`, private ESM, version 0.1.0 | Small starter, no application framework |
| Phaser | Declared `^4.2.1`; lockfile resolves **4.2.1** | This is a Phaser 4 project; no installed engine was available to inspect |
| Toolchain | TypeScript `^7.0.2` → 7.0.2; Vite `^8.2.2` → 8.2.2; `@types/node ^26.5.0` → 26.5.0 | Preserve existing strict TS and Rolldown configuration initially |
| Node | Package says `>=20.19.0`; locked Vite requires `^20.19.0 || >=22.12.0` | Package range admits Node releases Vite excludes; align later |
| Available runtime | Node 24.19.0, npm 11.17.0 | Meets locked Vite's declared runtime requirement |
| Scripts | `dev`, `dev:host`, `typecheck`, `build`, `preview`, `preview:host` | Build runs `tsc --noEmit && vite build`; no test/lint scripts |
| Vite | Relative base `./`, alias `@/`, LAN hosting, ports 5173/4173, ES2022, source maps, separate Phaser chunk via `codeSplitting.groups` | Retain configuration pending a real baseline build |
| TypeScript | Strict, unused checks, explicit overrides, exact optional properties, unchecked indexed access; relative path alias | New contracts should compile without `any` or suppression comments |
| Assets | Only `public/assets/.gitkeep`; player and white-pixel textures generated at preload | No sound/animation pipeline to preserve |

`npm run typecheck` was attempted and failed because `tsc` is not installed locally. Dependencies were not installed during this documentation task. Build and runtime behavior are therefore unverified; source inspection is not a passing baseline test. Run `npm ci`, typecheck and build as the first implementation baseline, preserving the lockfile rather than upgrading by assumption.

### Current execution and ownership

`main.ts` creates `Phaser.Game`, exposes it for development diagnostics, catches synchronous startup failures, and destroys the game on `pagehide`. Configuration registers `BootScene → PreloadScene → PlayScene`.

- `BootScene` sets a scene-local drag threshold and installs a game-lifetime orientation overlay listener. It does not pause gameplay or sound when the overlay appears.
- `PreloadScene` generates placeholder textures, has loader progress plumbing, hides the boot overlay and starts Play. Its progress UI uses raw scale dimensions and is not responsive through `BaseScene`; currently the asset queue is empty.
- `PlayScene` extends `BaseScene`. It draws a diagnostic layout, rail and draggable player, and moves the block with a 260 ms tween on background taps. It has no rounds, audio, score or rhythm logic.
- `BaseScene` constructs `Viewport`, calls `build()` then `layout()`, resizes cameras and removes its resize subscription at shutdown. `build()` means once per scene start, not once for the lifetime of a scene instance.
- `Viewport` supplies full, safe, content and centered design frames under `Scale.EXPAND`, referenced to 720×1280. `safeArea.ts` converts CSS environment insets into logical coordinates. `shell.ts` controls DOM overlays.
- `HorizontalDragBehaviour`, `Player` and their textures are demo-specific. Play explicitly disposes the drag behavior on shutdown. There is no reusable audio/input service or event bus.
- The HTML already prevents scrolling/selection, uses dynamic viewport units and provides loading and rotation panels. Game config uses AUTO rendering, two touch pointers, raw pointer positions, mouse input, no keyboard, no physics, and uncapped display refresh with a target of 60.

## Proposed ownership: one gameplay scene

Keep Boot and Preload, add a small Start scene for audio readiness, and replace Play's diagnostic implementation with the rhythm host. Use a result overlay inside Play for the six-round summary. Each vignette is a plain TypeScript object owning a Phaser container, not a separate Phaser Scene. This keeps input, clock and score alive across quick visual cuts.

Use direct method calls, explicit constructor arguments and a few pure functions. Do not add an ECS, dependency injection framework, global event bus, state-machine library, Tone.js or AudioWorklet for the slice.

| Responsibility | Module | Owns / must not own |
| --- | --- | --- |
| Round orchestration | `game/RoundController.ts` | Phase state, immutable round plan, routing, interruption and finalization; no drawing |
| Rhythm scheduling | `rhythm/RhythmScheduler.ts` | Beat-to-seconds conversion, absolute planned times, scheduled source handles, cancellation; no score |
| Input capture | `input/TapInput.ts` | DOM pointer/keyboard timestamps, contact filtering, UI exclusion and cleanup; no timing grades |
| Clock conversion | `audio/AudioClock.ts` | Performance/event-to-audio mapping and calibration; no patterns |
| Timing judgement | `rhythm/judge.ts` | Pure matching and grade rules with explicit state; no Phaser/browser dependencies |
| Patterns | `rhythm/patterns.ts` | Validated authored beat offsets and phrase lengths; no art IDs |
| Difficulty/progression | `game/progression.ts` | Six-round order, seeded pattern choice and between-round tier updates |
| Audio | `audio/AudioEngine.ts` | One context, decoded buffers, gains, playback, unlock/resume/dispose |
| Visual vignettes | `vignettes/*` | Props, contact/recoil, accuracy reactions and punchlines; no scoring/input listeners |
| Transitions | `presentation/Transition.ts` | One fast cover/swap/reveal effect and cancellation; no musical timing |
| Score and feedback | `game/scoring.ts`, `presentation/RoundHud.ts` | Pure score aggregation versus displayed phase/accuracy/result |

Data flow: pattern + progression → immutable round plan → scheduler and judge. Captured tap → clock conversion → controller → immediate vignette action/audio → judge → score/HUD/vignette accuracy. Miss deadlines → judge → HUD/vignette miss. Final result → punchline → transition → next plan. The controller routes all results; a vignette never changes a score or advances a round.

## Audio timing model

Create one app-owned `AudioContext({ latencyHint: 'interactive' })`. Disable Phaser's sound manager with its supported no-audio configuration after verifying the installed 4.2.1 types; the app-owned engine handles all game audio. This avoids competing contexts and lifecycle behavior. Fetch/decode the few samples through AudioEngine while Preload loads visual assets; explicitly wait for both before allowing Start. A visible retry handles either failure.

Create/resume the context from the Start gesture, and require `state === 'running'` before planning a round. AudioContext resume restarts its time progression; do not schedule against a still-suspended context. See [MDN: resume](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/resume).

Musical positions are quarter-note beats. `secondsPerBeat = 60 / bpm`; `targetSec = phaseStartSec + beat * secondsPerBeat`. Derive each target from an absolute origin, never by summing frame deltas or timer intervals.

For these short, fully known rounds, schedule the entire count-in, demonstration and handoff at round preparation using `AudioBufferSourceNode.start(absoluteAudioSec)`. Allocate a fresh source per sound and keep cancellation handles. A 150 ms initial lead is a proposed setup margin. The audio renderer executes these times independently of when the next animation frame runs. The standard defines scheduled source times in the audio context's coordinate system; it also defines the output/performance timestamp pair used below. See [Web Audio specification](https://webaudio.github.io/web-audio-api/#dom-audioscheduledsourcenode-start).

This whole-round scheduling is simpler than a rolling queue for a four-beat phrase. If future content needs streaming or live tempo changes, replace it behind the same scheduler interface with a roughly 25 ms wakeup / 150 ms lookahead queue. Such a timer only submits future sounds; it never defines the beat by playing “now.” Neither Phaser time events nor tween completion callbacks are timing authorities.

Example at 100 BPM, with first preparation cue at audio time `T`:

```text
Preparation: T, T + 0.6
Demo origin D = T + 1.2
Demo hits:   D + [0, 0.6, 1.8, 2.1]
Handoff H = D + 2.4; cues at H and H + 0.6
Response origin R = H + 1.2
Targets:     R + [0, 0.6, 1.8, 2.1]
Response nominal end: R + 2.4
```

Schedule no target action sounds during response: taps cause them. Start player sound as soon as the handler executes, not quantized to the nearest target and never at a past event time. Actual speaker latency still exists; scheduling ahead solves demo jitter, not hardware or touch latency. Use trimmed, short attacks and avoid stretching action samples when BPM changes. One exception, added later: on an output route whose lag exceeds `RHYTHM.gridVoiceLagMs` (`AudioClock.tapVoiceLate`, typically Bluetooth), a tap-started voice is heard most of a subdivision late, so the targets are voiced on the grid instead and the tap drives only the picture and the verdict — see `docs/SOUND.md`.

### Map input to what the player heard

Native `event.timeStamp` describes event creation, which can precede handler execution. Normalize it to performance-origin milliseconds; use the standard timestamp directly, recognize legacy epoch timestamps by subtracting `performance.timeOrigin`, and validate plausibility. Fall back to a captured `performance.now()` only when invalid, recording that lower-confidence path. See [MDN: Event.timeStamp](https://developer.mozilla.org/en-US/docs/Web/API/Event/timeStamp).

Where supported and valid, sample `getOutputTimestamp()` and map performance time `p` to audible audio time:

```text
audibleSec(p) = stamp.contextTime + (p - stamp.performanceTime) / 1000
inputSec = audibleSec(normalizedEventMs) - calibrationMs / 1000
deltaMs = (inputSec - targetSec) * 1000
```

Positive delta is late; positive calibration subtracts consistent measured lateness. This uses the output timeline rather than blindly equating event arrival to `context.currentTime`, which may be ahead of the sound reaching the output device. Do not add output latency again to this mapping. Refresh the mapping during active play, reject zero/stale/discontinuous pairs and refresh after resume. See [MDN: getOutputTimestamp](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/getOutputTimestamp).

Fallback: capture a close pair of `performance.now()` and `context.currentTime` and map by their offset. Label this as an estimated render timeline, not output-accurate. Use a signed calibration setting (initially zero) to compensate residual offset, including output delay on the fallback path. A simple repeated-click practice/calibration panel may estimate the median error; require multiple taps and do not silently adapt offset during scored rounds. Store only in memory for the slice. Do not infer a precise end-to-end delay from `baseLatency` alone. Bluetooth and digitizer variation require real-device testing; no browser clock makes physical input sample-accurate.

### Visual synchronization and missed frames

Deliver the full demo cue list to the vignette before preparation begins. `update()` samples audible audio time and poses the current action relative to its target: windup before contact, contact at target, recoil afterward. It can catch up to the appropriate pose after a skipped frame. Never shift later targets because a frame was late. Dispatch `onDemonstrationBeat` once per due contact with its intended time and current observation time. This callback is a visual notification, not an audio trigger; late callbacks must not replay a backlog of sparks or sounds.

For player hits, use an immediate contact pose and interruptible recoil. Starting a 150 ms swing on tap and waiting for its end would make good input feel late. Vignettes own cosmetics; all numerical judgement comes from the captured timestamp.

## Input and deterministic judgement

Attach one native Pointer Events listener to the canvas for scored input, with explicit play-surface bounds excluding controls. Use pointerdown, pointerup and pointercancel to track a single active contact; accept primary mouse button only. Use a DOM keydown adapter for Space with repeat ignored and focused controls excluded. Do not simultaneously score Phaser pointer events or synthetic clicks. Native capture gives direct access to the original timestamp; Phaser remains useful for UI.

Phase eligibility is decided from normalized event time and the plan, not just the frame's displayed label. The response input interval is `[R - 0.130, R + phraseLengthSec + 0.130]`, supporting early first hits and late edge hits. Outside it, touches do not score. Process accepted records in timestamp order; record sequence IDs to break ties. Default calibration is zero; if adjusted, use the same corrected time domain for eligibility and matching.

Precompute one disjoint matching cell per expected target: its ±130 ms window intersected with the midpoints to its neighbors. Exact midpoint ties belong to the earlier target. Map a tap to this fixed target cell, not the nearest still-unmatched target. If there is no cell or its target is already matched, it is an extra; do not let duplicate taps spill into the next target. Each target can yield one grade or one Miss. Grade an eligible match with the absolute error thresholds in Game Design; retain signed error for Early/Late feedback. Slice patterns have minimum 0.5-beat spacing at up to 110 BPM (about 273 ms), so their ±130 ms windows do not overlap; midpoint clipping also defines behavior if denser patterns are added.

Drain input records before advancing miss deadlines. Finalize a pending target only after its cell's right edge plus a proposed 50 ms delivery allowance has elapsed on the audible clock. This allowance delays feedback; it does not widen scoring eligibility. Once finalized, results are immutable. At response end, wait for the interval end plus the delivery allowance, drain input, resolve remaining targets and calculate the round result exactly once.

A separate lightweight controller pump (for example every 25 ms) handles deadlines and phase routing; it reads the clock and does not synthesize musical time. Input handlers can drain immediately for feedback. Detect active-play callback gaps over a proposed 100 ms as an invalid attempt before expiring targets: cancel and offer a restart without score penalty. This limits unfairness from long main-thread stalls; native timestamp precision cannot guarantee arbitrary delivery order after an unbounded stall. Test and tune these thresholds on phones.

## Vignette API

The following is a proposed contract, not a source file to compile now. Shared payloads use audio seconds and explicit millisecond errors. Readonly payloads prevent a view from mutating the plan.

```ts
type VignetteId = 'hammer-nail' | 'window-cleaning' | 'bug-squash';
type Grade = 'perfect' | 'good' | 'off';
type Phase = 'prepare' | 'demonstrate' | 'handoff' | 'respond'
  | 'resolve' | 'transition' | 'paused' | 'session-end';

interface Pattern {
  readonly id: string;
  readonly lengthBeats: number;
  readonly hits: readonly number[];
}
interface Cue {
  readonly index: number;
  readonly targetSec: number;
}
interface RoundPlan {
  readonly roundId: number; // fresh ID even when an interrupted round retries
  readonly vignetteId: VignetteId;
  readonly bpm: number;
  readonly pattern: Pattern;
  readonly prepareStartSec: number;
  readonly demoStartSec: number;
  readonly handoffStartSec: number;
  readonly responseStartSec: number;
  readonly responseEndSec: number;
  readonly demoCues: readonly Cue[];
  readonly responseCues: readonly Cue[];
}
interface PlayerHit {
  readonly inputId: number;
  readonly inputSec: number;    // corrected capture time
  readonly observedSec: number; // time feedback can actually be rendered
}
type Accuracy =
  | { readonly inputId: number; readonly kind: 'matched';
      readonly cueIndex: number; readonly grade: Grade;
      readonly deltaMs: number }
  | { readonly inputId: number; readonly kind: 'extra' };
interface RoundResult {
  readonly roundId: number;
  readonly expectedHits: number;
  readonly perfect: number;
  readonly good: number;
  readonly off: number;
  readonly misses: number;
  readonly extras: number;
  readonly earnedPoints: number; // after extra penalty, clamped to zero
  readonly percent: number;
  readonly strongEnding: boolean;
}
interface Vignette {
  readonly id: VignetteId;
  mount(scene: Phaser.Scene, parent: Phaser.GameObjects.Container): void;
  layout(viewport: Viewport): void;
  reset(plan: RoundPlan): void;
  onPhaseChanged(phase: Phase): void;
  onDemonstrationBeat(cue: Cue, observedSec: number): void;
  onPlayerHit(hit: PlayerHit): void;
  onAccuracy(result: Accuracy): void;
  onMiss(cue: Cue): void;
  onRoundComplete(result: RoundResult): void;
  update(audibleSec: number): void;
  destroy(): void;
}
```

Use a small registry mapping each ID to a factory and an action-sound palette. AudioEngine chooses action samples by action ordinal (for example alternating wipe directions); the vignette uses the same ordinal visually. A factory creates a fresh object per round. Shared visual helpers are optional only when at least two vignettes actually need them.

Lifecycle contract:

1. Mount once, layout, then reset with the immutable plan. Reset prepares initial props and clears local counters and effects.
2. Phase notifications occur once per change. Handoff restores demonstration props for the response without changing the plan. Routine layout never resets progress, allocates objects or restarts an animation.
3. Demo contact notification occurs once per cue. The advance cue list lets `update` prepare windups; late notifications may omit expired cosmetics.
4. For each eligible tap, call `onPlayerHit` first, start its action sound, then call `onAccuracy` once for that input ID. Extras also perform an action. Accuracy decorates that action; it never causes a second strike.
5. `onMiss` fires once per unfilled target, without synthesizing a player hit. `onRoundComplete` fires once for a successfully resolved attempt. An interrupted attempt receives no completion or score.
6. Transition covers the old scene, destroys the old vignette and mounts the next, then reveals. The controller starts the new preparation only after reveal with a fresh lead time. Punchline/tween completion does not define any beat target.
7. Destroy is idempotent: remove owned objects, listeners, tweens and transient effects, but keep shared texture/audio caches. Round IDs reject stale callbacks. Vignettes never call `scene.start`, read a wall clock, register input or schedule gameplay timers.

## Lifecycle, cancellation and mobile resilience

Use a single app-lifetime lifecycle adapter for visibility, pagehide/pageshow, orientation blocking and audio state changes. Let it call `RoundController.interrupt(reason)`; do not depend on pausing only the Phaser scene because pre-scheduled audio can continue.

Interruption blocks input, clears held contacts and queued events, cancels scheduler/controller callbacks, stops/disconnects scheduled sources (with a brief gain fade where practical), discards the current attempt and pauses presentation. Keep completed session results. Resume from a user gesture, verify running audio, refresh clock mapping and recreate the same round with new absolute times and a new round ID. Wait until all blocking conditions have cleared. Ordinary portrait viewport changes only call layout.

At game destruction, dispose audio, native handlers and the lifecycle adapter. For a `pagehide` entering the back-forward cache (`persisted`), suspend/interruption handling should replace unconditional destruction; `pageshow` restores the resume surface. A non-persisted navigation can destroy. Current `main.ts` has only unconditional pagehide destruction and no restoration path, so browser back navigation needs explicit testing.

## Proposed source structure

Add these files incrementally as their behavior is implemented; this tree is a destination, not a request to scaffold empty abstractions.

```text
docs/
  GAME_DESIGN.md
  TECHNICAL_ARCHITECTURE.md
src/
  main.ts
  config/                       # retain existing config modules
    rhythm.ts                   # timing windows, lead, deadline/stall margins
  core/
    BaseScene.ts
    Viewport.ts
    safeArea.ts
    shell.ts
    AppLifecycle.ts
  scenes/
    BootScene.ts
    PreloadScene.ts
    StartScene.ts
    PlayScene.ts                # composition, layout, presentation update
  game/
    types.ts                    # phases, plans and results
    RoundController.ts
    progression.ts
    scoring.ts
  rhythm/
    patterns.ts                 # catalog + validation + Pattern type
    RhythmScheduler.ts
    judge.ts
  input/
    TapInput.ts
  audio/
    AudioEngine.ts
    AudioClock.ts
    sounds.ts                   # asset manifest and vignette palettes
  vignettes/
    Vignette.ts
    registry.ts
    HammerNailVignette.ts
    WindowCleaningVignette.ts
    BugSquashVignette.ts
  presentation/
    RoundHud.ts                 # phase, accuracy, pause, session summary
    Transition.ts
  textures/
    generateVignetteTextures.ts
  vite-env.d.ts
public/assets/
  audio/                        # action/cue samples
  vignettes/                    # optional later atlas, no assets required now
tests/
  judge.test.ts
  rhythm.test.ts
  round.test.ts
```

Separate modules by role as the repository guidelines request. Keep each vignette in a single file until its art actually warrants a folder. Type-only imports keep the pure judgement, scoring, patterns and progression modules independent from Phaser at runtime. One small test runner can be added as a development dependency when implementation begins; no new runtime dependency is needed.

## Changes to make before or alongside implementation

| Priority | Existing file/area | Proposed change and evidence |
| --- | --- | --- |
| First baseline | `package.json`, lockfile | Install with `npm ci`, run typecheck/build; align Node engine range with locked Vite. Do not assume a version upgrade is needed. |
| Before timed play | `config/game.ts`, Boot, Preload, new Start | Establish single audio ownership, explicit decode readiness and user-gesture start; none exists now. Register Start and route Preload through it. |
| Before timed play | `BootScene.ts`, `main.ts`, `core/shell.ts` | Connect orientation/visibility/audio suspension to cancellation; fix page-cache restoration. Existing rotation is display-only. |
| Input integration | `PlayScene.ts`, `input/*`, `objects/Player.ts` | Replace drag/tap-to-glide with timestamped input. Retire unused drag behavior/player and rail-only constants/textures once the host replaces the demo. Do not carry their tween timing into rhythm code. |
| Restart reliability | `PlayScene.ts` | Current `this.player = this.player ?? new Player(...)` can retain a destroyed object after scene restart. New host creates fresh owned objects per start and explicitly disposes subscriptions/services. |
| Mobile controls | `Viewport.touchTarget()` | Current 88 design-unit minimum is only approximately 48 CSS px (about 39 px on a 320 px-wide phone). Enforce `48 * viewport.unitScale` as the CSS-sized floor for controls. Centered designBox also is not inherently safe-area-clipped; intersect important art with safe/content. |
| Real loading | `PreloadScene.ts`, boot shell | Make progress layout responsive and add audio/asset failure UI. Current synchronous `main.ts` catch cannot handle later fetch/decode failures. |
| Documentation | `README.md`, `CLAUDE.md`, HTML title/description | Update starter/drag-specific guidance during implementation, including single-tap behavior. Preserve useful strict TS, build/layout and scaling conventions. |
| Runtime verification | `vite.config.ts` comments | Relative base helps deployment under subpaths but does not by itself guarantee ES-module/fetch operation from `file://`. Keep relative base; validate any future WebView origin when packaging is actually in scope. |

Retain `Scale.EXPAND`, safe-area probing, `expandParent: false`, raw input coordinates and strict TypeScript. Reassess uncapped rendering only with device measurements; it is a visual/battery choice, never a timing fix. No physics engine is required for these stylized contact animations.

## Implementation sequence and verification

1. Establish the dependency/build baseline and lifecycle/audio readiness. Verify a scheduled click phrase and captured input errors on a phone before investing in artwork.
2. Implement pure patterns, scoring, matching and the controller with a fake clock/audio sink. Test threshold boundaries, no-input and extra-input scoring, duplicate hits, midpoint ties, response entry, trailing silence, cancellation and exactly-once completion.
3. Integrate Hammer + Nail end to end, including calibration diagnostics, pause/restart, a result and transition. This proves the contract.
4. Add Window and Bug through the registry/API, then the six-round progression and replay. A new vignette should require no scheduler or judge changes.
5. Validate production build on devices: 320 px-wide phone, tall phone, tablet, 60/90/120 Hz where available; mouse/Space; mute; concurrent contacts; focus/rotation/audio suspension; browser back; missing asset retry.

Inject moderate frame delays and verify scheduled audio target times do not drift and the same synthetic captured timestamps yield identical grades. Inject a stall over the interruption threshold and verify the attempt restarts without score loss. Check clock fallback and calibration sign explicitly. Use an audio recording or loopback where available to measure audible spacing; logging requested start times alone does not prove output timing. Record hardware/browser and output route with latency observations.

After repeated sessions, confirm no growth in active audio sources, canvas listeners or vignette objects. Validate all patterns are finite, sorted, unique, nonnegative, nonempty, and strictly inside a positive phrase length; validate positive BPM and the intended minimum spacing. Keep diagnostic timing errors and viewport data behind a development flag. Production HUD should show only the game.
