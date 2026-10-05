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

## The map

- **A cleared stop is settled, not heavy.** It used to be filled with the area's ink, which on
  the four light areas made a near-black puck, the heaviest thing on the road and heavier than
  the coral frontier. `puckColours` (`ui/roadLayout.ts`) now fills it with the area's road
  mixed 45% toward whichever of ink and paper is darker, deepened only as far as the lighter
  one needs to clear `OUTLINE_CONTRAST` on it. The order at a glance is frontier, then
  cleared, then locked and preview, on all five areas. On Dusk, where paper and ink are
  inverted, this gives a warm mid-brown under a cream number. The brass star plates are
  unchanged.
- **Every number on the road clears the contrast floor.** A preview's number used to be
  drawn at 58% alpha, and on Grass it read at 2.6:1. It is now drawn whole, in the faintest
  mix toward the ink that reaches 3.15:1. `tests/roadLayout.test.ts` checks every state on
  every area.
- **One ambient layer per area** (`ui/mapAmbience.ts`): pollen on Grass, a slow glow
  breathing on Pavement's lamps, dust on Sand, snowfall on Snow, fireflies at Dusk. It is a
  fixed pool of 32 motes and 8 lamp glows, made once. Each mote's place is a pure function of
  its seed, the time and the view, wrapped round only off screen. Every mote is anchored to
  the world, so it keeps its place on the ground as the road scrolls. It sits at depth 0.75,
  over the ground and under every prop, stop, plate, gate and the header haze. It fades out
  near an area's seam, so a mote never changes kind in view. It is hidden under reduced
  motion and while the window is blurred. The lamp positions come from the bake, so the
  glows cost nothing when the road has not moved. Frame cost is in `docs/PERFORMANCE.md`.
- **The frontier hops on the music.** It used to jump every 1.6 s against a 2 s bar, so it
  drifted across the beat the player hears. The hop now leaves the ground `MAP.hopSec`
  (0.32 s) before each bar line and lands on beat 1, and the ring rolls out from the
  landing. The phase comes from `ui/musicPulse.ts`, read from the shell loop's playhead at
  the heard clock. The playhead (`MusicSystem.playheadAt`) records each rate change, so a
  level's loop that the map reuses at rate 1 still knows where its bar lines are. With no
  music playing, the frame clock runs at 120 BPM instead, so the hop never freezes.

## The title on the beat

- The theme (`bgm/theme/home-page.mp3`) was measured from the audio, not assumed. It runs at
  a steady 120 BPM in 4/4, with its first downbeat on the music's start, and its 64 s loop
  is 32 whole bars (`THEME.bpm`, `THEME.beatsPerBar`). `ThemeMusic.playheadAt` gives
  seconds from that downbeat.
- The tempo beads light beat by beat from that playhead through `ui/musicPulse.ts`, the same
  helper the map uses. Before the theme sounds (a cold start waits for a touch), or if it
  fails to load, they run on the frame clock at the same tempo.
- **The hammer plays beat 1 of every bar.** It winds up into the next bar line with the
  existing `anticipation` curve and lands with the existing strike (strength 0.8). The
  nail does not move: only a tap's knock sinks it, as before. When the beat source
  changes, for example when the theme arrives, the count moves without a blow, so the
  hammer never strikes off the beat it has just found. The strikes are silent; a soft
  tick under the theme is the open question for Dor. Under reduced motion there are no
  strikes and the cover holds still.

## Impact during play

- **Contact punch** (`ui/punch.ts`): the act's stage kicks down `PUNCH.reach` (3 design
  units, times the treatment's exaggeration and the scene's scale) on a contact and settles
  within 120 ms, with one small rebound. It moves the act's stage container and nothing
  else: not the camera, the block, the verdict or the headline. It fires on a Perfect
  player hit, never on a demonstration beat, an introduction or a teach pass, and on the
  finishing blow of a clean task's coda (the five-beat finale hold). It is applied after the slide's `translate` through the
  optional `Vignette.punch`, so the stage-home rule still holds. It is a pure function of
  the contact's audio-clock time and is off under reduced motion.
