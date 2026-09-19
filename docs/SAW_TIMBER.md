# Saw + Timber — implementation and architecture review

A fourth vignette over the existing rhythm engine, added at request. No clock, input,
scheduler or judgement rule changed for it. The engine gained one generic capability —
an optional judgement accent on the sound set — because the action sound is scheduled
before the tap is graded, so nothing existing could react to a grade.

`levelSpec` cycles the registry, so the saw is every sixth level now that Curl follows Tomato. Its tasks and tempo
come from the progression curve like any other vignette's: each level starts at the
music's 120 BPM and ramps task by task toward its peak, up to 150 BPM on the plateau.

The stroke's phases are fractions of a beat, not seconds (`sawTiming(beat)`), because
the tightest authored interval is a half beat at every tempo. Tuned at 120 BPM the
follow-through is 190 ms against a 250 ms half beat; held in seconds it would have had
10 ms to spare at the 150 BPM ceiling and read as continuous scrubbing. In beats it is
152 ms against 200 ms there, and `tests/saw.test.ts` asserts the ratio rather than the
120 BPM numbers.

## Visual direction and controls

### The second pass

A later pass gave the saw a hand. A canvas work glove in the cool range grips a
closed D-handle, and a rolled shirt sleeve runs along the blade's line out of the
frame, so the stroke reads as someone sawing rather than a tool sliding by itself.
The blade tapers more, carries a faint maker's etch, and its teeth are set, leaning
alternately as a crosscut's do. The saw rocks about the bite as it strokes
(`sawRock`, at most 0.04 rad): the heel dips into the push and the toe lifts on the
pull, pivoting on the teeth in the kerf rather than on the container's origin. A
pencilled line marks the cut below the kerf and a torn fibre or two sit at its
mouth; a heap of sawdust grows on the floor under the cut with the kerf
(`dustPile`), so the demonstration leaves the floor clean; the trestles gained a
diagonal brace and a sacrificial timber cap; and the dropped offcut throws one puff
of dust when it lands. None of it touches the stroke's timing, which the tests pin.

Deliberately cool, so it cannot read as Hammer's warm workshop: cold linen `#e6e9e4`,
deep slate `#22303a` for sawhorses, outlines and handle, pale sapwood `#cbb999` with a
lit top edge `#e4d8c0` and `#a89070` grain, kerf interior `#544a39`, blade `#aab6bd`,
grip `#3f5a63`. Sawdust `#d8a24a` is the only warm note, which makes the accent colour
double as the reward signal. Saw and Hammer share a subject, so this separation is the
act's main design risk and the reason the palette carries no warm ground at all.

A board crosses the frame at about -6.5°, cantilevered past two sawhorses that both sit
left of the cut, so the offcut is unsupported and the fall is telegraphed before it
happens. The blade stands 30° inside the plane of the cut, plunging into the kerf rather
than lying along the face; the kerf stays vertical because the tilt is within the cut
plane. The blade is never drawn below the depth it has actually sawn — the in-kerf slice
is bounded by `bladeVisibleDepth`, and the blade above the board is clipped at the top
face, so a slide can shorten what shows but never reveal uncut wood.

**The blade is one rigid piece of steel, and a stroke moves all of it.** `bladeSpan` puts
the toe and the heel both `slide` units along, so `heel - toe` is the same 600 units at
every point in a stroke; `bladeOutline` then clips that quad against the board's top face
and is the only thing that changes shape. The distinction is the whole illusion, and it
was got wrong once: pinning the toe at the kerf and letting only the heel travel took the
drawn steel from 278 units to 582 across one stroke and left every tooth standing exactly
where it was, so the saw read as being stretched rather than pushed. The teeth are phased
to the blade for the same reason — they are cut into the steel, not into the wood, and
they are the repeated feature the eye actually tracks. Display titles
frame the opening and ending; the illustration stays dominant during play and there are
no UI panels. Board, sawhorses, grain and the saw itself are Phaser Graphics with
deterministic local geometry: no external assets, no dynamic masks, no per-stroke
display objects, listeners or timers.

One tap is one stroke, and direction alternates — push, pull, push. Tap anywhere;
pointer-down is the contact. Maximum tooth engagement lands on the beat: the draw back
before it is anticipation and the overshoot after is follow-through, and neither carries
the timing. A stroke resting at the end of its travel is the next stroke's fully drawn
back, so alternating strokes chain without a pop, and a quick pair reverses from wherever
the previous follow-through had reached rather than snapping to a nominal rest. The draw
back and follow-through together take 0.34 s, inside the 250 ms-plus room the authored
half beats leave — a stroke that outlived its interval would read as one long scrub.

Accurate strokes deepen the kerf and throw a sawdust plume. An extra tap skids across the
face, sounds dull and leaves a scuff; a missed target leaves the kerf exactly where it was
and judders. Neither cuts, and an omission never invents a stroke the player did not make.
Off strokes also walk the cut off the line, so a rough ending is visible before it is
announced. The demonstration strokes the board without cutting it at all, so the player
starts on the board they watched. There is no bar between the demonstration and the
response in which a fresh length could arrive. Reduced-motion preference suppresses
timber flex, impact shake and the offering-gesture lift, and changes the board in place
instead of travelling; the stroke, the cut and the judgement all still read.

