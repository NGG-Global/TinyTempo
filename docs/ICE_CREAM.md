# Ice cream

Act 33. A person licks a treat on every beat; the coda either finishes it or drops it.
Requested as three variations: an ice cream cone, an "icicle" and a lollipop, with a
delivered licking sound. The icicle is drawn as an **ice pop** — a frozen lolly on a wooden
stick — read as the treat the request meant rather than ice hanging from a roof. If a literal
icicle was meant, it is one look in `iceCreamLooks.ts` and its drawing in `pop()`.

## Where it plays

It joins through a new era in `ROTATION`, `{ fromLevel: 291, acts: 33 }`, and first plays
**level 291**. That is forced by the keepsake rule rather than chosen: an era must start past
every keepsake players could hold, the last two (the prospector's) sit on 227 and 259, and
the prospector's era, 227–290, is exactly two 32-act laps. Levels 1–290 are unchanged. The
prospector's third and later looks move from 291/323 to 323/356; neither carries a keepsake.

| Lap | Level | Treat | Place and licker | Title | Keepsake |
| --- | --- | --- | --- | --- | --- |
| 0 | 291 | Strawberry scoop on a waffle cone | Ice cream parlour, a bob | Ice cream | Waffle cone |
| 1 | 324 | Cherry-over-lemon ice pop | Beach, curls | Ice pop | Cherry ice pop |
| 2 | 357 | Grape swirl lollipop | Sweet shop, a bun | Lollipop | — |

Laps then repeat every 33 levels. The treat changes what the act is, so it changes the words
(`VignetteDefinition.looks`): the map and the intro never announce ice cream over a lollipop.
Every rough ending reads *Dropped it!*, with its own second line per treat.

Development previews: `?debug&level=291`, `?debug&level=324`, `?debug&level=357`. A fresh
save meets the one-time triplet introduction on the same act first.

## The beat and the treat

`IceCreamVignette` is on the household lifecycle. Every lick, demonstrated or the player's,
puts the tongue on the treat's near side at the contact and sweeps it up the treat as it
comes back in, by 0.45 of a beat and never later than 0.3 s, so a sixteenth at 136 BPM
still sees it land and return (`lickReach`, `lickSweep`). The treat leans 12 units in to
meet it, which moves it and takes nothing.

**Only judged hits wear the treat down.** The demonstration licks and leaves it whole, and
an extra tap or a miss takes nothing, so the example never eats the player's treat. Hits
take it in proportion to the phrase, up to `LICKABLE` (80%); the scoop and the lollipop
shrink by radius, the ice pop from the top, cherry first, then lemon. The coda is one more
lick:

- **success** — the lick takes the rest by 0.5 s; then a grin with closed eyes, a tongue the
  colour of the treat, and sparkles. A cone is left empty, an ice pop and a lollipop a bare
  stick;
- **failure** — no lick: the rest slips off the cone or the stick, falls, and lands on the
  floor at `ICE_CREAM_DROP_AT` (0.42 s) as a puddle, or for the lollipop a cracked disc.
  The face goes from a shocked *O* to a frown, eyes on the floor.

A new task is a new treat. Under reduced motion the tongue stays in, the success coda shows
the treat already gone and the failure already on the floor.

## Sound

The lick is the delivered slurp, `sfx/lick.wav`, through the sample bank like every other
recorded beat; `audio/iceCreamSounds.ts` synthesizes a wet lick as its fallback, plus every
other voice: `scrape` (a tap that licked nothing) is a dry smack of the lips, `judder` (a
missed lick) a short hum. Success opens on the same synthesized lick, then a pleased *mm*
and a four-note chime as the treat is gone; rough is a falling squeak as it slips, then a wet
splat on `ICE_CREAM_DROP_AT`, which `tests/iceCream.test.ts` pins to the picture.

The shipped WAV is an edit of the delivered file, not a copy: its main transient was 26 ms
behind where the bank would have started it, and its energy sat in the right channel. What
was done, and why, is in `docs/SOUND.md` under *The lick is edited*. The delivered file is
kept as `sfx/masters/slurp-delivered.mp3` and is not bundled.

**Licence.** The delivered file's name (`freesound_community-cartoon-slurp-37066.mp3`)
follows the pattern Pixabay uses for sounds it carries from the Freesound community. That
has not been verified here: confirm its source page and licence before release, as for any
third-party asset.

## Timing

`ICE_CREAM_REVEAL_SEC` is 1.3 s inside a five-beat hold, which leaves the next task on its
downbeat two bars on at 120, 136 and 150 BPM, as every household act does.

## Files

| File | What it holds |
| --- | --- |
| `vignettes/IceCreamVignette.ts` | The three places, the licker, the tongue, the treats and both endings |
| `vignettes/iceCreamMotion.ts` | The lick, how much is gone, the drop, the splat and the grin; no Phaser |
| `vignettes/iceCreamLooks.ts` | The three treats, their lickers and their words |
| `audio/iceCreamSounds.ts` | The recorded lick, its fallback and every other voice |
| `sfx/lick.wav` | The lick as shipped |
| `tests/iceCream.test.ts` | Placement, timing, wear only on judged hits, both endings, the voices |

Seen in headless Chromium for all three treats, posed directly — idle, a demonstrated lick,
a judged lick, half gone, success and the drop, and both keepsakes with their silhouettes.
A full level was not seen running there: that environment renders at about 10 fps and the
level pauses itself on the stall. Not yet seen on a handset, and the slurp has not been
heard against the music.
