# The prospector

Act 32. A prospector swings a pick at a boulder on every beat; the coda's last blow splits
it open, and what is inside is the verdict. Requested as three variations, gold, diamond
and emerald on success, and nothing on failure.

## Where it plays

It joins through a new era in `ROTATION`, `{ fromLevel: 227, acts: 32 }`, and first plays
**level 227**. That is forced by the keepsake rule rather than chosen: an era must start
past every keepsake players could hold, and the last two (the nose and dish keepsakes) sit
on 196 and 197. The previous era, 165–226, is exactly two 31-act laps, so 227 is the first
boundary that keeps every lap count honest. Levels 1–226 are unchanged. The nose's third
and later looks move from 227/258 to 257/289 and the dishes' third from 228 to 258; neither
carries a keepsake.

| Lap | Level | Dig | Title | Keepsake |
| --- | --- | --- | --- | --- |
| 0 | 227 | Gold, a sandstone canyon | Strike gold | Gold nugget |
| 1 | 259 | Diamond, a timbered mine by lantern | Dig for diamonds | Rough diamond |
| 2 | 291 | Emerald, a mossy green cliff | Emerald seam | — |

Laps then repeat every 32 levels. Each dig has its own prospector — beard, shirt, overalls,
hat — so the second visit is a different place and not a recolour. The gem changes what the
act is, so it changes the words too (`VignetteDefinition.looks`): the map and the intro
never announce gold over a diamond. Every failure reads *Nothing but rock.*

Development previews: `?debug&level=227`, `?debug&level=259`, `?debug&level=291`. A fresh
save meets the one-time triplet introduction on the same act first.

## The beat and the stone

`ProspectorVignette` is on the household lifecycle. Every blow, demonstrated or the
player's, lands the pick's leading point on the boulder's shoulder at the contact and lifts
it by 0.4 of a beat, never more than 0.32 s, so a sixteenth at 136 BPM still sees it land
and lift (`pickBlow`). Sparks fly off the point for 0.16 s.

**Only judged hits crack the stone.** The demonstration sparks and cracks nothing, and an
extra tap or a miss cracks nothing, so the example never consumes the player's boulder.
Six cracks open in order from where the blows land (`cracksShown`). The split belongs to
the coda in both endings: a prospector who finds nothing still has to open the stone to
know it. The last blow lands on the coda's contact, the halves fall apart along the seam by
`PROSPECTOR_SPLIT_AT` (0.3 s), and then:

- **success** — the look's gem in the hollow, cut the way that gem is (a lump of gold, a
  brilliant, an emerald step cut), with a glow, sparkles, his eyes closed in a grin and his
  hat lifting;
- **failure** — the hollow is empty, a puff of grit drifts out of it, and he gets a bead of
  sweat and a flat mouth.

A new task is a new stone. Under reduced motion the pick rests, there are no sparks, and the
ending shows already open.

## Sound

`audio/prospectorSounds.ts`, synthesized and deterministic. The blow is steel on stone:
three inharmonic partials (struck steel is not a note) over a burst of high grit and a low
knock, in two takes the engine alternates. `scrape`, a tap that hit nothing, is a glance of
grit without the ring; `judder`, a missed beat, a dull knock. Both codas open with the last
blow and the stone giving at the split; 0.12 s after it, success rises into a four-note
chime and failure trickles grit and knocks twice on the empty hollow. The two are identical
until then, which `tests/prospector.test.ts` pins.

## Timing

`PROSPECTOR_REVEAL_SEC` is 1.25 s inside a five-beat hold, which leaves the next task on its
downbeat two bars on at 120, 136 and 150 BPM, as every household act does.

## Files

| File | What it holds |
| --- | --- |
| `vignettes/ProspectorVignette.ts` | The digs, the prospector, the pick, the boulder and both endings |
| `vignettes/prospectorMotion.ts` | The blow, the sparks, the cracks, the split and the reveal; no Phaser |
| `vignettes/prospectorLooks.ts` | The three digs and their words |
| `audio/prospectorSounds.ts` | Every voice, synthesized |
| `tests/prospector.test.ts` | Placement, timing, cracks only on judged hits, the endings, the voices |

Seen in headless Chromium at 393×851 for all three digs: a blow, a success and a failure.
Not yet seen on a handset, and the voices have not been heard against the music.
