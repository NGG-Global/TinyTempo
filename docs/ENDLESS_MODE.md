# Endless Mode

An arcade survival mode on top of the road, opened by **clearing level 100**. One continuous
musical session cycles through the acts the road has introduced by then: watch one rhythm,
copy it, and as that act's ending lands a different act is on the stage with its own —
no rest is added between them. Tempo and pattern
density climb in waves; three **Groove Lives** are the run's whole economy; the score is the
time survived, kept locally and — once the Console has the leaderboard — posted to a Google
Play Games *Time* leaderboard.

| File | What it holds |
| --- | --- |
| `src/config/endless.ts` | The ruleset: unlock level, rules version and seed, tempo band, threshold ramp, lives, count-in, grids, the step cycle, milestones, the plausibility ceiling. |
| `src/game/endless.ts` | The mode as decisions, pure: the unlock, the eligible pool, the step generator, the difficulty schedule, lives, the ranked time, milestones, formatting. |
| `src/game/endlessProgress.ts` | The device's record per ruleset: best time, badges, run count. `tiny-tempo.endless.v1`. |
| `src/scenes/EndlessScene.ts` | The run on screen: one loop, one act at a time, the turn block, the leave sheet, the result plaque. |
| `src/ui/endlessCard.ts` | The door, on the map and the title screen: locked copy, the best, the badges, Start and Leaderboard. Its controls stack (`cardStack`), so Close never covers the leaderboard chip. |
| `src/ui/endlessPlaque.ts` | The result plaque's layout, pure: rows stacked from their measured heights, then the leaderboard and the two blocks. |
| `src/playgames/endlessLeaderboard.ts` | The leaderboard as decisions, pure: the score, the day's best, the pending policy, open. |
| `src/playgames/endless.ts` | The same wired to the configured id, storage, the adapter and analytics. What scenes call. |
| `src/config/leaderboards.ts` | `LEADERBOARDS.endless`: `CgkI0Mey9o8ZEAIQBw`, item 7 of the Games project. |
| `src/config/achievements.ts` | `clear-100` and the four Endless achievements, appended, with their Console ids. |
| `tests/endless.test.ts`, `tests/fixtures/endless-rules-v1.json` | The pinned ruleset: the pool and the first forty steps. |

## The rules, as shipped (rules version 1)

- **Unlock.** `endlessUnlocked(progress)`: level 100 *cleared* — a best recorded for it, or
  a frontier past it — never merely reachable. A save code, a cloud merge and Auto Backup
  carry it, because it is read from the road's save and stored nowhere else. The road past
  100 is untouched: levels 101 onward derive as they always did.
- **Cost.** Nothing. No heart, no attempt id, no ad, no cooldown. `beginAttempt` is never
  called; Premium changes nothing; no rewarded placement exists in a run.
- **The pool** is every act the road introduces on levels 1–100, in the order it introduces
  them — twenty-eight acts, hammer to toothbrush. Read from `DEBUT_LEVELS`, not written down,
  so an act that debuts later (the paintbrush at 101, the glasses at 161) can never join the
  pool by accident. The list is pinned in the fixture, because the pool is part of the
  ruleset. The debut schedule was built so that exactly these twenty-eight are in by level
  100, in this order (`docs/ACT_SCHEDULE.md`), which is why rules version 1 survived it.
