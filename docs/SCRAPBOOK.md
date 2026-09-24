# The Scrapbook

Three stars on a designated level earns that act's keepsake, and the Scrapbook keeps
them: one page per act, a found keepsake mounted on a card, an unfound one as a silhouette
in a recessed slot with the level that earns it printed underneath. There is no currency,
no drop, no roll, no pack and no shop — a keepsake is a fact about a level's stars.

| File | What it holds |
| --- | --- |
| `src/game/scrapbook.ts` | The collection: every keepsake, what earns it, what a save owns. Pure. |
| `src/ui/keepsakes.ts` | The drawings, keyed by keepsake id, each with its silhouette. |
| `src/scenes/ScrapbookScene.ts` | The book, reached from the book puck at the title screen's top left. |
| `src/scenes/PlayScene.ts` | The card that reveals a new keepsake under the result plaque. |
| `tests/fixtures/keepsakes.json` | Every shipped keepsake's id, act, lap and level, pinned. |

## The rule

Keepsake `lap` of an act is earned by **three stars on the level where that act plays for
the `lap`-th time**: `actLevel(vignette, lap)` in `src/game/levels.ts`, the rotation read
backwards. The first set is one keepsake per act on levels 1–25; the second is one per
act, on that act's second appearance, drawn in that look's colours — the ladybird pin is
earned on level 28, where the shoe chases the ladybird, and the brass hammer on level 26.
The barber, popcorn and toothbrush joined the rotation at level 51, so their two are on
51–53 and 79–81 (`docs/BARBER_POPCORN_TOOTHBRUSH.md`).

**A new act can never move a keepsake.** Every level a keepsake is earned on belongs to an
era of `ROTATION` (`src/vignettes/registry.ts`) that is closed: appending an act adds an
era starting past the last keepsake level, and `tests/fixtures/keepsakes.json` pins every
level, so an append that moved one fails the build.

Every slot prints its level whether it is found or not, and touching one says it again in
words ("Three stars on level 14 finds it"), so a player can always see what earns what.

## Nothing is stored

A keepsake is owned exactly when `levelStars(progress, keepsake.level) === 3`. There is no
list of owned keepsakes anywhere, which is what makes every one of these true without any
code of their own:

- **Existing players already own theirs.** A save written before the Scrapbook existed is
  read the same way; its three-star levels are its keepsakes the moment the build ships.
- **No duplicates.** A keepsake is a property of one level, and one level has one keepsake.
- **Save codes and Auto Backup carry the collection** because they carry the accuracies.
- **Merges only add.** `mergeProgress` keeps the better accuracy per level, so a merged save
  owns exactly the union of what the two sides owned.
- **The totals are deterministic.** 56 today, from the list alone.

What it depends on is the star thresholds, which `tests/fixtures/level-thresholds.json`
already pins because saved stars depend on them too.

The one stored bit is `scrapbook` in the teach object (`game/progress.ts`, beside
`seenDemonstration`): whether this device has explained keepsakes, either on the first
reveal's longer card or by opening the book. It decides the longer note and the coral dot
on the title screen's book puck, and it travels nowhere.

## The reveal

