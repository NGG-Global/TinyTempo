# Scissors & paper

The seventh act is a folded-paper cutting exercise on a sage cutting mat.
Coral-handled scissors close on each beat; accurate taps advance the cut along
a pencilled half-silhouette and scatter paper offcuts. Extra taps nick the edge;
omissions rattle the fold. The demonstration moves the scissors without cutting
or consuming the player's sheet. Gameplay remains one tap anywhere per hit.

## Five endings

| Round accuracy | Animation |
| --- | --- |
| 70–100%, star task | The fold opens into a gold five-point star, rocks gently, and catches three glints. |
| 70–100%, heart task | Coral paper unfolds into a heart with a small settling pulse. |
| 70–100%, angel task | Cream paper opens into a winged angel, rises slightly, and reveals feather scores, gown pleats, and a halo. |
| 40–69% | The left half opens only partway, wobbles, and leaves a ragged attached flap. |
| Below 40% | The torn sheet buckles into a crumpled scrap and drops onto the mat. |

Star, heart and angel cycle deterministically by round ID, with the shape chosen
at reset so the cutting template matches its ending. They are the first of two
shape sets: the act's second visit (level 22) cuts a lilac butterfly, a green fir
tree and a pink tulip instead, and the third visit returns to the first set.
`PAPER_SHAPE_SETS` in `paperMotion.ts` holds both; see `docs/VARIANTS.md`. `PlayScene` passes the
authoritative weighted accuracy to the presentation; the new thresholds never
change judgement, score, stars or level unlocks.

The paper's coda holds for five beats before sliding, compared with the usual
one. Contact, hold, and slide together take eight beats, keeping the next task
on the music's bar boundary. All five endings settle before the slide even at
150 BPM. Reduced motion keeps the unfolding/crease information but suppresses
floating, pulsing, tumbling and decorative shake.

## Implementation and checks

- `src/vignettes/ScissorsPaperVignette.ts`: procedural scissors, cut sheet,
  mirrored reveal, offcuts, mat, and responsive layout.
- `src/vignettes/paperMotion.ts`: contours, cut-path sampling, tempo-scaled
  blade opening, ending states, and shape rotation.
- `src/audio/paperSounds.ts`: deterministic snips, paper rustle, and accents.
- `tests/paper.test.ts`: silhouettes, accuracy boundaries, motion, whole-bar
  coda alignment, and all five sound buffers.

Use `?debug&level=9` on the development server to preview. Accurate replay shows
the three success shapes over successive tasks; Rough replay shows failure.
For a partial result, answer about half the targets accurately and let the
remaining targets pass. Preview routing and replay controls are absent from
production builds.

The accompanying window refinements add a bevelled frame, garden scenery and
reflections, fully remove grime on success, park the tool within the scene, and
reserve room for the HUD on shorter screens. Tomato refinements add layered
skin shading, a leafy calyx, seed chambers, a bevelled knife that fits on screen,
and a bounded wood-grain cutting board. Neither changes rhythm judgement.
