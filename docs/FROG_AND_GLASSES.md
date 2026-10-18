# Frog and glasses

> **Where it plays has changed.** On the debut schedule (the frog now first plays level 151 and the glasses 161), every act has its own debut level and the level numbers below describe the schedule it replaced. See `docs/ACT_SCHEDULE.md`.

Acts 34 and 35, requested together: a frog croaking on a lily pad, which leaps into the
water on failure and is joined by two more frogs singing in harmony on success; and two
glasses clinking, with "Cheers!" on success and a broken glass on failure. Both are on the
household lifecycle (`HouseholdVignette`), stand on the shared shelf under the key light
(`docs/STAGING.md`), and are synthesized throughout: nothing is downloaded.

## Where they play

They join through one new era in `ROTATION`, `{ fromLevel: 357, acts: 35 }`, and first play
**levels 357 and 358**. As with every append, the level is forced by the keepsake rule rather
than chosen: an era must start past every keepsake players could hold, the last two (ice
cream's) sit on 291 and 324, and ice cream's era, 291–356, is exactly two 33-act laps.
Levels 1–356 are unchanged. Two looks without keepsakes move: ice cream's lollipop from 357
to 391, and the prospector's fifth dig from 389 to 390.

| Act | Lap | Level | Look | Keepsake |
| --- | --- | --- | --- | --- |
| Frog & lily pad | 0 | 357 | A green pond frog at midday, among water lilies | Pond frog |
| Raise a glass | 0 | 358 | Sparkling flutes at an evening party, under a festoon of bulbs | Party flute |
| Frog & lily pad | 1 | 392 | A bullfrog under the moon, fireflies over the reeds | Firefly jar |
| Raise a glass | 1 | 393 | Pink lemonade tumblers on a terrace at sunset | Lemonade tumbler |
| Frog & lily pad | 2 | 427 | Red-eyed tree frogs among lotus flowers at sunset | — |
| Raise a glass | 2 | 428 | Grape juice goblets at a candlelit dinner | — |

Laps then repeat every 35 levels. Neither act's look changes what its subject is, so neither
carries per-look words: a frog is a frog in any pond. The next appended act needs an era
past 393.

Development previews: `?debug&level=357` to `?debug&level=428` as in the table.

**The drinks are soft ones**, and nothing on screen names alcohol: sparkling juice, pink
lemonade, grape juice. A flute reads as a celebration either way, and keeping alcohol out
keeps the game clear of the "references to alcohol" question on a store age rating. If a
champagne or wine reading is wanted, it is the drink colour and the keepsake's name, not
the drawing.

## The frog

`FrogVignette`, curves in `frogMotion.ts`, ponds in `frogLooks.ts`, voices in
`audio/frogSounds.ts`.

**The beat is a croak.** On the contact the throat sac balloons out under the mouth, wider
than it is tall, with two arcs of sound either side of the head, and empties by half a beat,
never later than 0.34 s (`croakSwell`); the water rings out from the pad. The sac is the
action the player copies, so it plays under reduced motion too, as the project's motion
rule asks; the ripple, the blink and the listeners' sway do not.

**Only judged hits bring the audience.** The demonstration croaks to an empty pond. Each
judged hit brings one of two frogs up out of the water behind the side pads, eyes first —
the left one over the first half of the phrase and the right one over the second
(`listenerRise`) — so the player can see the chorus assembling. An extra tap or a miss
brings nobody. Their heads are clipped at the waterline by geometry (`above`), not masked.

- **Success.** One more croak on the contact; the two listeners leap out of the water and
  land on their pads at `FROG_JOIN_AT` (0.45 s); then all three sing a C major triad on
  `FROG_CHORDS` — two short chords and a held one — sacs swelling together, eyes shut,
  notes rising in each frog's colour, and sparkles.
- **Failure.** A crouch on the contact, an arc off the pad at `FROG_LEAP_AT`, head first,
  legs out behind, smaller as it goes away; into the water at `FROG_SPLASH_AT` (0.42 s) with
  a crown, a column and rings; the listeners duck back under; the empty pad rocks; and at
  `FROG_SURFACE_AT` the frog's eyes come back up, half-lidded, looking at the pad it left.

## The glasses

`GlassesVignette`, curves in `glassesMotion.ts`, looks in `glassesLooks.ts`, voices in
`audio/glassesSounds.ts`.

**The beat is a clink.** Two hands hold a glass each; on the contact the glasses swing in
and meet rim to rim, a glint and a ring of light at the point they touch, and part by 0.45
of a beat, never later than 0.3 s (`clinkSwing`). Where they meet is solved from each glass's
own profile (`glassPose`), so a flute, a tumbler and a goblet each touch exactly at the
centre. The drink stays level in the room whatever the glass's lean, and rocks after each
clink (`slosh`).

**Only judged hits light the room**, a festoon bulb or a mantel candle at a time, from the
ends inward, all but the last two (`lightsLit`); the example lights nothing. **Every mistake
leaves a hairline crack** in the right-hand glass at the rim that takes the clinks, up to
three: the failure ending is telegraphed before it arrives. A new task is a fresh pair of
glasses in a dark room.

- **Success.** One more clink, and the glasses stay together and lift; the remaining lights
  come on one every 70 ms; "Cheers!" grows out of the clink in a speech bubble at `CHEER_AT`
  with confetti from either end of it, and sparkles. The lettering is a `Text` made through
  `ui/type.ts` when the act is built and only posed after, so the coda's frame rasterises
  nothing.
- **Failure.** The clink lands, and at `GLASS_BREAK_AT` (0.05 s) the cracked bowl shatters:
  eight shards thrown on parabolas that come to rest on the cloth (`shardPose`), the drink
  falling out as one body and landing as a puddle at `GLASS_SPILL_AT` (0.4 s), and a jagged
  stub left in the hand. The other glass jolts back.

The success headline is *To good timing!* rather than a second "Cheers": the bubble already
says it, and the two would sit one above the other.

## Sound

Both acts synthesize every voice, deterministically, and give the action two takes a hair
apart in pitch, which the engine alternates.

- **Croak**: a buzz of harmonics on C3 weighted to a 720 Hz throat formant and chopped by a
  34 Hz rasp, opening in 3 ms so its start is the beat. Two splashes and two soft landings
  for the hop; the triad C3–E3–G3, the last chord held with a little vibrato. Rough is a
  startled rising croak, a whip of air, the splash on `FROG_SPLASH_AT` and its bubbles, and
  one bubble as it surfaces.
- **Clink**: two glasses about 80 Hz apart, so the ring shimmers, on inharmonic glass modes.
  Success rings on under a fizz and a rising chime; rough cracks into broadband noise and
  twenty-two tinkles as the pieces fly and land, and a wet slap on `GLASS_SPILL_AT`. Levels
  were matched against the prospector's and ice cream's voices.

`tests/frog.test.ts` and `tests/glasses.test.ts` pin the voices to the pictures: the splash
and the spill land on their constants, the chorus is louder than the gap before it, and the
shatter is louder than the toast at the same moment.

## Timing

`FROG_REVEAL_SEC` is 1.4 s and `GLASS_REVEAL_SEC` 1.35 s, inside the five-beat hold every
household act uses, which is 2.0 s at 150 BPM; the next task lands on its downbeat two bars
on at 120, 136 and 150 BPM. Every event of both codas falls inside its reveal.

## Files

| File | What it holds |
| --- | --- |
| `vignettes/FrogVignette.ts` | The three ponds, the frog in its own frame, the listeners, the hop, the leap and the splash |
| `vignettes/frogMotion.ts` | The croak, the listeners' rise, the chorus, the leap, the splash; no Phaser |
| `vignettes/frogLooks.ts` | The three ponds and their three frogs each |
| `audio/frogSounds.ts` | The croak, the triad and every other voice |
| `vignettes/GlassesVignette.ts` | The three rooms, the glassware and its pose, the hands, the lights, "Cheers!" and the wreck |
| `vignettes/glassesMotion.ts` | The clink, the slosh, the lights, the cracks, the shards, the spill; no Phaser |
| `vignettes/glassesLooks.ts` | The three toasts: glass, drink, room and the two people |
| `audio/glassesSounds.ts` | The clink, the toast and the shatter |
| `ui/keepsakes.ts` | Pond frog, party flute, firefly jar and lemonade tumbler, with their silhouettes |
| `tests/frog.test.ts`, `tests/glasses.test.ts` | Placement, timing, progress only on judged hits, both endings, the voices |

## Checked, and not

Seen in headless Chromium in all three looks of each act, posed directly — idle, a
demonstrated beat, judged hits and misses, both codas at several moments — and the four
keepsakes with their silhouettes. Both acts were also run as real levels (357 and 358, with
the debug auto-player's accurate and rough replays) under a virtual clock, through the
demonstration, the response and both codas. Not yet seen on a handset or a tablet, and the
synthesized voices have not been heard against the music.
