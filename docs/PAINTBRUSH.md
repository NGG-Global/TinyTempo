# Paintbrush

Act 29, appended at request. It joins the rotation at level 107 (`ROTATION`), which is
past every keepsake, so levels 1–106 keep the acts they had. Level 107 is its first
appearance and level 136 its second.

Each beat is one brush stroke on a canvas. A painting is eight strokes. A round lays at
most four fifths of them (`CANVAS_MOTION.reach`); a clean round's flurry writes the rest
and a signature in the corner, and a rough round smears the wet paint and drips off the
ferrule. The demonstration paints on its own clock and leaves the player's canvas blank.
Only judged hits lay paint. Extra taps move the brush and leave nothing behind.

The four paintings are looks, and each one that is not the sunset renames the act,
because a tabby is not a sunset (`definitionForLap`):

| Lap | Level | Painting | Title |
| --- | --- | --- | --- |
| 0 | 107 | Sunset: sky, sun, two hills, water, a tree | Paintbrush |
| 1 | 136 | A sailboat | Sailboat |
| 2 | 165 | A seated cat | Tabby |
| 3 | 194 | A flower | Flower |

Lap 0 keeps the registry's own words. The easel, the hand and the stroke are shared.
Voices are synthesized in `audio/canvasSounds.ts`: a bristle swish, a chime as the
signature goes on, a splat and a drip on a rough round. The five-beat hold is every
other household act's, and `CANVAS_REVEAL_SEC` settles inside it.

In development, open `?debug&level=107`.
