# Development guidelines

## Current state

Boot → Preload → `MenuScene` → `MapScene` (endless scrollable road, ten-level
areas) → `PlayScene` for one level → back to the map, with `SettingsScene`
reachable from the menu and the map. `src/game/levels.ts` derives every level
(tasks, per-task tempo ramp from 120 BPM, pattern tier, clear bar, stars) from
one curve in `src/config/progression.ts`; keep new difficulty knobs on that
curve. `src/game/progress.ts` owns saved progress and `src/game/settings.ts`
owns player settings; both validate every field on read, because storage can be
blocked, stale or tampered with. Progress leaves the device two ways, neither of them an
account: Android's Auto Backup, and the save code on `TransferScene` — a checksummed
Crockford base32 string carrying levels, accuracies and settings, never hearts or
purchases. Restoring **merges** (`mergeProgress`), so a code can only ever add. See
`docs/SAVES.md`.

The tiers stop at the eighth note; **triplets and sixteenths are a second stage on the
same curve** (`PROGRESSION.subdivision`, `SUBDIVIDED_TIERS`, `subdivide` in `levels.ts`).
From level 43 a level may swap up to half of its tasks, never the first, for a one-bar
triplet phrase, from level 59 for a sixteenth one, and only where the task's tempo leaves
`minSpacingMs` between taps — which is what keeps sixteenths off tasks above 136 BPM. The
swap draws from **its own seeded stream** after the tiers have chosen, so it never moves a
task it leaves alone (checked against `tierTasks`), and the threshold reads the plain curve.

**Difficulty is choreographed inside each area.** The curve is the baseline; a level's step in
its area (`PROGRESSION.choreography`, `LevelSpec.role`/`areaStep`) shifts the continuous task,
tempo and tier values before rounding — opener, two pattern levels, tempo, endurance,
recovery, two combinations, challenge, finale — ramped in over the first 20 levels, capped at
what the curve gives one area ahead, inside every ceiling. **The clear bar and star thresholds
are never choreographed**: stars are recomputed from best accuracy on every read, so moving a
threshold moves saved star totals and can close a gate behind a player
(`tests/fixtures/level-thresholds.json` holds them). `tests/fixtures/levels-choreography.json`
pins levels 1–120; a change that moves any of them is the registry trap again. See
`docs/DIFFICULTY.md`. **Each finer grid is introduced once, in the level that first uses it**
(`game/subdivisionIntro.ts`): one unscored task in front of the level's first, at 0.75× on the
act, block and judge the level uses — "New rhythm / 3 inside the beat", one example, one
answer, one retry below 50% — on ordinary windows, never wider. `introGrid` triggers on a level
that uses an unseen grid, so a save from before the feature meets it on the next such level,
never at launch; the `triplet`/`sixteenth` teach flags live beside `seenDemonstration`. See
`docs/SUBDIVISIONS.md`. Subdivided phrases
are parsed by `parseSubdivided`, which divides by the step count: twelve triplet steps
multiplied out land a hair over four beats and round the phrase up to two bars. The judge's
`windowsFor` narrows Perfect where two targets sit closer than 122 ms; Good is left to the
nearest-target cell. See `docs/SUBDIVISIONS.md`.

**Every area ends in a finale, and a finale is a presentation, not a new test.**
`isAreaFinale` (`level % PROGRESSION.areaSize === 0`) is the only place a finale's level is
decided — `LevelSpec.finale` is it — and `tests/finaleAreaSize.test.ts` re-runs the whole
derivation at an area of four. A finale keeps the choreography's `finale` row for length and
tempo, and replaces each pattern with one its area's earlier levels already used
(`areaRepertoire`, the reprise in `levels.ts`, its own seeded stream): no tier above the
curve's, no grid the area has not played, so the top of an area is never where something
new arrives. Its opening is `PROGRESSION.finale.openingBars` long, through the breather's
`leadBeats`. Clear bar, stars, hearts and unlocks are every level's. The dressing is data:
`FINALE_TREATMENTS` in `game/finale.ts`, drawn by one `FinaleStage` (`ui/finaleStage.ts`) —
pennants over the act that move up under the headline for the result, a title card that is
off the stage half a beat before the first demonstration, the loop swelling from
`musicFloor` onto that downbeat, and an "Area complete" ribbon across the plaque's top
edge — so a new area's finale is a new entry, never a PlayScene edit. The map flags every finale in its window and the dock's trail ends in one. See
`docs/FINALES.md`.

**Stars are a currency the road spends.** Every area after the first is closed until the
player's total stars reach `starsRequired(area)` (`game/stars.ts`, knobs in
`PROGRESSION.starGate`): 12, 25, 39, 53, then 14 more each time, a bank rather than a
per-area quota, so a player averaging 1.4 stars a level is never stopped and one who scrapes
is only ever a few replays short. Nothing is stored: the collection is the sum of
`starsFor(best)`, so save codes and merges carry it unknowingly. **An earned star is prize
brass everywhere it is shown** — plaque, road plate, tally and flight — and an empty seat on a
road plate is hollow (`drawStarSeat`), because on the dark Dusk plate brass and a faded seat
sit at the same luminance and only full-against-hollow keeps the count legible. A cleared level is never
held, only the uncleared frontier at a closed area's first stop. The map draws a barrier at
each closed area's foot, the collection on the bench, and flies a finished level's new stars
from its plate to the tally (`ui/starFlight.ts`); **while a flight is on, everything that
reads the collection reads the shown count**, so nothing opens before the star that opens
it has landed. See `docs/STAR_GATES.md`.

Twenty-eight vignettes rotate by registry order, **in eras**: `levelSpec` places a level
with `placementAt(ROTATION, level)` (`vignettes/rotation.ts`, the table beside the
registry). Levels 1–50 cycle the first twenty-five exactly as the old single rotation
did, and from level 51 all twenty-eight, opening on the acts that era added. Reordering
or inserting an entry in `src/vignettes/registry.ts` still silently reassigns every
level's vignette, and **appending one now also needs an era**, starting past every
keepsake level: a keepsake is earned on the level where its act plays a lap, and an
append under the old `VIGNETTES[(level - 1) % VIGNETTES.length]` would have moved every
keepsake on 26–50. `LevelSpec.lap` is how many earlier levels the act played, and
`actLevel` is its inverse — never `level + VIGNETTES.length`. See
`docs/BARBER_POPCORN_TOOTHBRUSH.md`.
Snare drum, bongos, slushy and apple are acts 22–25, on the household lifecycle.
Their coda contacts and voices share `treatMotion.ts`; the two food acts consume
judged hits and reserve the last portion for success. See `docs/PERCUSSION_AND_PICNIC.md`.
Barber, popcorn and toothbrush are acts 26–28, on the household lifecycle, first played
on levels 51–53. Each advances only on judged hits and keeps a share of its subject for a
clean round's coda: the barber cuts a twelve-lock mop in `BARBER_MOTION.order` and is the
fourth act with three endings — the cape whisked off, a lopsided cut, a beanie over the
damage — with a middle voice of its own; popcorn fills its bowl a layer at a time and ends
on one enormous kernel; the toothbrush brushes sixteen teeth once round, and a clean round
rinses the foam and sweeps a gleam across them. Their demonstrations snip the air, hop a
kernel back into the pan and scrub without cleaning. See `docs/BARBER_POPCORN_TOOTHBRUSH.md`.
Presentation lives inside the vignette; the rhythm controller, judge and scorer
stay authoritative, as `docs/VERTICAL_SLICE.md` sets out.

