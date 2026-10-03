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

## Looked at and left

- **Particle emitters are created on first use.** Measured: about 2.7 ms for the first
  emitter of a session (JavaScript warm-up), then 0.1–0.3 ms. Not worth building them early.
- **The result plaque redraws while it is up.** The summary frames cost about 1.5 ms of
  update, most of it the act still playing behind the plaque.
- **Entering the map builds about 40–60 ms of objects** on this machine: mostly the
  window's level-number Texts and the out-of-hearts sheet's copy, each a raster and a texture
  upload. It happens under the scene curtain. Creating the sheet's text on first open, and
  re-using number Texts between visits, are the next steps if a handset shows a hitch there.
- **Static scenery is still re-tessellated every frame.** Phaser has no tessellation cache,
  and a Graphics is rebuilt on the GPU path each frame whether or not it changed. This
  includes the map's baked strips, the window act's grime, and the knife acts' landed slices.
  Rendering a strip once into a texture would remove that cost. A WebGL render target is not
  multisampled, though, so its edges would lose the antialiasing they have now. That needs
  to be judged on a device before it is done.
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
at arm's length should both be checked on a mid-range Android phone.
