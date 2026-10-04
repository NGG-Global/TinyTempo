# Workshop visual system

The app uses one tactile workshop treatment (`src/config/style.ts`): objects sit
under one warm key light, the title hangs from the top edge on ropes, primary
actions are physical blocks, and compact controls are pucks. Fredoka is the
display face and Nunito is the supporting face, including the DOM shell shown
before Phaser has loaded.

## Design

- The title screen is an object composition, not a menu: hanging wooden title,
  floating hammer and nail, tempo beads and one coral Play block.
- Hammer has an opt-in cover framing that leaves room for the title on short
  screens. Its gameplay scale, poses, sounds and contact timing are unchanged.
- The road uses a sage/sand palette, a coral current-level marker and a persistent
  next-level dock. Locked levels remain discoverable but subordinate. Their ring,
  squash and padlock provide local feedback without an explanatory message.
- Navigation uses a 320 ms diagonal sweep: a card of paper with a coral edge and
  an ink edge ahead of it, both weighted by the treatment's outline. A completed
  outgoing sweep remains opaque until scene shutdown, avoiding a flash when Phaser
  queues the scene change. Reduced-motion users get an immediate cut.
- Gameplay replaces the task-number string with quiet progress marks and reveals
  the result stars as a stamp: empty seats first, then brass medals dropping
  left to right, each throwing a bloom, sparks and confetti as it lands.
  Essential navigation targets are separated by at least 56 CSS pixels, with at
  least 48 CSS pixel hit areas.
- Copy is deliberately sparse. The scene carries meaning through composition,
  motion and object state; text is reserved for the current area, vignette name,
  phase handoff, result, and actionable settings. Uppercase eyebrows, level labels,
  taglines, helper captions and technical footnotes do not appear in normal play.
- Settings retain the same raised paper and coral-block language. Each card has one
  large state and one action, rather than a heading, value and explanation stack.

## The player's turn, as it reads

Four readability changes to the response phase, all presentation: no cue moved, nothing
scheduled, judged or scored changed.

- **The handover's dim is an edge vignette, not a wash.** The room used to step back under
  a flat fill of the game's ink at 17%, and over cream and timber a green-black wash read as
  olive: the scene looked dirty rather than lit differently. `FxKey.vignette`
  (`ui/feedback.ts`) is one generated soft texture, clear across the middle and whole only
  in its corners, drawn as a single tinted image at the same depth, on the same `turn.yours`
  curve. Its tint is a shade of the act's own paper, read from the camera the act's Backdrop
  painted, so a dark stage darkens without a hue shift. It hangs low and oversized, so its
  clear middle covers the act and the block together and its bottom edge falls below the
  frame: the block comes forward because the room above and beside it steps back.
- **The turn block stands on a patch of sheet** (`docs/TURN_CUE.md`, "The sheet under the
  rows").
- **The count-in has a backing** at its own weight, and a floor of 42 rather than 36
  (`docs/TURN_CUE.md`, "The count's backing").
- **The verdict word lands on a pill of the act's paper**, drawn with the block from the
  word's own pose, so Perfect's coral and a miss's muted grey read on wood and on the dark
  stages; and it pops inside its existing 0.45 s arrive — from a little under size, past
  it, to rest — so it lands rather than surfaces. No scale under reduced motion.
- **The Flawless halo is one soft image**, the glow texture the stage's pool is made of,
  sized to the word; it replaces three fainter offset passes of an ellipse, which frame by
  frame read as a smeared double image rather than as light. `flawlessPose`'s timing is
  unchanged.

## Boundaries

`SceneCurtain` owns only screen-navigation motion. It cancels its tween and update
listener at shutdown, prevents repeated navigation, and releases the new level's
start callback after the illustration is revealed. It never shifts an active
rhythm grid. Musical task transitions, Web Audio scheduling, input timestamps,
judgement, difficulty and scores are unchanged. The edit in `game/levels.ts` is
only the Grass palette.

The map retains its own scrolling input, now with pointer ownership, cancellation
on blur/touch cancellation, desktop wheel input, bounded inertial steps, and a
resize anchor that preserves the viewed stretch of road. UI navigation stops
outgoing action voices; shared background music retains its existing lifetime.

## Verification

- Typecheck, lint, production build and the test suite pass. (The count in this
  line drifted every time a test was added; `npm test` is the authority.)
- New tests cover frame-rate-independent inertia, resize anchoring, stalled-frame
  bounds, transition re-entry, late callbacks after shutdown and reduced motion.
- Browser inspection: 320×568, 390×844, 430×932 and 800×600. Title/tool collisions
  are resolved; controls and next-level information remain within the layout.
- Scrolled between map areas and resized while browsing; the same stretch of road
  remained visible. Tested locked-level feedback and next-level dock navigation.
- An accurate Hammer level completed at 100%; a deliberately rough Window level
  completed at 0%. Both used the existing development replay controls, which send
  mouse events through the normal input path.
- Rapid restarts, leaving during play, and Menu → Map → Play → Map → Menu were
  exercised. The debug readout stayed at one pointer handler and stable object
  counts (17 Hammer / 16 Window); debug controls disappeared on scene exit.
- Calibration samples are limited to one per beat and reject erratic runs, so
  rapid tapping cannot manufacture a device offset. The backdrop teardown is
  idempotent even under an aggressive same-scene restart.
- Observed roughly 60–61 fps during the browser runs and no warning/error console
  entries. This is not a physical-device performance or latency certification.

Remaining device QA: real multitouch and interrupted gestures, native safe-area
insets, Android/iOS audio latency, and OS reduced-motion behavior. The reduced
motion transition path is covered by automated tests, not an OS-setting run.