- **A step** is one act, one rhythm task — demonstration, then the player's response on the
  very next downbeat, judged by the level's own `RoundController`, judge and scorer — then
  the act's own coda — its contact, its hold and two slide beats, which complete one bar or
  two (`TaskSequence.ending`) — and **nothing else**: the next act's demonstration starts
  on the downbeat the coda's slide lands on, with no lead-in, exactly as one task follows
  another inside a level. The coda is the only rest between acts. The outgoing act slides
  out over the coda's slide beats, the incoming one is built on the swap beat and slides in
  over the last beat, and its name ("Next", then the act's title) stays up through its
  demonstration and clears on the player's downbeat. Its voices are synthesized as the
  previous act resolves, under that coda, not on the swap beat. The run's only lead-in is
  the four-beat count-in before the first act. (The first build put two bars of interlude
  here; playtesting found it broke the pacing, and it was removed before release.)
- **The sequence** is a pure function of `(seed, rulesVersion, index)`. Each step draws
  from its own stream in a fixed order — act, lap, pattern, grid — with these constraints:
  no act repeats within the last six, no pattern repeats back to back, the look (`lap`) is
  drawn from four. The generator carries only the last six acts, the last pattern and the
  planned clock, so a run of an hour costs what a run of a minute does
  (`createEndlessSequence`; `endlessSteps` and `endlessStep` walk it for tests).
- **Difficulty is a schedule.** Every step reads the *planned* run clock — the seconds the
  steps before it were scheduled to take, at their tempi — never the real clock and never
  the player:
  - tempo: 130 BPM, climbing in 2 BPM steps to 150 by five planned minutes, then held there;
  - the bar a vignette must reach: 75% rising to 90% by five minutes, held there, a whole
    percent, compared against the round's **unrounded** accuracy, strictly (`74.999` loses
    a life at 75; `75` keeps it);
  - pattern tier: 0 rising to 4 by five minutes;
  - a ten-step cycle of roles shifts tempo and tier around that ramp — opener, pattern,
    pattern, tempo, endurance, recovery, combination, combination, challenge, finale — so
    past the cap the run still has recoveries at 146 BPM and tier 3 between challenges at
    150 and tier 4;
  - finer grids from two planned minutes, on the pattern, combination, challenge and finale
    roles, 30% of the time, and only where `gridFits` says the tempo leaves 110 ms between
    taps. Triplets fit at 150 BPM. Sixteenths fit only under 137 BPM, which the ramp has left
    behind before they are allowed, so **in this ruleset sixteenths never appear**; the rule
    is kept so a change to the tempo band meets them as the ruleset change it is.
  The tempo changes on the next act's first demonstration downbeat, with the stems, and
  never inside a step: a demonstration and its response are always at one tempo.
- **Groove Lives.** Three to start. A vignette below its bar costs exactly one and ends the
  streak. One at or above 95% extends the streak; the third in a row gives one life back if
  any is missing and resets the streak either way, so a full set banks nothing. A vignette
  cannot lose and recover at once. Zero lives is the end of the run, decided in
  `applyAccuracy` and nowhere else, and applying a result past zero stays at zero: a
  duplicate callback cannot take two.
- **The ranked time** is `elapsedMs(runStart, runEnd)`: from the first demonstration
  downbeat (after the four-beat count-in, which is not counted) to the end of the fatal
  response's bar, both grid times on the audio clock, as whole milliseconds. Every act's coda
  before it counts; the fatal act's own coda does not. The HUD reads the same clock each frame and
  truncates to tenths; the plaque shows hundredths.
- **Milestones.** 120, 300 and 600 seconds earn a local badge once each, shown on the
  card and the plaque; the achievements of the same numbers mirror them where configured.
- **Music.** The loop started on the count-in runs to the end of the run. It starts on the
  track's first stem with the metronome bar, at the first step's tempo; `advanceLayers`
  moves the stem count per scored act exactly as a level does; `setRate` and `setLayers`
  are placed on the next act's demonstration downbeat. The track is the unlock level's chapter
  (`trackForLevel(100)`), which under `TRACK_CYCLE = ['b']` is track B. Nothing restarts a
  source between acts; an act change is `RoundController.start` on the running grid. The
  act's coda is cut on the swap beat exactly as a level cuts it.
- **The turn block, as a level draws it**, hit poses, EARLY/LATE and the flawless flourish
  included: a step answered Perfect throughout with nothing extra strikes *Flawless!* over
  the face, sweeps the sockets and ends in the chorus (`ui/flourish.ts`). Groove is a
  level's and not here: no warm room, no rim, no accents.

## What ends a run, and what it records

