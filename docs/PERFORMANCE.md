# Performance audit

A pass before 0.1.16 to check that the game responds to a tap without delay and plays
smoothly. Each finding was measured before it was changed, and measured again afterwards.

## How it was measured

The harness drives the development build in headless Chromium at a 393×851 phone viewport.
It disables the round's stall guard for the measurement and replays or idles each screen.
For every frame it records:

- the main-thread time of the scene update and of the render submission;
- Graphics commands rendered and rebuilt;
- Text rasters;
- allocation per frame, from the V8 sampling heap profiler.

The numbers are from a desktop x86 core. A mid-range Android phone runs this JavaScript
roughly two to four times slower. That ratio is an estimate, not a measurement, so read the
figures as relative.

The renderer here is software (SwiftShader), so frame *rate* in the harness means nothing.
Only main-thread milliseconds and allocation are compared.

## What was wrong, and what changed

### Every curve was a hundred points, every frame

Phaser 4's WebGL Graphics renderer turns each `arc` into a fixed 100 points
(`iterStep = 0.01`), whatever its radius or sweep, and does it again on every frame it
renders.

- A 2-unit highlight costs what a 200-unit sun does.
- A rounded rectangle is 404 points, because each corner is a full hundred.

The acts draw hundreds of these a frame. The map draws thousands, in its baked strips, and
re-tessellates them every frame.

`ui/arcDetail.ts` replaces `Graphics.arc` once, in `main.ts`, before the game is
constructed. The replacement emits the same curve as chords: enough that none strays more
than 0.1 unit inside the true circle, and never more than Phaser's hundred.

- The sweep is normalized exactly as the renderer normalizes it, so concave corners,
  anticlockwise arcs and slices run the same way round.
- A pixel diff of circles, strokes, rounded and concave rectangles, an ellipse, a slice and
  an anticlockwise arc, at the phone's own 2.75× density, shows only antialiasing noise on
  edges. At 4× zoom the two are indistinguishable.

Main-thread milliseconds per frame (update plus render submission), before → after:

| Screen | Before | After | Change |
| --- | --- | --- | --- |
| Map (64 levels, scrolling), render only | 15.0 | 6.3 | −58% |
| Light switch (act 12) | 4.20 | 2.94 | −30% |
| DJ scratch (act 19) | 5.27 | 3.34 | −37% |
| Bicep curl (act 6) | 4.65 | 2.64 | −43% |
| Bubble wrap (act 11) | 4.24 | 3.10 | −27% |
| Fisherman (act 18) | 3.91 | 2.47 | −37% |
| Bongos (act 23) | 3.57 | 2.10 | −41% |
| Slushy (act 24) | 2.73 | 1.96 | −28% |

Allocation per frame also roughly halved:

| Screen | Before | After |
| --- | --- | --- |
| Light switch | 5.1 MB | 2.8 MB |
| DJ scratch | 6.8 MB | 3.1 MB |
| Map | 10.9 MB | 5.0 MB |

That is less work for the garbage collector, whose pauses are what a player feels as a
hitch. Memory after a collection is unchanged, so nothing is retained.

The update side rises a little, about 0.1–0.3 ms, because the chords are now written into
the command buffer. The renderer stops recomputing them, which more than pays for it.

### A text resize redrew the text up to five times

`resize` in `ui/type.ts` runs on the frame of every judged tap (the verdict) and every
count-in strike ("3, 2, 1, Go!"). It called Phaser's `setColor`, `setShadow` and
`setPadding`, and each of those redraws the text's canvas and re-uploads its texture,
whether or not anything changed.

`restyle` now writes the fields directly and says what has to be redrawn:

- once, re-measured, when the size or outline moves;
- once, repainted, for a colour, shadow or padding;
- not at all when nothing changed.

| Call | Before | After |
| --- | --- | --- |
| Same look | 3 rasters, 0.20 ms | 0 rasters, 0.01 ms |
| New size | 5 rasters, 0.34 ms | 1 raster, 0.12 ms |

Across a replayed level, text rasters at the 95th-percentile frame fell from 6 to 2.

### The map's ambience, measured before and after

