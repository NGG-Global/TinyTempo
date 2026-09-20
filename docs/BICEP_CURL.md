# Bicep curl — implementation and architecture review

A sixth vignette over the existing rhythm engine, added at request. No clock, input,
scheduler or judgement rule changed for it, and no engine capability was added: it uses
the judgement accents Saw introduced. The entry is appended to the registry, so levels 1
to 5 keep the vignettes they had and the curl is every sixth level from 6 on.

## Visual direction and controls

The coach described below is the first of three people who take the bench. On the
act's second visit (level 25, with nineteen acts in the rotation) a sprinter in a plum singlet lifts, with a high bun
and a star badge; on the third (level 40) a bald, bearded veteran in amber with two
racing stripes. `src/vignettes/curlLooks.ts` holds the three as data; the figure,
its motion and the gym are shared. See `docs/VARIANTS.md`.

A gym of concrete, rubber and iron: paper `#dad4cb` with a dado of cooler plaster
`#cbc3b7`, a slate mat `#4c4954` with paler seams, a chalkboard `#34493f` in a timber
frame. The tank `#2e9c8e` is the only saturated colour in the room, which makes the
figure the subject at a glance; skin `#d8945f` flushes toward `#d9634a` as the set goes
on, and the dumbbell is cool iron `#3b3e47` with a chrome bar — no brass, so it does not
borrow Saw's one warm accent. Teal sits well away from Hammer's vermilion and the
tomato's red; the framing is a standing figure rather than a tool on a bench.

The refined coach has a swept quiff, curled moustache, expressive eyes, a lightning
singlet badge, ribbed socks and tailored trainers. Bézier silhouettes and connected
shadow planes replace the stacked ellipses and isolated highlight patches. The arm's
contour still swells on the squeeze. A rounded far cheek and an inset, foreshortened
nose keep the face consistently three-quarter rather than mixing in a profile silhouette.
The figure and chalkboard fit above the verdict,
including on a 320px-wide phone; the original workshop palette is preserved.

Three-quarter view, floor at the bottom of the frame, the figure facing right of centre. One tap
is one curl: the elbow stays planted, the forearm sweeps from hanging to a squeeze in
front of the shoulder, and the squeeze at the top carries the timing. The lift before it
is anticipation; the controlled lower after it is follow-through. Accurate reps chalk a
stroke on the board and pump the working arm; an extra tap gets the weight halfway
before the arm gives and the plates clank; a missed target leaves the arm hanging and
trembling under the load. Neither counts, and an omission never invents a rep. Off reps
lean the figure back into bad form, so a rough result is visible before it is announced.
The demonstration curls the weight in full without counting, so the player starts on the
empty board they watched; there is no bar between the demonstration and the response in
which the tally could be wiped. Reduced-motion preference suppresses the squeeze squash,
the landing thump, the idle breath and the decorative bursts.

The coda is an unscored last rep of the set once the controller has resolved the
response; it never changes the result. Strong (70%, as every act) holds the squeeze at
the top with a dying tremor and draws a ring round the tally. Rough gets the weight
there, loses it, and the dumbbell meets the mat twice; the chalk is dragged across the
count.

Rep phases are fractions of a beat (`curlTiming(beat)`): the tightest authored interval
is a half beat at every tempo, and the lower is 0.4 beat, so the arm is hanging again
before the next possible hit from 120 to 150 BPM.

## Ownership and timing

- `src/vignettes/curlMotion.ts`: presentation-only curves — lift, squeeze, lower, bulge,
  pump, drop, hold tremor, chalk — pure and Phaser-free, unit-tested under node.
- `src/vignettes/BicepCurlVignette.ts`: geometry, palette and motion, sampling only the
  absolute audio time the host supplies and the plan's absolute times.
- `src/audio/curlSounds.ts`: deterministic exhale with plates settling, a half-rep clank,
  a tremble under load, a racked rest, a dropped thud on the mat.
- `src/vignettes/registry.ts`: one definition, appended. Nothing else in the engine
  changed.

Grading stays outside the vignette: it receives `Judgement` and inspects only `kind` and
`index`; the strong/rough boundary is `successAccuracy` on the registry entry.

## Verification

`npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass.
`tests/curl.test.ts` pins the squeeze exactly at contact, the arm hanging again before a
half beat at 120, 136 and 150 BPM, the lift reaching exactly 1 on the beat from wherever
it started, the forearm past vertical at the top, reps advancing on hits only, a rep
left for the coda, a drop that lands where the rough buffer puts its thud, and five
deterministic bounded sound buffers. `tests/saw.test.ts` now pins the six-vignette
rotation.

Driven in headless Chromium through level 6 with no console or page errors. Not
established here: touch and audio latency, acoustic output, and whether the teal tank
reads as a distinct scene beside Window's glass and Saw's slate on a real handset.