| How it ends | State | Recorded | Posted | Shown |
| --- | --- | --- | --- | --- |
| Lives reach zero | over | yes, once, by run id | if a ranked time and a day's best | "Out of lives", the time, acts, peak BPM, best/new best, new badges, the posting note |
| The player taps the map puck and confirms | abandoned | no | no | straight back to the screen that opened Endless |
| Backgrounded, `pagehide`, the phone turned to landscape on a handset, a stall the controller catches, the next task could not be placed, sound could not start | invalidated | no | no | "Run interrupted · not ranked", the clock where it stopped in grey (no time row if it never started), Try again, Map or Home |

## Two doors, one card

Endless opens from the map's infinity puck — tagged *Opens after level 100* while it is
locked and *Endless* once it is open, until the card has been opened once
(`ui/puckLabel.ts`) — and, once level 100 is cleared, from an
**Endless** block on the title screen beside How to play (`MenuScene`): the title screen is
where a player who has finished the road comes back to. Both open the same `EndlessCard`,
and opening it from either marks the unlock seen, which clears the coral dot on both. The
title screen's Start is the gesture that unlocks audio; the scene is started with
`{ from: 'menu' }`, its way-out block reads **Home**, and every way out (the plaque, the
leave sheet, Android's back) returns there. From the map it reads **Map** and returns to
the map, as before.

## The result plaque

The plaque is as tall as what it says (`planEndlessPlaque`): eyebrow, title, time, stats,
best, note, then the leaderboard chip where Play Games offers one, then Try again and the
way out. A row with nothing to say takes no room, the note is balanced (`balanceWrap`), and
a plaque taller than its frame gives up its top before its buttons. While it is up the
run's HUD (the clock, the tempo line, the lives and both pucks) is hidden: the plaque
carries the time, and the HUD's clock kept counting under an interrupted run's plaque.

Invalidation happens once (`invalidate`): the controller is interrupted, voices cancelled,
the loop stopped, the act paused, and `endless_abandoned` reported with its reason. A
reason that arrives after the run is over — the result backgrounded — changes nothing.
Nothing is ever recorded or sent from an exception path. An audio context that suspends
mid-run is handled as a level handles it: `tick` stops pumping until it recovers, and the
controller's stall detection then interrupts, which invalidates.

The record (`recordEndlessRun`) is monotonic — best time, best act count, best tempo, run
count, badges only ever rise — and idempotent by run id. It refuses a time the leaderboard
would refuse (`rankedMs`: whole, non-negative, at most `ENDLESS.maxRunMs`, six hours) and
is kept per rules version. Local first: the record is saved before anything is sent, and a
failed save (blocked storage) is reported and sends nothing, so the next launch cannot be
owed an achievement for a run it cannot find.

## The leaderboard

**Its own Play Games leaderboard**, never Daily Tempo's: the Console board is created with
the **Time** format and **Larger is better**, so a submitted 66 032 renders as 1:06.03. The
score is the survival time in whole milliseconds, nothing packed into it; equal times tie.
`LEADERBOARDS.endless` holds the id, `CgkI0Mey9o8ZEAIQBw`. An empty or malformed id would
turn submission and both leaderboard buttons off, and the mode would still play in full.

One Play Games leaderboard is daily, weekly and all-time at once, and **a submission is
filed into the daily and weekly windows current when it arrives**. Every policy follows
from that:

- A finished run that beats the Play Games day's best is sent at once, tagged
  `r<rules>-<day>`. The all-time view keeps the maximum by itself, so a best is on it the
  moment it reaches Play.
- A run that cannot be sent — offline, a timeout, signed out — is kept pending **for the
  Play Games day it was played on** (`tiny-tempo.endless-board.v1`, `dailyTempoDay`'s
  clock, UTC−7) and retried at boot once signed in, when the board is opened, and on the
  next run that day. **Once the day has turned it is dropped from the queue**: sending it
  then would post it to a daily and a weekly chart the player did not play it on. The local
  best keeps the time; the player's next ranked run posts to the board. The game never
  tells the player a past day's time was posted to that day's chart. This is the
  conservative policy the brief asked for, and it is a Play Games client limitation, not a
  bug to fix: there is no API to post into a past window.
- The board opens on its **weekly** view; Play's own screen switches to daily and all-time.
  A signed-out player is offered sign-in there and nowhere else.
- `scripts/check-android-config.mjs` decodes both leaderboard ids against the Games project
  and refuses the two sharing one id: the Daily Tempo id pasted into the Endless field would
  post milliseconds onto a board shown in thousandths.
- `PlayGamesPlugin.java`'s `MAX_SCORE` rose from 100 000 (Daily Tempo's ceiling) to six
  hours in milliseconds; each board's own ceiling is enforced on the TypeScript side.