Every act carries more than one look. `LevelSpec.lap` counts how many earlier levels
the act played, PlayScene passes it to `create(scene, lap)`,
and the act indexes its own list with it. Bug & shoe has three bugs and sneaker
colourways (`bugLooks.ts`), the bicep curl three people at the bench
(`curlLooks.ts`), scissors & paper four sets of three shapes (`PAPER_SHAPE_SETS`),
the light switch four interiors (`lightLooks.ts`), the doorbell four leaves
(`doorLooks.ts`), the slushy five flavours (`slushyLooks.ts`), and the apple act an
apple, a pear, a peach and a donut (`appleLooks.ts`). The other twenty-one each have
three looks in their own `*Looks.ts`, chosen by `lookAt`: the hammer, the window's
view, the saw's timber, the tomato, cucumber and banana, the egg, the bubble sheet,
the roller's wall and gallery (`rollerImage`, leaving `paintImage` on the original
three), the hotel bell, the balloons, the stapler, the fisherman's mac, the DJ
booth, the trombone, the clap's sleeves, the snare's lacquer, the bongos, the barber's
customer, the popcorn's bowl and the toothbrush's mirror.
Lap 0 is always the original look, so the first twenty-five levels are unchanged.
Add variety this way, as a new look inside an existing act, rather than as a
registry entry. **A look that changes
what the subject is also changes its words**: `VignetteDefinition.looks` holds a
title, intro and verdict per look, and `definitionForLap` is what PlayScene and the
map read, so a donut is never announced as "Apple". The donut is the one look with
its own geometry — eaten from one side across, drawn as scanned half-rings so a bite
can open the hole — and a wasp instead of the worm. See `docs/VARIANTS.md`.

Scissors & paper is the ninth act. Its three cutout shapes rotate per task;
`paperMotion.ts` derives success (70%+), partial (40–69%) and failure from the
round accuracy passed to `Vignette.finish`. Other acts retain their binary
endings. Its five-beat reveal hold adds one bar to the default coda; holds must
complete whole bars with the contact and two slide beats. See
`docs/SCISSORS_PAPER.md`. In DEV only, `?debug&level=9` opens it directly.

Egg cracking, Bubble wrap, Light switch and Doorbell are acts 10–13. They share
the lifecycle in `HouseholdVignette.ts`, with independent drawings and material
voices in `audio/householdSounds.ts`. Their five-beat finale holds preserve the
downbeat and allow the egg drop, pop cascade, room reveal and door swing to
complete. See `docs/HOUSEHOLD_ACTS.md`.

Paint roller, Hotel bell, Balloon pump and Stapler are acts 14–17, on the same
lifecycle: one Graphics each, curves in `errandMotion.ts`, voices in
`audio/errandSounds.ts`, and the same five-beat hold. The roller's picture is a
coarse grid so a stripe of any width is whole columns; the balloon grows only on
judged hits and bursts on a rough coda. See `docs/ERRAND_ACTS.md`.

The fisherman is act 18, on the same lifecycle: one Graphics, curves in
`fishingMotion.ts`, voices in `audio/fishingSounds.ts`, and the same five-beat hold. The
beat is a pull on a hooked line, not a reel, so `rodHeave` is deliberately not monotonic.
It is the second act with three endings from the round accuracy: a big fish at 70%+, one
of three that each leave the water their own way, a small fish at 40–69%, and a boot or
tyre below. See `docs/FISHERMAN.md`.

The DJ scratch is act 19: a hand on a record and one on the crossfader, one short scratch
per beat (`scratchPush`, back in place inside 0.42 beat), the mixer's meter lit by judged
hits, and a binary ending — hands up under the lights, or the needle skips off. Its voices
run vinyl noise through a swept band-pass (`audio/scratchSounds.ts`). See `docs/DJ_SCRATCH.md`.

The clapping hands are act 21, on the household lifecycle: one Graphics, curves in
`clapMotion.ts`, and a five-beat hold. Each hand is laid out in its own frame and the left
one is that frame mirrored, so the pair cannot drift apart; `roundedBox` traces the palm,
the cuff and every crowd mitt. It is the third act with three endings from the round
accuracy — a crowd of eleven pairs on a clean round, a scatter of three on a middling one,
and on a rough one nobody at all, the hands turning palms up into a shrug — and the first
whose middle ending has a voice of its own, since all four of its takes were recorded.
**A coda can outlive the hold it plays in.** Four seconds of applause against 2.8 at the
fastest tempo would land on the beats the player has to copy next, so `playFinish` takes
the instant the room has to be clear by — the next task's own downbeat — and fades the coda
under it; after the last task nothing follows and it rings out under the summary. See
`docs/CLAPPING_HANDS.md`.

The trombone is act 20 and its beat is unlike every other's. **The action voice is scheduled
on the grid for every demonstration cue and every target when a task is placed**, and the
engine hands out its two recorded takes in that order for the whole level, so the note that
sounds is fixed by its position in the level and the picture follows the plan (`soundedNotes`,
`noteFor`), not the tap: the slide moves with the take being heard. The tap keeps the judged
reactions and the curtain. Its four recordings are the sample bank's first MP3s, for reasons
`docs/SOUND.md` records. See `docs/TROMBONE.md`.

`HouseholdVignette.update` re-anchors the stage to its laid-out home every frame,
as every other act does in its own `update`. `Vignette.translate` is the
between-task slide and is an absolute offset from that home, applied by PlayScene
right after `update`; an act that skips the re-anchor walks off screen.

Every sub-screen header is one row: the back puck at `safe.top + 66 * s`, its title at 56 in the
display face beside it, and every scene's `s` is `min(safe.width / 720, safe.height / 1150)` — one
divisor, so the shared puck row does not shift size between the map and Settings on a tablet.
A text's `align` agrees with its origin, and a caption that can wrap hangs from its top edge so
a second line grows away from the title above it rather than up into it.
Three chrome screens follow the refined design in `docs/UI_REFINEMENTS.md`: Settings is
labelled sections scrolling between a pinned title and a pinned Done, with calibration on
its own `CalibrateScene`; the level result is a plaque that hangs on ropes and takes a
knock from each medal; and out-of-hearts is one ranked sheet, on the map and mid-run.
**The medals seat in a tray inside the plaque, each over a chip naming its threshold**
(`ui/resultLayout.ts`, `game/resultCopy.ts`, read from `spec.starAccuracy`, never
written down): the middle one larger and raised, nothing crossing the plaque or a rope
at rest. Under it, in one order, a cleared finale's card (the collection and the next
area's gate in that area's colours), then the next star ("Third star at 85%") or a new
keepsake's card, which is as tall as its words; a clear short of three stars adds a wood
**Replay level N** block over Continue, by the restart puck's path — coral stays on
Continue alone. `planResult` stacks them and, on a short frame, takes rope before it
shrinks the plaque, never below `minScale`.
**A plaque is a Graphics *and* its Text.** `stars.clear()` empties the drawing and leaves
every `Text` on it untouched, which left the score and its "On the beat" caption hanging
over the middle of the act for a whole round after the summary closed. `drawStars` is the
one place that knows what the plaque is made of — its chips, the rows under it and the
replay block included — so hiding it is a call to that rather than a list of objects at
the call site.
Two version traps live there. **Phaser 4 dropped WebGL geometry masks** — `setMask` warns
and no-ops off the canvas renderer — so a clipped region is a second camera's viewport,
never a mask. And a control inside a scrolling list fires on the pointer *release*:
`TapInput` reports the press, which is right only where the press is the musical event.