`ui/mapAmbience.ts` adds a fixed pool of 32 motes and 8 lamp glows to the map
(`docs/VISUAL_POLISH.md`, "The map"). The same harness measured it on the 393×851 phone
viewport. It timed the whole game step (update plus render submission) for 12 s on an idle
map. The before build is the commit before the change, served from a worktree. Each side ran
twice, one after the other, never at the same time.

| Area | Before, mean / p95 (ms) | After, mean / p95 (ms) |
|---|---|---|
| Grass (pollen) | 6.85 / 10.8 and 6.79 / 10.3 | 7.50 / 11.8 and 7.30 / 11.9 |
| Pavement (lamp glows) | 7.94 / 11.6 and 7.62 / 10.6 | 7.88 / 11.2 and 7.88 / 11.4 |
| Dusk (fireflies, additive) | 6.32 / 9.9 and 6.58 / 9.8 | 7.09 / 11.7 and 7.05 / 10.4 |

The cost is about 0.5–0.7 ms a frame on this core where motes are drawn, and within noise on
Pavement, whose lamps are a few large images rather than 32 small ones. On the
two-to-four-times-slower handset estimated above, that is roughly 1–3 ms of the 16.7 ms
budget. The "after" figures also include the frontier hop reading the music's playhead
once a frame, which is a refresh of the clock and a short walk of the rate history.
Nothing grows with the length of the road or the time spent on the map. The pool is built
once on entry. Posing a mote allocates a few short-lived objects (its seed and its pose), about a hundred a frame in all, which the young generation collects cheaply. Under
reduced motion or a blurred window, every image is hidden and the pose loop does not run.
The fill-rate cost on a real GPU was not measured here (the harness renders in software).

### Static drawings were re-tessellated every frame (the map's lag at later levels)

The map lagged more the further a player got. Phaser walks every Graphics' whole command
buffer and rebuilds its triangles on every frame it renders, and the map's road, scenery,
sign, pucks and bench were Graphics that change only when the player taps one. Below level
21 the map's window holds 27 stops; from then on it holds 48, so the bake doubled: 77,000
commands at level 5 against 155,000 at level 180. About 72,000 vertices were submitted every
frame either way, and a CPU profile put three-quarters of the main thread in earcut, stroke
building and batching.

The Scrapbook had the same fault in a worse form: every keepsake on every page was one
Graphics, drawn in full every frame for the two or three pages on screen. Settings drew
about 17,000 commands a frame on a screen that changes only on a press, and the title
screen about 5,000 for its pucks and buttons.

**What changed.** `ui/bakedLayer.ts` rasterises a Graphics once and shows the raster, a
single textured quad, in its place.

- The raster goes through Phaser's own **canvas** renderer for the Graphics, into a 2D canvas
  that is then uploaded. A 2D canvas antialiases every path; a WebGL render target is not
  multisampled, which is why this was left alone in the previous audit. Strokes join with
  bevels, as Phaser's WebGL stroke does.
- `ui/graphicsBounds.ts` reads the command buffer for the rectangle the drawing covers, so the
  texture is exactly its size. It refuses a gradient or a canvas transform: the canvas renderer
  would not reproduce them, so such a drawing stays live.
- The Graphics is never thrown away. It shows until the raster exists, whenever a drawing
  cannot be bounded, and after a lost WebGL context, which drops every raster (they are
  rebuilt on demand). A raster is an optimisation the picture never depends on.
- A redraw that produces the same commands keeps its raster (`sameDrawing`). Layout redraws the
  chrome on every frame of an Android URL-bar collapse; none of that is rasterised again.
- A drawing redrawn every frame (a press, a slide) stays live until it settles (`ready`), and
  a scene rasterises at most one layer a frame.

Per scene:

- **Map.** Strips are painted when they near the view, not all at once; the ones on screen are
  rasterised inside the frame the scene is built in, which is under the curtain at full cover,
  and the rest one a frame as the camera approaches (`STRIP_RASTER` in `ui/navigation.ts`).
  A raster more than three-quarters of a screen past the view is freed. Sign, pucks, bench
  and crest are rasters at rest. The frontier's puck and plate are one raster lifted for the
  hop, and the live gate is redrawn only while its count or its bar moves. Level numbers and
  the out-of-hearts sheet's seventeen texts are made when first needed. A landed star flight
  repaints only the strips holding that level and the frontier, not the whole road. The
  camera scrolls on whole pixels, so a raster at rest is never resampled.
