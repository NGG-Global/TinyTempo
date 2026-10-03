# Mastery, kept

A level played **IN THE POCKET** (every scored task flawless, on a cleared level; see
`docs/GROOVE.md`) used to be a moment on the result screen and nothing after it. It is now
a fact about the save: the map marks the stop for as long as the save exists, and the
result knows the difference between a first mastery and a repeat.

There is no currency, no XP and no mastery level. Stars, Groove, keepsakes, hearts and
progression are unchanged.

## Derived, not stored

`game/mastery.ts` holds the rule: a level is mastered exactly when its saved best accuracy
is **100** (`isLevelMastered`, `masteredCount`). Nothing new is written anywhere.

That is only safe if a best of 100 and the result's `isMastered` are the same fact, so it
was checked against the code rather than assumed:

| Step | Why a 100 means flawless |
| --- | --- |
| A task (`scoreRound`) | `(perfect × 100 + good × 70 − extras × 25) / targets`, floored at 0. It reaches 100 only when every target is a Perfect hit and there is no extra tap. The scene's flawless test is the same thing: every mark Perfect and `extras === 0`. |
| A level (`meanAccuracy`) | The plain mean of its tasks, so 100 only when every task is 100. The sum of whole hundreds divided by their count is exact in floating point. |
| Cleared | Every star threshold is a whole percent at or under 93, so a 100 always clears. |
| Stored (`recordResult`) | The unrounded mean, and only when it beats the best. A worse replay or a failed run cannot lower it. |
| Level 1's unfailable first task | A missed beat there marks no socket and scores under 100, so neither test calls it flawless. |

`tests/mastery.test.ts` runs both tests through the real judge, scorer and groove — 4,000
random tasks and 300 random levels, many of them one Good away from flawless — and
requires them to agree every time. The scoring formula and `goodPoints: 70` have not
changed since the scorer was written, so a best of 100 in a save written before this
feature means the same thing, and those levels show as mastered from the first launch.

**The one carrier that broke the equivalence was the save code**, which rounds each best to
a whole percent: a 99.6 was written as 100 and restored as a mastered level. A flawless
level is now written as 101 and everything else as at most 99; a byte of 100 from an older
code is read as 99.5. `docs/SAVES.md` has the details. Every other carrier keeps the exact
number:

| Carrier | What happens |
| --- | --- |
| Restart, app update | The same storage key, read by `loadProgress` |
| Auto Backup | The WebView's storage restored whole |
| Save code | 101 for flawless; merged with `mergeProgress`, which keeps the higher best |
| Play Games Saved Games | `CloudSaveV1.progress` carries the exact floats; `mergeCloudSaves` keeps the higher best |

Because every merge takes the higher best per level, nothing can take mastery away. Hearts
and preferences are untouched: they were never part of progress.

## The map

A mastered **cleared** stop gets a thin brass groove inlaid just inside its puck's rim
(`masteryGroove` in `ui/roadLayout.ts`, drawn in `MapScene.drawLevelPuck`, decided by
`mapMastered`). No word, no badge, no extra star.

- **Inside the rim**, because a finale's puck already has two brass rings outside it; a third
  would read as part of the finale. Inside, the same groove works on both.
- **Thin** (2.4 units of brass in a 5.2-unit channel on a 46-unit puck), because the stars
  on the plate under the puck are the reward. The groove says how it was played.
- **In a dark channel**, because the cleared puck is the area's ink: dark on four areas and
  cream on Dusk, where brass alone is under 1.9:1. The test requires 3:1 from brass or
  channel on every area.
- **Only on cleared stops**: the frontier is coral and hops, and locked and preview stops are
  faded. A best that a tampered save holds beyond its own frontier gets no mark.

It is part of the baked road, so it costs nothing per frame. The map is rebuilt on every
entry, which is when a new mastery arrives.

## The result

`masteryResult(before, outcome, level, flawless)` is decided in `PlayScene.recordOutcome`
from the save as it stood before the run:

| | Plate | Ring, glint, knock | Chord, buzz, sparks | `level_mastered` |
| --- | --- | --- | --- | --- |
| `first` | IN THE POCKET | yes | yes | once |
| `repeat` | IN THE POCKET AGAIN | no | no | no |
| `none` | — | — | — | — |

A repeat still says the run was flawless. It does not present it as newly earned.

There is no level detail screen to add "IN THE POCKET" to. The map's bench block always
shows the frontier, which cannot be mastered. The Scrapbook is about keepsakes only.

## Analytics

`level_mastered` fires on a level's first mastery only, beside `level_completed`, with
`level`, `area`, `vignette`, `mode`, `task_count`, `accuracy` and `stars`. It does not fire
on a flawless replay of a mastered level, and never from the map.

"First" is judged against this device's save at the moment of recording. A level mastered
on another device whose cloud save has not merged yet will report once more here. That is
the same scope every other progress event has.

## Files

| File | What it holds |
| --- | --- |
| `game/mastery.ts` | `isLevelMastered`, `masteredCount`, `masteryResult`, `mapMastered`; pure |
| `game/saveCode.ts` | `accuracyByte` / `accuracyFromByte`: the flawless byte |
| `ui/roadLayout.ts` | `masteryGroove`: the map mark's geometry and colours |
| `ui/groove.ts` | `masteryPose(age, still, repeat)` |
| `tests/mastery.test.ts` | The equivalence, reload, replay, merges, legacy saves, the map, first vs repeat |