**A dressed letter only takes an outline its own fill can carry.** `typeStroke` returns
`null` below `OUTLINE_CONTRAST`, and `ui/type.ts` then draws no stroke and lifts the letter
on a pale drop. The workshop's thick border is for cream on timber or coral; the game's ink
and every act's and area's ink self-shaded to a near-black border at under 2:1, which reads
as a thicker, muddier stem and closes Fredoka's counters. A new act's ink is covered by
`tests/ui.test.ts` without anyone remembering this.

Commerce analytics is `monetization/analytics.ts` (a typed bus, no vendor) behind
`analytics/` (the Firebase adapter), and the provider **wraps the installed sink rather
than replacing it** — `diagnostics/boot.ts` has already put a crash-breadcrumb wrapper
there, and replacing it would keep the events flowing while silently emptying every crash
report of the purchase that caused it. **Firebase enforces its limits by discarding**, so
`analytics/eventShape.ts` holds the name and parameter rules as pure functions and
`tests/analytics.test.ts` checks every shipped event against them; a name Firebase
dislikes is not an error, it is an event that never arrives. Consent is a stored setting
with a switch in Settings → Privacy, it starts where `VITE_ANALYTICS_CONSENT` puts it, and
it deliberately does not travel in a save code; the adapter also refuses to hand an event
to the SDK while consent is not granted. **Gameplay events ride the same bus**, reported
through `game/playAnalytics.ts` rather than by calling `track` from a scene: it keys a level
attempt on PlayScene's heart attempt id, so Resume and the restart puck continue a run
instead of starting a second one, `level_completed`/`level_failed` fire once from
`recordOutcome`, and a finished id is never reopened. Its session state (retries, the gate
dedupe) is in memory and stores nothing. See `docs/ANALYTICS.md`.

Crash reporting is `core/errors.ts` (capture, no vendor) behind `diagnostics/` (the
Sentry adapter), the same split `monetization/` uses — see `docs/DIAGNOSTICS.md`.
**A throw inside a Phaser `update()` fires sixty times a second**, so reports are keyed
by message plus top frame and re-sent only on a power-of-two repeat; nothing added to a
sink may throw, and nothing may send a query string or a device file path. Capture is
installed before Phaser is constructed. **Every Sentry integration that captures on its
own is filtered out** (`diagnostics/integrations.ts`): one that is missed reports around
the capture layer, with no dedupe, redaction, breadcrumbs or context, and the same throw
arrives twice — `BrowserApiErrors`, which wraps `setTimeout` and `addEventListener`, did
exactly that until it was found by reading the posted envelopes. Sourcemaps are still never shipped: only
`npm run build:release` emits them, and `@sentry/vite-plugin` uploads and deletes them,
which is what CI's "no sourcemaps ship" check keeps honest. That plugin **warns instead
of failing** on a missing token or a failed upload, which would ship a release whose
every trace is minified, so `vite.config.ts` throws on both and
`scripts/check-no-sourcemaps.mjs` fails the build if a `.map` survives.

Play Games Services is `playgames/`, on the same adapter split and **authentication only** —
the SDK is initialized, v2 signs the player in itself, and the game can ask who they are. No
snapshot is written; `docs/PLAY_GAMES.md` carries the Saved Games plan and the reason it is a
plan. **Play Games is never required to play.** Every call resolves, so a device without it,
a declined prompt and a plugin that rejects are one answer — signed out — and the browser
keeps `stubPlayGames`, which *cannot* report anyone authenticated. That is a different object
rather than a flag, which is what stops a development mock standing in for the real thing in a
release. Two ids in one strings.xml are not interchangeable and both fail silently when
crossed: `game_services_project_id` is the numeric Games project id the manifest's
`com.google.android.gms.games.APP_ID` points at, and is neither the AdMob app id beside it nor
the Firebase app id. `PlayGamesSdk.initialize` runs in `TinyTempoApplication`, which exists for
that and nothing else. The player id is identifying: it crosses the bridge because a snapshot
would be keyed on it, and reaches no log, crash report or analytics event.

**One leaderboard, for a Daily Tempo that does not exist yet.** `LEADERBOARDS.dailyTempo`
(`config/leaderboards.ts`) holds the Console id, but `DAILY_TEMPO_AVAILABLE`
(`config/dailyTempo.ts`) is false, so nothing is submitted and no button shows. **A
leaderboard id is copied, never retyped**: I/l, O/0 and o/0 pass every format check and fail
on every call, so `check-android-config.mjs` decodes the id and warns unless it names project
`863268283344` — the first id supplied failed exactly that way. The score is `round(accuracy × 1000)`
from `leaderboardScore` alone, never re-derived. Play Games keeps daily, weekly and all-time
views of one leaderboard by itself and resets the daily one at UTC−7, so `dailyTempoDay`
reads that clock, not the local date. Only a score that beats the day's best is sent; a
failed one is kept and retried; nothing here prompts except the leaderboard button, and
nothing ever blocks a result. Scenes call `playgames/dailyTempo.ts` only. See
`docs/LEADERBOARDS.md`.

**Achievements are derived from the save and re-sent, never remembered.** The first five
(`config/achievements.ts`) are earned by *clearing* levels 10–50, the area finales;
`hasEarned` reads the save, so old saves, codes and merges carry them and a player already
past a finale is owed it on their first signed-in launch. v2's `unlock` queues offline and
ignores repeats, so `playgames/achievementSync.ts` hands every earned one over once a
session — after a *saved* result (an unlock cannot be taken back) and at boot once signed
in — and keeps no ledger. All five ids are set and pinned by `tests/achievements.test.ts`; an
empty id leaves an achievement off; the list is append-only. See `docs/ACHIEVEMENTS.md`.

**A sound the tap starts is heard one output lag after the tap.** The demonstration is
scheduled on the grid and drawn from the heard clock, so it stays together on any route; the
player's own beat, started at `currentTime` by the tap, reaches a Bluetooth headset 150–400 ms
later — most of an eighth note — so a Perfect tap sounded on the next subdivision and no Tap
offset could move it, since the offset moves the judgement and a sound cannot precede the tap
that starts it. `AudioClock.tapVoiceLate` (reported lag plus any positive offset, against
`RHYTHM.gridVoiceLagMs`) therefore turns on the trombone's `gridAction` for every act, per
task: the targets are voiced on the grid and the tap keeps the picture and the verdict. See
`docs/SOUND.md`.

**A recorded beat is late by whatever silence was in front of it.** The delivered
one-shots open with between 0.1 ms and 25 ms of room before the take, and a beat sound is
scheduled *on* the grid — so that silence is not padding, it is lateness, charged to every
demonstration beat and then to the player copying what they heard. `audio/samples.ts`
drops it at decode, the same thing `detectLeadIn` already does to the music. An act may
also give a voice more than one take (`Voice` in `AudioEngine`), which the engine
alternates rather than layers, so a beat that repeats all level is not the identical
sample eleven times running.

Music is one premixed stereo MP3 normalized to a 120 BPM, 60-bar loop
(`docs/MUSIC.md`), encoded from the seven WAV masters by `npm run music:encode`.
**The title screen has a second track and nothing else does.** `audio/ThemeMusic.ts` plays
`bgm/theme/cozy-quest.mp3` on `MenuScene` and stops on every way out, with its own player
rather than a mode inside `MusicSystem`, because every guarantee that system makes is
about a beat grid a level is judged against and the menu is judged against nothing. A
browser will not sound it until the page has been touched, so it fetches nothing on a cold
start and every tap that leaves the player on the title screen asks again.
The `AudioEngine` is game-wide via `audio/sharedAudio.ts` and is unlocked by the
menu's PLAY tap. The same loop is the **shell bed** on settings and the map
(`audio/musicBed.ts`): PLAY starts it as the title theme leaves, those screens
reuse the one source, a level fades it out and starts a fresh source on its own
downbeat, and Tap offset cuts it so the metronome is the only pulse. Starting
the track from a scene without going through the bed is how a leftover level
and the menu overlap.

