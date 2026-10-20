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

## A new rhythm is met second, not last

The curve ramps tier and tempo from the same progress through a level, so a rhythm the road
had never asked for used to arrive in the second half of its level, near its fastest tempo
and after the most fatigue: the first two-bar phrase was task 4 of 5 at 131 BPM (level 18),
the first sixteenth task 5 of 8 at 136 on a *challenge* level (59). A new rhythm should be met
fresh and slow and then again at speed.

So the level where a rhythm first appears — its **debut**, `debutLevels()` in
`game/levels.ts` — trades two phrases: the first task carrying the new rhythm swaps with the
second task (`DEBUT_SLOT`). Every slot keeps its own tempo and lead-in; a tier phrase takes its
tier with it and a finer-grid phrase takes the slot's, as `subdivide` leaves it. A family is a
tier above the quarter notes (`t1`–`t4`) or a finer grid at one of its two densities
(`familyOf`). Debuts are found by scanning the composed road (`composedTasks`: the curve, or a
finale's reprise) and never written down, so a change to the curve moves a debut with it; a
finale is never a debut, since its reprise draws only on what its area already played.

Nothing the choreography promises moves: tasks, peak tempo and top tier are the same, so the
spike, role and area-average tests hold as they were. The swap is skipped where it would put two
identical phrases side by side, or a finer grid on a slot too fast for the thumb.

Playing a debut level at the base tempo throughout was considered and rejected: it makes level
59 → 60 a 28 BPM jump, which the "no sudden spikes" test rightly forbids.

| Family | Debut | Before | After |
| --- | --- | --- | --- |
| Offbeat (tier 1) | 6 | task 3 at 120 | task 2 at 120 |
| Syncopation (tier 2) | 9 | task 4 at 125 | task 2 at 122 |
| Two-bar phrase (tier 3) | 18 | task 4 at 131 | task 2 at 124 |
| Dense two-bar phrase (tier 4) | 28 | task 5 at 136 | task 2 at 124 |
| Triplets, one group a bar | 43 | task 3 at 127 | task 2 at 124 |
| Triplets, two groups | 57 | task 2 at 124 | unchanged |
| Sixteenths, one group a bar | 59 | task 5 at 136 | task 2 at 124 |
| Sixteenths, two groups | 72 | task 4 at 130 | task 2 at 123 |

The road moved again, deliberately, in exactly those seven rows of
`tests/fixtures/levels-choreography.json` — 6, 9, 18, 28, 43, 59 and 72 — and no others.
`tests/levels.test.ts` pins the debut table and checks that every other level of 1–300 is
the composed road untouched. The independence property above now compares `composedTasks`,
the stage before a debut is placed.

## The last-beat offbeat waits for level 11

User testing found one offbeat consistently confusing: a phrase whose last tap is the second
eighth of its last beat, the "and" of 4 (`endsOffBeat` in `rhythm/patterns.ts`). That tap
lands half a beat before the next phrase's downbeat, and players read it as early or as part
of what came next. Three tier phrases end that way: `t1-0` (`X - X - X - - X`), `t2-2` and
`t2-3`. Before this change they played on levels 6, 7, 9 and 10, and `t2-2` was level 9's
debut phrase.

**Held back below `PROGRESSION.lastOffbeat.from` (11).** `tierTasks` draws as it always has,
then replaces any phrase that ends that way with one of its own tier that does not and that
neither neighbour plays (`holdLastOffbeat`), from a random stream of its own. A narrower pool
was rejected: it would move the index every later draw lands on, and with it phrases that
never ended off the beat. Tiers 1 and 2 always keep such phrases, so no task changes tier.

**Debuts on 11, as task 2, with its own introduction.** Level 11 had no such phrase. Its
first task on a tier with offbeats takes `t1-0` and trades into the second slot as any debut
does (`placeLastOffbeat`, `DEBUT_SLOT`): every slot keeps its tempo and lead-in, and the
level keeps its task count, peak, top tier and number of tasks per tier. It plays at 121 BPM
in its second task, after one bar of quarter notes. The tiers bring the phrase back on their
own from 12. The introduction is `lastOffbeat` in `game/conceptIntro.ts`
(`docs/SUBDIVISIONS.md`). Level 11 is a fixed level rather than a point on the curve,
because the request was a level: the first of the second area.

| Level | Before | After |
| --- | --- | --- |
| 6 | task 4 `t1-0` | `t1-1` |
| 7 | task 4 `t1-0` | `t1-3` |
| 9 | tasks 2 and 5 `t2-2`, `t2-3` | `t2-0`, `t2-1` (tier 2 still debuts here) |
| 10 | finale reprise of the above | a reprise of the new 1–9 |
| 11 | `t0-3 t0-0 t1-2 t1-3` | `t0-3 t1-0 t0-0 t1-3` |

Those five rows of `tests/fixtures/levels-choreography.json` moved, deliberately, and no
others. Clear bars and star thresholds are untouched, so no saved star total moves. Endless
reads `PATTERN_TIERS` directly, so its rules version is unchanged.

## The plateau's vocabulary

The curve stops adding anything new once both grids are in play, and the road goes on for
ever; what keeps a plateau level from being one the player has learnt is its phrases. There
were twenty tier phrases, four a tier, so a plateau area of 77 tasks played 20–22 distinct
phrases and every one came round three or four times an area, for good — and 33 of levels
1–120 played a phrase twice inside one level (level 57 the same triplet bar three times).

From `PROGRESSION.vocabulary.from` (d 0.9, level 59, where sixteenths arrive) each tier the
plateau plays draws on four more phrases (`PLATEAU_PATTERNS`, tiers 2–4, through
`tierPool`), written to the tier's own measure and tested for it, with no hit set repeated
across the whole vocabulary. From the same point a level plays no phrase twice while its
tier has another (`tierTasks`), and the second stage never swaps in a finer-grid phrase the
level already has (`subdivide`, at every level). Below level 59 the tier draws are exactly
as they were: repetition is how the early road is learnt, and those levels were left alone.
`PATTERN_TIERS` and `SUBDIVIDED_TIERS` were not edited, because Endless rules v1 reads them;
its fixture passes unchanged.

On the re-pinned road plateau areas play 30–32 distinct phrases instead of 20–22, and no
level from 57 on repeats one. The road moved in levels 57 and 59–120 — every level the
vocabulary or the no-repeat rule reaches — and no others; the debut table above did not move.
The new phrases were written to the tier rules here and have not yet been heard on a device.