- **Scrapbook.** One layer per page; pages off the band are not drawn, and pages on it are
  rasters.
- **Settings.** Sections, controls and the pinned header and Done are layers.
- **Menu.** The block, the "How to play" plank and the pucks are layers. The sign is not: it
  drifts on its ropes continuously, and a raster rotated every frame is resampled every frame.

**Measured.** Same harness, draws stubbed so only main-thread work is timed, vsync-paced.
Milliseconds per frame on a desktop core:

| Screen | Before | After |
| --- | --- | --- |
| Map at level 180, idle (mean / p95) | 5.26 / 7.4 | 0.65 / 0.9 |
| Map at level 180, scrolling (mean / p95) | 5.59 / 7.5 | 0.68 / 0.8 |
| Map at level 5, idle (mean / p95) | 5.87 / 8.8 | 0.63 / 0.9 |
| Map, first 90 frames after entering (p95) | 12.1 | 5.9 |
| Scrapbook, render | ~7.5 | 0.6 |
| Settings, render | ~1.7 | 0.34 |
| Menu, static Graphics | 1.09 | 0.45 |

Vertices submitted on the map fell from about 72,000 a frame to about 1,800, and draw calls
from 34–40 to 14.

Entering the map costs about the same as before: 119–128 ms warm and 185 ms cold at level
180, against 95–110 and 202. Building the scene got cheaper (25–45 ms down to about 9, from the
deferred text), and the rasters of what is on screen took its place. That work sits under the
closed curtain, so the reveal and everything after it run on the cheap path. The uploads are
the larger share here, and SwiftShader uploads in software, so a phone's GPU may do better
than this.

**Memory.** On the map the rasters hold about 29 MB of GPU texture on entry and at most
35 MB while scrolling the whole 48-stop window (never more than 7 of 16 strips at once), at
the 720-wide logical frame. Under WebGL one scratch canvas is shared by every raster, so
the CPU side is a single canvas of a few megabytes. This is the cost of the change, and it
is bounded by `STRIP_RASTER.keep`, not by the length of the road.

**Checked for regressions.** Real WebGL rendering (SwiftShader), reduced motion, Phaser's own
framebuffer snapshot, before against after:

- the map at seven scroll positions each for saves at levels 5, 44 and 180;
- a frontier held by a closed star gate;
- a star flight landing the star that lifts that gate;
- the Scrapbook at four positions;
- the Menu, and Settings at three positions.

Every element is present and in place. The differences are single-pixel antialiasing fringes
along edges, where canvas coverage and the GPU's multisampling round differently, plus up to
half a pixel of offset on frames whose scroll was fractional (now whole). At 4x zoom the two
are indistinguishable.

**Left alone.** The acts in a level. Their art is rebuilt on beats and taps, and a raster
costs several milliseconds, so rasterising it would put that cost on the frames where a hitch
would show, in the middle of a round. A level renders in about 2–3 ms a frame here. The play
screen's three pucks would save about 0.2 ms, which is not worth any raster work on that
screen.

## Looked at and left

- **Particle emitters are created on first use.** Measured: about 2.7 ms for the first
  emitter of a session (JavaScript warm-up), then 0.1–0.3 ms. Not worth building them early.
- **The result plaque redraws while it is up.** The summary frames cost about 1.5 ms of
  update, most of it the act still playing behind the plaque.
- **Static drawings inside a level are still re-tessellated every frame**, such as the window
  act's grime and the knife acts' landed slices. See "Left alone" above for why the acts were
  not rasterised.
- **Track B's six stems decode to about 230 MB of PCM.** This is recorded in `docs/MUSIC.md`
  as an accepted cost. It is the biggest risk on a low-memory handset, and it is unchanged
  here.

## Checked and clean

- Timers, intervals and window or document listeners are removed on scene shutdown.
- `TapInput` judges from the DOM event's own timestamp, so a slow frame delays only what is
  drawn, never the verdict.
- Settings scrolls with a camera and the map's pointer handler does no layout.
- `setText` with an unchanged string is free in Phaser.

## Not verified

No real device was used. The two-to-four-times scaling and the absence of visible faceting
at arm's length should both be checked on a mid-range Android phone. So should the rasters:
their upload time on a real GPU, the 29–35 MB they hold on the map, and the edges of the
map, Scrapbook and Settings at arm's length against the previous build.