Output latency is corrected in two places, and they do not overlap.
`AudioClock` maps a tap onto the sample the player is **hearing**: from
`getOutputTimestamp()` where the platform gives a usable pair, and otherwise from
`currentTime` minus `reportedOutputLag`, which is **`baseLatency` + `outputLatency`** —
measured in Chrome, where the heard sample sat 40–43 ms behind `currentTime` against a
sum of 42 and an `outputLatency` of 32 alone. Estimating from `currentTime` without that
subtraction judged every tap late by the device's whole output lag, which on Bluetooth is
a fifth of a second. `AudioClock.calibrationMs` is then the correction on top for whatever
the platform under-reports, it applies to judged input only — never to cue scheduling or
visuals, which the device does not delay — and `CalibrateScene` names the reported lag
when it is large enough to be the reason a player is failing levels.

**A level runs on two clocks, and a deadline must name the right one.** `AudioClock.now()`
is the context time of the sample the player is hearing, so every phase, judgement and
visual in `PlayScene` lands with the sound it belongs to. Anything the scene *schedules*
is placed on `context.currentTime`, which sits the device's output latency ahead of that
reading — milliseconds through a speaker, 200–400 ms through Bluetooth. A deadline read on
one clock for a tick that arrived on the other charges that latency to the level: the task
change did exactly that, and interrupted every level on a headset a beat before the next
task. `canPlaceNextTask` is that deadline now, and it is the next task's own downbeat.

**Whose turn it is is an object at the thumb, not a word at the top.** `ui/turnBlock.ts`
draws two rows sharing one set of column centres — the demonstration's recessed shelf above,
the player's raised face below, where the beat track already was — and one coral baton that
leaves a sunken slot on the shelf and lands in the slot on the face. It all runs on
`handover(plan, now)` from `game/beatTrack.ts`, which opens `RHYTHM.runwayBeats` before the
player's first target, **inside the demonstration's own bar**: nothing is added to the loop
and no cue moves. **By the downbeat nothing new appears** — the face has warmed, the sockets
have rung up left to right and the baton has landed. That is the property to protect; a cue
that arrives on the beat it announces arrives too late to wind up for. The stage light moves
with it (`turnOpen` in `vignettes/motion.ts`, keyed to the plan in each act's `reset`) and is
the only thing that does: the demonstration is still running, so nothing that consumes the
act's subject may start there. `showPhase` sets no turn words. What does carry words is `turnCount` in `game/beatTrack.ts`:
**"3", "2", "1" on the beats before the player's first target and "Go!" on the target itself**,
under the player's own row. It is a count-in and is built as one — measured in beats back from
`targets[0]` rather than in seconds, opening `RHYTHM.turnCountBeats` (one beat ahead of the
runway) inside the demonstration's own bar, scheduling and sounding nothing. Its `weight` ramps
from a quarter to full so the count is faintest where the example is still the thing to watch,
and it sits *below the face* rather than in the verdict's band, because a tap on the downbeat is
judged there and then and the verdict would wipe the "Go!" for the player who got it right. The
slot is occupied from "3" onward, so "Go!" replaces the "1" in place and the property still holds.
`turnCountPose` poses each numeral as a *strike* — dropped in oversized, stamped to size, leaning
alternate ways, a ring left on the beat, the fill warming from ink to coral — and the baton's
travel (`batonTrail`, `glyphFlip`, `landingRipple`, `dropLine`, all pure in `ui/turnBlock.ts`) is
what makes the token read as handed over. **A task answered Perfect throughout gets the one
celebration a task has**: `isFlawless` reads the judge's marks, and `ui/flourish.ts` strikes
*Flawless!* onto the verdict's line and sweeps a light across the face, glinting each socket in
turn. It is `f(age)` from the audio clock, like everything else on the block.
The first run adds one 0.75×
demonstration pass before level 1's first task and a guiding ring on that level's sockets —
no scene, no modal, no skip — and the socket ring is `#8f3620` rather than coral, because
coral on a coral plate is invisible. See `docs/TURN_CUE.md`.

A task is a demonstration phrase and then the player's response, back to back on
the bar line: nothing waits between them, and nothing waits between one task and
the next. The only pauses in a level are its opening `RHYTHM.leadInBeats` bar and,
for a level of `PROGRESSION.breatherFromTasks` tasks or more, one
`PROGRESSION.breatherBars` breather at its midpoint. Both are the same mechanism —
`LevelTask.leadBeats`, counted in by `createRoundPlan`. Because no bar separates
the demonstration from the response, **a vignette's demonstration must not consume
its subject**: it plays the action in full and leaves the cumulative state alone,
since there is no longer anywhere to restore it.

Support is `SupportScene`, reached from Settings → Help: an address, and a block of
details the player could not be expected to assemble — build, device, level, premium,
hearts, and their save code. **What is sent is on the screen before it is sent**, which is
the difference between a support report and telemetry. `game/supportReport.ts` is pure and
holds the wording, including `describeDevice`, which parses the user-agent's platform block
**by counting bracket depth** — a model name can contain brackets (`moto g(30)`) and a
non-greedy match loses the rest of the block. A player whose game will not start cannot
reach Settings, so the boot panel carries the address too — and because a device that
refuses every canvas context kills Phaser's *import-time* detection, so `/src/main.ts`
never evaluates, that handler is an inline `<script>` in `index.html` rather than anything
in the bundle. See `docs/SUPPORT.md`.

The separate `TutorialScene` (`game/TutorialRun.ts`, the menu's "How to play", a first
Play) exists alongside the first-run pass and teaches on the **same turn block** a level
draws, with the two things a level leaves out — a label on each row and a pointer that
follows the token — and words. `coach` derives every heading from `momentOf`, which reads
the same `handover` the block is drawn from, so *Get ready* is said when the baton starts
to cross and *Your turn* on the downbeat, never after it; `tests/tutorial.test.ts` pins
that order. The tried pass is judged by the level's own `RoundController`, and a miss is
named — *Too early* for taps in the hammer's turn, *That was your turn* for a bar that
went by — rather than scored. Nothing in it waits for a tap: the loop's whole lesson is
that it does not. See `docs/TUTORIAL.md`.

**Three stars on a designated level earns a keepsake, and ownership is never stored.**
`game/scrapbook.ts` lists every keepsake as `{ id, vignette, lap, name }`; its level is where
that act plays for the `lap`-th time, and it is owned exactly when that level has three stars
— so old saves, save codes, merges and Auto Backup carry the collection without knowing it
exists, and nothing can be owned twice. **The list is append-only**: an entry's `id`,
`vignette` and `lap` are pinned by `tests/fixtures/keepsakes.json`, because changing one moves
a keepsake players hold. Each has a drawing in `ui/keepsakes.ts` whose identifying detail sits
in `pen.detail`, which is what keeps it out of the silhouette. `ScrapbookScene` is reached from
the book puck at the title screen's top left (the right-hand corner is the sign's rope at full
swing); the result screen raises a card under the plaque a second into the summary, after the
medals. The only stored bit is the `scrapbook` teach flag. See `docs/SCRAPBOOK.md`.

