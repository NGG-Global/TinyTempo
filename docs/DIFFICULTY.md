# Difficulty choreography

One curve, `d(level) = 1 − e^(−(level−1)/25)`, used to push every dimension of a level up
together: more tasks, a higher tempo ceiling, a denser pattern tier and a higher clear bar,
all at once, every level. So the road only ever got longer, faster, harder and stricter
at the same time, and nothing in an area was ever easier than what came before it.

The curve is still the baseline. What changed is that **where a level sits inside its
ten-level area decides which dimensions lead**. The code is `choreographedShape` and
`levelSpec` in `src/game/levels.ts`; the knobs are `PROGRESSION.choreography`.

## The ten steps

| Step | Role | Tasks | Peak BPM | Tier | Finer-grid chance | What it is for |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `opener` | −1 | −4 | −0.5 | ×0.5 | A way into the new area after the finale |
| 2 | `pattern` | 0 | −4 | +1 | ×1.5 | Rhythm leads; tempo steps back |
| 3 | `pattern` | −1 | −4 | +1 | ×1.5 | The same, shorter |
| 4 | `tempo` | 0 | +8 | −1 | ×0 | Speed for pattern: simpler rhythms, faster, no finer grid |
| 5 | `endurance` | +2 | −4 | −0.5 | ×0.5 | Length for pressure |
| 6 | `recovery` | −1 | −6 | −1 | ×0.5 | Noticeably easier, mid-area |
| 7 | `combination` | 0 | +2 | +0.25 | ×1 | Dimensions start to combine |
| 8 | `combination` | 0 | +4 | +0.5 | ×1 | … a little more |
| 9 | `challenge` | +1 | +6 | +1 | ×1.25 | Everything up |
| 10 | `finale` | +1 | +8 | +1 | ×1.25 | The area's top length and tempo, as a reprise of its own patterns (`docs/FINALES.md`) |

The offsets are added to the **continuous** value each dimension is rounded from — tasks
`3 + 5d`, BPM of headroom `30·d^1.5`, the fractional tier `5·d^0.8` — so a shift of half a
tier moves the level only once the curve has brought it within half a tier of the next
one. Small shifts fade in; nothing jumps because a row said so. The offsets roughly
cancel across an area, so an area's average follows the curve.

`LevelSpec.role` and `LevelSpec.areaStep` carry the result, and `role` rides on every level
analytics event (`docs/ANALYTICS.md`). The tenth step is also an area finale
(`LevelSpec.finale`, from `PROGRESSION.areaSize`): it keeps this row's length and tempo, and
replaces each pattern with one its area already played, so the top of the area is never
where something new arrives. See `docs/FINALES.md`.

## The rules that keep it safe

- **Ramped in.** The offsets grow from nothing at level 1 to full strength at level 21
  (`rampLevels: 20`). Level 1 — the guided level with the first-run pass — is the curve
  itself, to the pattern, and levels 1–3 are still three quarter-note tasks at 120 BPM.
  The first area plays the shape at about half strength.
- **One area ahead, at most.** No dimension may exceed what the plain curve gives the
  level ten levels on (`lookahead`). A challenge previews the next area; it never
  arrives from three areas away.
- **The ceilings hold.** 3–8 tasks, 120–150 BPM, tiers 0–4, and the 110 ms thumb-spacing
  floor for finer grids. The 120–150 BPM design is unchanged: every level still starts on
  the music's own 120 and ramps task by task to its peak, which the music follows.
- **Finer grids arrive no earlier.** Whether a level may carry a triplet or a sixteenth is
  still read from the plain curve (`d ≥ 0.8`, `d ≥ 0.9`); a role only scales the chance
  once it may. So the first triplet is still a level in the 40s and the first sixteenth
  still 59, and a tempo level never carries either.
- **Deterministic.** A level's spec is a pure function of its number: the role from
  `(level − 1) mod 10`, the patterns from the same seeded streams as before.

## The clear bar and the stars did not move

This is deliberate. **Stars are not stored**: a level's stars are its best accuracy read
against its thresholds, every time, and the collection is their sum (`game/stars.ts`). A
choreographed threshold would therefore have changed every existing save's star count —
and a raised one could have closed a star gate behind a player who had already passed it.

So the clear bar and the three star thresholds stay on the curve, rising smoothly with the
level number, which is also the version a player can read. A recovery level asks the same
bar as its neighbours of easier material, so it is *easier* to three-star, never oddly
harder. `tests/fixtures/level-thresholds.json` records every threshold of levels 1–300
from the derivation before this change, and `tests/levels.test.ts` holds them to it.

## Levels 1–30