- **Material particles.** `generateFeedbackTextures` now draws four more textures:
  `splinter`, `droplet`, `ring` and `flake`. Four presets use them: `splinters`,
  `droplets`, `rings` and `flakes`. The saw throws splinters. The tomato and cucumber throw
  droplets. Bubble wrap lets out rings on each judged pop. The roller and the paintbrush,
  whose only contact feedback was the picture itself growing, now flick drops of the
  stripe's or stroke's own paint. Counts are 3–7, inside the existing range, and `burst`
  still scales them by exaggeration. Household acts reach them through
  `HouseholdVignette.throwBits`, which makes one `Feedback` in the stage on first use and
  keeps it under the card light. As `ui/feedback.ts` documents, a burst fires at the
  contact and then flies on Phaser's frame delta. It is decoration for a moment that has
  already been judged.
- **Squash where it was missing** (levels 1–13). The struck subject now gives on contact
  through `contactGive` (`ui/spring.ts`, built on `squash`). It squats 6% and widens 3% for
  100 ms, about the point where it rests. This applies to the nail (scaled by the blow's
  strength), the tomato, the cucumber and the banana (about the cut face on the board, so
  the blade stays on it), and the egg (about its own centre, before it is tilted). The bug,
  the bubble and the doorbell's button already deformed. The glass, the timber and the paper
  are rigid, so they were left as they are. Off under reduced motion.

### Contact feedback, act by act

What each act shows on a player's judged contact, audited before the changes above. ✚ marks
what this pass added.

| # | Act | Particles | Its own effect | The subject deforms |
|---|---|---|---|---|
| 1 | Hammer | dust | flash lines, ring | hammer head; nail ✚ |
| 2 | Window | water | lane wiped, gleam | squeegee; glass is rigid |
| 3 | Bug & shoe | dust | contact ring | shoe and bug |
| 4 | Saw | chips → splinters ✚ | kerf, sawdust plume | timber is rigid |
| 5 | Tomato | dust → droplets ✚ | juice, board ring | tomato ✚ |
| 6 | Bicep curl | dust, sweat | tally | trunk, bicep |
| 7 | Cucumber | water → droplets ✚ | juice, ring | cucumber ✚ |
| 8 | Banana | dust | pulp drops, ring | banana ✚ |
| 9 | Scissors & paper | — | snip ticks, scraps | paper is a sheet |
| 10 | Egg | — | strike lines | egg ✚ |
| 11 | Bubble wrap | rings ✚ | pop ring, crinkle | bubble flattens |
| 12 | Light switch | — | — | paddle, slightly |
| 13 | Doorbell | — | halo, sound arcs | button sinks |
| 14 | Paint roller | droplets ✚ | stripe painted | — |
| 15 | Hotel bell | — | ring arcs | plunger |
| 16 | Balloon pump | — | — | balloon puffs and grows |
| 17 | Stapler | — | jaw flash, staple | — |
| 18 | Fisherman | — | water rings, drops | rod bends |
| 19 | DJ scratch | — | meter lights | — |
| 20 | Trombone | — | sound arcs, note | cheeks |
| 21 | Clapping hands | — | rings | palms |
| 22 | Snare | — | rings | — |
| 23 | Bongos | — | rings | palm drops |
| 24 | Slushy | — | sip drops | mouth |
| 25 | Apple | — | crumbs | — |
| 26 | Barber | — | snip flash, falling hair | — |
| 27 | Popcorn | — | pop flash | kernels squash on landing |
| 28 | Toothbrush | — | glint, foam | — |
| 29 | Paintbrush | droplets ✚ | stroke laid | — |
| 30 | Blow your nose | — | motion lines | face, tissue |
| 31 | Wash the plate | — | suds | sponge |
| 32 | Prospector | — | sparks, cracks | — |

The light switch and the DJ scratch are the quietest at the moment of contact. They were
left alone: a switch throws nothing, and the record's dust on a dark deck would not read.
They are the next candidates if more is wanted.

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