**Three daily objectives, and nothing to spend.** `game/objectives.ts` draws three a day
from a curated pool — one *play*, one *skill*, one *mastery*, by weight — with a generator
seeded by the local date (`calendarDay`, the daily heart's helper), filtered by what the save
can reach that morning: finer grids only once a level using them is playable, a new level
only while no star gate holds the frontier, the Daily Tempo never while
`DAILY_TEMPO_AVAILABLE` is false. The set is stored when drawn, so progress cannot reshuffle
it, and a new local day draws a new one. **A level reports once, from `recordOutcome`**, with
the finishing pass's Perfects and flawless tasks, which is also what keeps
`objective_progress` to one event per objective per level. The reward is a stamp per
completed day — no currency, no streak to lose, nothing to buy. Every stored field is
validated; a damaged set is redrawn from its seed and never costs stamps. A puck with three
tick boxes opens `ui/objectivesCard.ts` on the Menu and the Map. See `docs/OBJECTIVES.md`.

The first time the hearts run out, both empty-bar screens say once that a finished level
never costs a heart and the map's sheet offers *Replay level N* (`levelToPolish`, the
highest finished level short of three stars, never the frontier). `seenReplayTip` lives
beside `seenDemonstration` in `game/progress.ts`, in one stored object that a write to
either flag preserves whole, and neither travels in a save code.

**A baked Graphics is free of rebuild cost, not of render cost.** Phaser walks a
Graphics' whole command buffer and re-tessellates it on every frame it renders, and it
culls nothing by bounds — `willRender` asks about visibility and alpha, never about where
an object is. `MapScene` bakes its road once in `layout()` and used to bake it into one
Graphics, which on a 64-level save was 82,000 commands for a world 10,700 units tall
showing 1,560 of them: 23.6 ms of main-thread time per frame, more than the whole 60 fps
budget, ~85% of it spent off the top and bottom of the screen. The bake is now cut into
strips of `MAP.stripLevels` levels (`stripBounds` in `ui/navigation.ts`, which
`tests/navigation.test.ts` pins as a true tiling — a gap is a screen-wide band of missing
ground) and `cullStrips` draws only the strips the camera can reach, with the level
numbers, since each `Text` carries its own texture. Two things follow for anyone editing
the map's drawing. Each strip has a **ground layer under every strip's detail layer**, so
the terrain of the strip above can never land on a prop standing across the seam below it.
And within the ground layer strips are painted bottom to top, so anything that overhangs a
seam is claimed by the strip holding its **topmost** extent (`MAP.overhang`) and hangs
down onto paint already laid; claiming by centre instead drew a row of half-alpha terrain
motifs twice, at every seam.