The coda is an unscored finishing stroke that severs the plank once the controller has
resolved the response. It never changes the engine's result. A strong finish (70% or
better, as with the other three acts) runs the cut true, drops the offcut square, and
lets one late mote of dust drift down after everything else is still — the ending copy
fades in only after the finishing contact. A rough finish leaves the cut wandering and
the offcut hanging by a splintered hinge, swinging, and the copy holds back.

## Ownership and timing

- `src/vignettes/sawMotion.ts`: presentation-only curves and constants — stroke travel,
  the draw back, kerf depth, visible blade depth, dust fall — plus `sawDirection` and
  `advanceBite`; `acceptDemoBeat` and the generic advance-on-hit live in `motion.ts`
  since a second vignette needed them. Pure `number → number` with no Phaser import, so it
  is unit-testable under vitest's node environment. It never alters a target, grade or score.
- `src/vignettes/SawTimberVignette.ts`: all geometry, palette and motion. Motion samples
  the absolute audio time the host supplies and the plan's absolute times; there is no
  wall clock, tween or timer, so a throttled frame cannot shift a contact. Input callbacks
  render contact on the tap's own frame.
- `src/audio/sawSounds.ts`: deterministic bite, skid, judder, sever and hinge-creak
  synthesis from one seeded noise source. No remote audio assets.
- `src/audio/AudioEngine.ts`: `VignetteSounds` gained optional `scrape` and `judder`
  slots and a `playAccent` that no-ops for a set declaring neither, so the three existing
  acts are unaffected.
- `src/scenes/PlayScene.ts`: plays those accents from `showJudgement`, which already owned
  judgement presentation. `RoundController`, `judge.ts`, `TapInput` and `AudioClock` are
  untouched, per the rule in [vertical slice](VERTICAL_SLICE.md).
- `src/vignettes/registry.ts`: one definition, and nothing else. `levelSpec` picks
  `VIGNETTES[(level - 1) % VIGNETTES.length]`, so a fourth entry enters the rotation
  with no change to the level generator.

Grading stays entirely outside the vignette. It receives `Judgement` and inspects only
`kind` and `index`; the strong/rough boundary is `successAccuracy` on the registry entry,
compared by the host.

At the base 120 BPM a four-beat phrase gives four beats each of demonstration and
response: for a task with no lead-in the demonstration is at the plan's start, the
response at 2.0 s, the end at 4.0 s, the coda's contact one beat later at 4.5 s, and the
next task at 6.0 s. Only a level's first task and a long level's breather carry a
lead-in, of one bar and four bars respectively. Faster tasks compress all of it proportionally,
which is what the note above is about.

## Verification

`npm run typecheck`, `npm run lint`, `npm test` and `npm run build`
all pass. `tests/saw.test.ts` pins the curve boundaries the way `tests/hammer.test.ts`
does — the bite exactly on contact, the follow-through settling at rest, kerf and blade
depth clamped at both ends, a flawless response stopping short of severing — and adds
three assertions with no precedent in the suite: that direction alternation is total for
negative and large action counts, that an extra or an omission never advances the cut, and
that a demonstration beat delivered twice draws one stroke. The last matters because
rendering re-scans the plan's cues every frame while the host also forwards the
controller's cue, so the guard has a genuine double-delivery path to survive.
`tests/audio.test.ts` covers both accent voices and the silence of a three-slot set. The
saw enters the rotation through the registry alone, so no level or progression test needed
changing; `tests/levels.test.ts` checks only that level 1 is Hammer and that neighbouring
levels differ, so `tests/saw.test.ts` pins the actual cycle — reordering or inserting a
registry entry silently reassigns every level's vignette, and nothing else would catch it.

Driven in headless Chromium at 393x851, entering the saw's level from the map, through
demonstration, response, both codas and into the following task, with no console
or page errors: one pointer handler and a bounded 14 scene objects throughout; the kerf
deepening only on accurate strokes and holding still through a miss; the demonstration
leaving the board uncut; a strong finish at 80% severing the plank, dropping the offcut square and
revealing "Two planks now." only after the finishing contact; a rough finish at 0% leaving
a wandered kerf, three scuffs and the offcut hanging by its hinge with the copy held back.
Under `prefers-reduced-motion: reduce` the board neither travels nor flexes, still swaps in
place, and a clean response still reaches full response depth (three bites over six
strokes) — the stroke, the cut and the judgement all read.

Three defects were found and fixed this way rather than by reading the code: the per-frame
timber flex was assigning the container's `y` outright and destroying the board's own
anchor; the blade's perpendicular pointed into the wood, putting the teeth on the blade's
upper edge; and the stroke scaled the blade instead of sliding it, because the toe was
clamped to the kerf while the heel travelled. The clamp was also cutting the steel along
the kerf's own perpendicular rather than along the board's top face — the two coincide
only at the tooth edge, so the blade ended in mid-air above uncut wood instead of going
into the cut. Both are one fix: a rigid quad, clipped to the face.

Not established here, and not claimed: physical-device touch latency and digitiser
behaviour, audio latency, and acoustic output — none of which a browser can demonstrate,
and the headless renderer's frame rate is not a usable performance signal either. Mobile
Safari, reduced motion on a real handset, and whether the cool palette reads as a distinct
scene beside Hammer's warm one still need device and listening QA. Device testing is
separately blocked by the 161 MB of raw WAV stems, which [music notes](MUSIC.md) says must
be delivered compressed first; that is pre-existing and untouched by this change.