| Level | Area step | Role | Tasks | Peak BPM | Top tier | Clear / 3★ | Old road (tasks · BPM · tier) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | opener | 3 | 120 | 0 | 40 / 80 | 3 · 120 · 0 |
| 2 | 2 | pattern | 3 | 120 | 0 | 42 / 81 | 3 · 120 · 0 |
| 3 | 3 | pattern | 3 | 120 | 0 | 43 / 81 | 3 · 120 · 0 |
| 4 | 4 | tempo | 4 | 122 | 0 | 45 / 82 | 4 · 122 · 0 |
| 5 | 5 | endurance | 4 | 120 | 0 | 46 / 82 | 4 · 122 · 1 |
| 6 | 6 | recovery | 4 | 120 | 1 | 47 / 82 | 4 · 122 · 1 |
| 7 | 7 | combination | 4 | 124 | 1 | 49 / 83 | 4 · 122 · 1 |
| 8 | 8 | combination | 4 | 126 | 1 | 50 / 83 | 4 · 124 · 1 |
| 9 | 9 | challenge | 5 | 126 | 2 | 51 / 84 | 4 · 124 · 1 |
| 10 | 10 | finale | 5 | 128 | 2 | 52 / 84 | 5 · 124 · 1 |
| 11 | 1 | opener | 4 | 124 | 1 | 53 / 84 | 5 · 126 · 2 |
| 12 | 2 | pattern | 5 | 124 | 2 | 54 / 85 | 5 · 126 · 2 |
| 13 | 3 | pattern | 4 | 124 | 2 | 55 / 85 | 5 · 128 · 2 |
| 14 | 4 | tempo | 5 | 132 | 1 | 56 / 85 | 5 · 128 · 2 |
| 15 | 5 | endurance | 6 | 126 | 2 | 57 / 86 | 5 · 128 · 2 |
| 16 | 6 | recovery | 5 | 124 | 1 | 58 / 86 | 5 · 130 · 2 |
| 17 | 7 | combination | 5 | 132 | 2 | 59 / 86 | 5 · 130 · 2 |
| 18 | 8 | combination | 5 | 134 | 3 | 60 / 87 | 5 · 130 · 2 |
| 19 | 9 | challenge | 6 | 136 | 3 | 61 / 87 | 6 · 132 · 2 |
| 20 | 10 | finale | 6 | 138 | 3 | 61 / 87 | 6 · 132 · 3 |
| 21 | 1 | opener | 5 | 128 | 2 | 62 / 87 | 6 · 132 · 3 |
| 22 | 2 | pattern | 6 | 128 | 3 | 63 / 88 | 6 · 132 · 3 |
| 23 | 3 | pattern | 5 | 130 | 3 | 63 / 88 | 6 · 134 · 3 |
| 24 | 4 | tempo | 6 | 138 | 2 | 64 / 88 | 6 · 134 · 3 |
| 25 | 5 | endurance | 7 | 130 | 2 | 65 / 88 | 6 · 134 · 3 |
| 26 | 6 | recovery | 5 | 130 | 2 | 65 / 88 | 6 · 136 · 3 |
| 27 | 7 | combination | 6 | 138 | 3 | 66 / 89 | 6 · 136 · 3 |
| 28 | 8 | combination | 6 | 140 | 4 | 66 / 89 | 6 · 136 · 3 |
| 29 | 9 | challenge | 7 | 140 | 4 | 67 / 89 | 6 · 136 · 3 |
| 30 | 10 | finale | 7 | 142 | 4 | 67 / 89 | 6 · 138 · 3 |

## What it costs

Measured on a composite (each of tasks, peak BPM and top tier scaled 0–1 and averaged):
areas 1–3 match the old road to within about 0.02 — the first area is a touch
*harder*, because its challenge and finale are — and every area is harder than the one
before it. From area 4 the average sits 0.03–0.06 below the old road on that 0–1 scale, and on
the plateau 0.06 below (0.94 against 1.00). That is structural, not a tuning slip: once a dimension reaches its ceiling a
challenge cannot rise past it, while a recovery still eases. On the plateau the old road
was every level at the ceiling; the new one is the ceiling on the combination, challenge
and finale levels, with breathing room between.

## The road changed, once, on purpose

Of levels 1–120, 17 are unchanged task for task — levels 1–4, where the ramp has not yet
moved anything, and thirteen combination and finale levels on the plateau (57, 58, 69, 70,
77, 78, 80, 97, 98, 107, 108, 117, 118) that already sat at every ceiling. Every other
level has new content. That is the registry trap —
a level a player has learnt, silently changed — accepted deliberately for this change.
Saved progress is unaffected: unlocks, best accuracies and star totals all read the same,
because the thresholds did not move and the save holds accuracies, not patterns.

`tests/fixtures/levels-before-subdivision.json` pinned levels 1–42 to the road as it was
before finer grids existed; that is now false by design, so it is replaced by:

- `tests/fixtures/levels-choreography.json` — every task of levels 1–120 plus each level's
  role, as this derivation produces them. Same strength as before: any change to any task
  of any of those levels fails. Regenerate it only for a deliberate change to the road.
  The area finales moved exactly their own rows of it — 10, 20, … 120 — and no others:
  their patterns became the area's reprise and their opening grew to two bars.
- `level-thresholds.json` — the saved-stars guarantee above.
- A property test that, for every level 1–300, the tasks `subdivide` leaves alone equal
  `tierTasks(level)` exactly, and the ones it swaps keep their tempo, tier and lead-in —
  the "its own seeded stream" property the old fixture proved indirectly, now stated.
  Finales are the one exception: their patterns are the reprise, and the test holds them to
  the curve's tempo ramp and lead-ins instead (`tests/finale.test.ts` checks the rest).