**Tamper protection** on the Console is a basic layer, not anti-cheat: the time comes from
the client. There is no server here; if the board ever carried prizes it would need one.

## Achievements

Five appended to `ACHIEVEMENTS`, with the ids the Console import gave them: `clear-100`
(level 100 cleared, from the road's save) and `endless-first-run`, `endless-120s`,
`endless-300s`, `endless-600s` (from the device's Endless record). `hasEarned` takes the
facts — the save, and the record — and `syncAchievements` reads the record from the device
at every sync, so an Endless milestone earned while signed out is handed over by the next
sync from anywhere, the road included. The first five are untouched. See
`docs/ACHIEVEMENTS.md`.

## What is device-local, and why

The Endless record is **not** in a save code and **not** in the cloud snapshot in this
version. A save code grew no field, so older builds still decode every code; the cloud
snapshot's shape is asserted by `tests/cloudSave.test.ts` and was left alone. Auto Backup
carries the record only because every key shares one store. A cross-device best would need:
a versioned field on `CloudSaveV1` (schema 2), a merge of `max(bestMs)` with the badges
unioned and the run count summed-or-maxed, the same account binding the snapshot already
keeps, and a size check — a deliberate change, not a side effect of this one.

## Versioning the competition

Anything in `src/config/endless.ts` is part of the ruleset the board ranks against: the
seed, the tempo band and ramp, the threshold ramp, the lives, the step's shape, the grid rules,
the cycle, the recent-acts window, the lap range, the milestones, and the pool (which
follows `DEBUT_LEVELS` through level 100, so a change to the schedule below level 100 is a
ruleset change too). Changing any of them:

1. raise `ENDLESS.rulesVersion`;
2. create a **new** Console leaderboard and put its id in `LEADERBOARDS.endless` — or
   explicitly reset the old board, since old and new times are incomparable;
3. regenerate `tests/fixtures/endless-rules-v1.json` as the next version's fixture, and keep
   the old one if the old ruleset stays playable (it does not, today: one ruleset ships);
4. the device record keys itself by rules version, so an old best is kept but neither shown
   as current nor sent.

`tests/endless.test.ts` fails on an unversioned change: the fixture pins the first forty
steps of the shipped rules.

**Rules version 1 is fixed at release, not before.** Removing the interlude changed the
schedule — every planned start, and so the tempo, bar and tier each step reads — but it was
made before Endless Mode reached any player, so it stayed version 1 and the fixture was
regenerated. Any time on the Console board from before it was posted by a tester under the
old pacing; reset the board's scores in the Console before release if any were posted.

## Analytics

`ENDLESS_EVENTS` in `monetization/analytics.ts`, shaped like every other event and checked
by `tests/analytics.test.ts`: `endless_unlocked` (from the level-100 clear), `endless_opened`
(the card), `endless_started`, `endless_vignette_finished` (one per act, bounded by the
run), `endless_life_lost`, `endless_recovered`, `endless_finished` (the one event carrying
a ranked time), `endless_abandoned` (with its reason), and the leaderboard's three. No
player id, no tap, nothing high-cardinality.

## Tuning that waits for playtesting

The 130→150 band, the five-minute ramp, 75→90, 95 for excellent, three for a recovery, and
the 30% grid chance are the brief's starting values; the typical competent run of three to
six minutes is a design hypothesis, not observed. The dump in `tests/fixtures/endless-rules-v1.json`
is the auditable schedule: step 0 is 16 beats at 130 BPM (7.4 s), a step averages about
7.9 s, the bar reaches 90% at step 41 (about 300 s), and the ramp's last stretch alternates tier 4 challenges at 150 BPM
with tier 3 recoveries at 146. Every one of those is a ruleset change when it moves.
