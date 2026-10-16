# Knife + Tomato — implementation and architecture review

A fifth vignette over the existing rhythm engine, added at request. No clock, input,
scheduler or judgement rule changed for it, and no engine capability was added: it uses
the judgement accents Saw introduced. `levelSpec` cycles the registry, so the tomato is every eighth level now that Cucumber
and Banana follow Curl. The entry was never moved: later acts were appended.

## Visual direction and controls

A white-tiled kitchen: near-white paper `#f6f7f2` with faint mint grout `#c9d8cc`, a
pale board `#e3cfa6` with a darker edge, a grey-green counter wash below. The tomato
`#d94a3a` is the only saturated thing in frame, which makes it the subject at a glance;
its cut face shows flesh `#e35f4a`, a paler ring `#f0a08e` and seeds `#f5d98a`. The knife
is cool steel `#d3dadd` with a near-black handle and steel rivets — no brass, so it does
not borrow Saw's one warm accent. The red sits closest to Hammer's vermilion handle, but
Hammer's red is an accent on warm copper timber and this red is the subject on a white
kitchen; the framing differs as well.

Side view, board horizontal, the fruit in profile left of centre. One tap is one rocking
chop: the tip stays near the board and is the rotation pivot, the heel lifts between chops
and drops, and the edge meeting the board carries the timing. The windup before contact
rises a little higher first, then accelerates down to exactly zero on the beat; the rise
after it is follow-through. Slices come off the right side of the tomato, so the knife's
descent is always over cleared board and never through uncut fruit. Each accurate chop
advances the cut left and the slab topples off it onto a pile to the right, turning from
edge-on to a leaning disc that shows its cross-section as it goes. Everything is Phaser
Graphics — the clipped tomato and the discs are fan-filled polygons — with no assets,
masks, per-slice display objects, listeners or timers.

An extra tap lands the knife on bare board beside the fruit with a hollow clack and leaves
a nick; a missed target leaves the knife hovering with a tremble and a faint ring. Neither
takes a slice, and an omission never invents a chop. Off chops accumulate as unevenness
that decides how crooked the later slices land, so a rough result is visible before it is
announced. The demonstration rocks the knife over the fruit without slicing it, so the
player starts on the tomato they watched; there is no bar between the demonstration and
the response in which a whole one could arrive. Reduced-motion preference suppresses board
press, impact shake and the idle bob.

The coda is an unscored finishing chop that takes the standing heel once the controller
has resolved the response; it never changes the result. Strong (70%, as every act) lays
the last slice on an even pile and lets one seed drop late, after everything is still.
Rough squashes the final slice flat, splays the pile, and the copy holds back.

Chop phases are fractions of a beat (`tomatoTiming(beat)`): the tightest authored
interval is a half beat at every tempo, and the rise back up is 0.36 beat, so the knife is
always clear before the next possible hit from 120 to 150 BPM.

## Ownership and timing

- `src/vignettes/tomatoMotion.ts`: presentation-only curves — knife lift and windup, cut
  fraction, slice topple, juice fall — pure and Phaser-free, unit-tested under node.
- `src/vignettes/TomatoKnifeVignette.ts`: geometry, palette and motion, sampling only the
  absolute audio time the host supplies and the plan's absolute times.
- `src/audio/tomatoSounds.ts`: deterministic board knock with a wet element, a hollow
  knock for bare board, a trembling ring, a late seed pip, a squelch.
- `src/vignettes/motion.ts`: `acceptDemoBeat` and `advanceOnHit` moved here from the saw
  module because a second vignette needed the same two guards. Common bounded easing was
  already there; the rule that no vignette imports another's motion still holds.
- `src/vignettes/registry.ts`: one definition. Nothing else changed.

Grading stays outside the vignette: it receives `Judgement` and inspects only `kind` and
`index`; the strong/rough boundary is the level's clear bar (`finishOutcome`, `game/taskVerdict.ts`).

## Verification

`npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass. `tests/tomato.test.ts`
pins the edge landing exactly at contact, the knife back up before a half beat at 120, 136
and 150 BPM, the windup peaking above rest and reaching zero on the beat, slices advancing
on hits only, a heel left for the coda, bounded topple and juice, and five deterministic
bounded sound buffers. `tests/saw.test.ts` now pins the five-vignette rotation.

Driven in headless Chromium through level 5 with no console or page errors. Not
established here: touch and audio latency, acoustic output, and whether the tomato red
reads as a distinct scene beside Hammer's vermilion on a real handset.
