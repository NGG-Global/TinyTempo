# Hammer + Nail — Tiny Tempo

One vignette, built over the existing rhythm engine. No Window, Bug, progression system or alternate scoring was added.

Pacing update: rounds now contain three automatic nail tasks and beat-aligned table slides. Restart repeats the full round, not an individual nail. Optional continuous music bedding is ready; no track is loaded. See [current game design](GAME_DESIGN.md) and [music contract](MUSIC.md), which supersede the original single-task flow below.

Pacing verification (10 September 2026): typecheck, lint, the full test suite and the production build pass. Browser accurate replay completed all three tasks with 100% round accuracy; 240 ms-late replay completed all three with 0%, without blocking progression. Checked 390×844 and 320×568, automatic slides, repeated restart during travel, one input handler and empty warning/error logs. Music scheduling/cancellation is unit-tested with mocked Web Audio; listening with a real backing track and physical-device touch/audio testing remain outstanding.

## Visual direction and controls

A warm printed-workshop palette: paper `#eee8d8`, forged green `#243e35`, vermilion `#cf5134`, muted copper timber `#c99460`. The bundled display face sets the opening and ending titles; a small Watch / Repeat label leaves the illustration dominant during play. There are no UI panels in normal play. The bench's grain is a generated material tile and the paper is the shared backdrop's; all tool and nail geometry is Phaser Graphics, shaded from the one key light in `ui/light.ts`.

Tap anywhere to start. Two preparation ticks precede the demonstration. The hammer winds up before each pre-scheduled contact. The demonstration strikes the nail without sinking it, so the nail is already standing proud when the player's turn arrives; the spotlight opens toward them on the response downbeat. On the player's turn, accepted taps hit immediately; grades separately decide whether the nail moves deeper. Extras still animate a strike. Countdown text, outcome dots and percentage results are absent in normal play; numerical feedback remains available in development debug mode.

The visual review enlarged the tool and raised the timber horizon to 68% of the safe height. Lower-contrast growth lines, a fine lit timber edge and a cast nail shadow give depth without adding objects. Impact poses hold for 26 ms, release into a restrained overshoot and settle by 340 ms. Shape compression is compensated around the striking face so it cannot pull the head off the nail. Small contact rings, shadow compression, timber flex and diagonal micro-shake support the impact. Reduced-motion preference suppresses shake, timber flex and the offering gesture. Ending copy fades in only after the finishing contact. All motion is sampled from absolute time; these holds do not delay sound, input or judgement.

After resolution, a 70% or better result gets a flush nail, stronger thock/ring and brief sparkle. Lower results get a bent nail and a descending metal resonance. Both finish within the scene. The extra finishing blow is an unscored coda; it never changes the engine's result. Another nail cycles the existing patterns at 100 BPM. ↻ repeats the current pattern, including during playback/ending; ♪ toggles the master gain. Their hit regions remain at least 48 CSS px.

## The title screen

The same act, constructed with `cover = true`, is the title illustration: it never receives a plan, and its hammer idles. A tap anywhere on the title screen that is not a control — not a puck, Play, How to play or an open objectives card — lands a blow (`MenuScene.knock` → `HammerNailVignette.knock`). The strike, the dust and the shake are the level's own; the voice is the act's synthesized hit, played as a stinger through the engine's effects bus so the mute puck and the Effects level govern it, and the engine's level sound set is left alone. The nail gives `KNOCK.depth` on the first knock and no more on any that follow, since a screen that judges nothing never drives it home, and `knockDepth` (`hammerMotion.ts`, pure) lets it ease back up over `KNOCK.riseSec` once `KNOCK.restSec` has passed without a knock. `knock` goes round `onPlayerHit`'s turn gate because the cover has no turn, and `reset` clears the knock so a level's hammer never inherits one. On a cold start the context is still suspended; the source is started regardless and plays when the same tap's resume lands, so the first tap knocks late rather than silently.

## Ownership and timing

- `src/vignettes/HammerNailVignette.ts`: object graph, responsive layout, depth animation, anticipatory strikes, immediate contact/recoil, dust, vibration and endings. It consumes outcomes without judging them.
- `src/vignettes/hammerMotion.ts`: pure easing/contact/depth curves and presentation constants. The final head face lands flush with the surface. Reduced-motion preference suppresses impact shake.
- `src/audio/hammerSounds.ts`: deterministic wood/metal/noise synthesis, with hit/flush/bent buffers. No remote audio assets.
- `src/audio/AudioEngine.ts`: optional hammer sound profile and scheduled coda playback. Default click profile remains available. All oscillator/buffer sources share cancellation and mute.
- `src/scenes/PlayScene.ts`: connects existing engine callbacks, changes headlines, selects the next existing pattern and owns interruption/cleanup. A generation guard protects asynchronous audio unlock.

The timing thresholds, matching, points and extra penalties are unchanged. Demonstration sound is scheduled ahead by the original scheduler. The visual pose samples its exact audio timestamp; an idempotent cue handler can run from the frame or controller callback, whichever observes the beat first. This prevents the hammer briefly returning to rest between the scheduled instant and the next controller pump. Input contact starts immediately rather than playing a windup that delays the player's action. The finishing sound and animated contact use the same future audio timestamp.

The geometry scales inside the safe portrait area; the timber fills the viewport. Layout changes do not allocate textures, reset depth or restart animations. Restart cancels scheduled sound, discards the old attempt/coda, and resets the existing visual objects. No per-strike timers or object allocations are used for motion; seven dust marks are drawn from the current impact age.

## Verification

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build` are the required checks. The tests include the existing engine regressions plus contact-at-zero, anticipatory lift, recoil endpoints, flush-depth bounds and deterministic bounded sound buffers.

DEV `/?debug` exposes round/voice/handler counters and two QA controls. Accurate replay sends synthetic DOM mouse-down/up events at target times; rough replay sends them 240 ms late. Both go through Phaser's normal unified input and timing judgement. This avoids remote-browser click latency contaminating the exact-timing visual check. The replay uses the existing controller observation pump, adds no separate timer, and is cancelled with the round. It is not an autoplay mode in production.

Browser QA includes actual pointer attempts and synthetic accurate/mistimed replays, both ending poses, repeated restarts, phone aspect ratios and console inspection. The accurate replay has produced 100% with a flush nail and zero remaining voices. Rough attempts produce the crooked ending. Physical touch, mobile Safari and acoustic output latency still require real-device testing; browser automation cannot establish those hardware properties.

Final verification (10 September 2026): typecheck, lint, the full test suite and the production build passed. Browser viewports checked: 320×568, 390×844 and 430×932. All three existing patterns scored 100% through accurate pointer replay, including the 300 ms closing double. Late replay produced the 0% crooked ending. Repeated restarts retained one input handler and returned to zero voices at completion; console warning/error checks were empty. Source-cancellation tests cover both regular hammer hits and scheduled finishing sounds.

Two synchronization refinements came from QA: quick-double anticipation blends from the previous recoil rather than snapping to rest; headline reveals use absolute elapsed time so a throttled frame cannot leave the ending text half-faded long after the strike. Numerical rhythm judgement was not changed.