When a finished level takes its keepsake's level from under three stars to three
(`keepsakeEarned`, from the save before and after the result), the result screen raises a
card under the plaque (under a finale's card when there is one), one second into the
summary — after the last medal has landed. The card is as tall as its note, measured once
it is set, so the first keepsake's longer note is never cut off by the card's edge. It shows the keepsake stamped onto a small mount, "New
keepsake" and its name, and one line: the collection's tally, or, the first time on this
device, what keepsakes are and where the Scrapbook is. It intercepts nothing; the tap that
moves on works from the first frame. It is not shown if the progress save failed, since the
next launch would not find the keepsake the card promised.

## Adding keepsakes

1. **Append** an entry to the end of `KEEPSAKE_LIST` in `src/game/scrapbook.ts`:
   `{ id, vignette, lap, name }`. The `id` is permanent — it is the analytics id and the
   drawing's key — so choose it as you would a database key: lower-case, hyphenated,
   prefixed with the act's id (`hammer-…`), at most 40 characters.
2. Pick a `lap` no keepsake of that act already uses. Its level follows from it; there is
   nothing to write down. An act with looks is best served by the lap whose look the
   keepsake shows.
3. **Draw it** in `src/ui/keepsakes.ts`: one function in `DRAWERS` under the same id, in
   the 100-unit box, within ±42 of the centre. Put everything that identifies it inside
   `pen.detail(...)`, so the silhouette is the outline's mass and nothing more.
4. **Append** its line to `tests/fixtures/keepsakes.json`.
5. Run the tests. They fail if the drawing is missing, leaves its slot, or shows detail in
   silhouette; if two keepsakes share an id, a level or a name; or if the level's act and
   lap disagree with the keepsake's.

**Never change an existing entry's `id`, `vignette` or `lap`, and never remove one.** Each
moves or deletes a keepsake players already hold, which is the registry trap in miniature;
the fixture test fails on all three. A `name` may be reworded. Inserting an entry in the
middle of the list changes nothing players see, but the fixture test requires the shipped
entries to stay first, so history stays readable.

A new *act* in the registry does not get a keepsake automatically; it gets one when an
entry is appended for it. The Scrapbook shows only acts that have at least one.

## The initial set

| Level | Act | Keepsake | Id |
| --- | --- | --- | --- |
| 1 | Hammer & nail | Lucky nail | `hammer-lucky-nail` |
| 2 | Window cleaning | Squeegee | `window-squeegee` |
| 3 | Bug & shoe | Plum beetle pin | `bug-plum-beetle` |
| 4 | Saw & timber | Pine round | `saw-pine-round` |
| 5 | Knife & tomato | Tomato slice | `tomato-slice` |
| 6 | Bicep curl | Coach's ribbon | `curl-coach-ribbon` |
| 7 | Knife & cucumber | Cucumber coin | `cucumber-coin` |
| 8 | Knife & banana | Banana sticker | `banana-sticker` |
| 9 | Scissors & paper | Paper star | `paper-star` |
| 10 | Egg cracking | Painted egg | `egg-painted` |
| 11 | Bubble wrap | Bubble square | `bubble-square` |
| 12 | Light switch | Salon switch | `light-salon-switch` |
| 13 | Doorbell | Ginger's bell | `doorbell-ginger-bell` |
| 14 | Paint roller | Paint swatch | `roller-swatch` |
| 15 | Hotel bell | Front-desk bell | `bell-desk-bell` |
| 16 | Balloon pump | Red balloon | `balloon-red` |
| 17 | Stapler | Stapled note | `stapler-note` |
| 18 | Fisherman | Brass lure | `fisherman-lure` |
| 19 | DJ scratch | Seven-inch record | `scratch-record` |
| 20 | Trombone | Mouthpiece | `trombone-mouthpiece` |
| 21 | Clapping hands | Encore ticket | `clap-encore-ticket` |
| 22 | Snare drum | Drumsticks | `snare-sticks` |
| 23 | Bongos | Bongo charm | `bongos-charm` |
| 24 | Slushy | Berry slushy | `slushy-berry-cup` |
| 25 | Apple | Shiny apple | `apple-shiny` |
| 28 | Bug & shoe | Ladybird pin | `bug-ladybird` |
| 31 | Bicep curl | Sprinter's ribbon | `curl-sprinter-ribbon` |
| 34 | Scissors & paper | Paper butterfly | `paper-butterfly` |
| 37 | Light switch | Kitchen switch | `light-kitchen-switch` |
| 38 | Doorbell | Crimson knocker | `doorbell-crimson-knocker` |
| 49 | Slushy | Blue slushy | `slushy-blue-cup` |
| 50 | Apple | Ripe pear | `apple-pear` |
| 26 | Hammer & nail | Brass hammer | `hammer-brass-head` |
| 27 | Window cleaning | Harbour frame | `window-harbour-frame` |
| 29 | Saw & timber | Cherry round | `saw-cherry-round` |
| 30 | Knife & tomato | Golden tomato | `tomato-gold-slice` |
| 32 | Knife & cucumber | Dark cucumber | `cucumber-dark-coin` |
| 33 | Knife & banana | Green banana | `banana-green-sticker` |
| 35 | Egg cracking | Brown egg | `egg-brown` |
| 36 | Bubble wrap | Pink bubbles | `bubble-pink-square` |
| 39 | Paint roller | Sage swatch | `roller-sage-swatch` |
| 40 | Hotel bell | Brass bell | `bell-brass-bell` |
| 41 | Balloon pump | Teal balloon | `balloon-teal` |
| 42 | Stapler | Teal stapler | `stapler-teal` |
| 43 | Fisherman | Navy mac | `fisherman-navy-mac` |
| 44 | DJ scratch | Amber label | `scratch-amber-label` |
| 45 | Trombone | Silver horn | `trombone-silver-horn` |
| 46 | Clapping hands | Plum cuffs | `clap-plum-cuffs` |
| 47 | Snare drum | Blue snare | `snare-blue-shell` |
| 48 | Bongos | Walnut bongos | `bongos-walnut` |
| 51 | Barber | Barber’s pole | `barber-pole` |
| 52 | Popcorn | Bowl of popcorn | `popcorn-butter-bowl` |
| 53 | Toothbrush | Teal toothbrush | `toothbrush-teal` |
| 79 | Barber | Ginger lock | `barber-ginger-lock` |
| 80 | Popcorn | Cinema tub | `popcorn-cinema-tub` |
| 81 | Toothbrush | Strawberry paste | `toothbrush-berry-paste` |

## Analytics

`scrapbook_opened` (`source`, `owned`, `total`) on every opening, and `collectible_unlocked`
(`vignette`, `collectible`, `level`, `first`, `owned`) when a finished level earns a
keepsake — at most once per keepsake per session, and never for keepsakes an existing save
owned on arrival, since nothing was unlocked then. Both ids are stable and low-cardinality:
28 acts, 56 keepsakes. See `docs/ANALYTICS.md`.

## Checked, and not

The book and the reveal were driven in headless Chromium with seeded saves, against
the original thirty-two: a partial collection (17/32), a full one (32/32, every drawing
then), a touch on a card, a scroll, the
reveal card with and without the refunded-heart plaque, and first versus later notes. The
reveal was attached to a real result screen rather than earned, because that environment
renders at ~12 fps and its replayed taps cannot score three stars. Not yet seen on a device
or a tablet.