**`layout()` runs once per frame of an Android URL-bar collapse**, so expensive layout
work needs a reason to run, not just a resize. Chrome collapsing its URL bar changes the
frame's *height* and nothing else, and `uiScale` is `min(safe.width / 720, safe.height / 1150)`,
which the width pins on any handset — so the map's scale, its world height and every node
come out identical fifteen frames running. Re-baking them cost 11.8 ms a frame, 177 ms of
main-thread work per collapse, to redraw geometry byte for byte the same as what was
already on screen. `MapScene.bakeKey` is every value the bake reads and nothing else (the
frame's height is deliberately not in it), and the bake is skipped when it has not moved.
Like any field holding scene state, **it is assigned in `build()`**: a second entry makes
fresh, empty strips, and a key left over from the first would skip the one bake that fills
them.

Two standing rules that predate the current state and still hold: debug replay
controls exist only with DEV and `?debug`, and **do not add a vignette without a
request** — a new entry in the registry reassigns levels unless it joins through a new
era in `ROTATION`, past every keepsake.

## History

Superseded, and kept only for the reasoning that produced the current design.
Nothing below is a description of the code as it stands.

### The two-vignette milestone

The default was the Hammer + Nail vignette (see `docs/HAMMER_NAIL.md`).
Keep presentation inside `src/vignettes/HammerNailVignette.ts`; the existing
rhythm controller/judge/scorer remain authoritative.

### The timing-only milestone

PlayScene was Rhythm Lab: one authored phrase, a tempo toggle, and no vignettes
or progression. Four rules survive from it and are not negotiable. Gameplay has
one TAP action, using Phaser's unified pointer event and the original DOM
timestamp. The drag and player helpers are unused starter code, and
drag-to-position must not return to the rhythm scene. `AudioEngine` owns the only
AudioContext; Phaser sound is disabled. Visual frame or tween time must never
become the musical clock.

## Conventions

Mobile-first Phaser 4 game project. Portrait, touch-first, with Android as the
intended primary platform.

These are the conventions for this repository. Where a rule states a reason,
the reason is the rule — if it no longer applies, change the rule deliberately
rather than working around it.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server with HMR on port 5173, exposed on the LAN |
| `npm run typecheck` | Type-check only |
| `npm run lint` | oxlint over `src` and `tests`, warnings are errors |
| `npm test` | vitest, node environment, no config file |
| `npm run build` | Type-check, then produce the production bundle in `dist/` |
| `npm run preview` | Serve the built bundle on port 4173 |
| `npm run music:encode` | Premix the WAV masters to the shipped MP3 |
| `npm run sfx:encode` | Encode the long one-shot masters in `sfx/masters/` to MP3 |
| `npm run icons` | Cut every launcher and web icon from the 1024px master |
| `npm run android:apk` | Build, sync and assemble a debug APK |
| `npm run android:bundle` | Release-build, sync and produce the signed AAB Play takes |

The first four are the gate. CI runs exactly those on every push and pull
request, and also fails if a sourcemap reaches `dist/`.

`npm run build` runs `tsc --noEmit` first, so a type error fails the build.
Vite does not type-check on its own — `npm run dev` will happily serve code
that does not compile. Run `npm run typecheck` before assuming work is done.

### Testing on a real device

The dev server binds to all interfaces, so a handset on the same network can
load `http://<dev-machine-ip>:5173`. Do this early and often. A desktop browser
at a phone-sized viewport does not reproduce touch latency, digitiser jitter,
GPU fill-rate limits, or the URL bar collapsing mid-frame.

## Stack

- **Phaser 4.2.x** — `Phaser.AUTO` renderer (WebGL, canvas fallback)
- **TypeScript 7** — strict, plus `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`
- **Vite 8** — bundles with **Rolldown**, not Rollup
- **npm**

Four version-specific traps, all of which cost time if assumed away:

1. **TypeScript 7 removed `baseUrl`.** Entries in `paths` must be relative
   (`"@/*": ["./src/*"]`).
2. **Vite 8 uses Rolldown.** Chunking is `build.rollupOptions.output.codeSplitting.groups`.
   Rollup's `manualChunks` object form is not supported — only a function, and
   it is deprecated.
3. **Phaser 4 ships `export = Phaser`** typings against an ESM runtime build.
   `import Phaser from 'phaser'` is the form used here; named imports also work
   but do not meaningfully shrink the bundle, since the engine is monolithic.
4. **Phaser 4 dropped WebGL geometry masks.** `GameObject.setMask` and
   `Camera.setMask` are canvas-only: under WebGL they log a warning and leave
   `mask` null, so the clip silently does nothing. The replacement,
   `FilterList#addMask`, renders the mask object to a DynamicTexture. To clip a
   rectangular region, give it a camera: `cameras.add(...)` plus `setViewport`
   is a scissor rectangle and costs nothing (`SettingsScene`). A camera renders
   every object the other cameras do, so `ignore()` both ways, and note that a
   `setScrollFactor(0)` object lands offset by the second camera's viewport
   origin.

## Project layout

```
src/
  main.ts              Entry point; creates the game, reports boot failure
  analytics/
    boot.ts            Attaches the provider on native; composes with the installed sink
    eventShape.ts      Firebase's name and parameter limits, as pure functions
    firebase.ts        The Firebase adapter; the only file that knows the vendor
  audio/
    AudioEngine.ts     The only AudioContext; SFX scheduling and mute
    AudioClock.ts      DOM event time to output time, plus the input offset
    MusicSystem.ts     The premixed loop: load, normalize, start, rate, gain
    musicBed.ts        Shell, level or silent: which job the one loop is doing
    ThemeMusic.ts      The title screen's own track: load, loop, fade in and out
    *Sounds.ts         Deterministic per-vignette synthesis, one file per act
    finaleSounds.ts    The finale's opening roll and payoff fanfare, synthesized
    sharedAudio.ts     Game-wide engine in the registry; applies stored settings
    samples.ts         The recorded one-shots: fetch, decode, align to the beat
  config/
    design.ts          Design resolution, layout metrics, depth ordering
    game.ts            Phaser game config (every non-default value is justified)
    music.ts           Measured musical model of the shipped track
    progression.ts     The one difficulty curve and its knobs
    dailyTempo.ts      Whether the Daily Tempo mode exists; everything built for it reads this
    leaderboards.ts    Play Games leaderboard ids and the daily reset clock
    achievements.ts    Play Games achievements: key, the level that earns it, Console id
    rhythm.ts          Timing windows and scheduling constants
    scenes.ts          Scene keys
    support.ts         The address a player writes to; mirrored in the legal pages
    analytics.ts       Whether a provider is attached, and the consent it starts under
    diagnostics.ts     Sentry DSN and release; empty DSN keeps reporting off
    style.ts           The workshop treatment: outline, exaggeration, faces, grain
    theme.ts           PALETTE: the four colours the shell, curtain and clear colour share
  core/
    BaseScene.ts       Scene base class owning the build/layout lifecycle
    errors.ts          Capture, dedupe, breadcrumbs and redaction; no vendor, no network
    haptics.ts         navigator.vibrate behind the player's setting; the one added web API
    Viewport.ts        Live layout frames (full / safe / content / designBox)
    motionPreference.ts  The one live read of prefers-reduced-motion
    safeArea.ts        Reads env(safe-area-inset-*) via a probe element
    shell.ts           Controls the DOM overlays in index.html
  diagnostics/
    boot.ts            Installs capture, then attaches the vendor when a DSN exists
    sentry.ts          The Sentry adapter; the only file that knows the vendor
  game/
    levels.ts          Derives a level spec from the curve and its step in the area
    RoundController.ts Phase machine for one task
    TaskSequence.ts    Task ordering within a level
    scoring.ts         Pure weighted accuracy
    progress.ts        Saved unlocks and best accuracies; merging two saves
    saveCode.ts        Progress as a checksummed string, no Phaser import; never consent
    supportReport.ts   The details a support email carries, as pure text
    settings.ts        Saved audio offset and mute
    beatTrack.ts       What the two rows show, and the handover, as pure functions
    playAnalytics.ts   Gameplay events: what a level, the tutorial and a gate report, once
    subdivisionIntro.ts  A finer grid's one-time introduction: where, which, and its tries
    scrapbook.ts       Keepsakes: which level earns each, and what a save owns; stores nothing
    finale.ts          Area finales: the area, the next one, the treatment, the map's marks
    resultCopy.ts      The result's words: thresholds, the next star, replay, the next gate
    objectives.ts      Daily objectives: the pool, the day's draw, progress, stamps; one key
  input/
    TapInput.ts        Unified pointer taps, original DOM timestamp preserved
    HorizontalDragBehaviour.ts   Unused starter code; do not reintroduce
  objects/
    Player.ts          Unused starter code
  playgames/
    playGames.ts       Signed in or not, and who; pure, and the inert browser stub
    native.ts          The PlayGames bridge; validates the payload rather than casting it
    boot.ts            Native-only gate; the browser never leaves the stub
    leaderboard.ts     Score conversion, the day's best, submission and retry; pure
    dailyTempo.ts      The Daily Tempo leaderboard wired to config, adapter and analytics
    ids.ts             Validates a Console leaderboard or achievement id
    achievements.ts    What a save has earned, and the idempotent sync; pure
    achievementSync.ts The achievements wired to config and the installed adapter
  rhythm/
    patterns.ts        Seeded pattern vocabulary by tier
    RhythmScheduler.ts Absolute-time cue scheduling
    judge.ts           Pure timing judgement; owns Perfect/Good/Miss
  scenes/
    BootScene.ts       Input tuning, orientation guard
    PreloadScene.ts    Texture generation and font registration
    MenuScene.ts       Title; owns the first audio gesture
    MapScene.ts        The endless road: a bounded window, baked into culled strips
    PlayScene.ts       One level: hosts a vignette, never judges
    SettingsScene.ts   Labelled sections, scrolling under a camera viewport
    CalibrateScene.ts  Tap offset: the latency measurement on its own screen
    TransferScene.ts   The save code: show it, copy it, restore from one
    SupportScene.ts    The address, and the details worth sending with it
    ScrapbookScene.ts  The keepsakes, a page per act, found or in silhouette
  textures/
    materials.ts       Seeded canvas tiles: paper, wood, metal, cloth, parchment
  ui/
    backdrop.ts        The shared stage behind a vignette: ground, light pool, paper
    colour.ts          hex / mix / shade, so depth tones derive from one palette
    feedback.ts        Particle presets on generated textures; the soft glow disc
    gear.ts, icons.ts  Drawn control glyphs; no symbol fonts
    light.ts           The one key light: cast shadows and lit/shade/rim faces
    panel.ts           Slabs and pucks with thickness, dressed per treatment
    path.ts            Catmull-Rom smoothing and dash spacing
    spring.ts          Physical motion as pure f(t): spring, overshoot, squash, settle
    star.ts            The star glyph
    keepsakes.ts       Each keepsake drawn, and its silhouette
    turnBlock.ts       The two rows and the baton: whose turn it is, as an object
    finaleStage.ts     An area finale's pennants, title card and ribbon, from its treatment
    finalePose.ts      Their poses as pure f(t)
    objectivesCard.ts  The daily objectives card, shared by the Menu and the Map
    starReveal.ts      Result poses as f(t): medals, plaque swing, jolt, chorus
    resultLayout.ts    The plaque's tray, seats and chips, and the stack under it; pure
    sheen.ts           The light crossing a brass panel; still under reduced motion
    switch.ts          The two-state switch; its geometry imports no Phaser
    type.ts            Display, body and label text from the treatment's bundled faces
  updates/
    playUpdate.ts      Flexible vs immediate, when to restart; no native import
    native.ts          The PlayUpdate plugin wrap, unloaded in the browser
    boot.ts            Native-only check on boot and resume
  vignettes/
    registry.ts        The acts, and ROTATION: their order and eras are the level assignment.
    rotation.ts        Which act plays a level, and its lap: the eras, forwards and back
    Vignette.ts        The contract a vignette implements
    *Vignette.ts       One per act: all geometry, palette and motion
    *Motion.ts         Pure curves, no Phaser import, unit-tested under node
```

Add new directories along the same axis — by role, not by feature — until a
feature grows large enough to own a folder of scenes and objects together.

## The scaling model

This is the single most important thing to understand before touching layout.

The game is authored against a **720x1280 design box** and runs under
`Phaser.Scale.EXPAND`. Under EXPAND the logical game size is **not constant**.
Phaser anchors whichever axis makes the design box fit and expands the other to
match the device's aspect ratio:

| Device | Logical game size |
| --- | --- |
| 393x851 phone (20:9) | 720 x 1559 — width anchored, height expanded |
| 375x667 phone (16:9) | 720 x 1281 — close to the design box |
| 768x1024 tablet (4:3) | 960 x 1280 — height anchored, width expanded |

`EXPAND` is used instead of `FIT` because `FIT` letterboxes: on a 20:9 handset
that is black bars across roughly a fifth of the screen. The cost of EXPAND is
that no coordinate can be hardcoded.

### Rules that follow from it

- **Never position anything using `DESIGN_WIDTH` / `DESIGN_HEIGHT`.** They
  define the reference frame; they are not the runtime screen size.
- **Never use `this.scale.width` directly in layout code.** Go through
  `this.viewport`, which also accounts for safe-area insets.
- Pick the right frame for the job:
  - `viewport.full` — backgrounds only. Extends under the notch.
  - `viewport.safe` — `full` minus device safe-area insets. Nothing
    interactive may sit outside this.
  - `viewport.content` — `safe` inset by `LAYOUT.screenPadding`. The default
    for HUD and gameplay.
  - `viewport.designBox` — the centred 720x1280 frame. Guaranteed visible on
    every device, so art that must not be cropped goes here.
- Scale design-space lengths with `viewport.scaled(n)`; get hit-area sizes from
  `viewport.touchTarget(n)`.

### Scene lifecycle

Scenes that lay anything out extend `BaseScene` and implement two methods:

- `build()` — create game objects. Runs **once per entry into the scene**.
- `layout()` — position and size them. Runs on create **and on every viewport
  change**.

**"Once" means once per entry, not once per instance.** Phaser constructs a Scene
object one time and reuses it for every `scene.start`, destroying the display list
in between — so `build()` runs again on a second visit while **field initializers
do not**. A field that collects game objects must therefore be *assigned* in
`build()`, never appended to: `this.eyebrows.push(...)` left Settings holding seven
destroyed Texts behind seven live ones, and the second visit threw inside
`Text.setColor` during `create`, which killed the game wherever the player happened
to open Settings from.

`layout()` must be idempotent: no object creation, no event listeners, no
tweens started. `BaseScene` handles the resize subscription, the camera resize,
and unsubscribing on shutdown. Do not override `create()`.

Use `onResize()` for post-resize work that is not layout, such as regenerating
a texture at a new resolution.

A resize is a routine event on Android, not an edge case — Chrome collapses its
URL bar, the keyboard opens, the device rotates. Assume `layout()` runs often.

## Touch input

- **Design for the thumb.** Interactive elements belong within reach of the
  bottom edge. Note that thumb reach is an *absolute* distance from where the
  hand grips the device, so anchor controls at a fixed offset from the bottom
  (`LAYOUT.trackOffsetFromBottom`) rather than at a fraction of the height,
  which drifts out of reach on a tall handset.
- **Honour the minimum touch target.** `LAYOUT.minTouchTarget` (88 design
  units, ~48 CSS px) is the accessible floor. Hit areas are expressed in
  texture-local units and therefore shrink with an object's scale, so small art
  needs its hit area widened explicitly — see `Player.refreshHitArea`.
- **Constrain gestures deliberately.** A thumb travelling horizontally always
  drifts vertically. `HorizontalDragBehaviour` applies the horizontal component
  and discards the vertical one. Do not use Phaser's raw drag for an
  axis-locked control.
- **Support tap as well as drag.** Reaching across a large phone to drag is
  uncomfortable; tap-to-position is often the gesture players actually use.
- **Acknowledge every touch visually**, before any movement happens.
- **Leave `input.smoothFactor` at 0.** Phaser computes
  `x = newX * smoothFactor + previousX * (1 - smoothFactor)`, so the value is
  the weight of the *new* sample — a low non-zero value such as `0.2` keeps 80%
  of the previous position and lags the finger by roughly 45 game units at the
  end of a fast swipe. `0` and `1` both mean "use the exact position".

## Configuration traps

Verified by testing, and easy to reintroduce:

- **Do not set `scale.min` / `scale.max`.** They clamp the **display** size in
  CSS pixels, not the logical game size. A floor of 480 CSS px forces the
  canvas wider than a 393 px handset screen, and `autoCenter` then centres the
  overflow so content is clipped off *both* edges. Bound the logical size in
  `Viewport` instead.
- **Keep `scale.expandParent: false`.** `#game-root` is sized by CSS using
  `100dvh`, which is what keeps the canvas stable while Android Chrome
  collapses its URL bar. Letting Phaser style the parent fights that.
- **Keep `base: './'` in the Vite config.** An Android WebView serves the
  bundle from local storage, where absolute `/assets/...` URLs 404.
- **Leave `render.powerPreference` at `'default'`.** A phone has one GPU, so
  `'high-performance'` mostly opts out of power management — a poor trade for a
  2D game, costing battery life and bringing on thermal throttling sooner.

## Assets

All art is procedural: drawn as Phaser Graphics inside each vignette and scene,
or generated at boot — material tiles in `textures/materials.ts`, particle and
glow discs in `ui/feedback.ts` — and looked up by key. There are no image files.

The typefaces are one of the two exceptions to "the music and a handful of one-shots". Two
variable fonts under `public/fonts/` — Fredoka for display, Nunito for body and
labels, both under the SIL Open Font License with each family's `OFL.txt`
committed beside it — load through Phaser's `load.font()` in
`PreloadScene.preload()` before the menu builds, because Phaser `Text`
rasterises at creation and never reflows for a font that arrives later. Text is
made through `ui/type.ts`, never with a font family literal.

The look is the workshop treatment in `config/style.ts`: one key light
(`ui/light.ts`), generated materials, thick outlines, and physical motion from
`ui/spring.ts`. Every drawing module reads its weights from `STYLE.current`
rather than carrying its own; a new surface uses `ui/panel.ts`, `ui/type.ts`
and `ui/icons.ts` rather than drawing a card or a glyph of its own.

The repository does ship binary audio — the WAV masters in `bgm/` and the MP3s
encoded from them — and that is the great majority of the checkout. Only the
premixed MP3 reaches the bundle. Sound effects are synthesized locally per vignette in
`src/audio/`, with one exception: six acts take a *recorded* beat from `sfx/` — the
window's two wipes, the bug's shoe, the curl's grunt, the paper's scissors, the
trombone's two notes and two endings, and the clap with the three rooms that answer it,
260 KB of WAV and 340 KB of MP3 beside the 2.4 MB track. A percussive take ships as
delivered; a coda of several seconds is kept in `sfx/masters/` and encoded by
`npm run sfx:encode`, which is what keeps four seconds of applause from costing 1.6 MB. They are an enhancement over a game that already works, so
`audio/samples.ts` never rejects and an act whose sample does not arrive keeps the
synthesized voice it shipped with. See `docs/SOUND.md`.

The one authored image in the repository is the icon master,
`assets/icon/tiny-tempo-1024.jpg`. Every shipped icon — the five Android density
buckets, legacy, round and adaptive foreground, plus the web favicon and Apple
touch icon — is derived from it by `npm run icons`. Do not edit a generated PNG:
replace the master and re-run. The script needs `ffmpeg` on PATH, and nothing
else in the build does.

Other real image assets, if any are ever added, go in `public/assets/` and load in
`PreloadScene.preload()`. Prefer
one texture atlas over many loose images: each separate texture is a
state change for the GPU, and on mobile draw-call count is usually what limits
frame rate. Generate textures larger than their on-screen size — scaling down
is nearly free, scaling up is visibly soft.

## Orientation

Portrait on a handset, either way up on a tablet. On the web portrait can only be
requested, not enforced — the Screen Orientation API locks orientation only from
fullscreen on Android, and fullscreen needs a user gesture — so `BootScene` raises the
`#orientation-overlay` prompt instead.

**`wrongOrientation` in `core/shell.ts` is the one place that decides**, because three
scenes act on it: Boot raises the prompt, and `PlayScene.blocked` and
`TutorialScene.blocked` hold the level behind the same question. It is landscape, *and* a
coarse pointer — so a landscape desktop window, a normal development setup, is never
nagged — *and* a display whose shorter side is under 600 CSS pixels.

That last term is the tablet rule, and it follows the platform rather than fighting it.
**Android ignores an activity's `screenOrientation` on a display of 600dp or more for an
app targeting API 36**, so a tablet can be held in landscape and the app has no say. The
manifest keeps `android:screenOrientation="portrait"` regardless: below 600dp the platform
still enforces it, which is the handset case, and it is what keeps older Android versions
portrait-locked everywhere. Without the tablet term the game asked a tablet player to
rotate back — something the OS would not let them do — and the two `blocked()` checks
stopped the level outright.

600 CSS pixels is the same measurement Android makes in dp: both take the shorter edge.
Game units are not, since the scaling model makes them a function of the design box and
the aspect ratio, so `viewport` cannot answer a question about the physical device.

A tablet in landscape is wide — a 4:3 tablet gives a logical box near 1707x1280 — and every
screen is laid out from a portrait design box. It adapts because `layout()` is idempotent
and reruns on resize, but it has not been looked at on a real tablet.

## Style

- TypeScript strict mode is non-negotiable; do not add `any` or
  `@ts-expect-error` to move past a type error.
- Name things after what they do in the game, not after their Phaser type.
- Comment the *why*, not the *what*. The comments worth keeping here are the
  ones recording a decision and its trade-off; a comment restating the code is
  noise.
- Keep magic numbers in `config/design.ts` or as a named constant at the top of
  the file that uses them.
- `window.__PHASER_GAME__` exposes the running game in **development builds
  only** — useful from a device's remote console. Do not depend on it in game
  code.

## Android packaging

Capacitor 8 wraps the web build (`capacitor.config.ts`, `android/`). `npm run
android:apk` builds, syncs and assembles a debug APK; `npm run android:bundle` is the
release path and produces the signed AAB, refusing to start without a keystore rather than
building an unsigned bundle. Both need JDK 21 and an
Android SDK (platform 36, build-tools 36.0.0) referenced from the untracked
`android/local.properties`. **`package.json` is the only version.** `versionName` is its
version verbatim and `versionCode` is derived from it (1.4.2 → 10402), because the same
string already feeds `__APP_VERSION__` — the Settings footer, the support subject and every
Sentry release tag — and a hardcoded Gradle version filed each crash under a release no
Play track matched. Release signing reads the untracked `android/keystore.properties` and
applies only when it exists, so a machine with no upload key still builds a debug APK. The launcher icon is an adaptive icon: a flat `#CE5133` background — the master's own ground, sampled from the artwork, which is why it is a shade off the game's `#CF5134` coral — under a full-bleed foreground, since the artwork is a scene rather than a glyph on transparency. `res/values/colors.xml` carries the palette for the native surfaces the WebView does not paint, and the launch window is a flat paper field rather than Capacitor's stock splash bitmap, so a cold start is one colour from the launcher to the menu. The portrait lock lives in `AndroidManifest.xml`;
the DOM rotate prompt remains the browser fallback. `android/app/src/main/assets/public`
is generated by `cap sync` and is not committed. Two native Capacitor plugins are used — AdMob and Firebase
Analytics — each behind an adapter that is dynamically imported on a native platform only,
so a browser build downloads none of them. Billing is the third native capability and is
**not** a package: `PlayBillingPlugin.java` in this module calls Google Play Billing
directly, registered by hand in `MainActivity` and reached through `monetization/purchases.ts`.
Every decision about a purchase lives in `monetization/playBilling.ts`, which imports no
native code and is therefore tested under node — the native side only relays what Play says
and performs the acknowledge and consume it is told to. See `docs/BILLING.md`. Play Games
Services v2 is the fourth and is hand-written for the same reason: `PlayGamesPlugin.java`
relays `GamesSignInClient` and `PlayersClient`, registered beside Billing in `MainActivity`,
and `PlayGamesSdk.initialize` runs in `TinyTempoApplication` because v2 wants it in
`Application.onCreate`. The artifact is pinned (`playGamesVersion` in `variables.gradle`) and
is **`play-services-games-v2` only** — the deprecated v1 `play-services-games` and the legacy
`GoogleSignIn` APIs must never be added beside it, which `scripts/check-android-config.mjs`
enforces along with the Games project id, the meta-data, the Application class and both
`registerPlugin` calls: `cap sync` rewrites `MainActivity` from its own template if the file
is ever lost, taking the registrations with it. See `docs/PLAY_GAMES.md`. In-app updates
are the fifth, the same shape: `PlayUpdatePlugin.java` talks to `AppUpdateManager`,
`src/updates/playUpdate.ts` decides flexible vs immediate and when to ask for a restart,
and a browser or a Studio-sideloaded APK is silent — Play only answers for a package it
installed. See `docs/UPDATES.md`. Beyond those, the game
depends on exactly four web APIs — Web Audio, pointer events, `navigator.vibrate` for the
Haptics switch, which `AndroidManifest.xml` covers with the normal `VIBRATE` permission,
and `navigator.clipboard` for the save code's Copy button. Each was added deliberately
rather than worked around, and each meets the same three terms: feature-detected at every
call, silent when it is not there, and never firing for anything the player did not just
do. Vibration (see `docs/UI_REFINEMENTS.md`) is how a rhythm game played with one thumb
confirms a landed tap, when the sound may be muted and the thumb is covering the motion.
Clipboard (see `docs/SAVES.md`) is a convenience over a code that stays readable on screen
without it, which is why the button can fail and the feature still works. A fifth is not
covered by that reasoning.

`android/app/google-services.json` is **gitignored**, because this repository is public:
the key inside it ships in every APK and Google calls the file safe to commit, but a
Firebase key is unrestricted until somebody restricts it and publishing it cannot be
undone. The cost is that a fresh clone builds an APK with no Firebase in it and nothing
says so, which `scripts/check-android-config.mjs` now does after every `cap sync` — along
with a config naming the *wrong* app, which is worse than none because the plugin applies
and every event is filed elsewhere. The live AdMob app ID is checked there too: it is
written in `strings.xml` and in `src/config/ads.ts`, nothing keeps the two in step, and
the manifest is what the SDK reads — so a half-finished edit runs the build as a
different app and says nothing.

Auto Backup is declared rather than defaulted: `res/xml/backup_rules.xml` and
`res/xml/data_extraction_rules.xml` name `app_webview/` and nothing else, and both exist
because Android reads the first below API 31 and the second from 31 up. Backup rules are
file-level and all eight storage keys share one LevelDB store, so nothing can be excluded
selectively — which is why the premium cache carries a `checkedAt` and expires, instead of
a restored backup granting Premium forever.
